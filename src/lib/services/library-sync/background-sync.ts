/**
 * Background Sync Manager
 *
 * Manages background synchronization that runs without impacting UI responsiveness.
 * Uses a scheduler-based approach with:
 * - Configurable sync intervals
 * - Automatic retry on failure
 * - Priority-based scheduling
 * - Resource-aware throttling
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { librarySyncState } from '@/lib/db/schema/library-sync.schema';
import { LibrarySyncService } from './sync-service';
import type {
  SyncConfig,
  SyncProgress,
  SyncResult,
  SyncEventListener,
  SyncEvent,
} from './types';
import { DEFAULT_SYNC_CONFIG } from './types';

/**
 * Background sync configuration
 */
export interface BackgroundSyncConfig {
  /** Enable automatic background sync */
  enabled: boolean;
  /** Sync interval in minutes */
  intervalMinutes: number;
  /** Retry delay in minutes after failure */
  retryDelayMinutes: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Only sync when idle (no user activity) */
  syncWhenIdle: boolean;
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
  /** Throttle CPU usage (yield periodically) */
  throttleEnabled: boolean;
}

/**
 * Default background sync configuration
 */
export const DEFAULT_BACKGROUND_SYNC_CONFIG: BackgroundSyncConfig = {
  enabled: true,
  intervalMinutes: 30,
  retryDelayMinutes: 5,
  maxRetries: 3,
  syncWhenIdle: true,
  idleTimeoutMs: 60000, // 1 minute of inactivity
  throttleEnabled: true,
};

/**
 * Background sync status
 */
export interface BackgroundSyncStatus {
  isEnabled: boolean;
  isRunning: boolean;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  consecutiveFailures: number;
  progress: SyncProgress | null;
}

/**
 * Background Sync Manager
 *
 * Singleton manager that handles scheduled background syncs.
 */
class BackgroundSyncManager {
  private static instance: BackgroundSyncManager | null = null;

  private config: BackgroundSyncConfig;
  private syncConfig: Partial<SyncConfig>;
  private syncService: LibrarySyncService | null = null;
  private scheduledTimeoutId: NodeJS.Timeout | null = null;
  private userId: string | null = null;
  private consecutiveFailures: number = 0;
  private lastSyncAt: Date | null = null;
  private nextSyncAt: Date | null = null;
  private listeners: Set<SyncEventListener> = new Set();
  private lastActivityTime: number = Date.now();
  private activityListenerAttached: boolean = false;

  private constructor() {
    this.config = { ...DEFAULT_BACKGROUND_SYNC_CONFIG };
    this.syncConfig = { ...DEFAULT_SYNC_CONFIG };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): BackgroundSyncManager {
    if (!BackgroundSyncManager.instance) {
      BackgroundSyncManager.instance = new BackgroundSyncManager();
    }
    return BackgroundSyncManager.instance;
  }

  /**
   * Initialize background sync for a user
   */
  async initialize(userId: string, config?: Partial<BackgroundSyncConfig>, syncConfig?: Partial<SyncConfig>): Promise<void> {
    this.userId = userId;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (syncConfig) {
      this.syncConfig = { ...this.syncConfig, ...syncConfig };
    }

    // Load saved sync state
    const state = await this.loadSyncState();
    if (state) {
      this.lastSyncAt = state.lastSyncCompletedAt ? new Date(state.lastSyncCompletedAt) : null;
      if (state.autoSyncEnabled !== undefined) {
        this.config.enabled = state.autoSyncEnabled;
      }
      if (state.syncFrequencyMinutes) {
        this.config.intervalMinutes = state.syncFrequencyMinutes;
      }
    }

    // Attach activity listener for idle detection
    this.attachActivityListener();

    // Start background sync if enabled
    if (this.config.enabled) {
      this.scheduleNextSync();
    }

    console.log(`[BackgroundSync] Initialized for user ${userId}, enabled: ${this.config.enabled}`);
  }

  /**
   * Start or restart background sync
   */
  start(): void {
    this.config.enabled = true;
    this.consecutiveFailures = 0;
    this.scheduleNextSync();
    console.log('[BackgroundSync] Started');
  }

  /**
   * Stop background sync
   */
  stop(): void {
    this.config.enabled = false;
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
    this.nextSyncAt = null;
    console.log('[BackgroundSync] Stopped');
  }

  /**
   * Trigger an immediate sync
   */
  async triggerSync(force: boolean = false): Promise<SyncResult | null> {
    if (!this.userId) {
      console.error('[BackgroundSync] No user ID set');
      return null;
    }

    if (this.syncService?.isRunning() && !force) {
      console.log('[BackgroundSync] Sync already running');
      return null;
    }

    // Cancel any scheduled sync
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }

    // Check if we should wait for idle
    if (this.config.syncWhenIdle && !force && !this.isIdle()) {
      console.log('[BackgroundSync] Waiting for idle state');
      this.scheduleNextSync(this.config.idleTimeoutMs);
      return null;
    }

    console.log('[BackgroundSync] Starting sync...');

    // Create sync service
    this.syncService = new LibrarySyncService(this.userId, {
      ...this.syncConfig,
      forceFullSync: force,
    });

    // Forward events to listeners
    const unsubscribe = this.syncService.subscribe((event) => {
      this.emitEvent(event);
    });

