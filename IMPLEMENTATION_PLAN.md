# Comprehensive Implementation Plan: Music Analytics & Background/Offline Play Fixes

## Executive Summary

This plan addresses all 16 identified issues across music analytics (~3,500 lines) and background/offline playback (~2,200 lines) systems. The implementation is organized into 5 phases with estimated completion times and priority levels.

---

## Phase 1: Centralize Shared Utilities (High Priority)
**Estimated Time: 2-3 hours**

### 1.1 Create Analytics Helpers Module

**File:** `/src/lib/utils/analytics-helpers.ts`

**Rationale:** The `extractArtist()` function is duplicated in 4 files:
- `recommendation-analytics.ts` (line 95-98)
- `mood-timeline-analytics.ts` (line 276-279)
- `advanced-discovery-analytics.ts` (line 152-155)
- `discovery-analytics.ts` (implicitly in processing)

**Implementation:**

```typescript
// /src/lib/utils/analytics-helpers.ts

/**
 * Centralized Analytics Helper Functions
 *
 * Consolidates duplicate functions from:
 * - recommendation-analytics.ts
 * - mood-timeline-analytics.ts
 * - advanced-discovery-analytics.ts
 * - discovery-analytics.ts
 */

// ============================================================================
// Artist/Title Extraction
// ============================================================================

/**
 * Extract artist name from "Artist - Title" format
 */
export function extractArtist(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[0]?.trim() || songArtistTitle;
}

/**
 * Extract song title from "Artist - Title" format
 */
export function extractTitle(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[1]?.trim() || '';
}

// ============================================================================
// Date Range Helpers
// ============================================================================

export type DateRangePeriod = '7d' | '30d' | '90d' | '1y' | 'all';

/**
 * Get date range from period string
 */
export function getDateRange(period: DateRangePeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2020);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Get date N days ago with time reset to midnight
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get start of week (Sunday) for a given date
 */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get start of month for a given date
 */
export function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// Trend Calculation
// ============================================================================

export type TrendDirection = 'improving' | 'declining' | 'stable';

/**
 * Calculate trend direction from rate comparison
 * @param recentRate - Recent period acceptance rate
 * @param olderRate - Older period acceptance rate
 * @param threshold - Change threshold (default 5%)
 */
export function calculateTrend(
  recentRate: number,
  olderRate: number,
  threshold: number = 0.05
): TrendDirection {
  const diff = recentRate - olderRate;
  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'declining';
  return 'stable';
}

// ============================================================================
// Diversity Score (Shannon Entropy)
// ============================================================================

/**
 * Calculate Shannon entropy-based diversity score
 * @param itemCounts - Map of item names to counts
 * @returns Normalized score between 0-1 (higher = more diverse)
 */
export function calculateDiversityScore(itemCounts: Map<string, number>): number {
  if (itemCounts.size === 0) return 0;

  const total = Array.from(itemCounts.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  // Shannon entropy: H = -Σ(p_i * log2(p_i))
  let entropy = 0;
  for (const count of itemCounts.values()) {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  // Normalize to 0-1 range (max entropy for N items is log2(N))
  const maxEntropy = Math.log2(itemCounts.size);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

// ============================================================================
// Time Slot Helpers
// ============================================================================

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeSlotConfig {
  morning: { start: number; end: number };
  afternoon: { start: number; end: number };
  evening: { start: number; end: number };
  night: { start: number; end: number };
}

// Configurable time slots (no longer hardcoded!)
export const DEFAULT_TIME_SLOTS: TimeSlotConfig = {
  morning: { start: 5, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
  night: { start: 21, end: 5 },
};

/**
 * Get time slot from hour of day
 * @param hour - Hour (0-23)
 * @param config - Optional custom time slot configuration
 */
export function getTimeSlot(hour: number, config: TimeSlotConfig = DEFAULT_TIME_SLOTS): TimeSlot {
  if (hour >= config.morning.start && hour < config.morning.end) return 'morning';
  if (hour >= config.afternoon.start && hour < config.afternoon.end) return 'afternoon';
  if (hour >= config.evening.start && hour < config.evening.end) return 'evening';
  return 'night';
}

// ============================================================================
// A/B Test Confidence Intervals
// ============================================================================

/**
 * Calculate Wilson score confidence interval for binomial proportion
 * Used for A/B test result confidence intervals
 *
 * @param successes - Number of successes (e.g., thumbs up)
 * @param total - Total sample size
 * @param confidence - Confidence level (default 0.95 for 95%)
 */
export function calculateConfidenceInterval(
  successes: number,
  total: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 0 };

  // Z-score for confidence level
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;

  const p = successes / total;
  const n = total;

  // Wilson score interval
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}
```

### 1.2 Update Analytics Services to Use Shared Helpers

**Files to update:**
- `/src/lib/services/recommendation-analytics.ts`
- `/src/lib/services/mood-timeline-analytics.ts`
- `/src/lib/services/advanced-discovery-analytics.ts`
- `/src/lib/services/discovery-analytics.ts`

**Changes per file:**

```typescript
// Add import at top of each file
import {
  extractArtist,
  extractTitle,
  getDateRange,
  getDaysAgo,
  getStartOfWeek,
  getStartOfMonth,
  calculateTrend,
  calculateDiversityScore,
  getTimeSlot,
  calculateConfidenceInterval,
  type TimeSlot,
  type TrendDirection,
} from '@/lib/utils/analytics-helpers';

// Remove local definitions of these functions
```

