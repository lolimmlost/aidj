/**
 * Keeps a house speaker (Music Assistant, #244) in step with AIDJ's queue while
 * the phone acts as the remote.
 *
 * AIDJ's queue stays the source of truth — the AI DJ keeps extending it as usual.
 * This hook polls the speaker and:
 *  - follows it: when the speaker moves to another track, AIDJ's current index
 *    moves too (`nextSong` for a normal advance, so AI DJ refills keep firing);
 *  - feeds it: the speaker's upcoming tracks are kept equal to AIDJ's next
 *    LOOKAHEAD songs (append when it runs low, replace when AIDJ's queue changed);
 *  - redirects local play: anything that starts the phone's own decks while a
 *    speaker is active (tapping a song, play on the lock screen) is sent to the
 *    speaker instead.
 *
 * Phase 1 is phone-driven: with the phone asleep the speaker plays out its
 * look-ahead and stops. Server-side picking is Phase 3.
 */

import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { useAudioStore } from '@/lib/stores/audio';
import { useSpeakerOutput, type ActiveSpeaker } from '@/lib/stores/speaker-output';

const POLL_MS = 3000;
/** Tracks queued on the speaker after the current one. */
const LOOKAHEAD = 5;
/** Top up once fewer than this many tracks remain after the current one. */
const MIN_AHEAD = 2;
/**
 * A track change must be seen on this many consecutive polls before AIDJ
 * follows it: right after a skip MA briefly reports the previous track again.
 */
const SETTLE_POLLS = 2;
/**
 * Don't replace upcoming tracks this close to the end of the current one —
 * the receiver has already buffered the next track.
 */
const NO_REPLACE_TAIL_SEC = 15;

type SpeakerAction = 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'seek' | 'volume';

async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  return json as T;
}

// Follow/feed bookkeeping shared by the poll loop and the actions below.
let pendingSongId: string | null = null;
let pendingCount = 0;
let pollInFlight = false;
let feedInFlight = false;
let consecutiveFailures = 0;
let pollNow: (() => void) | null = null;

function resetFollow() {
  pendingSongId = null;
  pendingCount = 0;
}

/**
 * Hand playback to `speaker`, starting from AIDJ's current song.
 * `positionSec` defaults to the phone's current position (mid-song hand-off);
 * pass 0 when starting a different song.
 */
export async function startSpeakerPlayback(speaker: ActiveSpeaker, positionSec?: number): Promise<void> {
  const audio = useAudioStore.getState();
  const index = audio.currentSongIndex;
  const current = audio.playlist[index];
  if (!current) {
    toast.error('Pick something to play first');
    return;
  }
  const songIds = audio.playlist.slice(index, index + 1 + LOOKAHEAD).map((s) => s.id);
  const out = useSpeakerOutput.getState();

  out.setConnecting(true);
  // Silence the phone before the speaker starts so the two never overlap.
  if (audio.isPlaying) {
    audio.markUserPause();
    audio.setIsPlaying(false);
  }
  try {
    await api('/api/speakers/play', {
      playerId: speaker.id,
      songIds,
      positionSec: positionSec ?? audio.currentTime,
    });
    resetFollow();
    out.setActive(speaker);
    toast.success(`Playing on ${speaker.name}`);
  } catch (err) {
    toast.error(`Couldn't play on ${speaker.name}`, {
      description: err instanceof Error ? err.message : undefined,
    });
  } finally {
    out.setConnecting(false);
    pollNow?.();
  }
}

/** Stop the speaker and make the phone the player again. */
export async function stopSpeakerPlayback({ resumeLocally }: { resumeLocally: boolean }): Promise<void> {
  const { active, status, setActive } = useSpeakerOutput.getState();
  if (!active) return;
  setActive(null);
  resetFollow();
  try {
    await api('/api/speakers/control', { playerId: active.id, action: 'stop' });
  } catch (err) {
    console.warn('[Speakers] stop failed:', err);
  }
  if (resumeLocally) {
    const audio = useAudioStore.getState();
    audio.syncIndexToActiveSong(status?.currentSongId);
    audio.setIsPlaying(true);
  }
}

/**
 * Transport control from the phone. next/previous also move AIDJ's queue right
 * away (a user skip, so the AI DJ's skip signals see it), which keeps the phone
 * in step without waiting for the next poll.
 */
export async function controlSpeaker(action: SpeakerAction, value?: number): Promise<void> {
  const { active, status, setStatus } = useSpeakerOutput.getState();
  if (!active) return;
  const audio = useAudioStore.getState();

  if (action === 'next') audio.nextSong(true);
  if (action === 'previous') audio.previousSong();
  if (status && (action === 'play' || action === 'pause')) {
    setStatus({ ...status, state: action === 'play' ? 'playing' : 'paused', receivedAt: Date.now() });
  }
  resetFollow();

  try {
    await api('/api/speakers/control', { playerId: active.id, action, value });
  } catch (err) {
    toast.error(`${active.name}: ${action} failed`, {
      description: err instanceof Error ? err.message : undefined,
    });
  } finally {
    pollNow?.();
  }
}

