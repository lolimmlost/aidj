/**
 * Offline-First Services
 *
 * Main entry point for offline functionality.
 * Exports all offline-related utilities and adapters.
 *
 * @see docs/architecture/offline-first.md
 */

// Core IndexedDB operations
export {
  initDB,
  closeDB,
  isIndexedDBAvailable,
  getStorageEstimate,
  STORES,
  type StoreName,
  type SyncAction,
  type SyncQueueItem,
  type ListeningHistoryRecord,
  type FeedbackRecord,
  type LibraryCacheItem,
  type RecommendationCacheItem,
} from './indexed-db';

// Sync queue management
export {
  addToSyncQueue,
  getSyncQueue,
  getSyncQueueByAction,
  getSyncQueueItem,
  removeFromSyncQueue,
  markSyncItemFailed,
  shouldRetry,
  getRetryDelay,
  requestAllBackgroundSyncs,
  getPendingSyncCount,
  getFailedSyncCount,
  clearFailedSyncItems,
  processSyncQueue,
  notifyServiceWorkerToSync,
  SYNC_TAGS,
} from './sync-queue';

// Offline-first adapters for core functionality
export {
  // Online status
  isOnline,

  // Listening history
  recordSongPlayOffline,
  getLocalListeningHistory,
  getUnsyncedListeningHistoryCount,

  // Feedback
  submitFeedbackOffline,
  getLocalFeedback,
  getAllLocalFeedback,
  getUnsyncedFeedbackCount,

  // Preferences
  savePreferencesOffline,
  getLocalPreferences,

  // Library cache
  cacheLibraryItem,
  cacheLibraryItems,
  getCachedLibraryItem,
  getCachedLibraryItemsByType,
  clearExpiredLibraryCache,

  // Recommendations cache
  cacheRecommendations,
  getCachedRecommendations,
  clearExpiredRecommendations,

  // Status
  getOfflineSyncStatus,
  clearAllOfflineData,
  type OfflineSyncStatus,
} from './offline-adapters';
