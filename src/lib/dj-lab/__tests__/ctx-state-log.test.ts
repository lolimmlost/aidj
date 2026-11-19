import { describe, it, expect } from 'vitest';
import { CtxStateLog } from '../ctx-state-log';

describe('CtxStateLog (#438)', () => {
  it('logs the first event and every change', () => {
    const log = new CtxStateLog();
    expect(log.next('suspended|paused', 0)).toBe(0);
    expect(log.next('running|playing', 10)).toBe(0);
    expect(log.next('suspended|playing', 20)).toBe(0);
  });

  it('folds the same state repeating and reports the count with the next logged event', () => {
    const log = new CtxStateLog(30_000);
    expect(log.next('suspended|paused', 0)).toBe(0);
    // the old-iPhone flood: ~14 identical events a second
    for (let t = 70; t < 29_000; t += 70) expect(log.next('suspended|paused', t)).toBeNull();
    const folded = Math.floor((29_000 - 70) / 70) + 1;
    expect(log.next('running|paused', 29_500)).toBe(folded);
  });

  it('logs an unchanged state again once the window has passed', () => {
    const log = new CtxStateLog(30_000);
    log.next('suspended|paused', 0);
    expect(log.next('suspended|paused', 1_000)).toBeNull();
    expect(log.next('suspended|paused', 30_000)).toBe(1);
  });

  it('a status change under the same state is a change', () => {
    const log = new CtxStateLog();
    log.next('suspended|paused', 0);
    expect(log.next('suspended|playing', 5)).toBe(0);
  });
});
