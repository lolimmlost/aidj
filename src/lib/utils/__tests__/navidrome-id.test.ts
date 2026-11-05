import { describe, expect, it } from 'vitest';
import { canonicalNavidromeId, canonicalizeIdParams } from '../navidrome-id';

// Pairs read off a real library before and after the 0.63.2 → 0.64.2 upgrade (2026-11-05)
const PAIRS: [string, string][] = [
  ['Ld68uROqjc2Cjj8mahjvGG', '5Yjtp9r5wAmh3EMg4PP8eh'], // a song (James Hype – Confession)
  ['nJ8RdgWBwcjCSRftJ0vBMg', '4dvmasUmxxRMo19zUgh70T'], // a published mix
  ['IP2SRc6iE3CxNt53a6bcWy', '0s40puERvydX4C27t0FUvq'], // a playlist
];

describe('canonicalNavidromeId', () => {
  it('maps a pre-0.64 id to the id Navidrome migrated it to', () => {
    for (const [oldId, newId] of PAIRS) expect(canonicalNavidromeId(oldId)).toBe(newId);
  });

  it('leaves canonical ids, and an id run through twice, unchanged', () => {
    for (const [, newId] of PAIRS) expect(canonicalNavidromeId(newId)).toBe(newId);
    expect(canonicalNavidromeId('04c5BoXJQ1NBSu2ERWKxXo')).toBe('04c5BoXJQ1NBSu2ERWKxXo');
  });

  it('leaves anything that is not a 22-char base62 id alone', () => {
    for (const v of ['', 'abc', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'Ld68uROqjc2Cjj8mahjvG-', 'Ld68uROqjc2Cjj8mahjvGGG']) {
      expect(canonicalNavidromeId(v)).toBe(v);
    }
    expect(canonicalNavidromeId(null)).toBeNull();
    expect(canonicalNavidromeId(undefined)).toBeUndefined();
  });
});

describe('canonicalizeIdParams', () => {
  it('rewrites id params, repeated ones too, and nothing else', () => {
    const p = new URLSearchParams('id=Ld68uROqjc2Cjj8mahjvGG&songIdToAdd=Ld68uROqjc2Cjj8mahjvGG&songIdToAdd=nJ8RdgWBwcjCSRftJ0vBMg&playlistId=IP2SRc6iE3CxNt53a6bcWy&query=Ld68uROqjc2Cjj8mahjvGG&size=20');
    canonicalizeIdParams(p);
    expect(p.get('id')).toBe('5Yjtp9r5wAmh3EMg4PP8eh');
    expect(p.getAll('songIdToAdd')).toEqual(['5Yjtp9r5wAmh3EMg4PP8eh', '4dvmasUmxxRMo19zUgh70T']);
    expect(p.get('playlistId')).toBe('0s40puERvydX4C27t0FUvq');
    expect(p.get('query')).toBe('Ld68uROqjc2Cjj8mahjvGG');
    expect(p.get('size')).toBe('20');
  });
});
