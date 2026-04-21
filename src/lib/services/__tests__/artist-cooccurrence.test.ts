/**
 * Tests for the Artist Co-Occurrence service.
 *
 * Covers the pure helpers (session splitting, pair accumulation,
 * recency-decayed weighting) without touching the DB.
 */

import { describe, it, expect } from 'vitest';
import { splitIntoSessions, accumulatePairs } from '../artist-cooccurrence';

function d(isoMinutesAgo: number, base = new Date('2026-04-01T12:00:00Z')): Date {
  return new Date(base.getTime() - isoMinutesAgo * 60 * 1000);
}

describe('splitIntoSessions', () => {
  it('returns empty array when there are no plays', () => {
    expect(splitIntoSessions([])).toEqual([]);
  });

  it('keeps plays in one session when gaps are under the threshold', () => {
    const plays = [
      { artist: 'a', playedAt: d(20) },
      { artist: 'b', playedAt: d(15) },
      { artist: 'c', playedAt: d(10) },
    ];
    const sessions = splitIntoSessions(plays);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toHaveLength(3);
  });

  it('splits when gap exceeds the threshold (default 30min)', () => {
    const plays = [
      { artist: 'a', playedAt: d(100) },
      { artist: 'b', playedAt: d(95) },
      { artist: 'c', playedAt: d(40) },
      { artist: 'd', playedAt: d(35) },
    ];
    const sessions = splitIntoSessions(plays);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].map((p) => p.artist)).toEqual(['a', 'b']);
    expect(sessions[1].map((p) => p.artist)).toEqual(['c', 'd']);
  });

  it('uses custom gap threshold when provided', () => {
    const plays = [
      { artist: 'a', playedAt: d(20) },
      { artist: 'b', playedAt: d(10) },
    ];
    const tight = splitIntoSessions(plays, 5 * 60 * 1000);
    expect(tight).toHaveLength(2);
  });
});

describe('accumulatePairs', () => {
  it('emits no pairs for a one-artist session', () => {
    const sessions = [
      [
        { artist: 'a', playedAt: d(5) },
        { artist: 'a', playedAt: d(3) },
      ],
    ];
    const pairs = accumulatePairs(sessions);
    expect(pairs.size).toBe(0);
  });

  it('emits one pair per distinct artist pair per session (not per song)', () => {
    const sessions = [
      [
        { artist: 'a', playedAt: d(10) },
        { artist: 'b', playedAt: d(9) },
        { artist: 'a', playedAt: d(8) }, // replay of a — should not inflate
        { artist: 'b', playedAt: d(7) },
      ],
    ];
    const pairs = accumulatePairs(sessions);
    expect(pairs.size).toBe(1);
    const [, acc] = [...pairs.entries()][0];
    expect(acc.coplayCount).toBe(1);
  });

  it('keys pairs with lexicographic ordering (a|b, never b|a)', () => {
    const sessions = [
      [
        { artist: 'zebra', playedAt: d(5) },
        { artist: 'apple', playedAt: d(3) },
      ],
    ];
    const pairs = accumulatePairs(sessions);
    expect([...pairs.keys()]).toEqual(['apple|zebra']);
  });

  it('accumulates weight across sessions and counts coplays', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    const sessions = [
      [
        { artist: 'a', playedAt: d(20) },
        { artist: 'b', playedAt: d(15) },
      ],
      [
        { artist: 'a', playedAt: d(10) },
        { artist: 'b', playedAt: d(5) },
      ],
    ];
    const pairs = accumulatePairs(sessions, now);
    expect(pairs.size).toBe(1);
    const acc = pairs.get('a|b')!;
    expect(acc.coplayCount).toBe(2);
    expect(acc.weight).toBeGreaterThan(1.5); // two near-instant plays → weight close to 2
    expect(acc.weight).toBeLessThanOrEqual(2);
  });

  it('applies recency decay — older co-plays contribute less than fresh ones', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    const staleSession = [
      [
        { artist: 'a', playedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
        { artist: 'b', playedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
      ],
    ];
    const freshSession = [
      [
        { artist: 'a', playedAt: new Date(now.getTime() - 60 * 1000) },
        { artist: 'b', playedAt: new Date(now.getTime() - 60 * 1000) },
      ],
    ];
    const stale = accumulatePairs(staleSession, now).get('a|b')!;
    const fresh = accumulatePairs(freshSession, now).get('a|b')!;
    expect(fresh.weight).toBeGreaterThan(stale.weight);
    expect(stale.weight).toBeLessThan(0.1); // exp(-0.05 * 60) ≈ 0.05
    expect(fresh.weight).toBeGreaterThan(0.99);
  });

  it('emits all pairs for a 3-artist session', () => {
    const sessions = [
      [
        { artist: 'a', playedAt: d(10) },
        { artist: 'b', playedAt: d(8) },
        { artist: 'c', playedAt: d(6) },
      ],
    ];
    const pairs = accumulatePairs(sessions);
    expect(new Set(pairs.keys())).toEqual(new Set(['a|b', 'a|c', 'b|c']));
  });

  it('tracks lastCoplayedAt as the most recent artist appearance in a pair', () => {
    const t0 = new Date('2026-04-01T12:00:00Z');
    const tLate = new Date('2026-04-01T12:20:00Z');
    const sessions = [
      [
        { artist: 'a', playedAt: t0 },
        { artist: 'b', playedAt: tLate },
      ],
    ];
    const acc = accumulatePairs(sessions, tLate).get('a|b')!;
    expect(acc.lastCoplayedAt.getTime()).toBe(tLate.getTime());
  });
});