async function pollSpeaker(): Promise<void> {
  const out = useSpeakerOutput.getState();
  const active = out.active;
  if (!active || out.connecting || pollInFlight) return;
  pollInFlight = true;
  try {
    const s = await api<{
      state: 'playing' | 'paused' | 'idle';
      currentSongId: string | null;
      positionSec: number;
      durationSec: number | null;
      upcomingSongIds: string[];
    }>(`/api/speakers/state?playerId=${encodeURIComponent(active.id)}`);
    // Speaker was switched off or changed while the request was out.
    if (useSpeakerOutput.getState().active?.id !== active.id) return;
    consecutiveFailures = 0;
    out.setStatus({ ...s, receivedAt: Date.now() });
    followSpeaker(s.currentSongId);
    await feedSpeaker(active, s);
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures === 3) {
      toast.error(`Lost contact with ${active.name}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  } finally {
    pollInFlight = false;
  }
}

/** Move AIDJ's current song to whatever the speaker settled on. */
function followSpeaker(speakerSongId: string | null) {
  const audio = useAudioStore.getState();
  const current = audio.playlist[audio.currentSongIndex];
  if (!speakerSongId || speakerSongId === current?.id) {
    resetFollow();
    return;
  }
  if (speakerSongId === pendingSongId) {
    pendingCount++;
  } else {
    pendingSongId = speakerSongId;
    pendingCount = 1;
  }
  if (pendingCount < SETTLE_POLLS) return;
  resetFollow();

  const next = audio.playlist[audio.currentSongIndex + 1];
  if (next?.id === speakerSongId) {
    // Ordinary advance: go through nextSong so AI DJ drip-feed refills fire.
    audio.nextSong(false);
  } else {
    audio.syncIndexToActiveSong(speakerSongId);
  }
}

export type FeedRequest = { songIds: string[]; mode: 'add' | 'replace_next' };

/**
 * Decide how to bring the speaker's upcoming tracks in line with AIDJ's next
 * songs (`desired`). Pure — exported for tests.
 *  - speaker's queue is a prefix of AIDJ's: append once it runs low;
 *  - it diverged (AIDJ queue edited): replace everything after the current
 *    track, unless the current track is nearly over and the receiver has
 *    already buffered the next one;
 *  - otherwise leave it alone.
 */
export function planFeed(
  desired: string[],
  upcoming: string[],
  remainingSec: number,
): FeedRequest | null {
  const matchesSoFar = upcoming.every((id, i) => i >= desired.length || desired[i] === id);
  if (matchesSoFar) {
    if (upcoming.length < MIN_AHEAD && desired.length > upcoming.length) {
      return { songIds: desired.slice(upcoming.length), mode: 'add' };
    }
    return null;
  }
  if (desired.length > 0 && remainingSec > NO_REPLACE_TAIL_SEC) {
    return { songIds: desired, mode: 'replace_next' };
  }
  return null;
}

/** Keep the speaker's upcoming tracks equal to AIDJ's next LOOKAHEAD songs. */
async function feedSpeaker(
  active: ActiveSpeaker,
  s: { currentSongId: string | null; positionSec: number; durationSec: number | null; upcomingSongIds: string[] },
) {
  if (feedInFlight) return;
  const audio = useAudioStore.getState();
  const index = audio.currentSongIndex;
  // Only feed once both sides agree on the current song.
  if (!s.currentSongId || audio.playlist[index]?.id !== s.currentSongId) return;

  const desired = audio.playlist.slice(index + 1, index + 1 + LOOKAHEAD).map((x) => x.id);
  const remainingSec = s.durationSec ? s.durationSec - s.positionSec : Infinity;
  const request = planFeed(desired, s.upcomingSongIds, remainingSec);
  if (!request) return;

  feedInFlight = true;
  try {
    await api('/api/speakers/enqueue', { playerId: active.id, ...request });
  } catch (err) {
    console.warn('[Speakers] enqueue failed:', err);
  } finally {
    feedInFlight = false;
  }
}

/** Mount once (PlayerBar). Runs the poll loop and the local-play redirect. */
export function useSpeakerSync(): void {
  const activeId = useSpeakerOutput((s) => s.active?.id ?? null);

  // Poll while a speaker is active and the page is visible.
  useEffect(() => {
    if (!activeId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void pollSpeaker();
    };
    pollNow = tick;
    tick();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      if (pollNow === tick) pollNow = null;
    };
  }, [activeId]);

  // Anything that starts local playback while a speaker is active goes to the
  // speaker instead. Runs synchronously inside the store update, so the decks
  // never see isPlaying=true.
  useEffect(() => {
    return useAudioStore.subscribe((state, prev) => {
      if (!state.isPlaying || prev.isPlaying) return;
      const { active, connecting, status } = useSpeakerOutput.getState();
      if (!active || connecting) return;
      useAudioStore.setState({ isPlaying: false });
      const song = state.playlist[state.currentSongIndex];
      if (!song) return;
      if (song.id === status?.currentSongId) {
        void controlSpeaker('play');
      } else {
        void startSpeakerPlayback(active, 0);
      }
    });
  }, []);
}
