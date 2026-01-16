/**
 * Offline Storage Adapters
 *
 * Provides offline-first wrappers for core services:
 * - Listening history recording
 * - Recommendation feedback
 * - User preferences
 * - Music library caching
 * - Recommendations caching
 *
 * These adapters:
 * 1. Try to sync to server when online
 * 2. Fall back to IndexedDB storage when offline
 * 3. Queue items for background sync
 *
 * @see docs/architecture/offline-first.md
 */

import {
  put,
  get,
  getAll,
  getByIndex,
  STORES,
  type ListeningHistoryRecord,
  type FeedbackRecord,
  type LibraryCacheItem,
  type RecommendationCacheItem,
  deleteExpired,
} from './indexed-db';
import { addToSyncQueue } from './sync-queue';

// Cache TTLs
const LIBRARY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const RECOMMENDATIONS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if the app is currently online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ============================================================================
// Listening History Adapter
// ============================================================================

interface RecordPlayParams {
  songId: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  duration?: number;
  playDuration?: number;
}

/**
 * Record a song play - offline-first
 *
 * If online: sends to server and stores locally
 * If offline: stores locally and queues for sync
 */
export async function recordSongPlayOffline(params: RecordPlayParams): Promise<void> {
  const record: ListeningHistoryRecord = {
    id: generateId(),
    songId: params.songId,
    artist: params.artist,
    title: params.title,
    album: params.album,
    genre: params.genre,
    duration: params.duration,
    playDuration: params.playDuration,
    playedAt: Date.now(),
    synced: false,
  };

  // Always store locally first (for offline history view)
  await put(STORES.LISTENING_HISTORY, record);
  console.log(`[OfflineAdapter] Stored listening history: ${params.artist} - ${params.title}`);

  if (isOnline()) {
    // Try to sync immediately
    try {
      const response = await fetch('/api/listening-history/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      if (response.ok) {
        // Mark as synced
        record.synced = true;
        await put(STORES.LISTENING_HISTORY, record);
        console.log(`[OfflineAdapter] Synced listening history: ${params.artist} - ${params.title}`);
        return;
      }
    } catch (error) {
      console.warn('[OfflineAdapter] Failed to sync listening history, queueing:', error);
    }
  }

  // Queue for background sync
  await addToSyncQueue('record_listening_history', params);
}

/**
 * Get local listening history
 */
export async function getLocalListeningHistory(): Promise<ListeningHistoryRecord[]> {
  const records = await getAll<ListeningHistoryRecord>(STORES.LISTENING_HISTORY);
  // Sort by played time (most recent first)
  return records.sort((a, b) => b.playedAt - a.playedAt);
}

/**
 * Get unsynced listening history count
 */
export async function getUnsyncedListeningHistoryCount(): Promise<number> {
  // IndexedDB stores booleans as 0/1, use 0 for false
  const records = await getByIndex<ListeningHistoryRecord>(
    STORES.LISTENING_HISTORY,
    'synced',
    0
  );
  return records.length;
}

// ============================================================================
// Feedback Adapter
// ============================================================================

interface SubmitFeedbackParams {
  songId: string;
  songArtistTitle: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  source?: string;
  recommendationCacheId?: number;
}

/**
 * Submit feedback - offline-first
 *
 * If online: sends to server and stores locally
 * If offline: stores locally and queues for sync
 */
