import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/stores/audio', () => ({
  useAudioStore: { subscribe: vi.fn(() => () => {}), getState: vi.fn(() => ({})) },
}));
vi.mock('@/lib/services/navidrome', () => ({ scrobbleSong: vi.fn(async () => {}) }));

import { useCrossfade } from '../useCrossfade';
import { withActiveDeckGain } from '../deckGainBackstop';
import type { Song } from '../useDualDeckAudio';

// Minimal HTMLAudioElement stand-in: just what useCrossfade touches.
function fakeDeck(label: string) {
  const listeners: Record<string, Set<() => void>> = {};
  let rejectPlay: ((e: Error) => void) | null = null;
  const deck = {
    label,
    src: '',
    currentTime: 0,
    duration: 200,
    paused: true,
    ended: false,
    readyState: 0,
    networkState: 1,
    playbackRate: 1,
    load: vi.fn(),
    pause: vi.fn(() => { deck.paused = true; }),
    play: vi.fn(() => new Promise<void>((resolve, reject) => {
      deck.paused = false;
      rejectPlay = reject;
      resolve();
    })),
    removeAttribute: vi.fn((name: string) => { if (name === 'src') deck.src = ''; }),
    addEventListener: vi.fn((ev: string, fn: () => void) => { (listeners[ev] ??= new Set()).add(fn); }),
    removeEventListener: vi.fn((ev: string, fn: () => void) => { listeners[ev]?.delete(fn); }),
    fire: (ev: string) => { listeners[ev]?.forEach((fn) => fn()); },
    rejectPlay: (e: Error) => rejectPlay?.(e),
  };
  return deck;
}

const nextSong = { id: 'next', url: 'http://x/next', title: 'Next', artist: 'A' } as unknown as Song;

function setup() {
  const deckA = fakeDeck('A');
  const deckB = fakeDeck('B');
  deckA.src = 'http://x/current';
  deckA.paused = false;
  deckA.currentTime = 195;
  const activeDeckRef = { current: 'A' as 'A' | 'B' };
  const crossfadeInProgressRef = { current: false };
  const crossfadeAbortedAtRef = { current: 0 };
  const gains: Record<'A' | 'B', number> = { A: 1, B: 0 };
  const scheduleGainRamp = vi.fn((d: 'A' | 'B', target: number) => { gains[d] = target; });
  const cancelGainRamp = vi.fn();
  const setGainImmediate = vi.fn((d: 'A' | 'B', v: number) => { gains[d] = v; });
  const onCrossfadeComplete = vi.fn();
  const onCrossfadeAbort = vi.fn();
  const setActiveDeck = vi.fn((d: 'A' | 'B') => { activeDeckRef.current = d; return true; });
  const getDeck = (l: 'A' | 'B') => (l === 'A' ? deckA : deckB) as unknown as HTMLAudioElement;

  const { result } = renderHook(() => useCrossfade({
    getActiveDeck: () => getDeck(activeDeckRef.current),
    getInactiveDeck: () => getDeck(activeDeckRef.current === 'A' ? 'B' : 'A'),
    activeDeckRef,
    crossfadeInProgressRef,
    crossfadeAbortedAtRef,
    scheduleGainRamp,
    cancelGainRamp,
    setGainImmediate,
    getGainValue: (d) => gains[d],
    resumeContext: vi.fn(async () => true),
    onCrossfadeComplete,
    onCrossfadeAbort,
    setActiveDeck,
  }));

  /** Start a 10s crossfade and get the incoming deck playing (warmup begins). */
  const startAndPlay = async () => {
    act(() => result.current.startCrossfade(nextSong, 10));
    deckB.readyState = 4;
    await act(async () => { deckB.fire('canplaythrough'); await Promise.resolve(); });
  };

  return {
    deckA, deckB, gains, result, activeDeckRef, crossfadeInProgressRef,
    scheduleGainRamp, cancelGainRamp, setGainImmediate, onCrossfadeComplete, onCrossfadeAbort, setActiveDeck,
    startAndPlay,
  };
}

