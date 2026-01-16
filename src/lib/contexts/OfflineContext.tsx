/**
 * Offline Context
 *
 * Provides global offline status and sync management to the app.
 * Use this context to:
 * - Check if the app is online/offline
 * - Get pending sync count
 * - Trigger manual sync
 * - Show offline indicators in UI
 *
 * @see docs/architecture/offline-first.md
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import { useOfflineStatus, type UseOfflineStatusReturn } from '@/lib/hooks/useOfflineStatus';

// Create context with default values
const OfflineContext = createContext<UseOfflineStatusReturn | null>(null);

interface OfflineProviderProps {
  children: ReactNode;
}

/**
 * Provider component for offline functionality
 *
 * Wrap your app with this provider to enable offline-first features
 *
 * @example
 * ```tsx
 * <OfflineProvider>
 *   <App />
 * </OfflineProvider>
 * ```
 */
export function OfflineProvider({ children }: OfflineProviderProps) {
  const offlineStatus = useOfflineStatus();

  return (
    <OfflineContext.Provider value={offlineStatus}>
      {children}
    </OfflineContext.Provider>
  );
}

/**
 * Hook to access offline context
 *
 * @throws Error if used outside of OfflineProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isOnline, pendingCount, triggerSync } = useOffline();
 *
 *   return (
 *     <div>
 *       {isOnline ? 'Online' : 'Offline'}
 *       {pendingCount > 0 && (
 *         <button onClick={triggerSync}>Sync {pendingCount} items</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useOffline(): UseOfflineStatusReturn {
  const context = useContext(OfflineContext);

  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }

  return context;
}

/**
 * HOC for components that need offline status
 */
export function withOfflineStatus<P extends object>(
  Component: React.ComponentType<P & UseOfflineStatusReturn>
) {
  return function WithOfflineStatus(props: P) {
    const offlineStatus = useOffline();
    return <Component {...props} {...offlineStatus} />;
  };
}
