/**
 * Offline Status Indicator
 *
 * A UI component that displays the current offline/online status
 * and pending sync count. Shows different states:
 * - Online (green)
 * - Offline (red/amber)
 * - Syncing (blue spinner)
 * - Pending items (badge count)
 *
 * @see docs/architecture/offline-first.md
 */

import React from 'react';
import { WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOffline } from '@/lib/contexts/OfflineContext';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OfflineIndicatorProps {
  /** Show the sync button */
  showSyncButton?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode - just icon */
  compact?: boolean;
}

/**
 * Offline status indicator component
 */
export function OfflineIndicator({
  showSyncButton = true,
  className,
  compact = false,
}: OfflineIndicatorProps) {
  const { isOnline, isInitialized, isSyncing, pendingCount, triggerSync } = useOffline();

  // Don't render until initialized
  if (!isInitialized) {
    return null;
  }

  // Determine status
  const status = isSyncing
    ? 'syncing'
    : isOnline
      ? pendingCount > 0
        ? 'pending'
        : 'online'
      : 'offline';

  const statusConfig = {
    online: {
      icon: Cloud,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'Online',
      description: 'All data is synced',
    },
    offline: {
      icon: CloudOff,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      label: 'Offline',
      description: 'Changes will sync when you reconnect',
    },
    pending: {
      icon: Cloud,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      label: `${pendingCount} pending`,
      description: `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting to sync`,
    },
    syncing: {
      icon: RefreshCw,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      label: 'Syncing...',
      description: 'Syncing your data',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full',
                config.bgColor,
                className
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4',
                  config.color,
                  status === 'syncing' && 'animate-spin'
                )}
              />
              {pendingCount > 0 && status !== 'syncing' && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
        config.bgColor,
        className
      )}
    >
      <Icon
        className={cn(
          'w-4 h-4',
          config.color,
          status === 'syncing' && 'animate-spin'
        )}
      />
      <span className={config.color}>{config.label}</span>

      {showSyncButton && pendingCount > 0 && isOnline && !isSyncing && (
        <Button
          variant="ghost"
          size="sm"
          onClick={triggerSync}
          className="h-6 px-2 text-xs"
        >
          Sync Now
        </Button>
      )}
    </div>
  );
}

/**
 * Full-screen offline banner for when connection is lost
 */
export function OfflineBanner() {
  const { isOnline, isInitialized, pendingCount } = useOffline();

  // Don't render if online or not initialized
  if (!isInitialized || isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      <span className="font-medium">
        You're offline
        {pendingCount > 0 && ` - ${pendingCount} item${pendingCount === 1 ? '' : 's'} pending`}
      </span>
    </div>
  );
}

/**
 * Toast notification for sync status changes
 */
export function useSyncToast() {
  const { isOnline, pendingCount, isSyncing } = useOffline();
  const [lastOnline, setLastOnline] = React.useState(isOnline);

  React.useEffect(() => {
    // Detect transition from offline to online
    if (isOnline && !lastOnline) {
      // Could trigger a toast here
      console.log('[OfflineIndicator] App came back online');
    }

    // Detect transition from online to offline
    if (!isOnline && lastOnline) {
      console.log('[OfflineIndicator] App went offline');
    }

    setLastOnline(isOnline);
  }, [isOnline, lastOnline]);

  return { isOnline, pendingCount, isSyncing };
}
