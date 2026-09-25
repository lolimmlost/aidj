/**
 * Speaker output (#244) — which house speaker, if any, is playing AIDJ's queue.
 *
 * While `active` is set the phone is a remote: local decks stay paused, the
 * PlayerBar routes transport controls to the speaker, and `useSpeakerOutput`
 * keeps the speaker a few tracks ahead of the AI DJ queue.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActiveSpeaker {
  id: string;
  name: string;
}

export interface SpeakerStatus {
  state: 'playing' | 'paused' | 'idle';
  currentSongId: string | null;
  positionSec: number;
  durationSec: number | null;
  upcomingSongIds: string[];
  /** Client clock (ms) when this status was received — for interpolation. */
  receivedAt: number;
}

interface SpeakerOutputState {
  active: ActiveSpeaker | null;
  status: SpeakerStatus | null;
  /** True while a hand-off to a speaker is in flight (receiver can take ~6s). */
  connecting: boolean;
  setActive: (speaker: ActiveSpeaker | null) => void;
  setStatus: (status: SpeakerStatus | null) => void;
  setConnecting: (connecting: boolean) => void;
}

export const useSpeakerOutput = create<SpeakerOutputState>()(
  persist(
    (set) => ({
      active: null,
      status: null,
      connecting: false,
      setActive: (active) => set({ active, ...(active ? {} : { status: null }) }),
      setStatus: (status) => set({ status }),
      setConnecting: (connecting) => set({ connecting }),
    }),
    {
      name: 'aidj-speaker-output',
      // Survive a reload so the phone reopens as the remote; live status is refetched.
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
