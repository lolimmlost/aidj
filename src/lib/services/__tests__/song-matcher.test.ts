/**
 * Tests for the matcher's YouTube-rip title normalization (#131): a library track
 * stored under its full video title (e.g. "Cloonee & Prospa - Good Girl (ft…)")
 * must still match the requested title ("Good Girl") instead of being declared
 * no_match and needlessly re-downloaded.
 */

import { describe, it, expect } from 'vitest';
import { stripLeadingArtistPrefix, calculateMatchScore } from '../song-matcher';
import type { ExportableSong } from '../playlist-export';
import type { PlatformSearchResult } from '../song-matcher';

describe('stripLeadingArtistPrefix', () => {
  it('strips a leading artist prefix that overlaps the artist', () => {
    expect(
      stripLeadingArtistPrefix('Cloonee & Prospa - Good Girl (ft. Tristan Henry)', 'Cloonee')
    ).toBe('Good Girl (ft. Tristan Henry)');
  });

  it('strips when the prefix contains any artist token', () => {
    expect(stripLeadingArtistPrefix('zvle - 1MY', 'zvle')).toBe('1MY');
  });

  it('leaves a genuine "A - B" title alone when the prefix is unrelated to the artist', () => {
    // "Home" is the artist; the title legitimately contains a dash.
    expect(stripLeadingArtistPrefix('Resonance - Part II', 'Home')).toBe('Resonance - Part II');
  });

  it('returns the title unchanged when there is no dash', () => {
    expect(stripLeadingArtistPrefix('Good Girl', 'Cloonee')).toBe('Good Girl');
  });
});

describe('calculateMatchScore with polluted candidate titles', () => {
  const source: ExportableSong = { title: 'Good Girl', artist: 'Cloonee', platform: 'spotify' };
  const cand = (title: string): PlatformSearchResult => ({
    platform: 'navidrome',
    platformId: 'abc',
    title,
    artist: 'Cloonee',
  });

  it('matches a junk YouTube-rip title to the clean requested title', () => {
    const clean = calculateMatchScore(source, cand('Good Girl'));
    const junk = calculateMatchScore(source, cand('Cloonee & Prospa - Good Girl (ft. Tristan Henry)'));
    // The stripped comparison should recover most of the title score.
    expect(junk.score).toBeGreaterThan(70);
    // And be in the same ballpark as the already-clean candidate.
    expect(clean.score - junk.score).toBeLessThan(15);
  });

  it('keeps feat/version info distinct for normal titles (no artist prefix)', () => {
    // A remix request should NOT be blurred into the original just because both
    // share a base title — the feat-leniency only applies to rip-style prefixes.
    const remixReq: ExportableSong = { title: 'Surround Sound (KAYTRANADA Remix)', artist: 'JID', platform: 'spotify' };
    const remixCand: PlatformSearchResult = { platform: 'navidrome', platformId: 'r', title: 'Surround Sound (KAYTRANADA Remix)', artist: 'JID' };
    const origCand: PlatformSearchResult = { platform: 'navidrome', platformId: 'o', title: 'Surround Sound (feat. 21 Savage & Baby Tate)', artist: 'JID' };
    const remixScore = calculateMatchScore(remixReq, remixCand).score;
    const origScore = calculateMatchScore(remixReq, origCand).score;
    // The exact remix must score higher than the (feat-only) original.
    expect(remixScore).toBeGreaterThan(origScore);
  });
});
