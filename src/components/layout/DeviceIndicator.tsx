/**
 * Device Indicator for PlayerBar
 *
 * Shows which device is currently playing.
 * Clicking opens the DevicePicker dropdown.
 */

import { useState, memo } from 'react';
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

export const DeviceIndicator = memo(function DeviceIndicator() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const remoteDevice = useAudioStore((s) => s.remoteDevice);

  // Only show if a remote device is playing
  if (!remoteDevice?.isPlaying) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPickerOpen(!pickerOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
          "bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
        )}
      >
        {getDeviceIcon(null)}
        <span className="hidden sm:inline truncate max-w-[120px]">
          {remoteDevice.deviceName || 'Another device'}
        </span>
      </button>

      {pickerOpen && (
        <DevicePicker onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
});