---

## Phase 2: Unified Cache Manager (High Priority)
**Estimated Time: 3-4 hours**

### 2.1 Create Unified Cache Service

**File:** `/src/lib/services/cache/analytics-cache.ts`

**Rationale:** Each service has independent caches with different TTLs:
- `recommendation-analytics.ts`: 60 min TTL
- `mood-timeline-analytics.ts`: 30 min TTL
- `advanced-discovery-analytics.ts`: 30 min TTL

**Implementation:**

```typescript
// /src/lib/services/cache/analytics-cache.ts

/**
 * Unified Analytics Cache Manager
 *
 * Provides consistent caching across all analytics services with:
 * - Configurable TTLs per cache type
 * - Automatic cache invalidation on data updates
 * - Memory-efficient LRU eviction
 * - Optional Redis backend for production
 */

export type CacheType =
  | 'taste-evolution'
  | 'quality-metrics'
  | 'activity-trends'
  | 'discovery-insights'
  | 'mood-timeline'
  | 'mode-metrics'
  | 'top-artists'
  | 'top-genres'
  | 'engagement-patterns'
  | 'ab-tests'
  | 'discovery-summary';

interface CacheConfig {
  ttlMs: number;
  maxSize: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

// Default cache configurations
const CACHE_CONFIGS: Record<CacheType, CacheConfig> = {
  // High-frequency, lower TTL
  'quality-metrics': { ttlMs: 30 * 60 * 1000, maxSize: 500 },
  'activity-trends': { ttlMs: 30 * 60 * 1000, maxSize: 500 },
  'mode-metrics': { ttlMs: 30 * 60 * 1000, maxSize: 500 },
  'engagement-patterns': { ttlMs: 30 * 60 * 1000, maxSize: 500 },

  // Medium-frequency
  'taste-evolution': { ttlMs: 60 * 60 * 1000, maxSize: 200 },
  'discovery-insights': { ttlMs: 60 * 60 * 1000, maxSize: 200 },
  'top-artists': { ttlMs: 60 * 60 * 1000, maxSize: 300 },
  'top-genres': { ttlMs: 60 * 60 * 1000, maxSize: 300 },
  'ab-tests': { ttlMs: 60 * 60 * 1000, maxSize: 100 },
  'discovery-summary': { ttlMs: 60 * 60 * 1000, maxSize: 200 },

  // Lower-frequency, higher TTL
  'mood-timeline': { ttlMs: 30 * 60 * 1000, maxSize: 100 },
};

class AnalyticsCacheManager {
  private caches = new Map<CacheType, Map<string, CacheEntry<any>>>();
  private invalidationCallbacks = new Map<string, Set<() => void>>();

  constructor() {
    // Initialize cache maps
    for (const cacheType of Object.keys(CACHE_CONFIGS) as CacheType[]) {
      this.caches.set(cacheType, new Map());
    }
  }

  /**
   * Get cached data
   */
  get<T>(cacheType: CacheType, key: string): T | null {
    const cache = this.caches.get(cacheType);
    if (!cache) return null;

    const entry = cache.get(key);
    if (!entry) return null;

    const config = CACHE_CONFIGS[cacheType];
    if (Date.now() - entry.timestamp > config.ttlMs) {
      cache.delete(key);
      return null;
    }

    // Update access count for LRU
    entry.accessCount++;
    return entry.data as T;
  }

  /**
   * Set cached data
   */
  set<T>(cacheType: CacheType, key: string, data: T): void {
    const cache = this.caches.get(cacheType);
    if (!cache) return;

    const config = CACHE_CONFIGS[cacheType];

    // LRU eviction if at capacity
    if (cache.size >= config.maxSize) {
      this.evictLRU(cache);
    }

    cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 0,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(cache: Map<string, CacheEntry<any>>): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestAccess = Infinity;

    for (const [key, entry] of cache.entries()) {
      // Prioritize by access count, then by age
      if (entry.accessCount < lowestAccess ||
          (entry.accessCount === lowestAccess && entry.timestamp < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.timestamp;
        lowestAccess = entry.accessCount;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  /**
   * Clear cache for a specific user
   */
  clearForUser(userId: string): void {
    for (const cache of this.caches.values()) {
      for (const key of cache.keys()) {
        if (key.startsWith(userId)) {
          cache.delete(key);
        }
      }
    }
    console.log(`[AnalyticsCache] Cleared cache for user: ${userId}`);
  }

  /**
   * Clear specific cache type
   */
  clearCacheType(cacheType: CacheType): void {
    const cache = this.caches.get(cacheType);
    if (cache) {
      cache.clear();
      console.log(`[AnalyticsCache] Cleared cache type: ${cacheType}`);
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    console.log('[AnalyticsCache] Cleared all caches');
  }

  /**
   * Register callback for automatic invalidation
   */
  onInvalidate(event: string, callback: () => void): void {
    if (!this.invalidationCallbacks.has(event)) {
      this.invalidationCallbacks.set(event, new Set());
    }
    this.invalidationCallbacks.get(event)!.add(callback);
  }

  /**
   * Trigger invalidation for an event
   */
  triggerInvalidation(event: string): void {
    const callbacks = this.invalidationCallbacks.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback();
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): Record<CacheType, { size: number; hitRate: number }> {
    const stats: Record<string, { size: number; hitRate: number }> = {};

    for (const [cacheType, cache] of this.caches.entries()) {
      const totalAccess = Array.from(cache.values())
        .reduce((sum, entry) => sum + entry.accessCount, 0);
      stats[cacheType] = {
        size: cache.size,
        hitRate: cache.size > 0 ? totalAccess / cache.size : 0,
      };
    }

    return stats as Record<CacheType, { size: number; hitRate: number }>;
  }

  /**
   * Build cache key with consistent format
   */
  buildKey(userId: string, ...parts: (string | number)[]): string {
    return [userId, ...parts].join(':');
  }
}

// Singleton instance
export const analyticsCache = new AnalyticsCacheManager();

// Export types and helper
export { CACHE_CONFIGS };
export type { CacheConfig };
```