export async function submitFeedbackOffline(params: SubmitFeedbackParams): Promise<void> {
  const record: FeedbackRecord = {
    id: generateId(),
    songId: params.songId,
    songArtistTitle: params.songArtistTitle,
    feedbackType: params.feedbackType,
    source: params.source || 'library',
    timestamp: Date.now(),
    synced: false,
  };

  // Check for existing feedback (prevent duplicates)
  const existing = await getByIndex<FeedbackRecord>(STORES.FEEDBACK, 'songId', params.songId);
  if (existing.length > 0) {
    // Update existing record
    const existingRecord = existing[0];
    existingRecord.feedbackType = params.feedbackType;
    existingRecord.timestamp = Date.now();
    existingRecord.synced = false;
    await put(STORES.FEEDBACK, existingRecord);
    record.id = existingRecord.id;
  } else {
    await put(STORES.FEEDBACK, record);
  }

  console.log(`[OfflineAdapter] Stored feedback: ${params.feedbackType} for ${params.songArtistTitle}`);

  if (isOnline()) {
    // Try to sync immediately
    try {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      // 409 means duplicate - still mark as synced
      if (response.ok || response.status === 409) {
        record.synced = true;
        await put(STORES.FEEDBACK, record);
        console.log(`[OfflineAdapter] Synced feedback: ${params.feedbackType}`);
        return;
      }
    } catch (error) {
      console.warn('[OfflineAdapter] Failed to sync feedback, queueing:', error);
    }
  }

  // Queue for background sync
  await addToSyncQueue('submit_feedback', params);
}

/**
 * Get local feedback for songs
 */
export async function getLocalFeedback(
  songIds: string[]
): Promise<Map<string, 'thumbs_up' | 'thumbs_down'>> {
  const feedbackMap = new Map<string, 'thumbs_up' | 'thumbs_down'>();

  for (const songId of songIds) {
    const records = await getByIndex<FeedbackRecord>(STORES.FEEDBACK, 'songId', songId);
    if (records.length > 0) {
      feedbackMap.set(songId, records[0].feedbackType);
    }
  }

  return feedbackMap;
}

/**
 * Get all local feedback records
 */
export async function getAllLocalFeedback(): Promise<FeedbackRecord[]> {
  return getAll<FeedbackRecord>(STORES.FEEDBACK);
}

/**
 * Get unsynced feedback count
 */
export async function getUnsyncedFeedbackCount(): Promise<number> {
  // IndexedDB stores booleans as 0/1, use 0 for false
  const records = await getByIndex<FeedbackRecord>(STORES.FEEDBACK, 'synced', 0);
  return records.length;
}

// ============================================================================
// Preferences Adapter
// ============================================================================

const PREFERENCES_KEY = 'user-preferences';

/**
 * Save preferences locally
 */
export async function savePreferencesOffline(preferences: unknown): Promise<void> {
  // Use 'id' as the key path to match the generic put function
  await put(STORES.PREFERENCES, { id: PREFERENCES_KEY, data: preferences, updatedAt: Date.now() });
  console.log('[OfflineAdapter] Stored preferences locally');

  if (isOnline()) {
    // Try to sync immediately
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        console.log('[OfflineAdapter] Synced preferences to server');
        return;
      }
    } catch (error) {
      console.warn('[OfflineAdapter] Failed to sync preferences, queueing:', error);
    }
  }

  // Queue for background sync
  await addToSyncQueue('update_preferences', preferences);
}

/**
 * Get local preferences
 */
export async function getLocalPreferences<T>(): Promise<T | null> {
  const record = await get<{ key: string; data: T; updatedAt: number }>(
    STORES.PREFERENCES,
    PREFERENCES_KEY
  );
  return record?.data || null;
}

// ============================================================================
// Library Cache Adapter
// ============================================================================

/**
 * Cache a library item (song, artist, album, playlist)
 */
export async function cacheLibraryItem(
  id: string,
  type: 'song' | 'artist' | 'album' | 'playlist',
  data: unknown
): Promise<void> {
  const item: LibraryCacheItem = {
    id,
    type,
    data,
    cachedAt: Date.now(),
    expiresAt: Date.now() + LIBRARY_CACHE_TTL,
  };

  await put(STORES.LIBRARY_CACHE, item);
}

/**
 * Cache multiple library items
 */
export async function cacheLibraryItems(
  type: 'song' | 'artist' | 'album' | 'playlist',
  items: Array<{ id: string; [key: string]: unknown }>
): Promise<void> {
  for (const item of items) {
    await cacheLibraryItem(item.id, type, item);
  }
  console.log(`[OfflineAdapter] Cached ${items.length} ${type} items`);
}

