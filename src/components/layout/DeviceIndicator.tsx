/**
 * Device Indicator for PlayerBar
 *
 * Shows which device is currently playing, including song name,
 * artist, and a progress bar. Clicking opens the DevicePicker dropdown.
 */

import { useState, useEffect, memo } from 'react';
import { Smartphone, Monitor, Tablet } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';
import { DevicePicker } from './DevicePicker';

function getDeviceIcon(type: string | null) {
  switch (type) {
    case 'mobile':
      return <Smartphone className="w-3.5 h-3.5" />;
    case 'tablet':
      return <Tablet className="w-3.5 h-3.5" />;
    default:
      return <Monitor className="w-3.5 h-3.5" />;
  }
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export const DeviceIndicator = memo(function DeviceIndicator() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const remoteDevice = useAudioStore((s) => s.remoteDevice);
  const [estimatedPosition, setEstimatedPosition] = useState(0);

  // Estimate current position by interpolating from the last known position
  useEffect(() => {
    if (!remoteDevice?.isPlaying || !remoteDevice.updatedAt || remoteDevice.currentPositionMs == null) {
      setEstimatedPosition(remoteDevice?.currentPositionMs ?? 0);
      return;
    }

    // Set initial position
    setEstimatedPosition(remoteDevice.currentPositionMs);

    // Tick every second to advance the estimated position
    const interval = setInterval(() => {
      const elapsed = Date.now() - (remoteDevice.updatedAt ?? Date.now());
      const pos = (remoteDevice.currentPositionMs ?? 0) + elapsed;
      const clamped = remoteDevice.durationMs ? Math.min(pos, remoteDevice.durationMs) : pos;
      setEstimatedPosition(clamped);
    }, 1000);

    return () => clearInterval(interval);
  }, [remoteDevice?.currentPositionMs, remoteDevice?.updatedAt, remoteDevice?.isPlaying, remoteDevice?.durationMs]);

  // Only show if a remote device is playing
  if (!remoteDevice?.isPlaying) return null;

  const hasSongInfo = remoteDevice.songName || remoteDevice.artist;
  const progressPercent = remoteDevice.durationMs && remoteDevice.durationMs > 0
    ? Math.min(100, (estimatedPosition / remoteDevice.durationMs) * 100)
    : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPickerOpen(!pickerOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
          "bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors",
          "max-w-[200px]"
        )}
      >
        {getDeviceIcon(null)}
        <div className="flex flex-col items-start min-w-0">
          {hasSongInfo ? (
            <>
              <span className="truncate max-w-[160px] font-medium leading-tight">
                {remoteDevice.songName}
              </span>
              <span className="truncate max-w-[160px] text-green-500/70 text-[10px] leading-tight">
                {remoteDevice.artist}
              </span>
            </>
          ) : (
            <span className="truncate max-w-[120px]">
              {remoteDevice.deviceName || 'Another device'}
            </span>
          )}
          {/* Mini progress bar */}
          {remoteDevice.durationMs && remoteDevice.durationMs > 0 && (
            <div className="w-full flex items-center gap-1 mt-0.5">
              <div className="flex-1 h-[2px] bg-green-500/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[9px] text-green-500/60 tabular-nums">
                {formatTime(estimatedPosition)}
              </span>
            </div>
          )}
        </div>
      </button>

      {pickerOpen && (
        <DevicePicker onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
});