### 2.2 Automatic Cache Invalidation

**File:** `/src/lib/services/cache/cache-invalidation.ts`

```typescript
// /src/lib/services/cache/cache-invalidation.ts

import { analyticsCache } from './analytics-cache';

/**
 * Cache Invalidation Events
 *
 * Automatically invalidate relevant caches when data changes
 */

export type InvalidationEvent =
  | 'feedback-added'
  | 'listening-history-recorded'
  | 'preference-updated'
  | 'playlist-created'
  | 'playlist-modified';

const EVENT_CACHE_MAPPINGS: Record<InvalidationEvent, string[]> = {
  'feedback-added': [
    'quality-metrics',
    'activity-trends',
    'discovery-insights',
    'mode-metrics',
    'top-artists',
    'top-genres',
    'engagement-patterns',
    'ab-tests',
    'discovery-summary',
    'taste-evolution',
  ],
  'listening-history-recorded': [
    'mood-timeline',
    'activity-trends',
    'discovery-insights',
  ],
  'preference-updated': [
    'discovery-summary',
    'mode-metrics',
  ],
  'playlist-created': [
    'discovery-summary',
  ],
  'playlist-modified': [
    'discovery-summary',
  ],
};

/**
 * Invalidate caches for a specific event and user
 */
export function invalidateCachesForEvent(
  event: InvalidationEvent,
  userId: string
): void {
  const cacheTypes = EVENT_CACHE_MAPPINGS[event];
  if (!cacheTypes) return;

  console.log(`[CacheInvalidation] Event: ${event} for user: ${userId}`);
  analyticsCache.clearForUser(userId);
}

/**
 * Hook to call after feedback submission
 */
export function onFeedbackAdded(userId: string): void {
  invalidateCachesForEvent('feedback-added', userId);
}

/**
 * Hook to call after listening history is recorded
 */
export function onListeningHistoryRecorded(userId: string): void {
  invalidateCachesForEvent('listening-history-recorded', userId);
}

/**
 * Hook to call after preference update
 */
export function onPreferenceUpdated(userId: string): void {
  invalidateCachesForEvent('preference-updated', userId);
}
```

---

## Phase 3: Audio Player Modularization (High Priority)
**Estimated Time: 4-6 hours**

### 3.1 Extract Media Session Service

**File:** `/src/lib/services/audio/media-session.ts`

**Rationale:** Media Session logic is duplicated in the `playing` event handler and setup phase (lines 1085-1371 in audio-player.tsx). Extract to dedicated service.

