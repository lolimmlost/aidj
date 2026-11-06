import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));

import { useAudioStore } from '@/lib/stores/audio';
import { useSpeakerOutput } from '@/lib/stores/speaker-output';
import { redirectLocalPlay, startSpeakerPlayback } from '../useSpeakerSync';

const song = (id: string) => ({ id, name: id, title: id, artist: 'x', album: 'y', duration: 200, url: `/s/${id}` }) as never;
const speaker = { id: 'ma-1', name: 'Living Room' };

let calls: { path: string; body: { songIds?: string[]; action?: string } }[] = [];
let release: (() => void) | null = null;
let unsub: () => void = () => {};

beforeEach(() => {
  calls = [];
  release = null;
  // /api/speakers/play resolves only when the test says so: the hand-off window
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
    const ok = () => ({ ok: true, json: async () => ({}) });
    if (path === '/api/speakers/play' && calls.filter((c) => c.path === path).length === 1) {
      return new Promise((resolve) => { release = () => resolve(ok()); });
    }
    return Promise.resolve(ok());
  }));
  useAudioStore.setState({ playlist: [song('a'), song('b'), song('c')], currentSongIndex: 0, isPlaying: false, currentTime: 0 });
  useSpeakerOutput.setState({ active: null, status: null, connecting: false });
  unsub = useAudioStore.subscribe(redirectLocalPlay);
});
afterEach(() => {
  unsub();
  vi.unstubAllGlobals();
});

describe('local play while a house speaker is the player (#244)', () => {
  it('sends a tapped song to the active speaker instead of the phone', () => {
    useSpeakerOutput.setState({ active: speaker, status: { state: 'playing', currentSongId: 'a', positionSec: 10, durationSec: 200, upcomingSongIds: [], receivedAt: 0 } });
    useAudioStore.setState({ currentSongIndex: 1, isPlaying: true });
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(calls[0]).toMatchObject({ path: '/api/speakers/play', body: { songIds: ['b', 'c'] } });
  });

  it('keeps the phone silent while a hand-off is still starting the speaker', () => {
    useSpeakerOutput.setState({ active: null, connecting: true });
    useAudioStore.setState({ currentSongIndex: 2, isPlaying: true });
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('leaves local play alone with no speaker', () => {
    useAudioStore.setState({ isPlaying: true });
    expect(useAudioStore.getState().isPlaying).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('plays a song picked during the hand-off on the speaker once it lands', async () => {
    const handoff = startSpeakerPlayback(speaker, 0);
    expect(useSpeakerOutput.getState().connecting).toBe(true);
    // Juan, 2026-11-06 18:12:59: a song tapped 3 s into the hand-off
    useAudioStore.setState({ currentSongIndex: 2, isPlaying: true });
    expect(useAudioStore.getState().isPlaying).toBe(false);
    release!();
    await handoff;
    const plays = calls.filter((c) => c.path === '/api/speakers/play').map((c) => c.body.songIds?.[0]);
    expect(plays).toEqual(['a', 'c']);
    expect(useSpeakerOutput.getState()).toMatchObject({ active: speaker, connecting: false });
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });
});
