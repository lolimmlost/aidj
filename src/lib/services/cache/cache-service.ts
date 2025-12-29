/**
 * Cache Service
 *
 * Centralized, configurable cache management service layer.
 * Provides namespaced caches with preset configurations for different use cases.
 */

import { CacheStore } from './cache-store';
import type {
  CacheConfig,
  CacheStats,
  CacheSetOptions,
  CacheGetOptions,
  CacheNamespace,
  CachePreset,
  CacheEventListener,
} from './types';

/**
 * Preset configurations for different cache use cases
 */
export const CACHE_PRESETS: Record<CacheNamespace, CachePreset> = {
  'library-index': {
    name: 'Library Index',
    config: {
      defaultTtlMs: 30 * 60 * 1000, // 30 minutes
      maxEntries: 10,
      enableAutoCleanup: true,
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    },
  },
  'library-sync': {
    name: 'Library Sync',
    config: {
      defaultTtlMs: 60 * 60 * 1000, // 1 hour
      maxEntries: 50,
      enableAutoCleanup: true,
      cleanupIntervalMs: 10 * 60 * 1000, // 10 minutes
    },
  },
  'artist-blocklist': {
    name: 'Artist Blocklist',
    config: {
      defaultTtlMs: 10 * 60 * 1000, // 10 minutes
      maxEntries: 100,
      enableAutoCleanup: true,
      cleanupIntervalMs: 2 * 60 * 1000, // 2 minutes
    },
  },
  lastfm: {
    name: 'Last.fm API',
    config: {
      defaultTtlMs: 5 * 60 * 1000, // 5 minutes
      maxEntries: 500,
      enableAutoCleanup: true,
      cleanupIntervalMs: 60 * 1000, // 1 minute
    },
  },
  recommendations: {
    name: 'Recommendations',
    config: {
      defaultTtlMs: 15 * 60 * 1000, // 15 minutes
      maxEntries: 200,
      enableAutoCleanup: true,
      cleanupIntervalMs: 3 * 60 * 1000, // 3 minutes
    },
  },
  search: {
    name: 'Search Results',
    config: {
      defaultTtlMs: 60 * 1000, // 1 minute
      maxEntries: 100,
      enableAutoCleanup: true,
      cleanupIntervalMs: 30 * 1000, // 30 seconds
    },
  },
  'user-preferences': {
    name: 'User Preferences',
    config: {
      defaultTtlMs: 30 * 60 * 1000, // 30 minutes
      maxEntries: 50,
      enableAutoCleanup: true,
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    },
  },
  general: {
    name: 'General',
    config: {
      defaultTtlMs: 5 * 60 * 1000, // 5 minutes
      maxEntries: 1000,
      enableAutoCleanup: true,
      cleanupIntervalMs: 60 * 1000, // 1 minute
    },
  },
};

/**
 * Cache Service - Singleton manager for namespaced caches
 */
class CacheService {
  private caches: Map<CacheNamespace, CacheStore>;
  private customConfigs: Map<CacheNamespace, Partial<CacheConfig>>;
  private globalEventListeners: Set<CacheEventListener>;
  private isInitialized = false;

  constructor() {
    this.caches = new Map();
    this.customConfigs = new Map();
    this.globalEventListeners = new Set();
  }