```typescript
// /src/lib/services/audio/media-session.ts

/**
 * Media Session Service
 *
 * Handles lock screen / notification controls for audio playback.
 * Extracted from audio-player.tsx for maintainability.
 */

import type { Song } from '@/lib/types/song';

interface MediaSessionCallbacks {
  onPlay: () => Promise<void>;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onSeekTo: (time: number) => void;
}

interface MediaSessionConfig {
  getCoverArtUrl: (albumId: string, size: number) => string;
}

const DEFAULT_CONFIG: MediaSessionConfig = {
  getCoverArtUrl: (albumId, size) =>
    `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`,
};

class MediaSessionService {
  private isSupported: boolean;
  private config: MediaSessionConfig;
  private callbacks: MediaSessionCallbacks | null = null;
  private currentSong: Song | null = null;
  private audioElement: HTMLAudioElement | null = null;

  constructor(config: MediaSessionConfig = DEFAULT_CONFIG) {
    this.isSupported = 'mediaSession' in navigator;
    this.config = config;
  }

  /**
   * Check if Media Session API is supported
   */
  get supported(): boolean {
    return this.isSupported;
  }

  /**
   * Initialize with audio element and callbacks
   */
  initialize(
    audioElement: HTMLAudioElement,
    callbacks: MediaSessionCallbacks
  ): void {
    if (!this.isSupported) {
      console.log('[MediaSession] API not supported');
      return;
    }

    this.audioElement = audioElement;
    this.callbacks = callbacks;

    // Set up event listeners
    audioElement.addEventListener('playing', this.handlePlaying);
    audioElement.addEventListener('pause', this.handlePause);
    audioElement.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', this.handleTimeUpdate);

    console.log('[MediaSession] Initialized');
  }

  /**
   * Clean up event listeners
   */
  cleanup(): void {
    if (!this.audioElement) return;

    this.audioElement.removeEventListener('playing', this.handlePlaying);
    this.audioElement.removeEventListener('pause', this.handlePause);
    this.audioElement.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate);

    this.clearActionHandlers();
    this.audioElement = null;
    this.callbacks = null;

    console.log('[MediaSession] Cleaned up');
  }

  /**
   * Update current song metadata
   */
  updateSong(song: Song): void {
    if (!this.isSupported) return;

    this.currentSong = song;
    this.updateMetadata();
  }

  /**
   * Set playback state
   */
  setPlaybackState(state: 'playing' | 'paused' | 'none'): void {
    if (!this.isSupported) return;
    navigator.mediaSession.playbackState = state;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handlePlaying = (): void => {
    if (!this.callbacks || !this.currentSong) return;

    console.log('[MediaSession] Playing - setting up handlers');

    this.setPlaybackState('playing');
    this.updateMetadata();
    this.setupActionHandlers();
  };

  private handlePause = (): void => {
    this.setPlaybackState('paused');
  };

  private handleLoadedMetadata = (): void => {
    this.updateMetadata();
  };

  private handleTimeUpdate = (): void => {
    this.updatePositionState();
  };

  private updateMetadata(): void {
    if (!this.currentSong) return;

    const artwork: MediaImage[] = [];
    if (this.currentSong.albumId) {
      const coverUrl = this.config.getCoverArtUrl(this.currentSong.albumId, 512);
      artwork.push(
        { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
        { src: coverUrl.replace('size=512', 'size=256'), sizes: '256x256', type: 'image/jpeg' },
        { src: coverUrl.replace('size=512', 'size=128'), sizes: '128x128', type: 'image/jpeg' },
      );
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.currentSong.name || this.currentSong.title || 'Unknown Song',
      artist: this.currentSong.artist || 'Unknown Artist',
      album: this.currentSong.album || '',
      artwork: artwork.length > 0 ? artwork : undefined,
    });
  }

  private updatePositionState(): void {
    if (!this.audioElement) return;

    const { duration, currentTime, playbackRate } = this.audioElement;

    if (duration && isFinite(duration) && isFinite(currentTime)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate,
          position: currentTime,
        });
      } catch {
        // Position state not supported or invalid
      }
    }
  }

  private setupActionHandlers(): void {
    if (!this.callbacks) return;

    try {
      // Play/Pause handlers
      navigator.mediaSession.setActionHandler('play', this.callbacks.onPlay);
      navigator.mediaSession.setActionHandler('pause', this.callbacks.onPause);

      // Track navigation - iOS requires these in 'playing' event
      navigator.mediaSession.setActionHandler('previoustrack', this.callbacks.onPreviousTrack);
      navigator.mediaSession.setActionHandler('nexttrack', this.callbacks.onNextTrack);

      // Seek handler
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && isFinite(details.seekTime)) {
          this.callbacks!.onSeekTo(details.seekTime);
        }
      });

      console.log('[MediaSession] Action handlers registered');
    } catch (e) {
      console.error('[MediaSession] Failed to set handlers:', e);
    }
  }

  private clearActionHandlers(): void {
    try {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Singleton export
export const mediaSessionService = new MediaSessionService();

export type { MediaSessionCallbacks, MediaSessionConfig };
```

### 3.2 Extract Playback Recovery Service

**File:** `/src/lib/services/audio/playback-recovery.ts`

