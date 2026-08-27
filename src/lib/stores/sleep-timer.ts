/**
 * Sleep timer store (isolated from the audio store on purpose).
 *
 * Holds only the timer intent as an ABSOLUTE expiry timestamp so it survives
 * backgrounding / screen-lock (a naive setTimeout gets throttled by iOS). The
 * actual pause is performed by PlayerBar's expiry watcher, which reuses the
 * existing togglePlayPause path — this store never touches playback directly,
 * keeping the delicate audio store untouched.
 *
 * See #171.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SleepTimerMode = 'off' | 'duration' | 'end-of-track';

interface SleepTimerState {
  mode: SleepTimerMode;
  /** Absolute wall-clock ms when playback should pause (Date.now()-based). */
  expiresAt: number | null;
  /** The armed duration in ms (for display); null when off. */
  durationMs: number | null;
  /** Last duration preset the user picked, remembered per-device. */
  lastPresetMs: number;

  /** Arm a fixed-duration timer. */
  armDuration: (ms: number) => void;
  /** Arm a one-shot that expires at (now + remaining track time). */
  armEndOfTrack: (remainingMs: number) => void;
  /** Cancel the timer. */
  clear: () => void;
}

export const DEFAULT_PRESET_MS = 30 * 60 * 1000;

export const useSleepTimer = create<SleepTimerState>()(
  persist(
    (set) => ({
      mode: 'off',
      expiresAt: null,
      durationMs: null,
      lastPresetMs: DEFAULT_PRESET_MS,

      armDuration: (ms) =>
        set({
          mode: 'duration',
          durationMs: ms,
          expiresAt: Date.now() + ms,
          lastPresetMs: ms,
        }),

      armEndOfTrack: (remainingMs) =>
        set({
          mode: 'end-of-track',
          durationMs: Math.max(0, remainingMs),
          expiresAt: Date.now() + Math.max(0, remainingMs),
        }),

      clear: () => set({ mode: 'off', expiresAt: null, durationMs: null }),
    }),
    {
      name: 'aidj-sleep-timer',
      // Only remember the preset — never auto-arm a timer on load.
      partialize: (s) => ({ lastPresetMs: s.lastPresetMs }),
    },
  ),
);
