// AIDJ Service Worker - Enables background audio, PWA functionality, and offline-first features
const CACHE_NAME = 'aidj-v3';
const AUDIO_CACHE_NAME = 'aidj-audio-v1';
const API_CACHE_NAME = 'aidj-api-v1';

// Database configuration (mirrors IndexedDB in main app)
const DB_NAME = 'aidj-offline';
const DB_VERSION = 1;
const STORES = {
  LISTENING_HISTORY: 'listeningHistory',
  FEEDBACK: 'feedback',
  PREFERENCES: 'preferences',
  LIBRARY_CACHE: 'libraryCache',
  SYNC_QUEUE: 'syncQueue',
  RECOMMENDATIONS: 'recommendations',
};

// Sync tags
const SYNC_TAGS = {
  LISTENING_HISTORY: 'sync-listening-history',
  FEEDBACK: 'sync-feedback',
  PREFERENCES: 'sync-preferences',
  ALL: 'sync-all',
};

// Retry configuration
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 60000;

// Assets to cache on install (only truly static assets)
const STATIC_ASSETS = [
  '/manifest.json',
];

// API endpoints that can be cached for offline use
const CACHEABLE_API_PATTERNS = [
  /^\/api\/library\//,
  /^\/api\/recommendations$/,
  /^\/api\/preferences$/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v3...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      // Use addAll for critical assets, but don't fail if some don't exist
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v3...');
  const currentCaches = [CACHE_NAME, AUDIO_CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !currentCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - handle requests with offline-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle audio streaming - don't cache, just pass through
  // This is important for Navidrome streaming to work properly
  if (url.pathname.includes('/rest/stream') ||
      url.pathname.includes('/api/stream') ||
      event.request.headers.get('Range')) {
    // For audio streams, just fetch normally - don't interfere
    return;
  }

  // For API calls that can be cached, use network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));

    if (isCacheable && event.request.method === 'GET') {
      event.respondWith(
        networkFirstWithCache(event.request)
      );
      return;
    }

    // For non-cacheable APIs, just fetch normally
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses for static assets
        if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      });
    })
  );
});

/**
 * Network-first strategy with cache fallback for API requests
 */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from API cache:', request.url);
      return cachedResponse;
    }

    // Return a proper offline response
    return new Response(JSON.stringify({
      error: 'OFFLINE',
      message: 'You are offline. Data will sync when you reconnect.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'PROCESS_SYNC_QUEUE') {
    console.log('[SW] Received request to process sync queue');
    processSyncQueue();
  }

  if (event.data && event.data.type === 'GET_SYNC_STATUS') {
    // Return sync status to the requesting client
    getSyncStatus().then(status => {
      event.source.postMessage({
        type: 'SYNC_STATUS',
        status,
      });
    });
  }
});

// Background Sync - handles queued actions when connectivity is restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  switch (event.tag) {
    case SYNC_TAGS.LISTENING_HISTORY:
      event.waitUntil(syncListeningHistory());
      break;

    case SYNC_TAGS.FEEDBACK:
      event.waitUntil(syncFeedback());
      break;

    case SYNC_TAGS.PREFERENCES:
      event.waitUntil(syncPreferences());
      break;

    case SYNC_TAGS.ALL:
      event.waitUntil(processSyncQueue());
      break;

    default:
      console.log('[SW] Unknown sync tag:', event.tag);
  }
});

// Periodic Background Sync - for regular sync checks
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-pending-data') {
    console.log('[SW] Periodic sync triggered');
    event.waitUntil(processSyncQueue());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification from AIDJ',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/dashboard',
      },
      actions: data.actions || [],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'AIDJ', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Handle action buttons
  if (event.action === 'sync-now') {
    processSyncQueue();
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/dashboard');
      }
    })
  );
});

// ============================================================================
// IndexedDB Operations (simplified for service worker context)
// ============================================================================

/**
 * Open the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('action', 'action', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('retryCount', 'retryCount', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.LISTENING_HISTORY)) {
        const historyStore = db.createObjectStore(STORES.LISTENING_HISTORY, { keyPath: 'id' });
        historyStore.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FEEDBACK)) {
        const feedbackStore = db.createObjectStore(STORES.FEEDBACK, { keyPath: 'id' });
        feedbackStore.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

/**
 * Get all items from a store
 */
async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get items from a store by index
 */
async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update an item in a store
 */
