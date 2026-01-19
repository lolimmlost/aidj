/**
 * Library Sync Store
 *
 * Zustand store for managing library sync state in the UI.
 * Provides reactive state for sync progress, status, and configuration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SyncProgress,
  SyncStatus,
  SyncConfig,
  SyncEvent,
} from '../services/library-sync/types';
import { DEFAULT_SYNC_CONFIG } from '../services/library-sync/types';
import type { BackgroundSyncConfig } from '../services/library-sync/background-sync';
import { DEFAULT_BACKGROUND_SYNC_CONFIG } from '../services/library-sync/background-sync';

/**
 * Sync statistics
 */
export interface SyncStats {
  lastSyncAt: Date | null;
  lastSyncDurationMs: number | null;
  totalSongsIndexed: number;
  totalArtistsIndexed: number;
  totalAlbumsIndexed: number;
  lastSyncErrorCount: number;
}

/**
 * Library sync store state
 */
interface LibrarySyncState {
  // Current sync status
  status: SyncStatus;
  progress: SyncProgress | null;
  isInitialized: boolean;

  // Sync statistics
  stats: SyncStats;

  // Configuration
  syncConfig: SyncConfig;
  backgroundConfig: BackgroundSyncConfig;

  // Error state
  lastError: string | null;

  // Scheduled sync info
  nextSyncAt: Date | null;

  // Actions
  setStatus: (status: SyncStatus) => void;
  setProgress: (progress: SyncProgress | null) => void;
  setStats: (stats: Partial<SyncStats>) => void;
  setSyncConfig: (config: Partial<SyncConfig>) => void;
  setBackgroundConfig: (config: Partial<BackgroundSyncConfig>) => void;
  setLastError: (error: string | null) => void;
  setNextSyncAt: (date: Date | null) => void;
  setInitialized: (initialized: boolean) => void;

  // Sync control actions (call API)
  startSync: (force?: boolean) => Promise<void>;
  pauseSync: () => Promise<void>;
  resumeSync: () => Promise<void>;
  abortSync: () => Promise<void>;
  updateSyncSettings: (config: Partial<SyncConfig & BackgroundSyncConfig>) => Promise<void>;

  // Event handler for sync events
  handleSyncEvent: (event: SyncEvent) => void;

  // Reset store
  reset: () => void;
}

/**
 * Initial sync stats
 */
const initialStats: SyncStats = {
  lastSyncAt: null,
  lastSyncDurationMs: null,
  totalSongsIndexed: 0,
  totalArtistsIndexed: 0,
  totalAlbumsIndexed: 0,
  lastSyncErrorCount: 0,
};

/**
 * Library sync store
 */
