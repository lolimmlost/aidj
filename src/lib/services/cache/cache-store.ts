/**
 * Cache Store Implementation
 *
 * An in-memory cache store with TTL, LRU eviction, and namespace support.
 */

import type {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CacheSetOptions,
  CacheGetOptions,
  CacheEvent,
  CacheEventListener,
} from './types';

const DEFAULT_CONFIG: CacheConfig = {
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  enableAutoCleanup: true,
  cleanupIntervalMs: 60 * 1000, // 1 minute
  trackAccess: true,
};

/**
 * In-memory cache store with configurable TTL and eviction policies
 */
export class CacheStore {
  private cache: Map<string, CacheEntry<unknown>>;
  private config: CacheConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stats: { hits: number; misses: number };
  private eventListeners: Set<CacheEventListener>;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0 };
    this.eventListeners = new Set();

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T, options: CacheSetOptions = {}): void {
    const now = Date.now();
    const ttlMs = options.ttlMs ?? this.config.defaultTtlMs;

    // Check if we need to evict entries
    if (this.config.maxEntries > 0 && this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data: value,
      createdAt: now,
      expiresAt: now + ttlMs,
      accessedAt: now,
      accessCount: 0,
      tags: options.tags,
    };

    this.cache.set(key, entry as CacheEntry<unknown>);
    this.emit({ type: 'set', namespace: 'general', key, timestamp: now });
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string, options: CacheGetOptions = {}): T | null {
    const { updateAccess = true, allowExpired = false } = options;
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    const isExpired = entry.expiresAt <= now;

    if (isExpired && !allowExpired) {
      this.stats.misses++;
      this.cache.delete(key);
      this.emit({ type: 'expire', namespace: 'general', key, timestamp: now });
      return null;
    }

    this.stats.hits++;

    if (this.config.trackAccess && updateAccess) {
      entry.accessedAt = now;
      entry.accessCount++;
    }

    this.emit({ type: 'get', namespace: 'general', key, timestamp: now });
    return entry.data;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.emit({ type: 'delete', namespace: 'general', key, timestamp: Date.now() });
    }
    return existed;
  }

  /**
   * Delete all entries matching a tag
   */
  deleteByTag(tag: string): number {
    let deleted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags?.includes(tag)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Delete all entries matching a key prefix
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    this.emit({ type: 'clear', namespace: 'general', timestamp: Date.now() });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let memoryUsage = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      // Rough memory estimate
      memoryUsage += JSON.stringify(entry.data).length * 2;

      if (entry.expiresAt <= now) {
        expiredCount++;
      }

      if (oldestEntry === null || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (newestEntry === null || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      entryCount: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      memoryUsage,
      oldestEntry,
      newestEntry,
      expiredCount,
    };
  }

  /**
   * Get all keys matching a pattern
   */
  keys(pattern?: string | RegExp): string[] {
    const allKeys = Array.from(this.cache.keys());
    if (!pattern) return allKeys;

    if (typeof pattern === 'string') {
      return allKeys.filter((key) => key.includes(pattern));
    }

    return allKeys.filter((key) => pattern.test(key));
  }

  /**
   * Get entry metadata without updating access time
   */
  getMetadata(key: string): Omit<CacheEntry<unknown>, 'data'> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const { data: _data, ...metadata } = entry;
    return metadata;
  }

  /**
   * Refresh TTL for an existing entry
   */
  refresh(key: string, ttlMs?: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const newTtl = ttlMs ?? this.config.defaultTtlMs;
    entry.expiresAt = now + newTtl;
    entry.accessedAt = now;

    return true;
  }

  /**
   * Subscribe to cache events
   */
  subscribe(listener: CacheEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    const wasAutoCleanupEnabled = this.config.enableAutoCleanup;
    this.config = { ...this.config, ...config };

    // Handle auto-cleanup toggle
    if (!wasAutoCleanupEnabled && this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    } else if (wasAutoCleanupEnabled && !this.config.enableAutoCleanup) {
      this.stopAutoCleanup();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        cleaned++;

        if (this.config.onEvict) {
          this.config.onEvict(key, entry);
        }
      }
    }

    if (cleaned > 0) {
      this.emit({ type: 'cleanup', namespace: 'general', timestamp: now });
    }

    return cleaned;
  }

  /**
   * Destroy the cache store and cleanup resources
   */
  destroy(): void {
    this.stopAutoCleanup();
    this.cache.clear();
    this.eventListeners.clear();
  }

  // Private methods

  private startAutoCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Ensure cleanup on Node.js process exit
    if (typeof process !== 'undefined' && process.on) {
      process.on('beforeExit', () => this.stopAutoCleanup());
    }
  }

  private stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccessTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccessTime) {
        oldestAccessTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);

      if (entry && this.config.onEvict) {
        this.config.onEvict(oldestKey, entry);
      }

      this.emit({
        type: 'evict',
        namespace: 'general',
        key: oldestKey,
        timestamp: Date.now(),
      });
    }
  }

  private emit(event: CacheEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[CacheStore] Error in event listener:', err);
      }
    }
  }
}