```typescript
// /src/lib/services/audio/playback-recovery.ts

/**
 * Playback Recovery Service
 *
 * Handles network errors, stall recovery, and stream reconnection.
 * Extracted from audio-player.tsx for maintainability.
 */

interface RecoveryConfig {
  maxStallAttempts: number;
  stallCheckDelayMs: number;
  networkRecoveryTimeoutMs: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  maxStallAttempts: 3,
  stallCheckDelayMs: 3000,
  networkRecoveryTimeoutMs: 15000,
  retryDelayMs: 1000,
};

interface RecoveryCallbacks {
  onRecoveryStart: () => void;
  onRecoverySuccess: () => void;
  onRecoveryFailed: (error: string) => void;
  onIsPlayingChange: (isPlaying: boolean) => void;
}

class PlaybackRecoveryService {
  private config: RecoveryConfig;
  private callbacks: RecoveryCallbacks | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private stallRecoveryAttempts = 0;
  private stallRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(config: RecoveryConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Initialize with audio element and callbacks
   */
  initialize(
    audioElement: HTMLAudioElement,
    callbacks: RecoveryCallbacks
  ): void {
    this.audioElement = audioElement;
    this.callbacks = callbacks;
    this.abortController = new AbortController();

    audioElement.addEventListener('stalled', this.handleStalled, { signal: this.abortController.signal });
    audioElement.addEventListener('error', this.handleError, { signal: this.abortController.signal });

    console.log('[PlaybackRecovery] Initialized');
  }

  /**
   * Clean up
   */
  cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;

    if (this.stallRecoveryTimeout) {
      clearTimeout(this.stallRecoveryTimeout);
      this.stallRecoveryTimeout = null;
    }

    this.audioElement = null;
    this.callbacks = null;
    this.stallRecoveryAttempts = 0;

    console.log('[PlaybackRecovery] Cleaned up');
  }

  /**
   * Attempt to recover playback with fresh stream
   */
  async recoverWithFreshStream(
    currentUrl: string,
    isPlaying: boolean
  ): Promise<boolean> {
    if (!this.audioElement || !this.callbacks) return false;

    this.callbacks.onRecoveryStart();

    try {
      const audio = this.audioElement;
      const currentTime = audio.currentTime;

      // Clear and reload with cache buster
      audio.src = '';
      audio.src = `${currentUrl}?t=${Date.now()}`;
      audio.load();

      // Wait for canplay
      await this.waitForCanPlay(this.config.networkRecoveryTimeoutMs);

      // Restore position if valid
      if (currentTime > 0 && isFinite(currentTime)) {
        audio.currentTime = Math.max(0, currentTime - 1);
      }

      // Resume if was playing
      if (isPlaying) {
        await audio.play();
        this.callbacks.onIsPlayingChange(true);
      }

      this.callbacks.onRecoverySuccess();
      this.stallRecoveryAttempts = 0;
      console.log('[PlaybackRecovery] Recovery successful');
      return true;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PlaybackRecovery] Recovery failed:', message);
      this.callbacks.onRecoveryFailed(message);
      return false;
    }
  }

  /**
   * Reset recovery attempts counter
   */
  resetAttempts(): void {
    this.stallRecoveryAttempts = 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleStalled = async (): Promise<void> => {
    if (!this.audioElement || !this.callbacks) return;

    console.log('[PlaybackRecovery] Audio stalled');
    this.callbacks.onRecoveryStart();

    // Clear existing timeout
    if (this.stallRecoveryTimeout) {
      clearTimeout(this.stallRecoveryTimeout);
    }

    this.stallRecoveryTimeout = setTimeout(async () => {
      await this.attemptStallRecovery();
    }, this.config.stallCheckDelayMs);
  };

  private handleError = (e: Event): void => {
    const audio = e.target as HTMLAudioElement;
    if (audio.error?.code === MediaError.MEDIA_ERR_NETWORK) {
      console.log('[PlaybackRecovery] Network error detected');
      this.callbacks?.onIsPlayingChange(false);
    }
  };

  private async attemptStallRecovery(): Promise<void> {
    if (!this.audioElement || !this.callbacks) return;

    const audio = this.audioElement;

    // Don't recover if not playing
    if (audio.paused || audio.ended) return;

    // Check if actually making progress
    const initialTime = audio.currentTime;
    await this.delay(2000);

    if (audio.currentTime !== initialTime || audio.paused) {
      // Making progress or user paused
      this.stallRecoveryAttempts = 0;
      this.callbacks.onRecoverySuccess();
      return;
    }

    this.stallRecoveryAttempts++;
    console.log(`[PlaybackRecovery] Stall recovery attempt ${this.stallRecoveryAttempts}/${this.config.maxStallAttempts}`);

    if (this.stallRecoveryAttempts > this.config.maxStallAttempts) {
      this.callbacks.onRecoveryFailed('Maximum recovery attempts exceeded');
      return;
    }

    // Attempt recovery
    const currentUrl = audio.src.split('?')[0]; // Remove existing cache buster
    await this.recoverWithFreshStream(currentUrl, true);
  }

  private waitForCanPlay(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.audioElement) {
        reject(new Error('No audio element'));
        return;
      }

      const audio = this.audioElement;
      const timeout = setTimeout(() => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        reject(new Error('Timeout waiting for canplay'));
      }, timeoutMs);

      const onCanPlay = () => {
        clearTimeout(timeout);
        audio.removeEventListener('error', onError);
        resolve();
      };

      const onError = () => {
        clearTimeout(timeout);
        audio.removeEventListener('canplay', onCanPlay);
        reject(new Error('Error during load'));
      };

      audio.addEventListener('canplay', onCanPlay, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton export
export const playbackRecoveryService = new PlaybackRecoveryService();

export type { RecoveryConfig, RecoveryCallbacks };
```

### 3.3 Extract Interrupt Handler

**File:** `/src/lib/services/audio/interrupt-handler.ts`

