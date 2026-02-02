/**
 * Audio Metadata Cache Service
 *
 * Provides persistent storage for BPM, key, and energy metadata using IndexedDB.
 * This avoids repeated API calls and stores estimated/analyzed values.
 *
 * Features:
 * - IndexedDB persistence across browser sessions
 * - In-memory cache for fast access
 * - TTL-based expiration (30 days)
 * - Batch operations for efficiency
 */

// Cached audio metadata for DJ features
export interface AudioMetadataCache {
  id: string;             // Song ID (Navidrome ID)
  bpm?: number;           // Beats per minute
  key?: string;           // Musical key (e.g., "Am", "C", "F#m")
  energy?: number;        // Energy level 0-1
  source: 'navidrome' | 'estimated' | 'user'; // Where the data came from
  confidence: number;     // Confidence level 0-1 (1 = from tags, lower = estimated)
  fetchedAt: number;      // Timestamp when metadata was fetched/estimated
  updatedAt: number;      // Timestamp when metadata was last updated
}

// Database configuration
const DB_NAME = 'aidj-audio-metadata';
const DB_VERSION = 1;
const STORE_NAME = 'metadata';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory cache for fast access
const memoryCache = new Map<string, AudioMetadataCache>();

// Database instance
let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  if (dbInitPromise) return dbInitPromise;

  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB not available');
  }

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[AudioMetadataCache] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[AudioMetadataCache] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[AudioMetadataCache] Upgrading database schema...');

      // Create the metadata store with songId as key
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Index for finding songs by BPM range (for DJ matching)
        store.createIndex('bpm', 'bpm', { unique: false });
        // Index for finding songs by key (for harmonic mixing)
        store.createIndex('key', 'key', { unique: false });
        // Index for finding songs by energy (for energy flow)
        store.createIndex('energy', 'energy', { unique: false });
        // Index for cache cleanup
        store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
        console.log('[AudioMetadataCache] Created metadata store');
      }
    };
  });

  return dbInitPromise;
}

/**
 * Check if cached metadata is still valid (not expired)
 */
function isValidCache(metadata: AudioMetadataCache): boolean {
  const now = Date.now();
  return now - metadata.fetchedAt < CACHE_TTL_MS;
}

/**
 * Get metadata for a song from cache
 * Returns null if not cached or expired
 *
 * @param songId - The Navidrome song ID
 * @returns Cached metadata or null
 */
export async function getMetadata(songId: string): Promise<AudioMetadataCache | null> {
  // Check memory cache first
  const memoryCached = memoryCache.get(songId);
  if (memoryCached && isValidCache(memoryCached)) {
    return memoryCached;
  }

  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(songId);

      request.onsuccess = () => {
        const metadata = request.result as AudioMetadataCache | undefined;

        if (metadata && isValidCache(metadata)) {
          // Update memory cache
          memoryCache.set(songId, metadata);
          resolve(metadata);
        } else {
          // Clean up expired entry if needed
          if (metadata) {
            deleteMetadata(songId).catch(() => {});
          }
          resolve(null);
        }
      };

      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to get metadata:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to get metadata from cache:', error);
    return null;
  }
}

/**
 * Get metadata for multiple songs from cache
 * More efficient than calling getMetadata for each song
 *
 * @param songIds - Array of Navidrome song IDs
 * @returns Map of songId to metadata (only includes cached songs)
 */
export async function getMetadataBatch(songIds: string[]): Promise<Map<string, AudioMetadataCache>> {
  const results = new Map<string, AudioMetadataCache>();
  const uncachedIds: string[] = [];

  // Check memory cache first
  for (const songId of songIds) {
    const memoryCached = memoryCache.get(songId);
    if (memoryCached && isValidCache(memoryCached)) {
      results.set(songId, memoryCached);
    } else {
      uncachedIds.push(songId);
    }
  }

  // Fetch remaining from IndexedDB
  if (uncachedIds.length > 0) {
    try {
      const db = await getDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const promises = uncachedIds.map(songId => {
        return new Promise<void>((resolve) => {
          const request = store.get(songId);
          request.onsuccess = () => {
            const metadata = request.result as AudioMetadataCache | undefined;
            if (metadata && isValidCache(metadata)) {
              results.set(songId, metadata);
              memoryCache.set(songId, metadata);
            }
            resolve();
          };
          request.onerror = () => resolve();
        });
      });

      await Promise.all(promises);
    } catch (error) {
      console.warn('[AudioMetadataCache] Failed to get batch metadata from cache:', error);
    }
  }

  return results;
}

/**
 * Save metadata for a song to cache
 *
 * @param metadata - The metadata to save
 */
export async function setMetadata(metadata: AudioMetadataCache): Promise<void> {
  const dataToSave = {
    ...metadata,
    updatedAt: Date.now(),
  };

  // Update memory cache
  memoryCache.set(metadata.id, dataToSave);

  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put(dataToSave);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to save metadata:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to save metadata to cache:', error);
  }
}

/**
 * Save metadata for multiple songs to cache
 * More efficient than calling setMetadata for each song
 *
 * @param metadataList - Array of metadata to save
 */
export async function setMetadataBatch(metadataList: AudioMetadataCache[]): Promise<void> {
  const now = Date.now();

  // Update memory cache
  for (const metadata of metadataList) {
    const dataToSave = { ...metadata, updatedAt: now };
    memoryCache.set(metadata.id, dataToSave);
  }

  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const promises = metadataList.map(metadata => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put({ ...metadata, updatedAt: now });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to save batch metadata to cache:', error);
  }
}