export const useLibrarySyncStore = create<LibrarySyncState>()(
  persist(
    (set, get) => ({
      // Initial state
      status: 'idle',
      progress: null,
      isInitialized: false,
      stats: initialStats,
      syncConfig: DEFAULT_SYNC_CONFIG,
      backgroundConfig: DEFAULT_BACKGROUND_SYNC_CONFIG,
      lastError: null,
      nextSyncAt: null,

      // State setters
      setStatus: (status) => set({ status }),
      setProgress: (progress) => set({ progress }),
      setStats: (stats) => set((state) => ({
        stats: { ...state.stats, ...stats },
      })),
      setSyncConfig: (config) => set((state) => ({
        syncConfig: { ...state.syncConfig, ...config },
      })),
      setBackgroundConfig: (config) => set((state) => ({
        backgroundConfig: { ...state.backgroundConfig, ...config },
      })),
      setLastError: (error) => set({ lastError: error }),
      setNextSyncAt: (date) => set({ nextSyncAt: date }),
      setInitialized: (initialized) => set({ isInitialized: initialized }),

      // Sync control actions
      startSync: async (force = false) => {
        try {
          set({ status: 'running', lastError: null });

          const response = await fetch('/api/library/sync/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ force }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to start sync');
          }

          const data = await response.json();
          set({
            progress: data.progress,
            nextSyncAt: data.nextSyncAt ? new Date(data.nextSyncAt) : null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ status: 'error', lastError: message });
          console.error('Failed to start sync:', error);
        }
      },

      pauseSync: async () => {
        try {
          const response = await fetch('/api/library/sync/pause', {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to pause sync');
          }

          set({ status: 'paused' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ lastError: message });
          console.error('Failed to pause sync:', error);
        }
      },

      resumeSync: async () => {
        try {
          set({ status: 'running' });

          const response = await fetch('/api/library/sync/resume', {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to resume sync');
          }

          const data = await response.json();
          set({ progress: data.progress });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ status: 'error', lastError: message });
          console.error('Failed to resume sync:', error);
        }
      },

      abortSync: async () => {
        try {
          const response = await fetch('/api/library/sync/abort', {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to abort sync');
          }

          set({ status: 'idle', progress: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ lastError: message });
          console.error('Failed to abort sync:', error);
        }
      },

      updateSyncSettings: async (config) => {
        try {
          const response = await fetch('/api/library/sync/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(config),
          });

          if (!response.ok) {
            throw new Error('Failed to update sync settings');
          }

          const data = await response.json();

          // Update local state
          if (data.syncConfig) {
            set((state) => ({
              syncConfig: { ...state.syncConfig, ...data.syncConfig },
            }));
          }
          if (data.backgroundConfig) {
            set((state) => ({
              backgroundConfig: { ...state.backgroundConfig, ...data.backgroundConfig },
            }));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ lastError: message });
          console.error('Failed to update sync settings:', error);
        }
      },

      // Handle sync events from the service
      handleSyncEvent: (event) => {
        const { type, progress, error } = event;

        switch (type) {
          case 'start':
            set({ status: 'running', progress, lastError: null });
            break;

          case 'progress':
            set({ progress });
            break;

          case 'phase-complete':
            set({ progress });
            break;

          case 'pause':
            set({ status: 'paused', progress });
            break;

          case 'resume':
            set({ status: 'running', progress });
            break;

          case 'complete':
            set({
              status: 'completed',
              progress,
              stats: {
                ...get().stats,
                lastSyncAt: new Date(),
                totalSongsIndexed: progress.processedItems,
                lastSyncErrorCount: progress.errorCount,
              },
            });
            // Reset to idle after a brief display of completion
            setTimeout(() => {
              set({ status: 'idle' });
            }, 3000);
            break;

          case 'error':
            set({
              status: 'error',
              progress,
              lastError: error?.message || 'Unknown error',
            });
            break;

          case 'abort':
            set({ status: 'idle', progress: null });
            break;
        }
      },

      // Reset to initial state
      reset: () => {
        set({
          status: 'idle',
          progress: null,
          isInitialized: false,
          stats: initialStats,
          syncConfig: DEFAULT_SYNC_CONFIG,
          backgroundConfig: DEFAULT_BACKGROUND_SYNC_CONFIG,
          lastError: null,
          nextSyncAt: null,
        });
      },
    }),
    {
      name: 'library-sync-storage',
      partialize: (state) => ({
        stats: state.stats,
        syncConfig: state.syncConfig,
        backgroundConfig: state.backgroundConfig,
      }),
    }
  )
);

/**
 * Hook to get sync progress as a percentage
 */
export function useSyncProgressPercent(): number {
  const { progress } = useLibrarySyncStore();
  if (!progress || progress.totalItems === 0) return 0;
  return Math.round((progress.processedItems / progress.totalItems) * 100);
}

/**
 * Hook to check if sync is active
 */
export function useIsSyncActive(): boolean {
  const { status } = useLibrarySyncStore();
  return status === 'running' || status === 'paused';
}

/**
 * Hook to get formatted sync status text
 */
export function useSyncStatusText(): string {
  const { status, progress } = useLibrarySyncStore();

  switch (status) {
    case 'idle':
      return 'Ready to sync';
    case 'running':
      if (progress?.phase) {
        return `Syncing ${progress.phase}... (${progress.processedItems}/${progress.totalItems})`;
      }
      return 'Syncing...';
    case 'paused':
      return 'Sync paused';
    case 'completed':
      return 'Sync completed';
    case 'error':
      return 'Sync failed';
    default:
      return 'Unknown status';
  }
}
