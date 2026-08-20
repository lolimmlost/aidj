/**
 * Tests for the YouTube per-song fallback (issue #145) pure helpers:
 * query normalization, the yt-dlp search URL, and download verification.
 * No network / MeTube interaction is exercised here.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSearchQuery,
  buildYouTubeSearchUrl,
  verifyDownload,
  itemLikelyMatchesTrack,
  libraryMatch,
} from '../youtube-fallback';

describe('normalizeSearchQuery', () => {
  it('uses the primary artist and drops collaborators', () => {
    const q = normalizeSearchQuery({ artist: 'Flume;SOPHIE;Eprom', title: 'Spring' });
    expect(q).toBe('Flume Spring');
  });

  it('strips feat./with qualifiers from the title', () => {
    const q = normalizeSearchQuery({ artist: 'matt proxy', title: '5 (with fakemink)' });
    expect(q).toBe('matt proxy 5');
  });

  it('strips remaster tags', () => {
    const q = normalizeSearchQuery({ artist: 'Some Artist', title: 'A Song (2011 Remaster)' });
    expect(q).toBe('Some Artist A Song');
  });

  it('collapses whitespace and trims', () => {
    const q = normalizeSearchQuery({ artist: '  Sun Room ', title: '  Insincere  ' });
    expect(q).toBe('Sun Room Insincere');
  });
});

describe('buildYouTubeSearchUrl', () => {
  it('produces a yt-dlp ytsearch1 pseudo-URL', () => {
    expect(buildYouTubeSearchUrl('Sun Room Insincere')).toBe('ytsearch1:Sun Room Insincere');
  });
});

describe('verifyDownload', () => {
  const track = { artist: 'Sun Room', title: 'Insincere' };

  it('accepts a clean official-video match', () => {
    const v = verifyDownload(track, { title: 'Sun Room - Insincere (Official Video)' });
    expect(v.matched).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(0.6);
  });

  it('accepts a title-only match when artist is present elsewhere', () => {
    const v = verifyDownload(track, { title: 'Insincere by Sun Room' });
    expect(v.matched).toBe(true);
  });

  it('rejects an unrelated video', () => {
    const v = verifyDownload(track, { title: 'Top 50 Summer House Mix 2024' });
    expect(v.matched).toBe(false);
  });

  it('flags a wrong-title result from the same artist', () => {
    const v = verifyDownload(track, { title: 'Sun Room - Cadillac (Live)' });
    expect(v.matched).toBe(false);
  });

  it('falls back to filename when title is missing', () => {
    const v = verifyDownload(track, { filename: 'Sun Room - Insincere.mp3' });
    expect(v.matched).toBe(true);
  });

  it('returns unmatched with no result title', () => {
    const v = verifyDownload(track, {});
    expect(v.matched).toBe(false);
    expect(v.score).toBe(0);
  });
});

describe('itemLikelyMatchesTrack (detection)', () => {
  // Real cases that the strict id-based detection got wrong: MeTube's resolved
  // title differs from the request but is clearly the same track.
  it('matches a multi-artist request against MeTube’s resolved title', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Wax Motif;Taiki Nulight;Scrufizzer', title: 'Skank N Flex (with Scrufizzer)' },
        { title: 'Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer' }
      )
    ).toBe(true);
  });

  it('matches "Got Bounce" by primary artist + title tokens', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Kumarion;STUCA', title: 'Got Bounce' },
        { title: 'Kumarion & STUCA - Got Bounce' }
      )
    ).toBe(true);
  });

  it('does not match an unrelated download in a large history', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Kumarion', title: 'Got Bounce' },
        { title: 'Some Other Artist - A Totally Different Song' }
      )
    ).toBe(false);
  });

  it('falls back to filename', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Sun Room', title: 'Insincere' },
        { filename: 'Sun Room - Insincere [Official Audio].mp3' }
      )
    ).toBe(true);
  });

  it('returns false with no title or filename', () => {
    expect(itemLikelyMatchesTrack({ artist: 'A', title: 'B' }, {})).toBe(false);
  });
});

describe('libraryMatch (dedup guard vs Navidrome songs)', () => {
  it('matches a CLEANLY-stored track (artist in a separate field)', () => {
    // The bug case: Navidrome title="Calling You", artist="Valexus" (not in title).
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'Calling You', artist: 'Valexus' })
    ).toBe(true);
    expect(
      libraryMatch({ artist: 'Valexus;Beehav3', title: 'Calling You' }, { title: 'Calling You', artist: 'Valexus & Beehav3' })
    ).toBe(true);
  });

  it('matches a JUNK-titled copy (whole video title in the title field)', () => {
    expect(
      libraryMatch(
        { artist: 'Wax Motif;Taiki Nulight;Scrufizzer', title: 'Skank N Flex (with Scrufizzer)' },
        { title: 'Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer', artist: 'Wax Motif' }
      )
    ).toBe(true);
  });

  it('does NOT match a same-title track by a different artist', () => {
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'Calling for You', artist: 'Drake' })
    ).toBe(false);
  });

  it('does NOT match an unrelated song', () => {
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'When Did Your Heart Go Missing?', artist: 'Rooney' })
    ).toBe(false);
  });
});
