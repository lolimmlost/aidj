/**
 * Background Discovery Manager
 *
 * Singleton manager that schedules and runs background discovery jobs.
 * Similar to BackgroundSyncManager, it handles:
 * - Configurable discovery intervals
 * - Automatic retry on failure
 * - Event notifications for UI updates
 * - Persistence of job state
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discoveryJobState, discoverySuggestions } from '@/lib/db/schema';
import {
  generateSuggestions,
  storeSuggestions,
  type DiscoveryConfig,
  DEFAULT_DISCOVERY_CONFIG,
} from './discovery-generator';

// ============================================================================
// Types
// ============================================================================

export interface BackgroundDiscoveryConfig {
  /** Enable automatic background discovery */
  enabled: boolean;
  /** Discovery interval in hours */
  frequencyHours: number;
  /** Retry delay in minutes after failure */
  retryDelayMinutes: number;
  /** Maximum retry attempts before disabling */
  maxRetries: number;
  /** Discovery generation config */
  discoveryConfig: DiscoveryConfig;
}

export const DEFAULT_BACKGROUND_DISCOVERY_CONFIG: BackgroundDiscoveryConfig = {
  enabled: true,
  frequencyHours: 12,
  retryDelayMinutes: 30,
  maxRetries: 3,
  discoveryConfig: DEFAULT_DISCOVERY_CONFIG,
};

export interface BackgroundDiscoveryStatus {
  isEnabled: boolean;
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
  totalSuggestionsGenerated: number;
  totalApproved: number;
  totalRejected: number;
  pendingCount: number;
}

export type DiscoveryEventType =
  | 'started'
  | 'completed'
  | 'failed'
  | 'suggestions_generated'
  | 'config_updated';

export interface DiscoveryEvent {
  type: DiscoveryEventType;
  timestamp: Date;
  data?: {
    suggestionsCount?: number;
    error?: string;
    config?: Partial<BackgroundDiscoveryConfig>;
  };
}

export type DiscoveryEventListener = (event: DiscoveryEvent) => void;

// ============================================================================
// Background Discovery Manager
// ============================================================================

/**
 * Singleton manager for background discovery jobs
 */
class BackgroundDiscoveryManager {
  private static instance: BackgroundDiscoveryManager | null = null;

  private config: BackgroundDiscoveryConfig;
  private userId: string | null = null;
  private scheduledTimeoutId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private consecutiveFailures: number = 0;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private lastError: string | null = null;
  private listeners: Set<DiscoveryEventListener> = new Set();

  private constructor() {
    this.config = { ...DEFAULT_BACKGROUND_DISCOVERY_CONFIG };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): BackgroundDiscoveryManager {
    if (!BackgroundDiscoveryManager.instance) {
      BackgroundDiscoveryManager.instance = new BackgroundDiscoveryManager();
    }
    return BackgroundDiscoveryManager.instance;
  }

  /**
   * Initialize discovery manager for a user
   */
  async initialize(
    userId: string,
    config?: Partial<BackgroundDiscoveryConfig>
  ): Promise<void> {
    this.userId = userId;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Load saved job state
    const state = await this.loadJobState();
    if (state) {
      this.lastRunAt = state.lastRunAt;
      this.consecutiveFailures = state.consecutiveFailures;
      this.lastError = state.lastError;

      if (state.enabled !== undefined) {
        this.config.enabled = state.enabled;
      }
      if (state.frequencyHours) {
        this.config.frequencyHours = state.frequencyHours;
      }
    }

    // Start background discovery if enabled
    if (this.config.enabled) {
      this.scheduleNextRun();
    }

    console.log(
      `[BackgroundDiscovery] Initialized for user ${userId}, enabled: ${this.config.enabled}`
    );
  }

  /**
   * Start or restart background discovery
   */
  start(): void {
    this.config.enabled = true;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.scheduleNextRun();
    this.saveJobState();
    console.log('[BackgroundDiscovery] Started');
  }

  /**
   * Stop background discovery
   */
  stop(): void {
    this.config.enabled = false;
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
    this.nextRunAt = null;
    this.saveJobState();
    console.log('[BackgroundDiscovery] Stopped');
  }

  /**
   * Trigger an immediate discovery run
   */
  async triggerNow(): Promise<{ success: boolean; suggestionsCount?: number; error?: string }> {
    if (!this.userId) {
      console.error('[BackgroundDiscovery] No user ID set');
      return { success: false, error: 'No user ID set' };
    }

    if (this.isRunning) {
      console.log('[BackgroundDiscovery] Discovery already running');
      return { success: false, error: 'Discovery already running' };
    }

    // Cancel any scheduled run
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }

    console.log('[BackgroundDiscovery] Starting discovery run...');
    this.isRunning = true;
    this.emitEvent({ type: 'started', timestamp: new Date() });

    // Update job state to running
    await this.updateJobState({ isRunning: true });

