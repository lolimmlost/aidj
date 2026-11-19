// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioStore } from '@/lib/stores/audio';
import { externalAudioOwner, releaseAudio } from '@/lib/utils/audio-owner';
import { __resetAppPlayerWatchForTests, takeAudioFromAppPlayer, watchAppPlayer } from '../app-player';

vi.mock('../log', () => ({ labLog: vi.fn() }));

type Status = 'idle' | 'loading' | 'playing' | 'paused';

function fakeEngine(status: Status = 'playing') {
  const listeners = new Set<() => void>();
  let snap = { status };
  let onBeforePlay: (() => void) | null = null;
  const engine = {
    setOnBeforePlay: vi.fn((fn: () => void) => { onBeforePlay = fn; }),
    getSnapshot: () => snap,
    pause: vi.fn(() => { snap = { status: 'paused' }; }),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    engine,
    beforePlay: () => onBeforePlay?.(),
    setStatus: (s: Status) => {
      snap = { status: s };
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  releaseAudio();
  __resetAppPlayerWatchForTests();
  useAudioStore.setState({ isPlaying: true, _userPauseAt: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('takeAudioFromAppPlayer (#438)', () => {
  it('pauses the app player as a deliberate pause and claims the audio for the Lab', () => {
    const before = Date.now();
    takeAudioFromAppPlayer();
    const s = useAudioStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s._userPauseAt).toBeGreaterThanOrEqual(before);
    expect(externalAudioOwner()).toBe('lab');
  });

  it('silences an <audio> element still sounding while the store already said paused', () => {
    useAudioStore.setState({ isPlaying: false });
    const el = document.createElement('audio');
    Object.defineProperty(el, 'paused', { value: false, configurable: true });
    const pause = vi.spyOn(el, 'pause').mockImplementation(() => {});
    document.body.appendChild(el);
    takeAudioFromAppPlayer();
    expect(pause).toHaveBeenCalled();
  });
});

describe('watchAppPlayer (#438)', () => {
  it("registers the takeover as the Lab's before-play hook", () => {
    const { engine, beforePlay } = fakeEngine();
    watchAppPlayer(engine as never);
    beforePlay();
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(externalAudioOwner()).toBe('lab');
  });

  it('a user play of the app player hands the audio back and pauses the set', () => {
    const { engine, beforePlay } = fakeEngine('playing');
    watchAppPlayer(engine as never);
    beforePlay();
    useAudioStore.getState().setIsPlaying(true);
    expect(externalAudioOwner()).toBeNull();
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it('a play while the set is paused still hands the audio back, without touching the Lab', () => {
    const { engine, beforePlay, setStatus } = fakeEngine('playing');
    watchAppPlayer(engine as never);
    beforePlay();
    setStatus('paused');
    useAudioStore.getState().setIsPlaying(true);
    expect(externalAudioOwner()).toBeNull();
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('a set that ends hands the audio back', () => {
    const { engine, beforePlay, setStatus } = fakeEngine('playing');
    watchAppPlayer(engine as never);
    beforePlay();
    setStatus('paused');
    expect(externalAudioOwner()).toBe('lab'); // a paused set keeps it: the user paused the music
    setStatus('idle');
    expect(externalAudioOwner()).toBeNull();
  });

  it('subscribes once however often the page re-runs the effect', () => {
    const { engine, beforePlay } = fakeEngine('playing');
    watchAppPlayer(engine as never);
    watchAppPlayer(engine as never);
    beforePlay();
    useAudioStore.getState().setIsPlaying(true);
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });
});
