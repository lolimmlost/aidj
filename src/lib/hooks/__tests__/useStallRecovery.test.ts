// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
