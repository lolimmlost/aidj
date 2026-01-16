/**
 * useOfflineStatus Hook
 *
 * Provides real-time online/offline status detection and sync status.
 * Handles:
 * - Browser online/offline events
 * - Service worker messages
 * - Pending sync count
 * - Auto-sync on reconnection
 *
 * @see docs/architecture/offline-first.md
 */

import { useState, useEffect, useCallback } from 'react';
import {
  initDB,
  getOfflineSyncStatus,
  processSyncQueue,
  notifyServiceWorkerToSync,
  type OfflineSyncStatus,
} from '@/lib/services/offline';

export interface UseOfflineStatusReturn {
  /** Whether the browser is currently online */
  isOnline: boolean;
  /** Whether an initial check has completed */
  isInitialized: boolean;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Detailed offline sync status */
  syncStatus: OfflineSyncStatus | null;
  /** Number of pending items to sync */
  pendingCount: number;
  /** Manually trigger a sync */
  triggerSync: () => Promise<void>;
  /** Refresh the sync status */
  refreshStatus: () => Promise<void>;
}

/**
 * Hook for monitoring online/offline status and managing sync
 */
export function useOfflineStatus(): UseOfflineStatusReturn {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus | null>(null);

  // Calculate pending count from status
  const pendingCount = syncStatus?.totalPending ?? 0;

  /**
   * Refresh the sync status from IndexedDB
   */
  const refreshStatus = useCallback(async () => {
    try {
      const status = await getOfflineSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('[useOfflineStatus] Failed to refresh status:', error);
    }
  }, []);

  /**
   * Manually trigger a sync
   */
  const triggerSync = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      // First try to notify service worker
      await notifyServiceWorkerToSync();

      // Also run sync in main thread as fallback
      await processSyncQueue();

      // Refresh status after sync
      await refreshStatus();
    } catch (error) {
      console.error('[useOfflineStatus] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshStatus]);

  // Initialize IndexedDB and fetch initial status
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // Initialize IndexedDB
        await initDB();

        // Get initial status
        if (mounted) {
          await refreshStatus();
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('[useOfflineStatus] Initialization failed:', error);
        if (mounted) {
          setIsInitialized(true); // Still mark as initialized even on error
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [refreshStatus]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[useOfflineStatus] App is online');
      setIsOnline(true);

      // Automatically sync when coming back online
      await triggerSync();
    };

    const handleOffline = () => {
      console.log('[useOfflineStatus] App is offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync]);

  // Listen for service worker sync messages
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('[useOfflineStatus] Received sync complete message:', event.data);
        // Refresh status after service worker sync
        refreshStatus();
        setIsSyncing(false);
      }

      if (event.data?.type === 'SYNC_STATUS') {
        console.log('[useOfflineStatus] Received sync status:', event.data.status);
        refreshStatus();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [refreshStatus]);

  // Periodically refresh status when online
  useEffect(() => {
    if (!isOnline || !isInitialized) return;

    // Refresh every 30 seconds when online
    const interval = setInterval(refreshStatus, 30000);

    return () => clearInterval(interval);
  }, [isOnline, isInitialized, refreshStatus]);

  return {
    isOnline,
    isInitialized,
    isSyncing,
    syncStatus,
    pendingCount,
    triggerSync,
    refreshStatus,
  };
}

/**
 * Simple hook for just checking online status
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
