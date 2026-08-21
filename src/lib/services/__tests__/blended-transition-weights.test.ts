/**
 * Guards the transition-learning weight rebalance in blended-recommendation-scorer.
 *
 * The whole scoring model assumes SCORE_WEIGHTS sums to 1.0. When the
 * transitionLearning flag is on we carve the transition weight out of dj +
 * temporal; if that ever stops summing to 1.0 the AI DJ silently skews. These
 * tests pin the invariant and the exact split the design doc specifies.
 */

import { describe, it, expect } from 'vitest';
import { SCORE_WEIGHTS, redistributeTransitionWeight } from '../blended-recommendation-scorer';

const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe('redistributeTransitionWeight', () => {
  it('base SCORE_WEIGHTS sum to 1.0 (transition 0 = flag-off no-op)', () => {
    expect(sum(SCORE_WEIGHTS)).toBeCloseTo(1, 6);
    expect(SCORE_WEIGHTS.transition).toBe(0);
  });

  it('keeps the full vector at 1.0 after carving out the transition weight', () => {
    const merged = { ...SCORE_WEIGHTS, ...redistributeTransitionWeight(0.1) };
    expect(sum(merged)).toBeCloseTo(1, 6);
  });

  it('matches the design doc split at w=0.10 (dj 0.20→0.12, temporal 0.05→0.03)', () => {
    const o = redistributeTransitionWeight(0.1);
    expect(o.dj).toBeCloseTo(0.12, 6);
    expect(o.temporal).toBeCloseTo(0.03, 6);
    expect(o.transition).toBeCloseTo(0.1, 6);
  });

  it('only ever draws from dj + temporal, never below zero, even if misconfigured high', () => {
    const o = redistributeTransitionWeight(999);
    expect(sum({ ...SCORE_WEIGHTS, ...o })).toBeCloseTo(1, 6);
    expect(o.dj).toBeGreaterThanOrEqual(0);
    expect(o.temporal).toBeGreaterThanOrEqual(0);
    // untouched signals are left alone
    expect(o.lastFm).toBeUndefined();
    expect(o.compound).toBeUndefined();
  });
});