```typescript
// /src/lib/services/audio/interrupt-handler.ts

/**
 * Audio Interrupt Handler
 *
 * Handles iOS audio interruptions (notifications, calls, Siri).
 * Extracted from audio-player.tsx for maintainability.
 */

interface InterruptConfig {
  maxInterruptionAgeMs: number;
  backgroundResumeMaxAttempts: number;
  backgroundResumeInitialDelayMs: number;
}

const DEFAULT_CONFIG: InterruptConfig = {
  maxInterruptionAgeMs: 30000, // 30 seconds
  backgroundResumeMaxAttempts: 3,
  backgroundResumeInitialDelayMs: 500,
};

interface InterruptCallbacks {
  onPlaybackResumed: () => void;
  onPlaybackPaused: () => void;
  onResumeAttemptFailed: () => void;
}

class AudioInterruptHandler {
  private config: InterruptConfig;
  private callbacks: InterruptCallbacks | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private wasPlayingBeforeInterruption = false;
  private isUserInitiatedPause = false;
  private interruptionTimestamp: number | null = null;
  private wasHiddenBeforePause = false;
  private abortController: AbortController | null = null;

  constructor(config: InterruptConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Initialize with audio element and callbacks
   */
  initialize(
    audioElement: HTMLAudioElement,
    callbacks: InterruptCallbacks
  ): void {
    this.audioElement = audioElement;
    this.callbacks = callbacks;
    this.abortController = new AbortController();

    audioElement.addEventListener('pause', this.handlePause, { signal: this.abortController.signal });
    audioElement.addEventListener('playing', this.handlePlaying, { signal: this.abortController.signal });
    document.addEventListener('visibilitychange', this.handleVisibilityChange, { signal: this.abortController.signal });

    console.log('[InterruptHandler] Initialized');
  }

  /**
   * Clean up
   */
  cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.audioElement = null;
    this.callbacks = null;
    this.reset();

    console.log('[InterruptHandler] Cleaned up');
  }

  /**
   * Mark pause as user-initiated
   */
  markUserInitiatedPause(): void {
    this.isUserInitiatedPause = true;
  }

  /**
   * Clear user-initiated pause flag
   */
  clearUserInitiatedPause(): void {
    this.isUserInitiatedPause = false;
  }

  /**
   * Check if currently tracking an interruption
   */
  get isTrackingInterruption(): boolean {
    return this.wasPlayingBeforeInterruption && this.interruptionTimestamp !== null;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.wasPlayingBeforeInterruption = false;
    this.isUserInitiatedPause = false;
    this.interruptionTimestamp = null;
    this.wasHiddenBeforePause = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handlePause = (): void => {
    if (!this.audioElement || !this.callbacks) return;

    // Only track if this wasn't user-initiated
    if (!this.isUserInitiatedPause) {
      this.interruptionTimestamp = Date.now();
      this.wasHiddenBeforePause = document.visibilityState === 'hidden';
      this.wasPlayingBeforeInterruption = true;

      console.log(`[InterruptHandler] Pause detected (wasHidden: ${this.wasHiddenBeforePause})`);

      // If in background, try to resume after interruption
      if (this.wasHiddenBeforePause) {
        this.attemptBackgroundResume(1);
      }
    }
  };

  private handlePlaying = (): void => {
    // Reset all flags when playback starts
    this.wasPlayingBeforeInterruption = false;
    this.isUserInitiatedPause = false;
    this.interruptionTimestamp = null;
    this.callbacks?.onPlaybackResumed();
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.handleVisibilityHidden();
    } else {
      this.handleVisibilityVisible();
    }
  };

  private handleVisibilityHidden(): void {
    // If interruption is stale, user probably left intentionally
    if (this.interruptionTimestamp) {
      const elapsed = Date.now() - this.interruptionTimestamp;
      if (elapsed > 1000) {
        console.log('[InterruptHandler] User left intentionally');
        this.reset();
      }
    }
  }

  private handleVisibilityVisible(): void {
    if (!this.audioElement || !this.callbacks) return;

    if (!this.interruptionTimestamp || !this.wasPlayingBeforeInterruption) return;

    const elapsed = Date.now() - this.interruptionTimestamp;

    if (elapsed < this.config.maxInterruptionAgeMs) {
      console.log(`[InterruptHandler] Resuming after ${elapsed}ms interruption`);
      this.attemptResume();
    } else {
      console.log(`[InterruptHandler] Interruption too old (${elapsed}ms)`);
      this.reset();
    }
  }

  private attemptBackgroundResume(attempt: number): void {
    if (!this.audioElement || !this.callbacks) return;
    if (attempt > this.config.backgroundResumeMaxAttempts) {
      console.log('[InterruptHandler] Background resume failed');
      this.callbacks.onResumeAttemptFailed();
      return;
    }

    const delay = this.config.backgroundResumeInitialDelayMs * Math.pow(1.5, attempt - 1);

    setTimeout(() => {
      if (!this.wasPlayingBeforeInterruption || !this.audioElement?.paused) return;

      console.log(`[InterruptHandler] Background resume attempt ${attempt}`);

      this.audioElement.play()
        .then(() => {
          console.log('[InterruptHandler] Background resume success');
          this.callbacks?.onPlaybackResumed();
          this.reset();
        })
        .catch(() => {
          this.attemptBackgroundResume(attempt + 1);
        });
    }, delay);
  }

  private attemptResume(): void {
    if (!this.audioElement || !this.callbacks) return;
    if (!this.audioElement.paused) return;

    setTimeout(() => {
      this.audioElement!.play()
        .then(() => {
          console.log('[InterruptHandler] Resume success');
          this.callbacks?.onPlaybackResumed();
          this.reset();
        })
        .catch(() => {
          console.log('[InterruptHandler] Resume failed');
          this.callbacks?.onResumeAttemptFailed();
          this.reset();
        });
    }, 100);
  }
}

// Singleton export
export const audioInterruptHandler = new AudioInterruptHandler();

export type { InterruptConfig, InterruptCallbacks };
```

### 3.4 Add Preload Audio Cleanup

**File:** Update `/src/components/ui/audio-player.tsx`

**Issue:** Preload audio element (line 70) is created but never cleaned up.

```typescript
// Add cleanup in useEffect return:

useEffect(() => {
  // ... existing code ...

  return () => {
    // Clean up preload audio element
    if (preloadAudioRef.current) {
      preloadAudioRef.current.src = '';
      preloadAudioRef.current = null;
      preloadedSongIdRef.current = null;
    }
    // ... rest of cleanup ...
  };
}, [/* deps */]);
```

---

## Phase 4: Scrobble Queue with beforeunload (High Priority)
**Estimated Time: 1-2 hours**

### 4.1 Create Scrobble Queue Service

**File:** `/src/lib/services/audio/scrobble-queue.ts`

**Rationale:** Scrobbling happens asynchronously after song end (lines 514-543), risking data loss if page closes.