/**
 * Update specific fields of cached metadata
 * Useful for partial updates (e.g., only updating energy)
 *
 * @param songId - The song ID
 * @param updates - Partial metadata to merge
 */
export async function updateMetadata(
  songId: string,
  updates: Partial<Omit<AudioMetadataCache, 'id'>>
): Promise<void> {
  const existing = await getMetadata(songId);

  if (existing) {
    await setMetadata({
      ...existing,
      ...updates,
      id: songId,
      updatedAt: Date.now(),
    });
  } else {
    // Create new entry with defaults
    await setMetadata({
      id: songId,
      source: 'estimated',
      confidence: 0.5,
      fetchedAt: Date.now(),
      updatedAt: Date.now(),
      ...updates,
    });
  }
}

/**
 * Delete metadata for a song from cache
 *
 * @param songId - The song ID to delete
 */
export async function deleteMetadata(songId: string): Promise<void> {
  memoryCache.delete(songId);

  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(songId);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to delete metadata:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to delete metadata from cache:', error);
  }
}

/**
 * Find songs by BPM range
 * Useful for DJ matching - find songs with similar BPM
 *
 * @param minBpm - Minimum BPM (inclusive)
 * @param maxBpm - Maximum BPM (inclusive)
 * @returns Array of song IDs with BPM in range
 */
export async function findSongsByBpmRange(minBpm: number, maxBpm: number): Promise<string[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('bpm');

    return new Promise((resolve, reject) => {
      const songIds: string[] = [];
      const range = IDBKeyRange.bound(minBpm, maxBpm);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const metadata = cursor.value as AudioMetadataCache;
          if (isValidCache(metadata)) {
            songIds.push(metadata.id);
          }
          cursor.continue();
        } else {
          resolve(songIds);
        }
      };

      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to find songs by BPM:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to find songs by BPM range:', error);
    return [];
  }
}

/**
 * Find songs by musical key
 * Useful for harmonic mixing
 *
 * @param key - The musical key to search for
 * @returns Array of song IDs with the specified key
 */
export async function findSongsByKey(key: string): Promise<string[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('key');

    return new Promise((resolve, reject) => {
      const songIds: string[] = [];
      const request = index.openCursor(IDBKeyRange.only(key));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const metadata = cursor.value as AudioMetadataCache;
          if (isValidCache(metadata)) {
            songIds.push(metadata.id);
          }
          cursor.continue();
        } else {
          resolve(songIds);
        }
      };

      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to find songs by key:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to find songs by key:', error);
    return [];
  }
}

/**
 * Get cache statistics
 * Useful for debugging and monitoring
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  entriesWithBpm: number;
  entriesWithKey: number;
  entriesWithEnergy: number;
  memoryCacheSize: number;
}> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      let totalEntries = 0;
      let validEntries = 0;
      let expiredEntries = 0;
      let entriesWithBpm = 0;
      let entriesWithKey = 0;
      let entriesWithEnergy = 0;

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          totalEntries++;
          const metadata = cursor.value as AudioMetadataCache;
          if (isValidCache(metadata)) {
            validEntries++;
            if (metadata.bpm !== undefined) entriesWithBpm++;
            if (metadata.key !== undefined) entriesWithKey++;
            if (metadata.energy !== undefined) entriesWithEnergy++;
          } else {
            expiredEntries++;
          }
          cursor.continue();
        } else {
          resolve({
            totalEntries,
            validEntries,
            expiredEntries,
            entriesWithBpm,
            entriesWithKey,
            entriesWithEnergy,
            memoryCacheSize: memoryCache.size,
          });
        }
      };

      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to get cache stats:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to get cache stats:', error);
    return {
      totalEntries: 0,
      validEntries: 0,
      expiredEntries: 0,
      entriesWithBpm: 0,
      entriesWithKey: 0,
      entriesWithEnergy: 0,
      memoryCacheSize: memoryCache.size,
    };
  }
}

/**
 * Clean up expired entries from the cache
 * Should be called periodically (e.g., on app start)
 */
export async function cleanupExpiredEntries(): Promise<number> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('fetchedAt');

    return new Promise((resolve, reject) => {
      let deletedCount = 0;
      const expiryThreshold = Date.now() - CACHE_TTL_MS;
      const range = IDBKeyRange.upperBound(expiryThreshold);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          memoryCache.delete(cursor.value.id);
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`🧹 [AudioMetadataCache] Cleanup: removed ${deletedCount} expired entries`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to cleanup expired entries:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to cleanup expired cache entries:', error);
    return 0;
  }
}

/**
 * Clear all cached metadata
 * Use with caution - will require re-fetching all metadata
 */
export async function clearAllMetadata(): Promise<void> {
  memoryCache.clear();

  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log('🧹 [AudioMetadataCache] Cache cleared');
        resolve();
      };
      request.onerror = () => {
        console.warn('[AudioMetadataCache] Failed to clear cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[AudioMetadataCache] Failed to clear cache:', error);
  }
}

/**
 * Close the database connection
 * Should be called when the app is shutting down
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInitPromise = null;
    console.log('[AudioMetadataCache] Database connection closed');
  }
}
