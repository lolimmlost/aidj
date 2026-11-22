import { describe, it, expect } from 'vitest';
import { CtxStateLog } from '../ctx-state-log';

describe('CtxStateLog (#438)', () => {
  it('logs the first event and every change', () => {
    const log = new CtxStateLog();
    expect(log.next('suspended|paused', 0)).toEqual({ folded: 0 });
    expect(log.next('running|playing', 10)).toEqual({ folded: 0 });
    expect(log.next('suspended|playing', 20)).toEqual({ folded: 0 });
  });

  it('folds the same state repeating, and the next logged event says how many and of what', () => {
    const log = new CtxStateLog(30_000);
    expect(log.next('suspended|paused', 0)).toEqual({ folded: 0 });
    // the old-iPhone flood: ~14 identical events a second
    for (let t = 70; t < 29_000; t += 70) expect(log.next('suspended|paused', t)).toBeNull();
    const folded = Math.floor((29_000 - 70) / 70) + 1;
    // logged on the "running" line, but they were repeats of "suspended"
    expect(log.next('running|paused', 29_500)).toEqual({ folded, of: 'suspended|paused' });
  });

  it('logs an unchanged state again once the window has passed', () => {
    const log = new CtxStateLog(30_000);
    log.next('suspended|paused', 0);
    expect(log.next('suspended|paused', 1_000)).toBeNull();
    expect(log.next('suspended|paused', 30_000)).toEqual({ folded: 1, of: 'suspended|paused' });
  });

  it('a status change under the same state is a change', () => {
    const log = new CtxStateLog();
    log.next('suspended|paused', 0);
    expect(log.next('suspended|playing', 5)).toEqual({ folded: 0 });
  });
});
