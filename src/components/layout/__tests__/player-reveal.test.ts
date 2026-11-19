import { describe, it, expect, vi } from 'vitest';
import { createPlayerRevealWatcher } from '../player-reveal';

const state = (isPlaying: boolean, songId: string | null) => ({
  isPlaying,
  playlist: songId ? [{ id: songId }] : [],
  currentSongIndex: songId ? 0 : -1,
});

describe('createPlayerRevealWatcher (#438)', () => {
  it('reveals the bar when the user starts a song', () => {
    const reveal = vi.fn();
    const watch = createPlayerRevealWatcher(reveal);
    watch(state(true, 'a'), state(false, 'a'));
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('does not reveal it for the same song restarting (recovery / the Lab handing the audio back)', () => {
    const reveal = vi.fn();
    const watch = createPlayerRevealWatcher(reveal);
    watch(state(true, 'a'), state(false, 'a')); // a starts
    reveal.mockClear();
    // the old-iPhone loop: true/false every ~1.5 s on the same song
    for (let i = 0; i < 20; i++) {
      watch(state(false, 'a'), state(true, 'a'));
      watch(state(true, 'a'), state(false, 'a'));
    }
    expect(reveal).not.toHaveBeenCalled();
  });

  it('reveals it when a different song starts after a pause', () => {
    const reveal = vi.fn();
    const watch = createPlayerRevealWatcher(reveal);
    watch(state(true, 'a'), state(false, 'a'));
    watch(state(false, 'a'), state(true, 'a'));
    reveal.mockClear();
    watch(state(true, 'b'), state(false, 'a'));
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('an auto-advance while playing is not a start, and later restarts of that song stay quiet', () => {
    const reveal = vi.fn();
    const watch = createPlayerRevealWatcher(reveal);
    watch(state(true, 'a'), state(false, 'a'));
    watch(state(true, 'b'), state(true, 'a')); // a ended, b plays on
    reveal.mockClear();
    watch(state(false, 'b'), state(true, 'b'));
    watch(state(true, 'b'), state(false, 'b'));
    expect(reveal).not.toHaveBeenCalled();
  });
});
