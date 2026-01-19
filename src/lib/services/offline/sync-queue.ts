/**
 * Offline Sync Queue
 *
 * Manages a queue of pending actions that need to be synced
 * to the server when the app comes back online.
 *
 * Features:
 * - Queues actions when offline
 * - Triggers Background Sync API when available
 * - Falls back to manual sync on reconnection
 * - Handles retry logic with exponential backoff
 *
 * @see docs/architecture/offline-first.md
 */

import {
  put,
  get,
  getAll,
  getByIndex,
  remove,
  STORES,
  type SyncQueueItem,
  type SyncAction,
} from './indexed-db';

// Sync configuration
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 60000; // 1 minute

// Background Sync tags
export const SYNC_TAGS = {
  LISTENING_HISTORY: 'sync-listening-history',
  FEEDBACK: 'sync-feedback',
  PREFERENCES: 'sync-preferences',
  ALL: 'sync-all',
} as const;

/**
 * Generate a unique ID for sync queue items
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add an item to the sync queue
 */
export async function addToSyncQueue(
  action: SyncAction,
  payload: unknown
): Promise<string> {
  const item: SyncQueueItem = {
    id: generateId(),
    action,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  };

  await put(STORES.SYNC_QUEUE, item);
  console.log(`[SyncQueue] Added item: ${action} (${item.id})`);

  // Try to trigger background sync
  await requestBackgroundSync(action);

  return item.id;
}

/**
 * Get all items from the sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
}

/**
 * Get sync queue items by action type
 */
export async function getSyncQueueByAction(action: SyncAction): Promise<SyncQueueItem[]> {
  return getByIndex<SyncQueueItem>(STORES.SYNC_QUEUE, 'action', action);
}

/**
 * Get a specific sync queue item
 */
export async function getSyncQueueItem(id: string): Promise<SyncQueueItem | undefined> {
  return get<SyncQueueItem>(STORES.SYNC_QUEUE, id);
}

/**
 * Update a sync queue item (e.g., after retry)
 */
export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  await put(STORES.SYNC_QUEUE, item);
}

/**
 * Remove an item from the sync queue (after successful sync)
 */
export async function removeFromSyncQueue(id: string): Promise<void> {
  await remove(STORES.SYNC_QUEUE, id);
  console.log(`[SyncQueue] Removed item: ${id}`);
}

/**
 * Mark an item as failed and increment retry count
 */
export async function markSyncItemFailed(
  id: string,
  error: string
): Promise<SyncQueueItem | null> {
  const item = await getSyncQueueItem(id);
  if (!item) return null;

  item.retryCount++;
  item.lastAttempt = Date.now();
  item.error = error;

  await updateSyncQueueItem(item);
  console.log(`[SyncQueue] Item ${id} failed (attempt ${item.retryCount}): ${error}`);

  return item;
}

/**
 * Check if an item should be retried
 */
export function shouldRetry(item: SyncQueueItem): boolean {
  return item.retryCount < MAX_RETRIES;
}

/**
 * Calculate the next retry delay with exponential backoff
 */
export function getRetryDelay(retryCount: number): number {
  const delay = Math.min(
    BASE_RETRY_DELAY * Math.pow(2, retryCount),
    MAX_RETRY_DELAY
  );
  // Add jitter (0-25% of delay)
  return delay + Math.random() * delay * 0.25;
}

/**
 * Request a background sync if the API is available
 */
async function requestBackgroundSync(action: SyncAction): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check if Background Sync API is available
    if (!('sync' in registration)) {
      console.log('[SyncQueue] Background Sync API not available');
      return false;
    }

    // Map action to sync tag
    const tagMap: Record<SyncAction, string> = {
      record_listening_history: SYNC_TAGS.LISTENING_HISTORY,
      submit_feedback: SYNC_TAGS.FEEDBACK,
      update_preferences: SYNC_TAGS.PREFERENCES,
    };

    const tag = tagMap[action] || SYNC_TAGS.ALL;

    // Request background sync
    await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag);
    console.log(`[SyncQueue] Registered background sync: ${tag}`);
    return true;
  } catch (error) {
    console.warn('[SyncQueue] Failed to register background sync:', error);
    return false;
  }
}

