/**
 * Tests for the Transition Scoring service.
 *
 * Covers the pure helpers (session splitting, directed adjacency accumulation
 * with source-weighting + recency decay, and edge scoring / backoff) without
 * touching the DB.
 */

import { describe, it, expect } from 'vitest';
import {
  splitIntoSessions,
  accumulateTransitions,
  edgeScore,
  scoreAgainstEdges,
  type PlayRow,
  type TransitionEdge,
  __internal,
} from '../transition-scoring';

const BASE = new Date('2026-08-01T12:00:00Z');

/** minutes-ago timestamp relative to BASE */
function t(minutesAgo: number): Date {
  return new Date(BASE.getTime() - minutesAgo * 60 * 1000);
}

/** build a PlayRow with sensible defaults (organic, completed) */
function play(over: Partial<PlayRow> & { artist: string; playedAt: Date }): PlayRow {
  return {
    songId: 's',
    genre: '',
    completed: true,
    skipped: false,
    isRecommender: false,
    ...over,
  };
}

function edge(over: Partial<TransitionEdge> & { fromKey: string; toKey: string }): TransitionEdge {
  return {
    granularity: 'artist',
    totalCount: 5,
    posWeight: 0,
    negWeight: 0,
    lastObserved: BASE,
    ...over,
  };
}

describe('splitIntoSessions', () => {
  it('returns empty for no plays', () => {
    expect(splitIntoSessions([])).toEqual([]);
  });

  it('keeps sub-threshold gaps in one session and preserves extra fields', () => {
    const plays = [
      play({ artist: 'a', genre: 'rock', playedAt: t(20) }),
      play({ artist: 'b', genre: 'pop', playedAt: t(15) }),
    ];
    const sessions = splitIntoSessions(plays);
    expect(sessions).toHaveLength(1);
    // generic split preserves genre (unlike the artist-cooccurrence version)
    expect(sessions[0][0].genre).toBe('rock');
  });

  it('splits on a gap over 30 minutes', () => {
    const plays = [
      play({ artist: 'a', playedAt: t(100) }),
      play({ artist: 'b', playedAt: t(95) }),
      play({ artist: 'c', playedAt: t(40) }), // 55min gap from b
      play({ artist: 'd', playedAt: t(38) }),
    ];
    const sessions = splitIntoSessions(plays);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].map((p) => p.artist)).toEqual(['a', 'b']);
    expect(sessions[1].map((p) => p.artist)).toEqual(['c', 'd']);
  });
});

describe('accumulateTransitions — adjacency & direction', () => {
  it('emits consecutive ordered pairs, not all-pairs', () => {
    const sessions = [[
      play({ artist: 'a', playedAt: t(30) }),
      play({ artist: 'b', playedAt: t(25) }),
      play({ artist: 'c', playedAt: t(20) }),
    ]];
    const edges = accumulateTransitions(sessions, { now: BASE });
    const artistEdges = [...edges.values()].filter((e) => e.granularity === 'artist');
    const pairs = artistEdges.map((e) => `${e.fromKey}->${e.toKey}`).sort();
    // a->b and b->c only; NOT a->c (that's co-occurrence, not a transition)
    expect(pairs).toEqual(['a->b', 'b->c']);
  });

  it('is directed: a->b and b->a are distinct edges', () => {
    const sessions = [[
      play({ artist: 'a', playedAt: t(30) }),
      play({ artist: 'b', playedAt: t(25) }),
      play({ artist: 'a', playedAt: t(20) }),
    ]];
    const edges = accumulateTransitions(sessions, { now: BASE });
    const keys = [...edges.values()].filter((e) => e.granularity === 'artist').map((e) => `${e.fromKey}->${e.toKey}`);
    expect(keys).toContain('a->b');
    expect(keys).toContain('b->a');
  });

  it('skips self-loops per granularity', () => {
    const sessions = [[
      play({ artist: 'a', genre: 'rock', playedAt: t(30) }),
      play({ artist: 'a', genre: 'rock', playedAt: t(25) }), // same artist AND genre
    ]];
    const edges = accumulateTransitions(sessions, { now: BASE });
    expect(edges.size).toBe(0);
  });

  it('records a genre edge even when the artist edge is a self-loop', () => {
    const sessions = [[
      play({ artist: 'a', genre: 'rock', playedAt: t(30) }),
      play({ artist: 'a', genre: 'pop', playedAt: t(25) }), // same artist, different genre
    ]];
    const edges = accumulateTransitions(sessions, { now: BASE });
    const grans = [...edges.values()].map((e) => e.granularity);
    expect(grans).toEqual(['genre']);
    expect([...edges.values()][0]).toMatchObject({ fromKey: 'rock', toKey: 'pop' });
  });

  it('ignores empty genre keys (e.g. scrobble rows)', () => {
    const sessions = [[
      play({ artist: 'a', genre: '', playedAt: t(30) }),
      play({ artist: 'b', genre: '', playedAt: t(25) }),
    ]];
    const edges = accumulateTransitions(sessions, { now: BASE });
    // artist edge only; no genre edge from empty keys
    expect([...edges.values()].map((e) => e.granularity)).toEqual(['artist']);
  });
});

