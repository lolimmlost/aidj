import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({ toast: { info: vi.fn() } }));

import {
  handleAutoplayBlocked,
  isAutoplayBlocked,
  registerAudioUnlocker,
  unlockAudioForGesture,
} from '../audio-unlock';

describe('audio-unlock (#311)', () => {
  it('runs the registered unlocker, and nothing after it unregisters', () => {
    const fn = vi.fn();
    const unregister = registerAudioUnlocker(fn);
    unlockAudioForGesture();
    expect(fn).toHaveBeenCalledTimes(1);

    unregister();
    unlockAudioForGesture();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a stale unregister does not remove a newer unlocker', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAudioUnlocker(first);
    const unregisterSecond = registerAudioUnlocker(second);
    unregisterFirst();
    unlockAudioForGesture();
    expect(second).toHaveBeenCalledTimes(1);
    unregisterSecond();
  });

  it('never throws out of the tap handler', () => {
    const unregister = registerAudioUnlocker(() => { throw new Error('boom'); });
    expect(() => unlockAudioForGesture()).not.toThrow();
    unregister();
  });

  it('recognises only NotAllowedError as an autoplay block', () => {
    expect(isAutoplayBlocked(new DOMException('x', 'NotAllowedError'))).toBe(true);
    expect(isAutoplayBlocked(new DOMException('x', 'AbortError'))).toBe(false);
    expect(isAutoplayBlocked(new Error('play() timeout'))).toBe(false);
    expect(isAutoplayBlocked(null)).toBe(false);
  });

  it('a blocked play stops playback instead of retrying', () => {
    const setIsPlaying = vi.fn();
    handleAutoplayBlocked('test', setIsPlaying);
    expect(setIsPlaying).toHaveBeenCalledWith(false);
  });
});
