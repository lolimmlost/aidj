/**
 * Resume Playback Prompt
 *
 * When the app loads and the server has an active playback session on another device,
 * this prompt asks the user whether they want to take over playback here.
 *
 * This provides the user gesture required by browser autoplay policy
 * while giving a Spotify Connect-like experience.
 */

import { useState, memo } from 'react';
import { Play, X } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { getDeviceInfo } from '@/lib/utils/device';
import { cn } from '@/lib/utils';

export const ResumePlaybackPrompt = memo(function ResumePlaybackPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const remoteDevice = useAudioStore((s) => s.remoteDevice);
  const playlist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const currentSong = playlist[currentSongIndex] ?? null;

  // Derive visibility directly from state — no effect needed
  const visible = remoteDevice?.isPlaying && !isPlaying && !!currentSong && !dismissed;

  if (!visible || !currentSong) return null;

  const handleResume = async () => {
    const deviceInfo = getDeviceInfo();

    // Transfer playback to this device via the REST API
    try {
      await fetch('/api/playback/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetDeviceId: deviceInfo.deviceId,
          targetDeviceName: deviceInfo.deviceName,
          targetDeviceType: deviceInfo.deviceType,
          play: true,
        }),
      });

      // Start local playback — the user gesture from clicking satisfies autoplay policy
      useAudioStore.getState().setIsPlaying(true);
      useAudioStore.getState().setRemoteDevice(null);
    } catch (err) {
      console.error('Failed to transfer playback:', err);
    }

    setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-50",
        "bg-card border border-border rounded-lg shadow-xl",
        "px-4 py-3 flex items-center gap-3",
        "animate-in fade-in slide-in-from-bottom-4 duration-300"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          Playing on {remoteDevice?.deviceName || 'another device'}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {currentSong.artist} — {currentSong.name || currentSong.title}
        </p>
      </div>

      <button
        type="button"
        onClick={handleResume}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
          "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        )}
      >
        <Play className="w-3.5 h-3.5" />
        Play here
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});