```typescript
// /src/lib/services/audio/scrobble-queue.ts

/**
 * Scrobble Queue Service
 *
 * Ensures scrobbles are not lost on page close using:
 * - navigator.sendBeacon for reliable delivery
 * - IndexedDB for persistence
 * - Automatic retry on failure
 */

interface PendingScrobble {
  songId: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  duration: number;
  playDuration: number;
  timestamp: number;
  submitted: boolean;
}

class ScrobbleQueue {
  private queue: PendingScrobble[] = [];
  private isProcessing = false;
  private dbName = 'aidj-scrobbles';
  private storeName = 'pending';

  constructor() {
    // Load pending scrobbles from IndexedDB on init
    this.loadFromStorage();

    // Set up beforeunload handler
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
      window.addEventListener('pagehide', this.handlePageHide);
    }
  }

  /**
   * Add a scrobble to the queue
   */
  enqueue(scrobble: Omit<PendingScrobble, 'timestamp' | 'submitted'>): void {
    const pending: PendingScrobble = {
      ...scrobble,
      timestamp: Date.now(),
      submitted: false,
    };

    this.queue.push(pending);
    this.saveToStorage();

    // Try to submit immediately
    this.processQueue();
  }

  /**
   * Process pending scrobbles
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    const pending = this.queue.filter(s => !s.submitted);

    for (const scrobble of pending) {
      try {
        await this.submitScrobble(scrobble);
        scrobble.submitted = true;
      } catch (error) {
        console.warn('[ScrobbleQueue] Failed to submit:', error);
      }
    }

    // Remove submitted scrobbles
    this.queue = this.queue.filter(s => !s.submitted);
    this.saveToStorage();

    this.isProcessing = false;
  }

  /**
   * Get pending count
   */
  get pendingCount(): number {
    return this.queue.filter(s => !s.submitted).length;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async submitScrobble(scrobble: PendingScrobble): Promise<void> {
    const response = await fetch('/api/listening-history/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        songId: scrobble.songId,
        artist: scrobble.artist,
        title: scrobble.title,
        album: scrobble.album,
        genre: scrobble.genre,
        duration: scrobble.duration,
        playDuration: scrobble.playDuration,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  private handleBeforeUnload = (): void => {
    this.flushWithBeacon();
  };

  private handlePageHide = (): void => {
    this.flushWithBeacon();
  };

  /**
   * Use sendBeacon for reliable delivery on page close
   */
  private flushWithBeacon(): void {
    const pending = this.queue.filter(s => !s.submitted);

    for (const scrobble of pending) {
      const data = JSON.stringify({
        songId: scrobble.songId,
        artist: scrobble.artist,
        title: scrobble.title,
        album: scrobble.album,
        genre: scrobble.genre,
        duration: scrobble.duration,
        playDuration: scrobble.playDuration,
      });

      try {
        navigator.sendBeacon('/api/listening-history/record', new Blob([data], { type: 'application/json' }));
        scrobble.submitted = true;
        console.log('[ScrobbleQueue] Sent via beacon:', scrobble.songId);
      } catch (error) {
        console.warn('[ScrobbleQueue] Beacon failed:', error);
      }
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        this.queue = request.result || [];
        db.close();

        // Process any pending scrobbles
        if (this.queue.length > 0) {
          console.log(`[ScrobbleQueue] Loaded ${this.queue.length} pending scrobbles`);
          this.processQueue();
        }
      };
    } catch (error) {
      console.warn('[ScrobbleQueue] Failed to load from storage:', error);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      // Clear and re-add all
      store.clear();
      for (const scrobble of this.queue) {
        store.add(scrobble);
      }

      tx.oncomplete = () => db.close();
    } catch (error) {
      console.warn('[ScrobbleQueue] Failed to save to storage:', error);
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { autoIncrement: true });
        }
      };
    });
  }
}

// Singleton export
export const scrobbleQueue = new ScrobbleQueue();
```

### 4.2 Update Audio Player to Use Scrobble Queue

**File:** Update `/src/components/ui/audio-player.tsx`

```typescript
// Add import
import { scrobbleQueue } from '@/lib/services/audio/scrobble-queue';

// Replace async scrobble calls with queue:
// In onEnded handler (around line 522):

// Old:
fetch('/api/listening-history/record', { ... })

// New:
scrobbleQueue.enqueue({
  songId: endedSongId,
  artist: endedSong.artist || 'Unknown',
  title: endedSong.name || endedSong.title || 'Unknown',
  album: endedSong.album,
  genre: endedSong.genre,
  duration: endedDuration,
  playDuration: endedPlayTime,
});
```

---

## Phase 5: A/B Test Confidence Intervals & Database Improvements (Medium Priority)
**Estimated Time: 2-3 hours**

### 5.1 Add Confidence Intervals to A/B Tests

**File:** Update `/src/lib/services/advanced-discovery-analytics.ts`

```typescript
// Import the confidence interval calculator
import { calculateConfidenceInterval } from '@/lib/utils/analytics-helpers';

// Update getABTestResults function (around line 687):
variants.push({
  variantName,
  variantId: variantName,
  sampleSize: group.shown,
  acceptanceRate,
  clickThroughRate,
  playRate,
  saveRate,
  // Add confidence interval!
  confidenceInterval: calculateConfidenceInterval(group.liked, totalFeedback, 0.95),
  isWinner: false,
});
```

### 5.2 Add Database Indexes

**File:** Create migration `/src/lib/db/migrations/add-analytics-indexes.ts`