/**
 * Request sync for all pending items
 */
export async function requestAllBackgroundSyncs(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if (!('sync' in registration)) {
      return;
    }

    await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAGS.ALL);
    console.log('[SyncQueue] Registered sync-all');
  } catch (error) {
    console.warn('[SyncQueue] Failed to register sync-all:', error);
  }
}

/**
 * Get the count of pending sync items
 */
export async function getPendingSyncCount(): Promise<number> {
  const items = await getSyncQueue();
  return items.length;
}

/**
 * Get the count of failed sync items
 */
export async function getFailedSyncCount(): Promise<number> {
  const items = await getSyncQueue();
  return items.filter(item => item.retryCount >= MAX_RETRIES).length;
}

/**
 * Clear failed items (items that have exceeded retry limit)
 */
export async function clearFailedSyncItems(): Promise<number> {
  const items = await getSyncQueue();
  const failedItems = items.filter(item => item.retryCount >= MAX_RETRIES);

  for (const item of failedItems) {
    await remove(STORES.SYNC_QUEUE, item.id);
  }

  console.log(`[SyncQueue] Cleared ${failedItems.length} failed items`);
  return failedItems.length;
}

/**
 * Process the sync queue
 * Returns the number of successfully synced items
 */
export async function processSyncQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const items = await getSyncQueue();
  let synced = 0;
  let failed = 0;

  console.log(`[SyncQueue] Processing ${items.length} items...`);

  for (const item of items) {
    // Skip items that have exceeded retry limit
    if (!shouldRetry(item)) {
      failed++;
      continue;
    }

    try {
      // Process based on action type
      const success = await processQueueItem(item);

      if (success) {
        await removeFromSyncQueue(item.id);
        synced++;
      } else {
        await markSyncItemFailed(item.id, 'Unknown error');
        failed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markSyncItemFailed(item.id, errorMessage);
      failed++;
    }
  }

  const remaining = await getPendingSyncCount();

  console.log(`[SyncQueue] Processed: ${synced} synced, ${failed} failed, ${remaining} remaining`);

  return { synced, failed, remaining };
}

/**
 * Process a single queue item
 */
async function processQueueItem(item: SyncQueueItem): Promise<boolean> {
  switch (item.action) {
    case 'record_listening_history':
      return await syncListeningHistory(item.payload);

    case 'submit_feedback':
      return await syncFeedback(item.payload);

    case 'update_preferences':
      return await syncPreferences(item.payload);

    default:
      console.warn(`[SyncQueue] Unknown action: ${item.action}`);
      return false;
  }
}

/**
 * Sync listening history to server
 */
async function syncListeningHistory(payload: unknown): Promise<boolean> {
  const response = await fetch('/api/listening-history/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to sync listening history: ${error}`);
  }

  return true;
}

/**
 * Sync feedback to server
 */
async function syncFeedback(payload: unknown): Promise<boolean> {
  const response = await fetch('/api/recommendations/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  // 409 Conflict means feedback already exists - treat as success
  if (response.status === 409) {
    return true;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to sync feedback: ${error}`);
  }

  return true;
}

/**
 * Sync preferences to server
 */
async function syncPreferences(payload: unknown): Promise<boolean> {
  const response = await fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to sync preferences: ${error}`);
  }

  return true;
}

/**
 * Notify the service worker to process sync queue
 */
export async function notifyServiceWorkerToSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      registration.active.postMessage({
        type: 'PROCESS_SYNC_QUEUE',
      });
      console.log('[SyncQueue] Notified service worker to process queue');
    }
  } catch (error) {
    console.warn('[SyncQueue] Failed to notify service worker:', error);
  }
}
