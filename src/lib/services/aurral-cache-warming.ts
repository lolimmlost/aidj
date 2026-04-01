/**
 * Aurral Cache Warming Manager
 *
 * Automatically warms the Aurral artist metadata cache on startup
 * and on a recurring schedule (default: every 24 hours).
 * Integrates with the task aggregator for Tasks Center visibility.
 */

import { isAurralConfigured, warmArtistCache } from './aurral';

export interface AurralCacheWarmingConfig {
  /** Enable automatic cache warming */
  enabled: boolean;
  /** Interval in hours between warming runs */
  intervalHours: number;
  /** Max artists to process per run */
  limit: number;
  /** Delay after server start before first warming (ms) */
  startupDelayMs: number;
}

export const DEFAULT_AURRAL_WARMING_CONFIG: AurralCacheWarmingConfig = {
  enabled: true,
  intervalHours: 24,
  limit: 300,
  startupDelayMs: 30_000, // 30 seconds — let the server settle first
};

export interface AurralCacheWarmingStatus {
  isEnabled: boolean;
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastDurationMs: number | null;
  lastResult: { cached: number; skipped: number; failed: number } | null;
  lastError: string | null;
  intervalHours: number;
}

class AurralCacheWarmingManager {
  private static instance: AurralCacheWarmingManager | null = null;

  private config: AurralCacheWarmingConfig;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private lastDurationMs: number | null = null;
  private lastResult: { cached: number; skipped: number; failed: number } | null = null;
  private lastError: string | null = null;
  private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  private constructor() {
    this.config = { ...DEFAULT_AURRAL_WARMING_CONFIG };
  }

  static getInstance(): AurralCacheWarmingManager {
    if (!AurralCacheWarmingManager.instance) {
      AurralCacheWarmingManager.instance = new AurralCacheWarmingManager();
    }
    return AurralCacheWarmingManager.instance;
  }

  /**
   * Initialize and start the warming scheduler.
   * Safe to call multiple times — only the first call takes effect.
   */
  async initialize(config?: Partial<AurralCacheWarmingConfig>): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (!this.config.enabled) {
      console.log('[AURRAL-WARMING] Disabled by config');
      return;
    }

    // Check if Aurral is even configured
    if (!(await isAurralConfigured())) {
      console.log('[AURRAL-WARMING] Aurral not configured — skipping');
      this.config.enabled = false;
      return;
    }

    console.log(
      `[AURRAL-WARMING] Initialized: interval=${this.config.intervalHours}h, ` +
      `limit=${this.config.limit}, startup delay=${this.config.startupDelayMs}ms`
    );

    // Schedule startup warming after a delay
    this.startupTimeoutId = setTimeout(() => {
      this.startupTimeoutId = null;
      this.triggerNow();
    }, this.config.startupDelayMs);
  }

  /**
   * Trigger a warming run immediately.
   */
  async triggerNow(): Promise<void> {
    if (this.isRunning) {
      console.log('[AURRAL-WARMING] Already running, skipping');
      return;
    }

    this.isRunning = true;
    this.lastError = null;
    const startTime = Date.now();

    try {
      // Dynamic import to avoid circular deps
      const { getArtists } = await import('./navidrome');

      const artists = await getArtists(0, this.config.limit);
      const artistList = artists.map(a => ({
        name: a.name,
        navidromeId: a.id,
      }));

      console.log(`[AURRAL-WARMING] Starting warming for ${artistList.length} artists`);

      const result = await warmArtistCache(artistList, {
        concurrency: 1,
        delayMs: 1500,
      });

      this.lastResult = result;
      this.lastDurationMs = Date.now() - startTime;
      this.lastRunAt = new Date();

      console.log(
        `[AURRAL-WARMING] Complete in ${Math.round(this.lastDurationMs / 1000)}s: ` +
        `${result.cached} cached, ${result.skipped} skipped, ${result.failed} failed`
      );
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.lastDurationMs = Date.now() - startTime;
      this.lastRunAt = new Date();
      console.error('[AURRAL-WARMING] Failed:', this.lastError);
    } finally {
      this.isRunning = false;
      // Schedule next run
      if (this.config.enabled) {
        this.scheduleNextRun();
      }
    }
  }

  getStatus(): AurralCacheWarmingStatus {
    return {
      isEnabled: this.config.enabled,
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastDurationMs: this.lastDurationMs,
      lastResult: this.lastResult,
      lastError: this.lastError,
      intervalHours: this.config.intervalHours,
    };
  }

  stop(): void {
    this.config.enabled = false;
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    this.nextRunAt = null;
    console.log('[AURRAL-WARMING] Stopped');
  }

  private scheduleNextRun(): void {
    if (!this.config.enabled) return;

    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
    }

    const delayMs = this.config.intervalHours * 60 * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + delayMs);

    this.scheduledTimeoutId = setTimeout(() => {
      this.triggerNow();
    }, delayMs);

    console.log(`[AURRAL-WARMING] Next run scheduled at ${this.nextRunAt.toISOString()}`);
  }
}

/**
 * Get the singleton cache warming manager instance.
 */
export function getAurralCacheWarmingManager(): AurralCacheWarmingManager {
  return AurralCacheWarmingManager.getInstance();
}

/**
 * Initialize the cache warming manager. Call once on server startup.
 */
export async function initializeAurralCacheWarming(
  config?: Partial<AurralCacheWarmingConfig>
): Promise<AurralCacheWarmingManager> {
  const manager = getAurralCacheWarmingManager();
  await manager.initialize(config);
  return manager;
}
