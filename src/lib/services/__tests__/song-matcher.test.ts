/**
 * Tests for the matcher's YouTube-rip title normalization (#131): a library track
 * stored under its full video title (e.g. "Cloonee & Prospa - Good Girl (ft…)")
 * must still match the requested title ("Good Girl") instead of being declared
 * no_match and needlessly re-downloaded.
 */

import { describe, it, expect } from 'vitest';
import {
  stripLeadingArtistPrefix,
  calculateMatchScore,
  parseTitle,
  artistMatchSimilarity,
} from '../song-matcher';
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

// Real pending_review cases from a 4,350-song Spotify import (2026-11-16).
// Spotify lists featured artists in the title and every performer in the
// artist field; the library usually has the plain title + album artist.
describe('feat credits and artist lists', () => {
  const src = (title: string, artist: string, album?: string): ExportableSong => ({ title, artist, album, platform: 'spotify' });
  const cand = (title: string, artist: string, album?: string): PlatformSearchResult => ({ platform: 'navidrome', platformId: title, title, artist, album });
  const score = (s: ExportableSong, c: PlatformSearchResult) => calculateMatchScore(s, c);

  it('parses feat, remix and remaster segments', () => {
    expect(parseTitle("She's My Collar (feat. Kali Uchis)")).toEqual({ base: 'she s my collar', version: '' });
    expect(parseTitle('X (with 2 Chainz & Saudi)')).toEqual({ base: 'x', version: '' });
    expect(parseTitle('After Life - Oliverse Remix')).toEqual({ base: 'after life', version: 'oliverse remix' });
    expect(parseTitle('After Life (Oliverse remix)')).toEqual({ base: 'after life', version: 'oliverse remix' });
    expect(parseTitle("I'll Be Missing You (feat. Faith Evans & 112) - 2014 Remaster")).toEqual({ base: 'i ll be missing you', version: '' });
    expect(parseTitle('Toasty Nutty Bass - Radio Edit')).toEqual({ base: 'toasty nutty bass', version: '' });
    // A genuine "A - B" title / non-version parenthetical stays in the base
    expect(parseTitle('Resonance - Part II').base).toBe('resonance part ii');
    expect(parseTitle('Leisure Wear (Sit & Laugh)').base).toBe('leisure wear sit laugh');
  });

  it('treats a credit list as matching any subset of it', () => {
    expect(artistMatchSimilarity('Gorillaz;Kali Uchis', 'Gorillaz')).toBe(1);
    expect(artistMatchSimilarity('DJ Jazzy Jeff;Jazzyfatnastees;The Roots', 'The Roots')).toBe(1);
    expect(artistMatchSimilarity('ScHoolboy Q;2 Chainz;Saudi', 'ScHoolboy Q, 2 Chainz, Saudi')).toBe(1);
    expect(artistMatchSimilarity('Gorillaz', 'Radiohead')).toBeLessThan(0.5);
  });

  it.each([
    [src("She's My Collar (feat. Kali Uchis)", 'Gorillaz;Kali Uchis'), cand("She's My Collar", 'Gorillaz')],
    [src('The Next Movement', 'DJ Jazzy Jeff;Jazzyfatnastees;The Roots'), cand('The Next Movement', 'The Roots')],
    [src('After Life - Oliverse Remix', 'Tchami;Stacey Barthe;Oliverse'), cand('After Life (Oliverse remix)', 'Tchami')],
    [src('Wild Wild West (feat. Gunna)', 'Offset;Gunna'), cand('Wild Wild West', 'Offset')],
    [src('X (with 2 Chainz & Saudi)', 'ScHoolboy Q;2 Chainz;Saudi'), cand('X', 'ScHoolboy Q, 2 Chainz, Saudi')],
  ])('auto-matches %# (feat / credit-list only difference)', (s, c) => {
    expect(['high', 'exact']).toContain(score(s, c).confidence);
  });

  it('prefers the original over a remix when the original was requested', () => {
    const req = src('Turn off the Lights (feat. Alexis Roberts)', 'Chris Lake;Alexis Roberts');
    const orig = score(req, cand('Turn off the Lights', 'Chris Lake'));
    const remix = score(req, cand('Turn off the Lights (Cages remix)', 'Chris Lake'));
    expect(['high', 'exact']).toContain(orig.confidence);
    expect(orig.score).toBeGreaterThan(remix.score);
    expect(['high', 'exact']).not.toContain(remix.confidence);
  });

  it.each([
    // [requested, library candidate] — real false positives seen when album + duration matched
    [src('Morena', 'Tornillo', 'Morena'), cand('Morena', 'Panache Savage & X-Tayler', 'Morena')],
    [src('Smile', 'sophie meiers;Ben Beal', 'Smile'), cand('Smile', 'nohidea.', 'Smile')],
    [src('Mona June (feat. Angela Hunte)', 'Slightly Stoopid;Angela'), cand('Mona Lisa', 'Slightly Stoopid')],
    [src('E. Coli (feat. Earl Sweatshirt)', 'The Alchemist;Earl Sweatshirt'), cand('E Coli (instrumental)', 'The Alchemist')],
    [src('Extraterrestrial', 'TYNAN;Kompany'), cand('Extraterrestrial (VIP)', 'TYNAN')],
  ])('never auto-matches a different artist, title or version %#', (s, c) => {
    // Matching album + duration as in the real data; a single's "album" is just its title.
    const album = s.album ?? 'Same Album';
    const r = score({ ...s, album, duration: 200 }, { ...c, album: c.album ?? album, duration: 201 });
    expect(['high', 'exact']).not.toContain(r.confidence);
  });

  it.each([
    [src('Ms. Fat Booty', 'Mos Def', 'Black on Both Sides'), cand('Ms. Fat Booty', 'Yasiin Bey', 'Black on Both Sides')],
    [src('Castles Made of Sand', 'Jimi Hendrix', 'Axis: Bold as Love'), cand('Castles Made of Sand', 'The Jimi Hendrix Experience', 'Axis: Bold As Love')],
  ])('accepts an artist alias when album and duration both match %#', (s, c) => {
    expect(['high', 'exact']).toContain(score({ ...s, duration: 300 }, { ...c, duration: 301 }).confidence);
  });

  it.each([
    ['Everlong - Acoustic Version', 'Everlong (acoustic)'],
    ['Cream On Chrome - Single Edit', 'Cream on Chrome'],
    ['Early In The Morning - 12" Version', 'Early in the Morning'],
    ['2am', '2 AM'],
    ['UFO', 'U.F.O.'],
  ])('treats %s and %s as the same recording', (a, b) => {
    expect(['high', 'exact']).toContain(score(src(a, 'Artist'), cand(b, 'Artist')).confidence);
  });

  it('does not auto-match a different song by a featured artist', () => {
    const req = src('Wild Wild West (feat. Gunna)', 'Offset;Gunna');
    expect(['high', 'exact']).not.toContain(score(req, cand('Pushin P', 'Gunna')).confidence);
  });
});
