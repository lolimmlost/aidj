/**
 * Unit Tests for Cache Service
 *
 * Tests the cache service layer implementation including:
 * - CacheStore basic operations
 * - TTL and expiration
 * - LRU eviction
 * - CacheService namespace management
 * - Configuration and statistics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheStore } from './cache-store';
import {
  CacheService,
  createCacheService,
  CACHE_PRESETS,
} from './cache-service';

describe('CacheStore', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore({
      defaultTtlMs: 1000, // 1 second for faster tests
      maxEntries: 5,
      enableAutoCleanup: false, // Disable auto cleanup for tests
      trackAccess: true,
    });
  });

  afterEach(() => {
    store.destroy();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      store.set('key1', { value: 'test' });
      const result = store.get<{ value: string }>('key1');
      expect(result).toEqual({ value: 'test' });
    });

    it('should return null for non-existent keys', () => {
      const result = store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values', () => {
      store.set('key1', 'value1');
      expect(store.has('key1')).toBe(true);

      const deleted = store.delete('key1');
      expect(deleted).toBe(true);
      expect(store.has('key1')).toBe(false);
    });

    it('should check if key exists', () => {
      store.set('key1', 'value1');
      expect(store.has('key1')).toBe(true);
      expect(store.has('non-existent')).toBe(false);
    });

    it('should clear all values', () => {
      store.set('key1', 'value1');
      store.set('key2', 'value2');
      store.clear();

      expect(store.has('key1')).toBe(false);
      expect(store.has('key2')).toBe(false);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', async () => {
      store.set('key1', 'value1', { ttlMs: 50 }); // 50ms TTL

      expect(store.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(store.get('key1')).toBeNull();
    });

    it('should not return expired entries by default', async () => {
      store.set('key1', 'value1', { ttlMs: 50 });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = store.get('key1');
      expect(result).toBeNull();
    });

    it('should return expired entries when allowExpired is true', async () => {
      store.set('key1', 'value1', { ttlMs: 50 });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = store.get('key1', { allowExpired: true });
      expect(result).toBe('value1');
    });

    it('should refresh TTL for existing entry', async () => {
      store.set('key1', 'value1', { ttlMs: 50 });

      await new Promise((resolve) => setTimeout(resolve, 30));

      // Refresh with new TTL
      store.refresh('key1', 200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still be valid after refresh
      expect(store.get('key1')).toBe('value1');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when max size reached', () => {
      // Create a new store with small max entries for this test
      const smallStore = new CacheStore({
        defaultTtlMs: 1000,
        maxEntries: 3,
        enableAutoCleanup: false,
        trackAccess: true,
      });

      smallStore.set('key1', 'value1');
      smallStore.set('key2', 'value2');
      smallStore.set('key3', 'value3');

      // Access key2 and key3 to update their access time
      smallStore.get('key2');
      smallStore.get('key3');

      // Add new entry, should evict key1 (least recently accessed)
      smallStore.set('key4', 'value4');

      expect(smallStore.has('key1')).toBe(false); // Evicted - least recently used
      expect(smallStore.has('key2')).toBe(true);
      expect(smallStore.has('key3')).toBe(true);
      expect(smallStore.has('key4')).toBe(true);

      smallStore.destroy();
    });
  });

  describe('tags', () => {
    it('should delete entries by tag', () => {
      store.set('key1', 'value1', { tags: ['group1'] });
      store.set('key2', 'value2', { tags: ['group1'] });
      store.set('key3', 'value3', { tags: ['group2'] });

      const deleted = store.deleteByTag('group1');

      expect(deleted).toBe(2);
      expect(store.has('key1')).toBe(false);
      expect(store.has('key2')).toBe(false);
      expect(store.has('key3')).toBe(true);
    });
  });

  describe('prefix operations', () => {
    it('should delete entries by prefix', () => {
      store.set('user:1', 'value1');
      store.set('user:2', 'value2');
      store.set('session:1', 'value3');

      const deleted = store.deleteByPrefix('user:');

      expect(deleted).toBe(2);
      expect(store.has('user:1')).toBe(false);
      expect(store.has('user:2')).toBe(false);
      expect(store.has('session:1')).toBe(true);
    });

    it('should list keys matching pattern', () => {
      store.set('user:1', 'value1');
      store.set('user:2', 'value2');
      store.set('session:1', 'value3');

      const userKeys = store.keys('user');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      store.set('key1', 'value1');

      store.get('key1'); // hit
      store.get('key1'); // hit
      store.get('key2'); // miss

      const stats = store.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should count entries', () => {
      store.set('key1', 'value1');
      store.set('key2', 'value2');

      const stats = store.getStats();
      expect(stats.entryCount).toBe(2);
    });

    it('should estimate memory usage', () => {
      store.set('key1', { large: 'data'.repeat(100) });

      const stats = store.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries', async () => {
      store.set('key1', 'value1', { ttlMs: 50 });
      store.set('key2', 'value2', { ttlMs: 5000 });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleaned = store.cleanup();
      expect(cleaned).toBe(1);
      expect(store.has('key1')).toBe(false);
      expect(store.has('key2')).toBe(true);
    });
  });
});

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService();
  });

  afterEach(() => {
    cacheService.destroy();
  });

  describe('namespace operations', () => {
    it('should set and get values in namespaces', () => {
      cacheService.set('general', 'key1', { value: 'test' });
      const result = cacheService.get<{ value: string }>('general', 'key1');
      expect(result).toEqual({ value: 'test' });
    });

    it('should isolate values between namespaces', () => {
      cacheService.set('general', 'key1', 'general-value');
      cacheService.set('lastfm', 'key1', 'lastfm-value');

      expect(cacheService.get('general', 'key1')).toBe('general-value');
      expect(cacheService.get('lastfm', 'key1')).toBe('lastfm-value');
    });

    it('should clear specific namespace', () => {
      cacheService.set('general', 'key1', 'value1');
      cacheService.set('lastfm', 'key1', 'value2');

      cacheService.clearNamespace('general');

      expect(cacheService.has('general', 'key1')).toBe(false);
      expect(cacheService.has('lastfm', 'key1')).toBe(true);
    });

    it('should clear all namespaces', () => {
      cacheService.set('general', 'key1', 'value1');
      cacheService.set('lastfm', 'key1', 'value2');

      cacheService.clearAll();

      expect(cacheService.has('general', 'key1')).toBe(false);
      expect(cacheService.has('lastfm', 'key1')).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use preset configurations', () => {
      const config = cacheService.getConfiguration('library-index');
      expect(config.defaultTtlMs).toBe(CACHE_PRESETS['library-index'].config.defaultTtlMs);
    });

    it('should allow custom configuration', () => {
      cacheService.configure('general', {
        defaultTtlMs: 60000,
        maxEntries: 100,
      });

      const config = cacheService.getConfiguration('general');
      expect(config.defaultTtlMs).toBe(60000);
      expect(config.maxEntries).toBe(100);
    });
  });

  describe('statistics', () => {
    it('should return namespace stats', () => {
      cacheService.set('general', 'key1', 'value1');
      cacheService.get('general', 'key1');

      const stats = cacheService.getNamespaceStats('general');
      expect(stats).not.toBeNull();
      expect(stats!.entryCount).toBe(1);
      expect(stats!.hits).toBe(1);
    });

    it('should return summary stats', () => {
      cacheService.set('general', 'key1', 'value1');
      cacheService.set('lastfm', 'key1', 'value2');

      const summary = cacheService.getSummaryStats();
      expect(summary.totalEntries).toBe(2);
      expect(summary.namespaceCount).toBe(2);
    });

    it('should return active namespaces', () => {
      cacheService.set('general', 'key1', 'value1');
      cacheService.set('lastfm', 'key1', 'value2');

      const namespaces = cacheService.getActiveNamespaces();
      expect(namespaces).toContain('general');
      expect(namespaces).toContain('lastfm');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all namespaces', async () => {
      // Set values with short TTL
      cacheService.configure('general', { defaultTtlMs: 50 });
      cacheService.set('general', 'key1', 'value1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = cacheService.cleanup();
      expect(results['general']).toBe(1);
    });
  });
});

describe('Cache Service Integration', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService();
  });

  afterEach(() => {
    cacheService.destroy();
  });

  it('should work with library-index pattern', () => {
    const LIBRARY_INDEX_CACHE_KEY = 'index';
    const mockIndex = {
      songs: new Map([['test', { id: '1' }]]),
      artists: ['Artist 1'],
      lastUpdated: Date.now(),
    };

    cacheService.set('library-index', LIBRARY_INDEX_CACHE_KEY, mockIndex);

    const cached = cacheService.get('library-index', LIBRARY_INDEX_CACHE_KEY);
    expect(cached).toEqual(mockIndex);
  });

  it('should work with artist-blocklist pattern', () => {
    const blocklist = new Set(['blocked-artist']);

    cacheService.set('artist-blocklist', 'blocklist:user123', blocklist);

    const cached = cacheService.get<Set<string>>('artist-blocklist', 'blocklist:user123');
    expect(cached).toEqual(blocklist);
  });

  it('should work with lastfm pattern', () => {
    const cacheKey = 'similar-tracks:Artist:Song:20';
    const mockTracks = [
      { name: 'Track 1', artist: 'Artist 1' },
      { name: 'Track 2', artist: 'Artist 2' },
    ];

    cacheService.set('lastfm', cacheKey, mockTracks);

    const cached = cacheService.get('lastfm', cacheKey);
    expect(cached).toEqual(mockTracks);
  });
});
