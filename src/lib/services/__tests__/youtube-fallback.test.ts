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