  /**
   * Initialize the cache service (lazy initialization)
   */
  private ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('[CacheService] Initialized');
  }

  /**
   * Get or create a cache for a namespace
   */
  getCache(namespace: CacheNamespace): CacheStore {
    this.ensureInitialized();

    let cache = this.caches.get(namespace);
    if (!cache) {
      const preset = CACHE_PRESETS[namespace];
      const customConfig = this.customConfigs.get(namespace);
      const config = { ...preset.config, ...customConfig };

      cache = new CacheStore(config);
      this.caches.set(namespace, cache);

      console.log(`[CacheService] Created cache: ${namespace}`);

      // Forward events to global listeners
      cache.subscribe((event) => {
        const enrichedEvent = { ...event, namespace };
        for (const listener of this.globalEventListeners) {
          listener(enrichedEvent);
        }
      });
    }

    return cache;
  }

  /**
   * Set a value in a namespaced cache
   */
  set<T>(
    namespace: CacheNamespace,
    key: string,
    value: T,
    options?: CacheSetOptions
  ): void {
    const cache = this.getCache(namespace);
    const prefixedKey = `${namespace}:${key}`;
    cache.set(prefixedKey, value, options);
  }

  /**
   * Get a value from a namespaced cache
   */
  get<T>(
    namespace: CacheNamespace,
    key: string,
    options?: CacheGetOptions
  ): T | null {
    const cache = this.getCache(namespace);
    const prefixedKey = `${namespace}:${key}`;
    return cache.get<T>(prefixedKey, options);
  }

  /**
   * Check if a key exists in a namespaced cache
   */
  has(namespace: CacheNamespace, key: string): boolean {
    const cache = this.getCache(namespace);
    const prefixedKey = `${namespace}:${key}`;
    return cache.has(prefixedKey);
  }

  /**
   * Delete a key from a namespaced cache
   */
  delete(namespace: CacheNamespace, key: string): boolean {
    const cache = this.getCache(namespace);
    const prefixedKey = `${namespace}:${key}`;
    return cache.delete(prefixedKey);
  }

  /**
   * Delete all entries in a namespace by tag
   */
  deleteByTag(namespace: CacheNamespace, tag: string): number {
    const cache = this.getCache(namespace);
    return cache.deleteByTag(tag);
  }

  /**
   * Clear all entries in a namespace
   */
  clearNamespace(namespace: CacheNamespace): void {
    const cache = this.caches.get(namespace);
    if (cache) {
      cache.clear();
      console.log(`[CacheService] Cleared namespace: ${namespace}`);
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const [namespace, cache] of this.caches) {
      cache.clear();
    }
    console.log('[CacheService] Cleared all caches');
  }

  /**
   * Get stats for a specific namespace
   */
  getNamespaceStats(namespace: CacheNamespace): CacheStats | null {
    const cache = this.caches.get(namespace);
    if (!cache) return null;
    return cache.getStats();
  }

  /**
   * Get aggregated stats for all namespaces
   */
  getAllStats(): Record<CacheNamespace, CacheStats> {
    const stats: Partial<Record<CacheNamespace, CacheStats>> = {};

    for (const [namespace, cache] of this.caches) {
      stats[namespace] = cache.getStats();
    }

    return stats as Record<CacheNamespace, CacheStats>;
  }

  /**
   * Get summary stats across all caches
   */
  getSummaryStats(): {
    totalEntries: number;
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    totalMemoryUsage: number;
    namespaceCount: number;
  } {
    let totalEntries = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let totalMemoryUsage = 0;

    for (const cache of this.caches.values()) {
      const stats = cache.getStats();
      totalEntries += stats.entryCount;
      totalHits += stats.hits;
      totalMisses += stats.misses;
      totalMemoryUsage += stats.memoryUsage;
    }

    const totalRequests = totalHits + totalMisses;

    return {
      totalEntries,
      totalHits,
      totalMisses,
      hitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
      totalMemoryUsage,
      namespaceCount: this.caches.size,
    };
  }

  /**
   * Configure a namespace with custom settings
   */
  configure(namespace: CacheNamespace, config: Partial<CacheConfig>): void {
    this.customConfigs.set(namespace, config);

    // Update existing cache if already created
    const cache = this.caches.get(namespace);
    if (cache) {
      cache.updateConfig(config);
    }

    console.log(`[CacheService] Updated config for: ${namespace}`);
  }

  /**
   * Configure multiple namespaces at once
   */
  configureBatch(
    configs: Partial<Record<CacheNamespace, Partial<CacheConfig>>>
  ): void {
    for (const [namespace, config] of Object.entries(configs)) {
      this.configure(namespace as CacheNamespace, config!);
    }
  }

  /**
   * Get configuration for a namespace
   */
  getConfiguration(namespace: CacheNamespace): CacheConfig {
    const cache = this.caches.get(namespace);
    if (cache) {
      return cache.getConfig();
    }

    const preset = CACHE_PRESETS[namespace];
    const customConfig = this.customConfigs.get(namespace);
    return {
      defaultTtlMs: 5 * 60 * 1000,
      maxEntries: 1000,
      enableAutoCleanup: true,
      cleanupIntervalMs: 60 * 1000,
      trackAccess: true,
      ...preset.config,
      ...customConfig,
    };
  }

  /**
   * Refresh TTL for an entry
   */
  refresh(namespace: CacheNamespace, key: string, ttlMs?: number): boolean {
    const cache = this.getCache(namespace);
    const prefixedKey = `${namespace}:${key}`;
    return cache.refresh(prefixedKey, ttlMs);
  }

  /**
   * Subscribe to cache events across all namespaces
   */
  subscribe(listener: CacheEventListener): () => void {
    this.globalEventListeners.add(listener);
    return () => this.globalEventListeners.delete(listener);
  }

  /**
   * Trigger cleanup on all caches
   */
  cleanup(): Record<CacheNamespace, number> {
    const results: Partial<Record<CacheNamespace, number>> = {};

    for (const [namespace, cache] of this.caches) {
      results[namespace] = cache.cleanup();
    }

    return results as Record<CacheNamespace, number>;
  }

  /**
   * Get all active namespaces
   */
  getActiveNamespaces(): CacheNamespace[] {
    return Array.from(this.caches.keys());
  }

  /**
   * Destroy all caches and cleanup resources
   */
  destroy(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
    this.customConfigs.clear();
    this.globalEventListeners.clear();
    this.isInitialized = false;
    console.log('[CacheService] Destroyed');
  }
}

// Singleton instance
let cacheServiceInstance: CacheService | null = null;

/**
 * Get the cache service singleton
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

/**
 * Create a new isolated cache service (for testing)
 */
export function createCacheService(): CacheService {
  return new CacheService();
}

/**
 * Reset the cache service singleton (for testing)
 */
export function resetCacheService(): void {
  if (cacheServiceInstance) {
    cacheServiceInstance.destroy();
    cacheServiceInstance = null;
  }
}

// Export the class for type inference
export { CacheService };