describe('accumulateTransitions — positive/negative & source weighting', () => {
  it('routes a skipped destination to negWeight, source-agnostic', () => {
    const sessions = [[
      play({ artist: 'a', playedAt: t(10) }),
      play({ artist: 'b', playedAt: t(9), completed: false, skipped: true, isRecommender: true }),
    ]];
    const e = [...accumulateTransitions(sessions, { now: BASE }).values()][0];
    expect(e.negWeight).toBeGreaterThan(0);
    expect(e.posWeight).toBe(0);
    expect(e.totalCount).toBe(1);
  });

  it('discounts recommender-chosen positives vs organic', () => {
    const organic = [...accumulateTransitions([[
      play({ artist: 'a', playedAt: BASE }),
      play({ artist: 'b', playedAt: BASE, isRecommender: false }),
    ]], { now: BASE }).values()][0];
    const recommender = [...accumulateTransitions([[
      play({ artist: 'a', playedAt: BASE }),
      play({ artist: 'b', playedAt: BASE, isRecommender: true }),
    ]], { now: BASE }).values()][0];

    expect(organic.posWeight).toBeCloseTo(__internal.ORGANIC_POS_WEIGHT, 5);
    expect(recommender.posWeight).toBeCloseTo(__internal.RECOMMENDER_POS_WEIGHT, 5);
    expect(recommender.posWeight).toBeLessThan(organic.posWeight);
  });

  it('applies recency decay: older destinations weigh less', () => {
    const recent = [...accumulateTransitions([[
      play({ artist: 'a', playedAt: BASE }),
      play({ artist: 'b', playedAt: BASE }),
    ]], { now: BASE, halfLifeDays: 120 }).values()][0];
    // B played ~1 half-life (120 days) before now → ~half the weight
    const old = [...accumulateTransitions([[
      play({ artist: 'a', playedAt: new Date(BASE.getTime() - 120 * 24 * 3600 * 1000) }),
      play({ artist: 'b', playedAt: new Date(BASE.getTime() - 120 * 24 * 3600 * 1000) }),
    ]], { now: BASE, halfLifeDays: 120 }).values()][0];

    expect(old.posWeight).toBeCloseTo(recent.posWeight * 0.5, 2);
  });

  it('accumulates repeated observations into totalCount', () => {
    const sessions = [
      [play({ artist: 'a', playedAt: t(30) }), play({ artist: 'b', playedAt: t(29) })],
      [play({ artist: 'a', playedAt: t(10) }), play({ artist: 'b', playedAt: t(9) })],
    ];
    const e = [...accumulateTransitions(sessions, { now: BASE }).values()].find((x) => x.granularity === 'artist')!;
    expect(e.totalCount).toBe(2);
  });
});

describe('edgeScore', () => {
  it('is neutral 0.5 at zero mass', () => {
    expect(edgeScore({ posWeight: 0, negWeight: 0 })).toBeCloseTo(0.5, 6);
  });
  it('is > 0.5 when positive dominates, < 0.5 when negative dominates', () => {
    expect(edgeScore({ posWeight: 10, negWeight: 0 })).toBeGreaterThan(0.5);
    expect(edgeScore({ posWeight: 0, negWeight: 10 })).toBeLessThan(0.5);
  });
  it('stays within [0,1]', () => {
    expect(edgeScore({ posWeight: 1e6, negWeight: 0 })).toBeLessThanOrEqual(1);
    expect(edgeScore({ posWeight: 0, negWeight: 1e6 })).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreAgainstEdges — gate & backoff', () => {
  const candidates = [
    { id: 'c1', artist: 'Beta', genre: 'Pop' },
    { id: 'c2', artist: 'Gamma', genre: 'Jazz' },
  ];

  it('scores via artist edge when support gate is met', () => {
    const edges = [edge({ granularity: 'artist', fromKey: 'alpha', toKey: 'beta', totalCount: 5, posWeight: 8 })];
    const scores = scoreAgainstEdges('alpha', 'rock', candidates, edges, 3);
    expect(scores.get('c1')!).toBeGreaterThan(0.5); // beta had a strong positive edge
    expect(scores.get('c2')!).toBe(0.5);            // gamma: no edge → neutral
  });

  it('ignores an artist edge below min support and falls back to genre', () => {
    const edges = [
      edge({ granularity: 'artist', fromKey: 'alpha', toKey: 'beta', totalCount: 2, posWeight: 8 }), // below gate
      edge({ granularity: 'genre', fromKey: 'rock', toKey: 'pop', totalCount: 9, posWeight: 9 }),   // used
    ];
    const scores = scoreAgainstEdges('alpha', 'rock', candidates, edges, 3);
    // c1 (Pop) should score via the genre edge, not the sub-threshold artist edge
    expect(scores.get('c1')!).toBeGreaterThan(0.5);
  });

  it('returns neutral when nothing meets the gate', () => {
    const edges = [edge({ granularity: 'artist', fromKey: 'alpha', toKey: 'beta', totalCount: 1, posWeight: 8 })];
    const scores = scoreAgainstEdges('alpha', 'rock', candidates, edges, 3);
    expect(scores.get('c1')!).toBe(0.5);
    expect(scores.get('c2')!).toBe(0.5);
  });

  it('normalizes candidate keys (case/spacing) to match stored edges', () => {
    const edges = [edge({ granularity: 'artist', fromKey: 'alpha', toKey: 'beta', totalCount: 5, posWeight: 8 })];
    const scores = scoreAgainstEdges('alpha', 'rock', [{ id: 'c1', artist: '  BETA ', genre: 'Pop' }], edges, 3);
    expect(scores.get('c1')!).toBeGreaterThan(0.5);
  });

  it('prefers artist edge over genre edge when both qualify', () => {
    const edges = [
      edge({ granularity: 'artist', fromKey: 'alpha', toKey: 'beta', totalCount: 5, posWeight: 0, negWeight: 8 }), // negative
      edge({ granularity: 'genre', fromKey: 'rock', toKey: 'pop', totalCount: 9, posWeight: 9, negWeight: 0 }),   // positive
    ];
    const scores = scoreAgainstEdges('alpha', 'rock', candidates, edges, 3);
    // c1 matches both; artist (negative) wins → below neutral
    expect(scores.get('c1')!).toBeLessThan(0.5);
  });
});
