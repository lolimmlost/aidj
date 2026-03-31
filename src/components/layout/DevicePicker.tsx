/**
 * Device Picker Dropdown
 *
 * Shows available devices and allows transferring playback.
 * Spotify Connect-style device selection.
 * Renders via portal to avoid overflow clipping in the fixed player bar.
 */

import { useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone, Monitor, Tablet, Check, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAudioStore } from '@/lib/stores/audio';
import { getDeviceInfo } from '@/lib/utils/device';
import { cn } from '@/lib/utils';

interface DevicePickerProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

function getDeviceIcon(type: string) {
  switch (type) {
    case 'mobile':
      return <Smartphone className="w-4 h-4" />;
    case 'tablet':
      return <Tablet className="w-4 h-4" />;
    default:
      return <Monitor className="w-4 h-4" />;
  }
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const DevicePicker = memo(function DevicePicker({ onClose, triggerRef }: DevicePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const localDevice = getDeviceInfo();
  const remoteDevice = useAudioStore((s) => s.remoteDevice);

  const { data } = useQuery({
    queryKey: ['playback', 'devices'],
    queryFn: async () => {
      const res = await fetch('/api/playback/devices', { credentials: 'include' });
      if (!res.ok) return { devices: [] };
      return res.json() as Promise<{ devices: Array<{
        id: string;
        deviceName: string;
        deviceType: string;
        lastSeenAt: string;
      }> }>;
    },
    staleTime: 10_000,
  });

  // Position above trigger once the dropdown DOM node is available
  const positionDropdown = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // Store for outside-click detection
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;

    if (triggerRef?.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const gap = 8;
      const dropdownWidth = 256;

      // Measure after content renders
      requestAnimationFrame(() => {
        const dropdownHeight = node.offsetHeight || 200;
        let top = triggerRect.top - dropdownHeight - gap;
        let left = triggerRect.left;

        if (top < 8) top = triggerRect.bottom + gap;
        if (left + dropdownWidth > window.innerWidth) left = window.innerWidth - dropdownWidth - 8;
        if (left < 8) left = 8;

        node.style.top = `${top}px`;
        node.style.left = `${left}px`;
        node.style.visibility = 'visible';
      });
    } else {
      // Fallback: position above player bar
      node.style.bottom = '80px';
      node.style.left = '16px';
      node.style.visibility = 'visible';
    }
  }, [triggerRef]);

  // Close on outside click (ignore clicks on the trigger button)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) &&
          !(triggerRef?.current && triggerRef.current.contains(target))) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, triggerRef]);

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const devices = data?.devices ?? [];

  const handleTransfer = async (targetDeviceId: string, targetDeviceName: string, targetDeviceType: string) => {
    try {
      await fetch('/api/playback/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetDeviceId,
          targetDeviceName,
          targetDeviceType,
          play: true,
        }),
      });
      onClose();
    } catch (err) {
      console.error('Failed to transfer playback:', err);
    }
  };

  if (typeof document === 'undefined') return null;

  const dropdown = (
    <div
      ref={positionDropdown}
      className={cn(
        "fixed w-64 z-[9999]",
        "bg-popover border border-border rounded-lg shadow-xl",
        "animate-in fade-in slide-in-from-bottom-2 duration-150"
      )}
      style={{ visibility: 'hidden' }}
    >
      <div className="p-3">
        <h4 className="text-sm font-medium mb-2">Available Devices</h4>
        <div className="space-y-1">
          {devices.map((device) => {
            const isLocal = device.id === localDevice.deviceId;
            const isActive = remoteDevice?.deviceId === device.id && remoteDevice?.isPlaying;

            return (
              <button
                type="button"
                key={device.id}
                onClick={() => {
                  if (!isActive) {
                    handleTransfer(device.id, device.deviceName, device.deviceType);
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 w-full px-2 py-2 rounded-md text-sm transition-colors",
                  "hover:bg-accent/50",
                  isActive && "bg-green-500/10"
                )}
                aria-label={`${isActive ? 'Playing on' : 'Transfer playback to'} ${device.deviceName}${isLocal ? ' (this device)' : ''}`}
              >
                <span className={cn("text-muted-foreground", isActive && "text-green-500")}>
                  {getDeviceIcon(device.deviceType)}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <p className={cn("truncate", isActive && "text-green-500 font-medium")}>
                    {device.deviceName}
                    {isLocal && <span className="text-muted-foreground ml-1">(this device)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isActive ? 'Playing' : formatLastSeen(device.lastSeenAt)}
                  </p>
                </div>
                {isActive ? (
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100" />
                )}
              </button>
            );
          })}
          {devices.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No other devices found
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dropdown, document.body);
});