    try {
      // Generate suggestions
      const suggestions = await generateSuggestions(
        this.userId,
        this.config.discoveryConfig
      );

      // Store suggestions
      const storedCount = await storeSuggestions(suggestions);

      this.lastRunAt = new Date();
      this.consecutiveFailures = 0;
      this.lastError = null;

      // Save state
      await this.saveJobState();

      // Emit success event
      this.emitEvent({
        type: 'suggestions_generated',
        timestamp: new Date(),
        data: { suggestionsCount: storedCount },
      });

      this.emitEvent({ type: 'completed', timestamp: new Date() });

      // Schedule next run
      if (this.config.enabled) {
        this.scheduleNextRun();
      }

      console.log(`[BackgroundDiscovery] Completed, generated ${storedCount} suggestions`);
      return { success: true, suggestionsCount: storedCount };
    } catch (error) {
      console.error('[BackgroundDiscovery] Discovery failed:', error);
      this.consecutiveFailures++;
      this.lastError = error instanceof Error ? error.message : 'Unknown error';

      // Emit failure event
      this.emitEvent({
        type: 'failed',
        timestamp: new Date(),
        data: { error: this.lastError },
      });

      // Calculate retry delay with exponential backoff
      const retryDelay = Math.min(
        this.config.retryDelayMinutes * Math.pow(2, this.consecutiveFailures - 1),
        120 // Max 2 hours
      );

      if (this.consecutiveFailures < this.config.maxRetries) {
        console.log(
          `[BackgroundDiscovery] Scheduling retry in ${retryDelay} minutes`
        );
        this.scheduleNextRun(retryDelay * 60 * 1000);
      } else {
        console.error('[BackgroundDiscovery] Max retries exceeded, stopping');
        this.stop();
      }

      await this.saveJobState();
      return { success: false, error: this.lastError };
    } finally {
      this.isRunning = false;
      await this.updateJobState({ isRunning: false });
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<BackgroundDiscoveryStatus> {
    const pendingCount = await this.getPendingCount();

    // Load stats from database
    const state = await this.loadJobState();

    return {
      isEnabled: this.config.enabled,
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      totalSuggestionsGenerated: state?.totalSuggestionsGenerated ?? 0,
      totalApproved: state?.totalApproved ?? 0,
      totalRejected: state?.totalRejected ?? 0,
      pendingCount,
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<BackgroundDiscoveryConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Save to database
    await this.saveJobState();

    // Handle enable/disable changes
    if (config.enabled !== undefined) {
      if (config.enabled && !wasEnabled) {
        this.start();
      } else if (!config.enabled && wasEnabled) {
        this.stop();
      }
    }

    // Reschedule if interval changed
    if (config.frequencyHours !== undefined && this.config.enabled) {
      this.scheduleNextRun();
    }

    // Emit config update event
    this.emitEvent({
      type: 'config_updated',
      timestamp: new Date(),
      data: { config },
    });
  }

  /**
   * Subscribe to discovery events
   */
  subscribe(listener: DiscoveryEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Destroy the manager (for cleanup)
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.userId = null;
    BackgroundDiscoveryManager.instance = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private scheduleNextRun(delayMs?: number): void {
    if (!this.config.enabled) return;

    // Cancel existing schedule
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
    }

    const delay = delayMs ?? this.config.frequencyHours * 60 * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + delay);

    this.scheduledTimeoutId = setTimeout(() => {
      this.triggerNow();
    }, delay);

    console.log(
      `[BackgroundDiscovery] Next run scheduled for ${this.nextRunAt.toISOString()}`
    );
  }

  private async loadJobState() {
    if (!this.userId) return null;

    const result = await db
      .select()
      .from(discoveryJobState)
      .where(eq(discoveryJobState.userId, this.userId))
      .limit(1);

    return result[0] || null;
  }

  private async saveJobState(): Promise<void> {
    if (!this.userId) return;

    await db
      .insert(discoveryJobState)
      .values({
        userId: this.userId,
        enabled: this.config.enabled,
        frequencyHours: this.config.frequencyHours,
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt,
        isRunning: this.isRunning,
        consecutiveFailures: this.consecutiveFailures,
        lastError: this.lastError,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: discoveryJobState.userId,
        set: {
          enabled: this.config.enabled,
          frequencyHours: this.config.frequencyHours,
          lastRunAt: this.lastRunAt,
          nextRunAt: this.nextRunAt,
          isRunning: this.isRunning,
          consecutiveFailures: this.consecutiveFailures,
          lastError: this.lastError,
          updatedAt: new Date(),
        },
      });
  }

  private async updateJobState(
    updates: Partial<{
      isRunning: boolean;
      totalSuggestionsGenerated: number;
      totalApproved: number;
      totalRejected: number;
    }>
  ): Promise<void> {
    if (!this.userId) return;

    await db
      .update(discoveryJobState)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(discoveryJobState.userId, this.userId));
  }

  private async getPendingCount(): Promise<number> {
    if (!this.userId) return 0;

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoverySuggestions)
      .where(
        eq(discoverySuggestions.userId, this.userId),
      );

    return result[0]?.count ?? 0;
  }

  private emitEvent(event: DiscoveryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[BackgroundDiscovery] Error in event listener:', e);
      }
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get the background discovery manager instance
 */
export function getBackgroundDiscoveryManager(): BackgroundDiscoveryManager {
  return BackgroundDiscoveryManager.getInstance();
}

/**
 * Initialize background discovery for a user
 */
export async function initializeBackgroundDiscovery(
  userId: string,
  config?: Partial<BackgroundDiscoveryConfig>
): Promise<BackgroundDiscoveryManager> {
  const manager = getBackgroundDiscoveryManager();
  await manager.initialize(userId, config);
  return manager;
}