async function putInStore(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete an item from a store
 */
async function deleteFromStore(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Process the entire sync queue
 */
async function processSyncQueue() {
  console.log('[SW] Processing sync queue...');

  try {
    const items = await getAllFromStore(STORES.SYNC_QUEUE);
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      if (item.retryCount >= MAX_RETRIES) {
        failed++;
        continue;
      }

      try {
        const success = await processQueueItem(item);

        if (success) {
          await deleteFromStore(STORES.SYNC_QUEUE, item.id);
          synced++;
        } else {
          await markItemFailed(item, 'Unknown error');
          failed++;
        }
      } catch (error) {
        await markItemFailed(item, error.message || 'Unknown error');
        failed++;
      }
    }

    console.log(`[SW] Sync complete: ${synced} synced, ${failed} failed`);

    // Notify clients of sync completion
    await notifyClients({
      type: 'SYNC_COMPLETE',
      synced,
      failed,
      remaining: items.length - synced,
    });

    // Show notification if there were successful syncs
    if (synced > 0) {
      await showSyncNotification(synced);
    }

    return { synced, failed };
  } catch (error) {
    console.error('[SW] Error processing sync queue:', error);
    return { synced: 0, failed: 0, error: error.message };
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(item) {
  switch (item.action) {
    case 'record_listening_history':
      return await syncListeningHistoryItem(item.payload);

    case 'submit_feedback':
      return await syncFeedbackItem(item.payload);

    case 'update_preferences':
      return await syncPreferencesItem(item.payload);

    default:
      console.warn('[SW] Unknown action:', item.action);
      return false;
  }
}

/**
 * Sync a listening history record
 */
async function syncListeningHistoryItem(payload) {
  const response = await fetch('/api/listening-history/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return response.ok;
}

/**
 * Sync a feedback record
 */
async function syncFeedbackItem(payload) {
  const response = await fetch('/api/recommendations/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  // 409 Conflict means feedback already exists - treat as success
  return response.ok || response.status === 409;
}

/**
 * Sync preferences
 */
async function syncPreferencesItem(payload) {
  const response = await fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  return response.ok;
}

/**
 * Sync all listening history
 */
async function syncListeningHistory() {
  const items = await getByIndex(STORES.SYNC_QUEUE, 'action', 'record_listening_history');

  for (const item of items) {
    try {
      const success = await syncListeningHistoryItem(item.payload);
      if (success) {
        await deleteFromStore(STORES.SYNC_QUEUE, item.id);
      }
    } catch (error) {
      console.warn('[SW] Failed to sync listening history item:', error);
    }
  }
}

/**
 * Sync all feedback
 */
async function syncFeedback() {
  const items = await getByIndex(STORES.SYNC_QUEUE, 'action', 'submit_feedback');

  for (const item of items) {
    try {
      const success = await syncFeedbackItem(item.payload);
      if (success) {
        await deleteFromStore(STORES.SYNC_QUEUE, item.id);
      }
    } catch (error) {
      console.warn('[SW] Failed to sync feedback item:', error);
    }
  }
}

/**
 * Sync all preferences
 */
async function syncPreferences() {
  const items = await getByIndex(STORES.SYNC_QUEUE, 'action', 'update_preferences');

  for (const item of items) {
    try {
      const success = await syncPreferencesItem(item.payload);
      if (success) {
        await deleteFromStore(STORES.SYNC_QUEUE, item.id);
      }
    } catch (error) {
      console.warn('[SW] Failed to sync preferences item:', error);
    }
  }
}

/**
 * Mark an item as failed
 */
async function markItemFailed(item, error) {
  item.retryCount = (item.retryCount || 0) + 1;
  item.lastAttempt = Date.now();
  item.error = error;

  await putInStore(STORES.SYNC_QUEUE, item);
}

/**
 * Get sync status
 */
async function getSyncStatus() {
  const items = await getAllFromStore(STORES.SYNC_QUEUE);
  return {
    pending: items.length,
    failed: items.filter(item => item.retryCount >= MAX_RETRIES).length,
  };
}

/**
 * Notify all clients of an event
 */
async function notifyClients(message) {
  const clientList = await clients.matchAll({ type: 'window' });
  for (const client of clientList) {
    client.postMessage(message);
  }
}

/**
 * Show a sync completion notification
 */
async function showSyncNotification(count) {
  await self.registration.showNotification('AIDJ Sync Complete', {
    body: `Synced ${count} item${count === 1 ? '' : 's'} to the server`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'sync-complete',
    silent: true,
  });
}
