/**
 * Task Aggregator Service
 *
 * Aggregates status from all background subsystems into a unified Task shape
 * for the Tasks Center page.
 */

import { getBackgroundSyncManager } from './library-sync/background-sync';
import { getBackgroundDiscoveryManager } from './background-discovery';
import { getActiveBackfill } from './lastfm-backfill';

export interface UnifiedTask {
  id: string;
  name: string;
  description: string;
  type: 'library-sync' | 'discovery' | 'lastfm-backfill';
  status: 'idle' | 'running' | 'completed' | 'error';
  progress?: {
    current: number;
    total: number;
    percentage: number;
    message?: string;
  };
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Human-readable interval, e.g. "30 minutes", "12 hours" */
  interval: string | null;
  /** Human-readable duration of last run, e.g. "45s", "1m 12s" */
  lastDuration: string | null;
  error?: string;
  canTrigger: boolean;
  canCancel: boolean;
  stats?: Record<string, number>;
}

/**
 * Format milliseconds into a human-readable duration string
 */
function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Get all task statuses aggregated from subsystems
 */
export async function getAllTaskStatuses(userId: string): Promise<UnifiedTask[]> {
  const tasks: UnifiedTask[] = [];

  // 1. Library Sync
  try {
    const syncManager = getBackgroundSyncManager();
    const syncStatus = syncManager.getStatus();

    tasks.push({
      id: 'library-sync',
      name: 'Library Sync',
      description: 'Syncs your Navidrome library metadata and song data',
      type: 'library-sync',
      status: syncStatus.isRunning
        ? 'running'
        : syncStatus.consecutiveFailures > 0
          ? 'error'
          : 'idle',
      progress: syncStatus.progress ? {
        current: syncStatus.progress.processedItems ?? 0,
        total: syncStatus.progress.totalItems ?? 0,
        percentage: syncStatus.progress.totalItems
          ? Math.round(((syncStatus.progress.processedItems ?? 0) / syncStatus.progress.totalItems) * 100)
          : 0,
        message: syncStatus.progress.phase ?? undefined,
      } : undefined,
      lastRunAt: syncStatus.lastSyncAt?.toISOString() ?? null,
      nextRunAt: syncStatus.nextSyncAt?.toISOString() ?? null,
      interval: `${syncStatus.intervalMinutes} minutes`,
      lastDuration: syncStatus.lastDurationMs != null ? formatDurationMs(syncStatus.lastDurationMs) : null,
      error: syncStatus.consecutiveFailures > 0
        ? `${syncStatus.consecutiveFailures} consecutive failures`
        : undefined,
      canTrigger: !syncStatus.isRunning,
      canCancel: syncStatus.isRunning,
    });
  } catch {
    tasks.push({
      id: 'library-sync',
      name: 'Library Sync',
      description: 'Syncs your Navidrome library metadata and song data',
      type: 'library-sync',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      interval: '30 minutes',
      lastDuration: null,
      canTrigger: true,
      canCancel: false,
    });
  }

  // 2. Background Discovery
  try {
    const discoveryManager = getBackgroundDiscoveryManager();
    const discoveryStatus = await discoveryManager.getStatus();

    tasks.push({
      id: 'discovery',
      name: 'Background Discovery',
      description: 'Discovers new music suggestions based on your listening patterns',
      type: 'discovery',
      status: discoveryStatus.isRunning
        ? 'running'
        : discoveryStatus.lastError
          ? 'error'
          : 'idle',
      lastRunAt: discoveryStatus.lastRunAt?.toISOString() ?? null,
      nextRunAt: discoveryStatus.nextRunAt?.toISOString() ?? null,
      interval: `${discoveryStatus.frequencyHours} hours`,
      lastDuration: discoveryStatus.lastDurationMs != null ? formatDurationMs(discoveryStatus.lastDurationMs) : null,
      error: discoveryStatus.lastError ?? undefined,
      canTrigger: !discoveryStatus.isRunning,
      canCancel: false,
      stats: {
        totalSuggestions: discoveryStatus.totalSuggestionsGenerated,
        approved: discoveryStatus.totalApproved,
        rejected: discoveryStatus.totalRejected,
        pending: discoveryStatus.pendingCount,
      },
    });
  } catch {
    tasks.push({
      id: 'discovery',
      name: 'Background Discovery',
      description: 'Discovers new music suggestions based on your listening patterns',
      type: 'discovery',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      interval: '12 hours',
      lastDuration: null,
      canTrigger: true,
      canCancel: false,
    });
  }

  // 3. Last.fm Backfill
  try {
    const backfillJob = getActiveBackfill(userId);

    if (backfillJob) {
      const progress = backfillJob.progress;
      tasks.push({
        id: 'lastfm-backfill',
        name: 'Last.fm History Import',
        description: 'Imports your listening history from Last.fm',
        type: 'lastfm-backfill',
        status: progress.status === 'running' ? 'running'
          : progress.status === 'completed' ? 'completed'
          : progress.status === 'error' ? 'error'
          : 'idle',
        progress: progress.status === 'running' ? {
          current: progress.imported,
          total: progress.totalScrobbles || 0,
          percentage: progress.totalScrobbles
            ? Math.round((progress.imported / progress.totalScrobbles) * 100)
            : 0,
          message: `Page ${progress.currentPage}/${progress.totalPages}`,
        } : undefined,
        lastRunAt: null,
        nextRunAt: null,
        interval: null,
        lastDuration: null,
        error: progress.error,
        canTrigger: false,
        canCancel: false,
        stats: {
          imported: progress.imported,
          skipped: progress.skipped,
        },
      });
    } else {
      tasks.push({
        id: 'lastfm-backfill',
        name: 'Last.fm History Import',
        description: 'Imports your listening history from Last.fm',
        type: 'lastfm-backfill',
        status: 'idle',
        lastRunAt: null,
        nextRunAt: null,
        interval: null,
        lastDuration: null,
        canTrigger: false,
        canCancel: false,
      });
    }
  } catch {
    tasks.push({
      id: 'lastfm-backfill',
      name: 'Last.fm History Import',
      description: 'Imports your listening history from Last.fm',
      type: 'lastfm-backfill',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      interval: null,
      lastDuration: null,
      canTrigger: false,
      canCancel: false,
    });
  }

  return tasks;
}