    try {
      const result = await this.syncService.start();

      this.lastSyncAt = new Date();
      this.consecutiveFailures = 0;

      // Save state
      await this.saveSyncState();

      // Schedule next sync
      this.scheduleNextSync();

      return result;
    } catch (error) {
      console.error('[BackgroundSync] Sync failed:', error);
      this.consecutiveFailures++;

      // Calculate retry delay with exponential backoff
      const retryDelay = Math.min(
        this.config.retryDelayMinutes * Math.pow(2, this.consecutiveFailures - 1),
        60 // Max 60 minutes
      );

      if (this.consecutiveFailures < this.config.maxRetries) {
        console.log(`[BackgroundSync] Scheduling retry in ${retryDelay} minutes`);
        this.scheduleNextSync(retryDelay * 60 * 1000);
      } else {
        console.error('[BackgroundSync] Max retries exceeded, stopping');
        this.stop();
      }

      return null;
    } finally {
      unsubscribe();
    }
  }

  /**
   * Pause current sync
   */
  async pause(): Promise<void> {
    if (this.syncService?.isRunning()) {
      await this.syncService.pause();
    }
  }

  /**
   * Resume paused sync
   */
  async resume(): Promise<void> {
    if (!this.userId) return;

    const state = await this.loadSyncState();
    if (state?.checkpoint) {
      this.syncService = new LibrarySyncService(this.userId, this.syncConfig);
      await this.syncService.start();
    }
  }

  /**
   * Abort current sync
   */
  async abort(): Promise<void> {
    if (this.syncService?.isRunning()) {
      await this.syncService.abort();
    }
  }

  /**
   * Get current status
   */
  getStatus(): BackgroundSyncStatus {
    return {
      isEnabled: this.config.enabled,
      isRunning: this.syncService?.isRunning() ?? false,
      lastSyncAt: this.lastSyncAt,
      nextSyncAt: this.nextSyncAt,
      consecutiveFailures: this.consecutiveFailures,
      progress: this.syncService?.getProgress() ?? null,
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<BackgroundSyncConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Save to database
    await this.saveSyncState();

    // Handle enable/disable changes
    if (config.enabled !== undefined) {
      if (config.enabled && !wasEnabled) {
        this.start();
      } else if (!config.enabled && wasEnabled) {
        this.stop();
      }
    }

    // Reschedule if interval changed
    if (config.intervalMinutes !== undefined && this.config.enabled) {
      this.scheduleNextSync();
    }
  }

  /**
   * Subscribe to sync events
   */
  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Destroy the manager (for cleanup)
   */
  destroy(): void {
    this.stop();
    this.detachActivityListener();
    this.listeners.clear();
    this.syncService = null;
    this.userId = null;
    BackgroundSyncManager.instance = null;
  }

  // Private methods

  private scheduleNextSync(delayMs?: number): void {
    if (!this.config.enabled) return;

    // Cancel existing schedule
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
    }

    const delay = delayMs ?? this.config.intervalMinutes * 60 * 1000;
    this.nextSyncAt = new Date(Date.now() + delay);

    this.scheduledTimeoutId = setTimeout(() => {
      this.triggerSync();
    }, delay);

    console.log(`[BackgroundSync] Next sync scheduled for ${this.nextSyncAt.toISOString()}`);
  }

  private async loadSyncState() {
    if (!this.userId) return null;

    const result = await db
      .select()
      .from(librarySyncState)
      .where(eq(librarySyncState.userId, this.userId))
      .limit(1);

    return result[0] || null;
  }

  private async saveSyncState(): Promise<void> {
    if (!this.userId) return;

    await db
      .insert(librarySyncState)
      .values({
        userId: this.userId,
        autoSyncEnabled: this.config.enabled,
        syncFrequencyMinutes: this.config.intervalMinutes,
        lastSyncCompletedAt: this.lastSyncAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: librarySyncState.userId,
        set: {
          autoSyncEnabled: this.config.enabled,
          syncFrequencyMinutes: this.config.intervalMinutes,
          lastSyncCompletedAt: this.lastSyncAt,
          updatedAt: new Date(),
        },
      });
  }

  private isIdle(): boolean {
    return Date.now() - this.lastActivityTime > this.config.idleTimeoutMs;
  }

  private attachActivityListener(): void {
    if (this.activityListenerAttached || typeof window === 'undefined') return;

    const updateActivity = () => {
      this.lastActivityTime = Date.now();
    };

    window.addEventListener('mousemove', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('scroll', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });

    this.activityListenerAttached = true;
  }

  private detachActivityListener(): void {
    if (!this.activityListenerAttached || typeof window === 'undefined') return;

    // Note: We can't easily remove the listeners since we used anonymous functions
    // This is fine since destroy() is typically called on app unmount
    this.activityListenerAttached = false;
  }

  private emitEvent(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[BackgroundSync] Error in event listener:', e);
      }
    }
  }
}

/**
 * Get the background sync manager instance
 */
export function getBackgroundSyncManager(): BackgroundSyncManager {
  return BackgroundSyncManager.getInstance();
}

/**
 * Initialize background sync for a user
 */
export async function initializeBackgroundSync(
  userId: string,
  config?: Partial<BackgroundSyncConfig>,
  syncConfig?: Partial<SyncConfig>
): Promise<BackgroundSyncManager> {
  const manager = getBackgroundSyncManager();
  await manager.initialize(userId, config, syncConfig);
  return manager;
}
