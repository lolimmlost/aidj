// @vitest-environment jsdom
/**
 * #438: on an old iPhone the app player and the Transition Lab kept taking the audio
 * from each other, flipping isPlaying every ~1.5 s for minutes. These reproduce the
 * player's half of that loop with a bare pause (what the Lab used to send), and show
 * that the Lab's takeover (a deliberate pause + audio ownership) ends it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudioStore } from '@/lib/stores/audio';
import { claimAudio, releaseAudio } from '@/lib/utils/audio-owner';
import { takeAudioFromAppPlayer } from '@/lib/dj-lab/app-player';
import { usePlaybackStateSync } from '../usePlaybackStateSync';

vi.mock('@/lib/dj-lab/log', () => ({ labLog: vi.fn() }));

function fakeDeck(paused: boolean) {
  const deck = {
    src: 'https://music.example/api/navidrome/stream/song-1',
    paused,
    currentTime: 42,
    readyState: 4,
    networkState: 1, // IDLE
    duration: 240,
    ended: false,
    buffered: { length: 1, end: () => 200 },
    play: vi.fn(async () => { deck.paused = false; }),
    pause: vi.fn(() => { deck.paused = true; }),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return deck;
}

function mount(deck: ReturnType<typeof fakeDeck>) {
  const idle = fakeDeck(true);
  idle.src = '';
  idle.currentTime = 0;
  const refs = {
    deckARef: { current: deck as unknown as HTMLAudioElement },
    deckBRef: { current: idle as unknown as HTMLAudioElement },
    activeDeckRef: { current: 'A' as 'A' | 'B' },
    lastProgressTimeRef: { current: Date.now() },
    lastProgressValueRef: { current: 42 },
    currentSongIdRef: { current: 'song-1' as string | null },
  };
  const getActiveDeck = () => deck as unknown as HTMLAudioElement;
  const checkAndResumeAudioContext = async () => true;
  const attemptStallRecovery = async () => true;
  const setActiveDeck = () => true;
  renderHook(() => {
    const isPlaying = useAudioStore((s) => s.isPlaying);
    usePlaybackStateSync({ ...refs, isPlaying, getActiveDeck, checkAndResumeAudioContext, attemptStallRecovery, setActiveDeck });
  });
  deck.play.mockClear();
  deck.pause.mockClear();
  return refs;
}

const isPlaying = () => useAudioStore.getState().isPlaying;
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  releaseAudio();
  useAudioStore.setState({ isPlaying: true, _userPauseAt: 0, _lastAudioContextInterrupt: 0, wasPlayingBeforeUnload: false });
});

afterEach(() => {
  vi.useRealTimers();
  releaseAudio();
});

describe('the loop, before the fix: a bare pause gets undone', () => {
  it('flips straight back to playing while the deck still sounds', () => {
    const deck = fakeDeck(false);
    mount(deck);
    act(() => useAudioStore.getState().setIsPlaying(false)); // the Lab's old onBeforePlay
    expect(isPlaying()).toBe(true); // "Store says pause but audio is playing — syncing store"
  });

  it('auto-resumes an interrupted deck every ~1.5 s, cycle after cycle', async () => {
    const deck = fakeDeck(true); // iOS paused it when the Lab took the audio session
    mount(deck);
    for (let cycle = 1; cycle <= 3; cycle++) {
      deck.paused = true;
      act(() => useAudioStore.getState().setIsPlaying(false));
      expect(isPlaying()).toBe(false);
      await flush(1600);
      expect(isPlaying()).toBe(true); // "External audio session interruption — attempting auto-resume"
    }
    expect(deck.play.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the fix: the Lab takes the audio and the player stands down (#438)', () => {
  it('a deck still sounding is paused, and the store stays paused', async () => {
    const deck = fakeDeck(false);
    mount(deck);
    act(() => takeAudioFromAppPlayer());
    expect(isPlaying()).toBe(false);
    expect(deck.pause).toHaveBeenCalled();
    await flush(20_000);
    expect(isPlaying()).toBe(false);
    expect(deck.play).not.toHaveBeenCalled();
  });

  it('an interrupted deck is not auto-resumed', async () => {
    const deck = fakeDeck(true);
    mount(deck);
    act(() => takeAudioFromAppPlayer());
    await flush(20_000);
    expect(isPlaying()).toBe(false);
    expect(deck.play).not.toHaveBeenCalled();
  });

  it('owning the audio is enough: an unmarked pause long after the takeover is not second-guessed', async () => {
    const deck = fakeDeck(true);
    mount(deck);
    act(() => claimAudio('lab')); // no user-pause marker, so only the ownership guard holds
    act(() => useAudioStore.getState().setIsPlaying(false));
    await flush(20_000);
    expect(isPlaying()).toBe(false);
    expect(deck.play).not.toHaveBeenCalled();
  });

  it('coming back to the page does not restart the player while the Lab owns the audio', async () => {
    const deck = fakeDeck(false);
    mount(deck);
    act(() => claimAudio('lab'));
    deck.paused = true; // iOS paused the deck; the store still says playing
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(500);
    expect(deck.play).not.toHaveBeenCalled();
  });

  it('control: without the Lab, coming back still resumes a paused deck the store says is playing', async () => {
    const deck = fakeDeck(false);
    mount(deck);
    deck.paused = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(500);
    expect(deck.play).toHaveBeenCalled();
  });
});