```typescript
// /src/lib/db/migrations/add-analytics-indexes.ts

import { sql } from 'drizzle-orm';
import { db } from '../index';

/**
 * Add indexes for analytics query optimization
 */
export async function addAnalyticsIndexes() {
  console.log('Adding analytics indexes...');

  // listening_history indexes
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_listening_history_user_timestamp
    ON listening_history (user_id, played_at DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_listening_history_user_song
    ON listening_history (user_id, song_id);
  `);

  // recommendation_feedback indexes
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_feedback_user_timestamp
    ON recommendation_feedback (user_id, timestamp DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_feedback_user_type
    ON recommendation_feedback (user_id, feedback_type);
  `);

  // discovery_feed_items indexes
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_feed_items_user_created
    ON discovery_feed_items (user_id, created_at DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_feed_items_source
    ON discovery_feed_items (recommendation_source);
  `);

  console.log('Analytics indexes added successfully');
}
```

### 5.3 Wake Lock Retry Mechanism

**File:** Update `/src/components/ui/audio-player.tsx` (lines 729-782)

```typescript
// Enhanced wake lock with retry
const requestWakeLock = async (retryCount = 0, maxRetries = 3) => {
  if (!('wakeLock' in navigator)) {
    console.log('[WakeLock] API not supported');
    return;
  }

  try {
    if (isPlaying && !wakeLockRef.current) {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired');

      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released');
        wakeLockRef.current = null;
        if (isPlaying && document.visibilityState === 'visible') {
          requestWakeLock(0, maxRetries);
        }
      });
    } else if (!isPlaying && wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('[WakeLock] Released (playback stopped)');
    }
  } catch (err) {
    console.log('[WakeLock] Request failed:', err);

    // Retry if page becomes visible
    if (retryCount < maxRetries && document.visibilityState === 'visible') {
      setTimeout(() => {
        requestWakeLock(retryCount + 1, maxRetries);
      }, 1000 * (retryCount + 1));
    }
  }
};
```

---

## Phase 6: Lower Priority Improvements
**Estimated Time: 3-4 hours**

### 6.1 Genre Metadata Fallback Enhancement

**File:** Update `/src/lib/services/advanced-discovery-analytics.ts`

```typescript
// In getTopRecommendedGenres, improve fallback logic (around line 436):

// Instead of using source as genre placeholder:
// const genre = `${fb.source} recommendations`;

// Try to extract genre from other sources:
async function extractGenreFromSong(songId: string): Promise<string | null> {
  // Try listening history first
  const historyEntry = await db
    .select({ genre: listeningHistory.genre })
    .from(listeningHistory)
    .where(eq(listeningHistory.songId, songId))
    .limit(1)
    .then(rows => rows[0]);

  if (historyEntry?.genre) return historyEntry.genre;

  // Could also call Navidrome API for song info
  return null;
}
```

### 6.2 Query Timeout Protection

**File:** Create `/src/lib/utils/query-timeout.ts`

```typescript
// /src/lib/utils/query-timeout.ts

/**
 * Wrap database queries with timeout protection
 */
export async function withQueryTimeout<T>(
  query: Promise<T>,
  timeoutMs: number = 30000,
  fallback?: T
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([query, timeoutPromise]);
  } catch (error) {
    if (fallback !== undefined) {
      console.warn('[QueryTimeout] Using fallback due to:', error);
      return fallback;
    }
    throw error;
  }
}

// Usage:
// const result = await withQueryTimeout(
//   db.select().from(table).where(...),
//   10000,
//   [] // fallback to empty array
// );
```

---

## Implementation Summary

| Phase | Priority | Time | Description |
|-------|----------|------|-------------|
| 1 | High | 2-3h | Centralize shared utilities (extractArtist, etc.) |
| 2 | High | 3-4h | Unified cache manager with auto-invalidation |
| 3 | High | 4-6h | Audio player modularization |
| 4 | High | 1-2h | Scrobble queue with beforeunload |
| 5 | Medium | 2-3h | A/B test confidence intervals, DB indexes |
| 6 | Low | 3-4h | Genre fallbacks, query timeouts |

**Total Estimated Time: 15-22 hours**

---

## Files to Create

1. `/src/lib/utils/analytics-helpers.ts` - Shared analytics functions
2. `/src/lib/services/cache/analytics-cache.ts` - Unified cache manager
3. `/src/lib/services/cache/cache-invalidation.ts` - Auto-invalidation hooks
4. `/src/lib/services/audio/media-session.ts` - Media Session service
5. `/src/lib/services/audio/playback-recovery.ts` - Recovery service
6. `/src/lib/services/audio/interrupt-handler.ts` - iOS interrupt handling
7. `/src/lib/services/audio/scrobble-queue.ts` - Scrobble queue with beacon
8. `/src/lib/db/migrations/add-analytics-indexes.ts` - DB indexes
9. `/src/lib/utils/query-timeout.ts` - Query timeout wrapper

## Files to Update

1. `/src/lib/services/recommendation-analytics.ts` - Use shared helpers
2. `/src/lib/services/mood-timeline-analytics.ts` - Use shared helpers
3. `/src/lib/services/advanced-discovery-analytics.ts` - Use shared helpers + CI
4. `/src/lib/services/discovery-analytics.ts` - Use shared helpers
5. `/src/components/ui/audio-player.tsx` - Use new services, add cleanup

---

## Testing Checklist

### Analytics
- [ ] All analytics functions return same results after refactor
- [ ] Cache invalidation works on feedback submission
- [ ] A/B test confidence intervals display correctly
- [ ] Database queries are faster with new indexes

### Audio Player
- [ ] Media Session controls work on iOS lock screen
- [ ] Background playback continues after notifications
- [ ] Network recovery works after WiFi switch
- [ ] Scrobbles are recorded even on page close
- [ ] Preload audio doesn't cause memory leaks
- [ ] Wake lock is released when playback stops

### Integration
- [ ] No console errors on page load
- [ ] Analytics dashboards load correctly
- [ ] All existing tests pass
