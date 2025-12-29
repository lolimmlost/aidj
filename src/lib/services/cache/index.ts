/**
 * Cache Service Layer
 *
 * Centralized, configurable cache management for the application.
 *
 * Features:
 * - Namespaced caches for different data types
 * - Configurable TTL, max entries, and eviction policies
 * - Automatic cleanup of expired entries
 * - Cache statistics and monitoring
 * - Event subscription for cache changes
 *
 * @example
 * ```typescript
 * import { getCacheService } from '@/lib/services/cache';
 *
 * const cache = getCacheService();
 *
 * // Set a value with default TTL
 * cache.set('library-index', 'my-key', { data: 'value' });
 *
 * // Get a value
 * const value = cache.get<MyType>('library-index', 'my-key');
 *
 * // Configure a namespace
 * cache.configure('recommendations', {
 *   defaultTtlMs: 10 * 60 * 1000, // 10 minutes
 *   maxEntries: 100,
 * });
 *
 * // Get statistics
 * const stats = cache.getSummaryStats();
 * console.log(`Hit rate: ${stats.hitRate}%`);
 * ```
 */

// Main exports
export { getCacheService, createCacheService, resetCacheService, CacheService, CACHE_PRESETS } from './cache-service';
export { CacheStore } from './cache-store';

// Type exports
export type {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CacheSetOptions,
  CacheGetOptions,
  CacheNamespace,
  CachePreset,
  CacheEvent,
  CacheEventType,
  CacheEventListener,
} from './types';
