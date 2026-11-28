// @vitest-environment jsdom
/**
 * #444: the silent keep-alive oscillator ran for the life of the page, so iOS never suspended a
 * paused, hidden copy of the app. It now runs only while the player plays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudioStore } from '@/lib/stores/audio';
import { releaseAudio } from '@/lib/utils/audio-owner';
import { KEEP_ALIVE_GRACE_MS, useWebAudioGraph } from '../useWebAudioGraph';

const param = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];

class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  addEventListener() {}
  removeEventListener() {}
  createGain() { return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }; }
  createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn() }; }
  createOscillator() {
    const osc = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    oscillators.push(osc);
    return osc;
  }
}

const deck = () => ({ src: '', paused: true, currentTime: 0, volume: 1, playbackRate: 1 }) as unknown as HTMLAudioElement;

function setup() {
  const { result } = renderHook(() => useWebAudioGraph());
  act(() => { result.current.initializeGraph(deck(), deck()); });
  return result;
}

const running = () => oscillators.filter((o) => o.start.mock.calls.length > 0 && o.stop.mock.calls.length === 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  oscillators.length = 0;
  releaseAudio();
  useAudioStore.setState({ isPlaying: true, _userPauseAt: 0, _lastAudioContextInterrupt: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('keep-alive oscillator (#444)', () => {
  it('starts once with the graph while playing', () => {
    setup();
    expect(oscillators).toHaveLength(1);
    expect(running()).toHaveLength(1);
  });

  it('stops after the grace period once the player is paused', () => {
    setup();
    act(() => useAudioStore.setState({ isPlaying: false }));
    act(() => { vi.advanceTimersByTime(KEEP_ALIVE_GRACE_MS - 1000); });
    expect(running()).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(running()).toHaveLength(0);
  });

  it('keeps running through a brief pause', () => {
    setup();
    act(() => useAudioStore.setState({ isPlaying: false }));
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => useAudioStore.setState({ isPlaying: true }));
    act(() => { vi.advanceTimersByTime(KEEP_ALIVE_GRACE_MS * 2); });
    expect(oscillators).toHaveLength(1);
    expect(running()).toHaveLength(1);
  });

  it('starts a fresh one when playback resumes after it stopped', () => {
    setup();
    act(() => useAudioStore.setState({ isPlaying: false }));
    act(() => { vi.advanceTimersByTime(KEEP_ALIVE_GRACE_MS); });
    expect(running()).toHaveLength(0);
    act(() => useAudioStore.setState({ isPlaying: true }));
    expect(oscillators).toHaveLength(2);
    expect(running()).toHaveLength(1);
  });

  it('a graph set up while paused stops its keep-alive after the grace period', () => {
    useAudioStore.setState({ isPlaying: false });
    setup();
    expect(running()).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(KEEP_ALIVE_GRACE_MS); });
    expect(running()).toHaveLength(0);
  });
});
