import { useEffect } from 'react';

export interface UsePlayerKeyboardShortcutsOptions {
  togglePlayPause: () => void;
  seek: (time: number) => void;
  changeVolume: (volume: number) => void;
  toggleLike: () => void;
  toggleShuffle: () => void;
  currentTime: number;
  duration: number;
  volume: number;
}

/**
 * Keyboard shortcuts for player controls.
 *
 * Shortcuts:
 * - Space: Play/Pause
 * - ArrowLeft: Seek back 5 seconds
 * - ArrowRight: Seek forward 5 seconds
 * - M: Toggle mute
 * - L: Toggle like
 * - S: Toggle shuffle
 */
export function usePlayerKeyboardShortcuts({
  togglePlayPause,
  seek,
  changeVolume,
  toggleLike,
  toggleShuffle,
  currentTime,
  duration,
  volume,
}: UsePlayerKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 5));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          changeVolume(volume > 0 ? 0 : 0.5);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          toggleLike();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          toggleShuffle();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, seek, changeVolume, toggleLike, currentTime, duration, volume, toggleShuffle]);
}
