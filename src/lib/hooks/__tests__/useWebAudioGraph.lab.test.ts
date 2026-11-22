// @vitest-environment jsdom
/**
 * #438: the app player's own AudioContext recovery kept resuming its context and
 * restarting the player while the Transition Lab owned the audio, a tug-of-war on iOS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudioStore } from '@/lib/stores/audio';
import { claimAudio, releaseAudio } from '@/lib/utils/audio-owner';
import { useWebAudioGraph } from '../useWebAudioGraph';

const param = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  private listeners = new Set<() => void>();
  addEventListener(type: string, fn: () => void) { if (type === 'statechange') this.listeners.add(fn); }
  removeEventListener(_type: string, fn: () => void) { this.listeners.delete(fn); }
  emit(state: string) { this.state = state; this.listeners.forEach((fn) => fn()); }
  createGain() { return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }; }
  createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 1024, connect: vi.fn(), disconnect: vi.fn(), getByteFrequencyData: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn() }; }
  createOscillator() { return { connect: vi.fn(), start: vi.fn() }; }
}

function deck(paused: boolean) {
  return {
    src: 'https://music.example/api/navidrome/stream/song-1',
    paused,
    currentTime: 42,
    volume: 1,
    playbackRate: 1,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  } as unknown as HTMLAudioElement;
}

function setup(deckAPaused: boolean) {
  const { result } = renderHook(() => useWebAudioGraph());
  const a = deck(deckAPaused);
  act(() => { result.current.initializeGraph(a, deck(true)); });
  const ctx = result.current.audioContextRef.current as unknown as FakeAudioContext;
  return { ctx, a };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  releaseAudio();
  useAudioStore.setState({ isPlaying: true, _userPauseAt: 0, _lastAudioContextInterrupt: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  releaseAudio();
});

describe('useWebAudioGraph and the Lab (#438)', () => {
  it('control: an interrupt keeps retrying resume, and running again restarts the player', async () => {
    const { ctx } = setup(false);
    act(() => ctx.emit('interrupted'));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    useAudioStore.setState({ isPlaying: false }); // an unmarked pause, like the Lab's old one
    act(() => ctx.emit('running'));
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it('while the Lab owns the audio: no resume retries, no health-check resume, no restart', async () => {
    const { ctx } = setup(false);
    act(() => claimAudio('lab'));
    act(() => ctx.emit('interrupted'));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); // past a 2 s retry and the 5 s health check
    expect(ctx.resume).not.toHaveBeenCalled();
    useAudioStore.setState({ isPlaying: false });
    act(() => ctx.emit('running')); // iOS resumed it on its own
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });

  it('coming back to the page does not resume the context while the Lab owns the audio', async () => {
    const { ctx } = setup(true);
    act(() => claimAudio('lab'));
    ctx.state = 'suspended';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