describe('useCrossfade — song change mid-crossfade (#296)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('cancel mid-ramp: cancels both ramps, restores gains, stops the incoming deck, leaves the queue alone', async () => {
    const t = setup();
    await t.startAndPlay();
    act(() => { vi.advanceTimersByTime(1000); }); // warmup → ramps scheduled
    expect(t.scheduleGainRamp).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(3000); }); // mid-ramp

    let cancelled = false;
    act(() => { cancelled = t.result.current.cancelCrossfade('song changed'); });

    expect(cancelled).toBe(true);
    expect(t.cancelGainRamp).toHaveBeenCalledWith('A');
    expect(t.cancelGainRamp).toHaveBeenCalledWith('B');
    expect(t.gains).toEqual({ A: 1, B: 0 });
    expect(t.deckB.pause).toHaveBeenCalled();
    expect(t.deckB.removeAttribute).toHaveBeenCalledWith('src');
    expect(t.crossfadeInProgressRef.current).toBe(false);
    expect(t.onCrossfadeAbort).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(30_000); }); // completion/safety timers must not resurrect it
    expect(t.onCrossfadeComplete).not.toHaveBeenCalled();
    expect(t.gains).toEqual({ A: 1, B: 0 });
    // Idempotent: nothing left to cancel
    expect(t.result.current.cancelCrossfade('again')).toBe(false);
  });

  it('cancel during the warmup: ramps are never scheduled and gains are restored', async () => {
    const t = setup();
    await t.startAndPlay();
    act(() => { vi.advanceTimersByTime(400); }); // inside the 1000ms warmup
    act(() => { t.result.current.cancelCrossfade('song changed'); });
    act(() => { vi.advanceTimersByTime(30_000); });

    expect(t.scheduleGainRamp).not.toHaveBeenCalled();
    expect(t.gains).toEqual({ A: 1, B: 0 });
    expect(t.deckB.pause).toHaveBeenCalled();
    expect(t.onCrossfadeAbort).not.toHaveBeenCalled();
    expect(t.onCrossfadeComplete).not.toHaveBeenCalled();
  });

  it('a soft reset during warmup (flag flipped without an abort) still stops the incoming deck', async () => {
    // The pre-fix song-change path: resetCrossfadeState() only flips the flag.
    // Before #296 the warmup timer just returned, leaving deck B playing at gain 0.
    const t = setup();
    await t.startAndPlay();
    t.crossfadeInProgressRef.current = false;
    act(() => { vi.advanceTimersByTime(1000); });

    expect(t.scheduleGainRamp).not.toHaveBeenCalled();
    expect(t.deckB.pause).toHaveBeenCalled();
    expect(t.gains).toEqual({ A: 1, B: 0 });
    expect(t.onCrossfadeAbort).not.toHaveBeenCalled();
  });

  it('a play() rejection caused by the cancel does not abort a second time', async () => {
    const t = setup();
    act(() => t.result.current.startCrossfade(nextSong, 10));
    // play() pending: cancel before it settles, then it rejects (AbortError)
    t.deckB.play.mockImplementationOnce(() => new Promise<void>((_, reject) => { setTimeout(() => reject(new Error('AbortError')), 50); }));
    t.deckB.readyState = 4;
    act(() => { t.deckB.fire('canplaythrough'); });
    act(() => { t.result.current.cancelCrossfade('song changed'); });
    const pausesAfterCancel = t.deckB.pause.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(100); await Promise.resolve(); });

    expect(t.deckB.pause.mock.calls.length).toBe(pausesAfterCancel);
    expect(t.onCrossfadeAbort).not.toHaveBeenCalled();
  });

  it('normal completion is unaffected and leaves nothing to cancel', async () => {
    const t = setup();
    await t.startAndPlay();
    act(() => { vi.advanceTimersByTime(1000); }); // ramps
    t.deckB.currentTime = 9;
    act(() => { vi.advanceTimersByTime(10_150); }); // ramp duration + 150ms

    expect(t.onCrossfadeComplete).toHaveBeenCalledWith(nextSong);
    expect(t.setActiveDeck).toHaveBeenCalledWith('B', 'crossfade-complete', { bypassCooldown: true });
    expect(t.gains).toEqual({ A: 0, B: 1 });
    expect(t.crossfadeInProgressRef.current).toBe(false);
    // The index change that follows completion must not trigger an abort.
    expect(t.result.current.cancelCrossfade('song changed')).toBe(false);
    expect(t.deckB.pause).not.toHaveBeenCalled();
  });
});

describe('withActiveDeckGain — muted-deck backstop (#296)', () => {
  it('makes a deck promoted outside a crossfade audible and silences the other', () => {
    const setActiveDeck = vi.fn(() => true);
    const setGain = vi.fn();
    const wrapped = withActiveDeckGain(setActiveDeck, setGain, { current: false });
    expect(wrapped('B', 'desync: deck B playing at 4.3s', { cooldownMs: 2000 })).toBe(true);
    expect(setActiveDeck).toHaveBeenCalledWith('B', 'desync: deck B playing at 4.3s', { cooldownMs: 2000 });
    expect(setGain).toHaveBeenCalledWith('B', 1);
    expect(setGain).toHaveBeenCalledWith('A', 0);
  });

  it('leaves gains to the ramps during a crossfade', () => {
    const setGain = vi.fn();
    const wrapped = withActiveDeckGain(vi.fn(() => true), setGain, { current: true });
    wrapped('B', 'crossfade-complete', { bypassCooldown: true });
    expect(setGain).not.toHaveBeenCalled();
  });

  it('does nothing when the switch was refused (cooldown / already active)', () => {
    const setGain = vi.fn();
    const wrapped = withActiveDeckGain(vi.fn(() => false), setGain, { current: false });
    expect(wrapped('A', 'desync')).toBe(false);
    expect(setGain).not.toHaveBeenCalled();
  });
});
