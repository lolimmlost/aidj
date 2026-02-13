import { useEffect, useState, useCallback } from 'react';

interface SyncStatus {
  pending: number;
  failed: number;
}

export function useServiceWorker() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported');
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        setRegistration(reg);
        setIsRegistered(true);
        console.log('[PWA] Service worker registered:', reg.scope);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version available');
                setIsUpdateAvailable(true);
              }
            });
          }
        });

        // Check for updates periodically (every hour)
        setInterval(() => {
          reg.update();
        }, 60 * 60 * 1000);

        // Try to register for periodic background sync
        if ('periodicSync' in reg) {
          try {
            await (reg as ServiceWorkerRegistration & { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync.register('sync-pending-data', {
              minInterval: 15 * 60 * 1000, // 15 minutes
            });
            console.log('[PWA] Periodic background sync registered');
          } catch {
            console.log('[PWA] Periodic background sync not available');
          }
        }

      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    };

    registerSW();

    // Listen for controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] New service worker activated');
    });

    // Listen for messages from service worker
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_STATUS') {
        setSyncStatus(event.data.status);
      }
      if (event.data?.type === 'SYNC_COMPLETE') {
        setIsSyncing(false);
        // Request updated status after a short delay
        setTimeout(() => {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'GET_SYNC_STATUS' });
          }
        }, 500);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  const updateServiceWorker = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }, [registration]);

  const requestSyncStatus = useCallback(() => {
    if (registration?.active) {
      registration.active.postMessage({ type: 'GET_SYNC_STATUS' });
    }
  }, [registration]);

  const triggerSync = useCallback(async () => {
    if (!registration?.active) return;

    setIsSyncing(true);

    // Try to use Background Sync API first
    if ('sync' in registration) {
      try {
        await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-all');
        console.log('[PWA] Background sync registered');
        return;
      } catch {
        console.log('[PWA] Background sync not available, using message');
      }
    }

    // Fall back to messaging the service worker directly
    registration.active.postMessage({ type: 'PROCESS_SYNC_QUEUE' });
  }, [registration]);

  return {
    isRegistered,
    isUpdateAvailable,
    updateServiceWorker,
    syncStatus,
    isSyncing,
    triggerSync,
    requestSyncStatus,
  };
}
