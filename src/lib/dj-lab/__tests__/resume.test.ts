import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announceTakeOver,
  clearResumePoint,
  loadResumePoint,
  resumeSnapshot,
  nextSongLabel,
  onTakeOver,
  parseSongLabel,
  RESUME_MAX_AGE_MS,
  saveResumePoint,
  subscribeResume,
} from '../resume';

describe('resume point (#439)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T03:47:40Z'));
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('keeps what the lost page was playing, without the clean flag, until it goes stale', () => {
    const changed = vi.fn();
    const off = subscribeResume(changed);
    saveResumePoint({ sid: 'n2t1sn', t: 1, status: 'paused', song: 'A – One', songId: 'a1', pos: 134, clean: true }, 'died');
    expect(changed).toHaveBeenCalledTimes(1);
    const p = loadResumePoint();
    expect(p).toMatchObject({ reason: 'died', sid: 'n2t1sn', song: 'A – One', songId: 'a1', pos: 134 });
    expect(p).not.toHaveProperty('clean');
    expect(loadResumePoint(Date.now() + RESUME_MAX_AGE_MS + 1)).toBeNull();
    clearResumePoint();
    expect(loadResumePoint()).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
    off();
  });

  it('hands useSyncExternalStore the same object until the offer changes', () => {
    saveResumePoint({ sid: 'n2t1sn', t: 1, status: 'paused', song: 'A – One' }, 'died');
    const first = resumeSnapshot();
    expect(first).toMatchObject({ song: 'A – One' });
    expect(resumeSnapshot()).toBe(first);
    clearResumePoint();
    expect(resumeSnapshot()).toBeNull();
  });

  it('has nothing to offer for a heartbeat without a song', () => {
    saveResumePoint({ sid: 'x', t: 1, status: 'loading' }, 'died');
    expect(loadResumePoint()).toBeNull();
  });
});

describe('song labels', () => {
  it('splits "Artist – Title" at the first dash', () => {
    expect(parseSongLabel('Fito Olivares – Juana la cubana')).toEqual({ artist: 'Fito Olivares', title: 'Juana la cubana' });
    expect(parseSongLabel('Untitled')).toEqual({ artist: '', title: 'Untitled' });
    expect(parseSongLabel(undefined)).toBeNull();
  });

  it("drops the heartbeat's state from the next song, and a failed lock altogether", () => {
    expect(nextSongLabel('locked Fito Olivares – Juana la cubana')).toBe('Fito Olivares – Juana la cubana');
    expect(nextSongLabel('mixing A – B')).toBe('A – B');
    expect(nextSongLabel('failed A – B')).toBeUndefined();
    expect(nextSongLabel(undefined)).toBeUndefined();
  });
});

describe('one set across windows', () => {
  const tick = () => new Promise((r) => setTimeout(r, 30));

  it('tells other windows to stop, and hears other windows but not itself', async () => {
    const peer = new BroadcastChannel('aidj:dj-lab');
    const heard: unknown[] = [];
    peer.onmessage = (e) => heard.push(e.data);
    const stop = vi.fn();
    const off = onTakeOver('me', stop);
    try {
      announceTakeOver('me');
      await tick();
      expect(heard).toEqual([{ type: 'take-over', from: 'me' }]);
      peer.postMessage({ type: 'take-over', from: 'me' }); // an echo of this window
      await tick();
      expect(stop).not.toHaveBeenCalled();
      peer.postMessage({ type: 'take-over', from: 'other' });
      await tick();
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      off();
      peer.close();
    }
  });
});
