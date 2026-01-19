/**
 * IndexedDB Service for Offline Storage
 *
 * Provides a persistent offline storage layer using IndexedDB.
 * Supports storing:
 * - Listening history (for offline scrobbling)
 * - Recommendation feedback (thumbs up/down)
 * - User preferences
 * - Music library metadata cache
 * - Sync queue for pending actions
 *
 * @see docs/architecture/offline-first.md
 */

// Database configuration
const DB_NAME = 'aidj-offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  LISTENING_HISTORY: 'listeningHistory',
  FEEDBACK: 'feedback',
  PREFERENCES: 'preferences',
  LIBRARY_CACHE: 'libraryCache',
  SYNC_QUEUE: 'syncQueue',
  RECOMMENDATIONS: 'recommendations',
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

// Sync queue item types
export type SyncAction =
  | 'record_listening_history'
  | 'submit_feedback'
  | 'update_preferences';

export interface SyncQueueItem {
  id: string;
  action: SyncAction;
  payload: unknown;
  createdAt: number;
  retryCount: number;
  lastAttempt?: number;
  error?: string;
}

export interface ListeningHistoryRecord {
  id: string;
  songId: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  duration?: number;
  playDuration?: number;
  playedAt: number;
  synced: boolean;
}

export interface FeedbackRecord {
  id: string;
  songId: string;
  songArtistTitle: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  source: string;
  timestamp: number;
  synced: boolean;
}

export interface LibraryCacheItem {
  id: string;
  type: 'song' | 'artist' | 'album' | 'playlist';
  data: unknown;
  cachedAt: number;
  expiresAt: number;
}

export interface RecommendationCacheItem {
  id: string;
  seedSongId?: string;
  recommendations: unknown[];
  cachedAt: number;
  expiresAt: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 * Creates all required object stores with appropriate indexes
 */
export async function initDB(): Promise<IDBDatabase> {
  // Return existing instance if available
  if (dbInstance) {
    return dbInstance;
  }

  // Return existing promise if initialization is in progress
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[IndexedDB] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[IndexedDB] Upgrading database schema...');

      // Listening History Store
      if (!db.objectStoreNames.contains(STORES.LISTENING_HISTORY)) {
        const historyStore = db.createObjectStore(STORES.LISTENING_HISTORY, { keyPath: 'id' });
        historyStore.createIndex('songId', 'songId', { unique: false });
        historyStore.createIndex('playedAt', 'playedAt', { unique: false });
        historyStore.createIndex('synced', 'synced', { unique: false });
        console.log('[IndexedDB] Created listeningHistory store');
      }

      // Feedback Store
      if (!db.objectStoreNames.contains(STORES.FEEDBACK)) {
        const feedbackStore = db.createObjectStore(STORES.FEEDBACK, { keyPath: 'id' });
        feedbackStore.createIndex('songId', 'songId', { unique: false });
        feedbackStore.createIndex('timestamp', 'timestamp', { unique: false });
        feedbackStore.createIndex('synced', 'synced', { unique: false });
        console.log('[IndexedDB] Created feedback store');
      }

      // Preferences Store
      if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
        db.createObjectStore(STORES.PREFERENCES, { keyPath: 'id' });
        console.log('[IndexedDB] Created preferences store');
      }

      // Library Cache Store
      if (!db.objectStoreNames.contains(STORES.LIBRARY_CACHE)) {
        const libraryStore = db.createObjectStore(STORES.LIBRARY_CACHE, { keyPath: 'id' });
        libraryStore.createIndex('type', 'type', { unique: false });
        libraryStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        console.log('[IndexedDB] Created libraryCache store');
      }

      // Sync Queue Store
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('action', 'action', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('retryCount', 'retryCount', { unique: false });
        console.log('[IndexedDB] Created syncQueue store');
      }

      // Recommendations Cache Store
      if (!db.objectStoreNames.contains(STORES.RECOMMENDATIONS)) {
        const recsStore = db.createObjectStore(STORES.RECOMMENDATIONS, { keyPath: 'id' });
        recsStore.createIndex('seedSongId', 'seedSongId', { unique: false });
        recsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        console.log('[IndexedDB] Created recommendations store');
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get a transaction for the specified store(s)
 */
async function getTransaction(
  storeNames: StoreName | StoreName[],
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBTransaction> {
  const db = await initDB();
  return db.transaction(storeNames, mode);
}

/**
 * Get an object store for operations
 */
async function getStore(
  storeName: StoreName,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  const transaction = await getTransaction(storeName, mode);
  return transaction.objectStore(storeName);
}

/**
 * Generic put operation - adds or updates a record
 */
export async function put<T extends { id: string }>(
  storeName: StoreName,
  data: T
): Promise<void> {
  const store = await getStore(storeName, 'readwrite');

  return new Promise((resolve, reject) => {
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get operation - retrieves a record by key
 */
export async function get<T>(
  storeName: StoreName,
  key: string
): Promise<T | undefined> {
  const store = await getStore(storeName, 'readonly');

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic getAll operation - retrieves all records from a store
 */
export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const store = await getStore(storeName, 'readonly');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get records by index
 */
export async function getByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const store = await getStore(storeName, 'readonly');
  const index = store.index(indexName);

  return new Promise((resolve, reject) => {
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a record by key
 */
export async function remove(storeName: StoreName, key: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');

  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all records from a store
 */
export async function clear(storeName: StoreName): Promise<void> {
  const store = await getStore(storeName, 'readwrite');

  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete expired records from a store (based on expiresAt index)
 */
export async function deleteExpired(storeName: StoreName): Promise<number> {
  const store = await getStore(storeName, 'readwrite');
  const index = store.index('expiresAt');
  const now = Date.now();
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Count records in a store
 */
export async function count(storeName: StoreName): Promise<number> {
  const store = await getStore(storeName, 'readonly');

  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count records by index value
 */
export async function countByIndex(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<number> {
  const store = await getStore(storeName, 'readonly');
  const index = store.index(indexName);

  return new Promise((resolve, reject) => {
    const request = index.count(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInitPromise = null;
    console.log('[IndexedDB] Database connection closed');
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Get database storage usage estimate
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
} | null> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentUsed: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0,
    };
  }
  return null;
}
