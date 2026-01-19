/**
 * Cache Service Types
 *
 * Type definitions for the configurable cache management service layer.
 */

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  accessedAt: number;
  accessCount: number;
  tags?: string[];
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs: number;
  /** Maximum number of entries (0 = unlimited) */
  maxEntries: number;
  /** Whether to enable automatic cleanup of expired entries */
  enableAutoCleanup: boolean;
  /** Interval for automatic cleanup in milliseconds (default: 1 minute) */
  cleanupIntervalMs: number;
  /** Whether to track access patterns for LRU eviction */
  trackAccess: boolean;
  /** Callback when an entry is evicted */
  onEvict?: <T>(key: string, entry: CacheEntry<T>) => void;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of entries */
  entryCount: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Approximate memory usage in bytes */
  memoryUsage: number;
  /** Oldest entry timestamp */
  oldestEntry: number | null;
  /** Most recent entry timestamp */
  newestEntry: number | null;
  /** Number of expired entries awaiting cleanup */
  expiredCount: number;
}

/**
 * Named cache preset configurations
 */
export interface CachePreset {
  name: string;
  config: Partial<CacheConfig>;
}

/**
 * Cache namespace for organizing related cache entries
 */
export type CacheNamespace =
  | 'library-index'
  | 'library-sync'
  | 'artist-blocklist'
  | 'lastfm'
  | 'recommendations'
  | 'search'
  | 'user-preferences'
  | 'general';

/**
 * Options for cache get/set operations
 */
export interface CacheSetOptions {
  /** TTL override for this specific entry */
  ttlMs?: number;
  /** Tags for grouping entries (for batch invalidation) */
  tags?: string[];
}

export interface CacheGetOptions {
  /** Whether to update access time on get */
  updateAccess?: boolean;
  /** Whether to return expired entries */
  allowExpired?: boolean;
}

/**
 * Cache event types for notifications
 */
export type CacheEventType =
  | 'set'
  | 'get'
  | 'delete'
  | 'expire'
  | 'evict'
  | 'clear'
  | 'cleanup';

export interface CacheEvent {
  type: CacheEventType;
  namespace: CacheNamespace;
  key?: string;
  timestamp: number;
}

export type CacheEventListener = (event: CacheEvent) => void;