/**
 * Get a cached library item
 */
export async function getCachedLibraryItem<T>(id: string): Promise<T | null> {
  const item = await get<LibraryCacheItem>(STORES.LIBRARY_CACHE, id);

  if (!item) return null;

  // Check if expired
  if (item.expiresAt < Date.now()) {
    return null;
  }

  return item.data as T;
}

/**
 * Get all cached items of a type
 */
export async function getCachedLibraryItemsByType<T>(
  type: 'song' | 'artist' | 'album' | 'playlist'
): Promise<T[]> {
  const items = await getByIndex<LibraryCacheItem>(STORES.LIBRARY_CACHE, 'type', type);
  const now = Date.now();

  return items
    .filter(item => item.expiresAt > now)
    .map(item => item.data as T);
}

/**
 * Clear expired library cache items
 */
export async function clearExpiredLibraryCache(): Promise<number> {
  return deleteExpired(STORES.LIBRARY_CACHE);
}

// ============================================================================
// Recommendations Cache Adapter
// ============================================================================

/**
 * Cache recommendations for a seed song
 */
export async function cacheRecommendations(
  seedSongId: string | undefined,
  recommendations: unknown[]
): Promise<void> {
  const item: RecommendationCacheItem = {
    id: seedSongId || 'general',
    seedSongId,
    recommendations,
    cachedAt: Date.now(),
    expiresAt: Date.now() + RECOMMENDATIONS_CACHE_TTL,
  };

  await put(STORES.RECOMMENDATIONS, item);
  console.log(`[OfflineAdapter] Cached ${recommendations.length} recommendations`);
}

/**
 * Get cached recommendations for a seed song
 */
export async function getCachedRecommendations<T>(seedSongId?: string): Promise<T[] | null> {
  const id = seedSongId || 'general';
  const item = await get<RecommendationCacheItem>(STORES.RECOMMENDATIONS, id);

  if (!item) return null;

  // Check if expired
  if (item.expiresAt < Date.now()) {
    return null;
  }

  return item.recommendations as T[];
}

/**
 * Clear expired recommendations cache
 */
export async function clearExpiredRecommendations(): Promise<number> {
  return deleteExpired(STORES.RECOMMENDATIONS);
}

// ============================================================================
// Sync Status
// ============================================================================

export interface OfflineSyncStatus {
  isOnline: boolean;
  pendingListeningHistory: number;
  pendingFeedback: number;
  totalPending: number;
  libraryItemsCached: number;
  recommendationsCached: number;
}

/**
 * Get overall offline sync status
 */
export async function getOfflineSyncStatus(): Promise<OfflineSyncStatus> {
  const pendingListeningHistory = await getUnsyncedListeningHistoryCount();
  const pendingFeedback = await getUnsyncedFeedbackCount();

  const libraryItems = await getAll<LibraryCacheItem>(STORES.LIBRARY_CACHE);
  const recommendations = await getAll<RecommendationCacheItem>(STORES.RECOMMENDATIONS);

  return {
    isOnline: isOnline(),
    pendingListeningHistory,
    pendingFeedback,
    totalPending: pendingListeningHistory + pendingFeedback,
    libraryItemsCached: libraryItems.length,
    recommendationsCached: recommendations.length,
  };
}

/**
 * Clear all offline data (for debugging/logout)
 */
export async function clearAllOfflineData(): Promise<void> {
  const { clear } = await import('./indexed-db');

  await clear(STORES.LISTENING_HISTORY);
  await clear(STORES.FEEDBACK);
  await clear(STORES.PREFERENCES);
  await clear(STORES.LIBRARY_CACHE);
  await clear(STORES.SYNC_QUEUE);
  await clear(STORES.RECOMMENDATIONS);

  console.log('[OfflineAdapter] Cleared all offline data');
}
