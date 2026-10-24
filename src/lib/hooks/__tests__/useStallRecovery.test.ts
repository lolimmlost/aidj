// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { useStallRecovery } from '../useStallRecovery';
import { useAudioStore } from '@/lib/stores/audio';

/** Minimal stand-in for a deck: records src writes and lets the test drive play(). */
function fakeDeck(play: () => Promise<void>) {
  const listeners: Record<string, Array<() => void>> = {};
  const srcWrites: string[] = [];
  let src = 'https://music.example/stream/song-1';
  const deck = {
    currentTime: 42,
    paused: true,
    play: vi.fn(play),
    pause: vi.fn(),
    load: vi.fn(() => {
      // A reload reports readiness asynchronously, like the real element.
      setTimeout(() => listeners.canplay?.forEach((fn) => fn()), 0);
    }),
    addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    get src() { return src; },
    set src(v: string) { srcWrites.push(v); src = v; },
  };
  return { deck: deck as unknown as HTMLAudioElement, srcWrites, raw: deck };
}

function setup(deck: HTMLAudioElement) {
  const onMaxAttemptsReached = vi.fn();
  const { result } = renderHook(() => useStallRecovery({
    getActiveDeck: () => deck,
    crossfadeInProgressRef: { current: false },
    onMaxAttemptsReached,
    resumeContext: async () => true,
  }));
  return { result, onMaxAttemptsReached };
}

const notAllowed = () => Promise.reject(new DOMException('not allowed', 'NotAllowedError'));

describe('useStallRecovery (#311)', () => {
  beforeEach(() => {
    useAudioStore.setState({ isPlaying: true });
  });

  it('treats NotAllowedError as "needs a tap", not a stall: pauses and spends no attempt', async () => {
    const { deck } = fakeDeck(notAllowed);
    const { result, onMaxAttemptsReached } = setup(deck);

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.attemptStallRecovery(deck, 'watchdog-desync'); });
    expect(ok).toBe(false);

    expect(result.current.recoveryAttemptRef.current).toBe(0);
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(onMaxAttemptsReached).not.toHaveBeenCalled();
  });

  it('never escalates to a reload or skip while play() is blocked', async () => {
    const { deck, raw } = fakeDeck(notAllowed);
    const { result, onMaxAttemptsReached } = setup(deck);

    await act(async () => {
      for (let i = 0; i < 5; i++) await result.current.attemptStallRecovery(deck, 'watchdog');
    });

    expect(raw.load).not.toHaveBeenCalled();
    expect(onMaxAttemptsReached).not.toHaveBeenCalled();
  });

  it('still counts ordinary failures as attempts', async () => {
    const { deck } = fakeDeck(() => Promise.reject(new Error('play() timeout')));
    const { result } = setup(deck);

    await result.current.attemptStallRecovery(deck, 'watchdog');

    expect(result.current.recoveryAttemptRef.current).toBe(1);
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it('attempt 3 reloads without clearing src (clearing fires the loader\'s "unavailable" error)', async () => {
    const { deck, srcWrites, raw } = fakeDeck(() => Promise.resolve());
    const { result } = setup(deck);
    result.current.recoveryAttemptRef.current = 2;

    await expect(result.current.attemptStallRecovery(deck, 'watchdog')).resolves.toBe(true);

    expect(srcWrites).not.toContain('');
    expect(raw.load).toHaveBeenCalled();
    expect(deck.currentTime).toBe(37); // seeked back 5s from 42
  });
});

describe('useStallRecovery escalation (#297)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAudioStore.setState({ isPlaying: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A deck whose play() resolves and reports playing, like iOS does even with nothing buffered. */
  function playingDeck(at: number) {
    const fake = fakeDeck(() => {
      fake.raw.paused = false;
      return Promise.resolve();
    });
    fake.raw.currentTime = at;
    fake.raw.paused = false;
    Object.assign(fake.raw, { buffered: { length: 0, end: () => 0 }, duration: 240 });
    return fake;
  }

  async function recover(result: ReturnType<typeof setup>['result'], deck: HTMLAudioElement) {
    let ok: boolean | undefined;
    await act(async () => {
      const p = result.current.attemptStallRecovery(deck, 'watchdog');
      await vi.advanceTimersByTimeAsync(0); // let attempt 3's reload report canplay
      ok = await p;
    });
    return ok;
  }

  it('watchdog: a clock frozen at 0.0s escalates to the reload instead of looping on attempt 1', async () => {
    // The prod log: play() "succeeds" every cycle, the clock never moves, and
    // the old not-paused check reset the count before attempt 3 could run.
    const { deck, raw } = playingDeck(0);
    const { onMaxAttemptsReached } = setup(deck);

    // Stalls are detected at ~6s, ~12s, ~18s (5s threshold, 2s ticks).
    await act(async () => { await vi.advanceTimersByTimeAsync(12_500); });
    expect(raw.play).toHaveBeenCalledTimes(2);
    expect(raw.load).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(raw.load).toHaveBeenCalledTimes(1);
    expect(onMaxAttemptsReached).not.toHaveBeenCalled();
  });

  it('a seek-back that replays buffered audio up to the same edge does not count as recovered', async () => {
    const { deck, raw } = playingDeck(42);
    const { result } = setup(deck);

    await recover(result, deck); // attempt 1: play() at 42, clock frozen
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await recover(result, deck); // attempt 2: seek back to 39
    expect(deck.currentTime).toBe(39);

    raw.currentTime = 42; // plays the buffered 3s, then stalls at the same edge
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recoveryAttemptRef.current).toBe(2);
  });

  it('resets once playback gets past the stall point', async () => {
    const { deck, raw } = playingDeck(42);
    const { result } = setup(deck);

    await recover(result, deck);
    raw.currentTime = 44;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(result.current.recoveryAttemptRef.current).toBe(0);
  });

  it('the watchdog resets the count as soon as playback passes the stall, before the 5s check', async () => {
    const { deck, raw } = playingDeck(42);
    const { result } = setup(deck);

    await recover(result, deck);
    raw.currentTime = 43.5;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // one watchdog tick

    expect(result.current.recoveryAttemptRef.current).toBe(0);
  });

  it('with the page hidden (watchdog paused), the 5s check still resets once past the stall', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const { deck, raw } = playingDeck(42);
      const { result } = setup(deck);

      await recover(result, deck);
      raw.currentTime = 44;
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(result.current.recoveryAttemptRef.current).toBe(1); // watchdog skipped while hidden

      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(result.current.recoveryAttemptRef.current).toBe(0);
    } finally {
      visibility.mockRestore();
    }
  });
});
