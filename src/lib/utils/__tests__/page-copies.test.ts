import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPageCopies, type CopiesChannel, type CopyLog } from '../page-copies';

/** One BroadcastChannel name shared by several pages: a post reaches every other page's channel. */
function channelHub() {
  const pages: Array<{ fns: Set<(e: MessageEvent) => void> }> = [];
  return () => {
    const me = { fns: new Set<(e: MessageEvent) => void>() };
    pages.push(me);
    const ch: CopiesChannel = {
      postMessage: (msg) => {
        for (const p of pages) if (p !== me) for (const fn of p.fns) fn({ data: msg } as MessageEvent);
      },
      addEventListener: (_t, fn) => me.fns.add(fn),
      removeEventListener: (_t, fn) => me.fns.delete(fn),
    };
    return ch;
  };
}

describe('watchPageCopies (#446)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a new page learns about the hidden copy, and the hidden copy logs that a new one opened', () => {
    const open = channelHub();
    const oldLog = vi.fn<CopyLog>();
    const newLog = vi.fn<CopyLog>();
    // the copy left behind, playing in the background (#443)
    watchPageCopies({
      id: 'orphan',
      channel: open(),
      log: oldLog,
      describe: () => ({ path: '/playlists/x', visibility: 'hidden', playing: true, sounding: true, song: 'FEZZO – Young Folks' }),
    });
    vi.advanceTimersByTime(60 * 60_000);
    // the copy a cold start opens
    watchPageCopies({ id: 'fresh', channel: open(), log: newLog, describe: () => ({ path: '/dashboard', visibility: 'visible', playing: false }) });

    expect(oldLog).toHaveBeenCalledWith(
      'another copy opened',
      expect.objectContaining({ other: 'fresh', otherPath: '/dashboard', otherVisibility: 'visible', playing: true, ageSec: 3600 }),
      'warn',
    );
    // the answers are collected, then logged once
    expect(newLog).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(newLog).toHaveBeenCalledTimes(1);
    expect(newLog).toHaveBeenCalledWith(
      'other copies open',
      { count: 1, copies: [expect.objectContaining({ id: 'orphan', path: '/playlists/x', visibility: 'hidden', sounding: true, song: 'FEZZO – Young Folks', ageSec: 3600 })] },
      'warn',
    );
  });

  it('logs nothing when it is the only copy', () => {
    const open = channelHub();
    const log = vi.fn<CopyLog>();
    watchPageCopies({ id: 'only', channel: open(), log, describe: () => ({}) });
    vi.advanceTimersByTime(10_000);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs an answer that comes after the wait (a copy that was suspended) on its own', () => {
    const open = channelHub();
    const log = vi.fn<CopyLog>();
    watchPageCopies({ id: 'fresh', channel: open(), log, describe: () => ({}) });
    vi.advanceTimersByTime(1500);
    const late = open();
    late.postMessage({ type: 'here', from: 'sleeper', info: { path: '/dj/lab', visibility: 'hidden' } });
    expect(log).toHaveBeenCalledWith('other copy answered late', { id: 'sleeper', path: '/dj/lab', visibility: 'hidden' }, 'warn');
  });

  it('a copy hears only the answers to its own hello, not the ones meant for a third copy', () => {
    const open = channelHub();
    const aLog = vi.fn<CopyLog>();
    const bLog = vi.fn<CopyLog>();
    const cLog = vi.fn<CopyLog>();
    watchPageCopies({ id: 'a', channel: open(), log: aLog, describe: () => ({ path: '/dashboard' }) });
    vi.advanceTimersByTime(1500);
    watchPageCopies({ id: 'b', channel: open(), log: bLog, describe: () => ({ path: '/library' }) });
    vi.advanceTimersByTime(1500);
    aLog.mockClear();
    bLog.mockClear();
    // a third copy opens: a and b both answer it on the one channel, so each hears the other's answer
    watchPageCopies({ id: 'c', channel: open(), log: cLog, describe: () => ({ path: '/dj/lab' }) });
    vi.advanceTimersByTime(1500);
    expect(aLog.mock.calls.map(([ev]) => ev)).toEqual(['another copy opened']);
    expect(bLog.mock.calls.map(([ev]) => ev)).toEqual(['another copy opened']);
    expect(cLog).toHaveBeenCalledWith(
      'other copies open',
      { count: 2, copies: [expect.objectContaining({ id: 'a', path: '/dashboard' }), expect.objectContaining({ id: 'b', path: '/library' })] },
      'warn',
    );
  });

  it('ignores its own messages and anything that is not a copy message', () => {
    const open = channelHub();
    const log = vi.fn<CopyLog>();
    watchPageCopies({ id: 'me', channel: open(), log, describe: () => ({}) });
    const other = open();
    other.postMessage({ type: 'hello', from: 'me' });
    other.postMessage({ type: 'take-over', from: 'x' });
    other.postMessage(null);
    vi.advanceTimersByTime(1500);
    expect(log).not.toHaveBeenCalled();
  });

  it('stops answering once stopped', () => {
    const open = channelHub();
    const log = vi.fn<CopyLog>();
    const stop = watchPageCopies({ id: 'old', channel: open(), log, describe: () => ({}) });
    stop();
    watchPageCopies({ id: 'new', channel: open(), log: vi.fn(), describe: () => ({}) });
    expect(log).not.toHaveBeenCalled();
  });

  it('does nothing where there is no BroadcastChannel', () => {
    const log = vi.fn<CopyLog>();
    const stop = watchPageCopies({ id: 'x', channel: null, log, describe: () => ({}) });
    vi.advanceTimersByTime(5000);
    stop();
    expect(log).not.toHaveBeenCalled();
  });
});
