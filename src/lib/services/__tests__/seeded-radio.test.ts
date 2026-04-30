/**
 * Tests for the Seeded Radio service.
 *
 * Covers the pure helpers directly (dedupe, artist-diversity, recency cap,
 * variety blend math) and each seed kind via mocked Navidrome + scorer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Song } from '@/lib/types/song';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test.
// ---------------------------------------------------------------------------

// Chainable + thenable mock. `.where()` returns a thenable that also exposes
// `.groupBy()`, `.orderBy()`, and `.limit()` so any of these chains resolve
// to `[]`:
//   await db.select().from().where()
//   await db.select().from().where().groupBy()
//   await db.select().from().where().orderBy().limit()
type QueryChain = Promise<never[]> & {
  groupBy: () => QueryChain;
  orderBy: () => QueryChain;
  limit: () => QueryChain;
};

function thenableChain(): QueryChain {
  const p = Promise.resolve([] as never[]);
  const chain = Object.assign(p, {
    groupBy: () => thenableChain(),
    orderBy: () => thenableChain(),
    limit: () => thenableChain(),
  }) as QueryChain;
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => thenableChain()),
  },
}));

vi.mock('@/lib/services/navidrome', () => ({
  getPlaylist: vi.fn(),
  getSongs: vi.fn(),
  getSongsByArtist: vi.fn(),
  getSongsByIds: vi.fn(),
  getStarredSongs: vi.fn().mockResolvedValue([]),
  searchArtistsByName: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/services/navidrome-users', () => ({
  getNavidromeUserCreds: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/blended-recommendation-scorer', () => ({
  getBlendedRecommendations: vi.fn().mockResolvedValue({ songs: [], metadata: {} }),
}));

vi.mock('@/lib/services/artist-cooccurrence', () => ({
  getRelatedArtists: vi.fn().mockResolvedValue([]),
}));

import { generateSeededRadio, __internal } from '../seeded-radio';
import {
  getPlaylist,
  getSongs,
  getSongsByArtist,
  getSongsByIds,
  searchArtistsByName,
} from '@/lib/services/navidrome';
import { getBlendedRecommendations } from '@/lib/services/blended-recommendation-scorer';
import { getRelatedArtists } from '@/lib/services/artist-cooccurrence';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSong(overrides: Partial<Song> & { id: string; artist: string; title: string }): Song {
  return {
    id: overrides.id,
    name: overrides.title,
    title: overrides.title,
    artist: overrides.artist,
    albumId: overrides.albumId ?? 'album-1',
    duration: overrides.duration ?? 180,
    track: overrides.track ?? 1,
    url: `/api/navidrome/stream/${overrides.id}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('seeded-radio helpers', () => {
  describe('dedupe', () => {
    it('drops duplicates by id', () => {
      const songs = [
        makeSong({ id: 'a', artist: 'X', title: 'T1' }),
        makeSong({ id: 'a', artist: 'X', title: 'T1' }),
        makeSong({ id: 'b', artist: 'Y', title: 'T2' }),
      ];
      expect(__internal.dedupe(songs)).toHaveLength(2);
    });

    it('drops duplicates by (artist|title) even when ids differ', () => {
      const songs = [
        makeSong({ id: 'a', artist: 'X', title: 'Same' }),
        makeSong({ id: 'b', artist: 'x', title: 'same' }), // case-insensitive match
      ];
      expect(__internal.dedupe(songs)).toHaveLength(1);
    });
  });

  describe('enforceArtistDiversity', () => {
    it('keeps at most one song per artist', () => {
      const songs = [
        makeSong({ id: '1', artist: 'A', title: 'a1' }),
        makeSong({ id: '2', artist: 'A', title: 'a2' }),
        makeSong({ id: '3', artist: 'B', title: 'b1' }),
        makeSong({ id: '4', artist: 'B', title: 'b2' }),
      ];
      const out = __internal.enforceArtistDiversity(songs);
      expect(out).toHaveLength(2);
      expect(out.map((s) => s.artist)).toEqual(['A', 'B']);
    });

    it('allows multiple songs from the `allowArtist` but caps others', () => {
      const songs = [
        makeSong({ id: '1', artist: 'Seed', title: 's1' }),
        makeSong({ id: '2', artist: 'Seed', title: 's2' }),
        makeSong({ id: '3', artist: 'Seed', title: 's3' }),
        makeSong({ id: '4', artist: 'Other', title: 'o1' }),
        makeSong({ id: '5', artist: 'Other', title: 'o2' }),
      ];
      const out = __internal.enforceArtistDiversity(songs, 'Seed');
      // 3 seed + 1 other
      expect(out).toHaveLength(4);
      expect(out.filter((s) => s.artist === 'Seed')).toHaveLength(3);
      expect(out.filter((s) => s.artist === 'Other')).toHaveLength(1);
    });
  });

  describe('applyRecencyCap', () => {
    it('caps recent-heard songs at 40% of target when fresh tracks are available', () => {
      const recentIds = new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
      const recent = { ids: recentIds, titleKeys: new Set<string>() };
      // 6 recent + 10 fresh → target 10 → cap should kick in (max 4 recent).
      const candidates: Song[] = [
        ...Array.from({ length: 6 }, (_, i) =>
          makeSong({ id: `r${i + 1}`, artist: `R${i}`, title: `rt${i}` }),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          makeSong({ id: `f${i}`, artist: `F${i}`, title: `ft${i}` }),
        ),
      ];
      const out = __internal.applyRecencyCap(candidates, recent, 10);
      // 10 * 0.4 = 4 recent allowed
      const recentTaken = out.filter((s) => recentIds.has(s.id)).length;
      expect(recentTaken).toBeLessThanOrEqual(4);
      expect(out).toHaveLength(10);
    });

    it('falls back to recent overflow when not enough fresh tracks exist', () => {
      // Soft cap: if fresh tracks < (target - cap), we refill from deferred recents
      // rather than returning a short list.
      const recentIds = new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
      const recent = { ids: recentIds, titleKeys: new Set<string>() };
      const candidates: Song[] = [
        ...Array.from({ length: 6 }, (_, i) =>
          makeSong({ id: `r${i + 1}`, artist: `R${i}`, title: `rt${i}` }),
        ),
        makeSong({ id: 'f1', artist: 'F', title: 'ft' }),
      ];
      const out = __internal.applyRecencyCap(candidates, recent, 10);
      // 6 recent + 1 fresh = 7 max available; expect all 7 returned.
      expect(out).toHaveLength(7);
    });

    it('counts pinned songs toward the target but not the recent cap', () => {
      const recent = { ids: new Set(['pinned']), titleKeys: new Set<string>() };
      const pinned = [makeSong({ id: 'pinned', artist: 'P', title: 'P' })];
      const candidates = [
        makeSong({ id: 'c1', artist: 'A', title: '1' }),
        makeSong({ id: 'c2', artist: 'B', title: '2' }),
      ];
      const out = __internal.applyRecencyCap(candidates, recent, 3, pinned);
      expect(out[0]).toEqual(pinned[0]);
      expect(out).toHaveLength(3);
    });
  });

  describe('ARTIST_CATALOG_FRACTION', () => {
    it('translates low/med/high to the expected percentages', () => {
      expect(__internal.ARTIST_CATALOG_FRACTION.low).toBe(0.6);
      expect(__internal.ARTIST_CATALOG_FRACTION.medium).toBe(0.35);
      expect(__internal.ARTIST_CATALOG_FRACTION.high).toBe(0.15);
    });

    it('produces sensible artist-slice targets for size=40', () => {
      const size = 40;
      expect(Math.round(size * __internal.ARTIST_CATALOG_FRACTION.low)).toBe(24);
      expect(Math.round(size * __internal.ARTIST_CATALOG_FRACTION.medium)).toBe(14);
      expect(Math.round(size * __internal.ARTIST_CATALOG_FRACTION.high)).toBe(6);
    });
  });

  describe('applyDurationTarget', () => {
    const mk = (id: string, duration: number): Song =>
      ({
        id,
        name: id,
        title: id,
        artist: 'A',
        album: '',
        albumId: '',
        track: 0,
        duration,
        url: '',
      }) as unknown as Song;

    it('returns input unchanged when target is 0 or negative', () => {
      const songs = [mk('a', 200), mk('b', 200)];
      expect(__internal.applyDurationTarget(songs, 0)).toBe(songs);
      expect(__internal.applyDurationTarget(songs, -10)).toBe(songs);
    });

    it('returns empty when input is empty', () => {
      expect(__internal.applyDurationTarget([], 600)).toEqual([]);
    });

    it('stops at exact boundary (include the track that hits target)', () => {
      // 3x 200s = 600s exactly. Including the third hits target with 0 overshoot.
      const songs = [mk('a', 200), mk('b', 200), mk('c', 200), mk('d', 200)];
      expect(__internal.applyDurationTarget(songs, 600)).toHaveLength(3);
    });

    it('snaps to closer boundary on overshoot — undershoot wins', () => {
      // After 2 tracks: 400s (undershoot 200). Adding 3rd: 700s (overshoot 100).
      // Overshoot is closer → include the third track.
      const songs = [mk('a', 200), mk('b', 200), mk('c', 300), mk('d', 200)];
      expect(__internal.applyDurationTarget(songs, 600)).toHaveLength(3);
    });

    it('snaps to closer boundary on overshoot — overshoot wins', () => {
      // After 2 tracks: 500s (undershoot 100). Adding 3rd: 800s (overshoot 200).
      // Undershoot is closer → stop at two.
      const songs = [mk('a', 250), mk('b', 250), mk('c', 300), mk('d', 200)];
      expect(__internal.applyDurationTarget(songs, 600)).toHaveLength(2);
    });

    it('always returns at least one track when input is non-empty, even if first overshoots', () => {
      // First track is 1200s, target 600s. Overshoot beats returning empty.
      const songs = [mk('a', 1200), mk('b', 200)];
      const out = __internal.applyDurationTarget(songs, 600);
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('a');
    });

    it('returns full list when total duration is below target', () => {
      const songs = [mk('a', 100), mk('b', 100)];
      expect(__internal.applyDurationTarget(songs, 600)).toHaveLength(2);
    });

    it('treats missing duration as 0 (does not advance accumulator)', () => {
      const noDur = { id: 'a', name: 'a', title: 'a', artist: 'A', url: '' } as unknown as Song;
      const songs = [noDur, mk('b', 600)];
      // 'a' contributes 0, 'b' hits target exactly.
      expect(__internal.applyDurationTarget(songs, 600)).toHaveLength(2);
    });
  });

  describe('estimateSizeFromMinutes', () => {
    it('floors at MIN_ESTIMATED_SIZE for very short targets', () => {
      // 30 min / 3.75 * 1.3 = ~10.4 → 11, but min is 15.
      expect(__internal.estimateSizeFromMinutes(30)).toBe(15);
    });

    it('scales linearly above the floor', () => {
      // 60 / 3.75 * 1.3 = 20.8 → 21
      expect(__internal.estimateSizeFromMinutes(60)).toBe(21);
      // 120 / 3.75 * 1.3 = 41.6 → 42
      expect(__internal.estimateSizeFromMinutes(120)).toBe(42);
      // 180 / 3.75 * 1.3 = 62.4 → 63
      expect(__internal.estimateSizeFromMinutes(180)).toBe(63);
    });
  });
});

// ---------------------------------------------------------------------------
// Per-seed integration (mocked)
// ---------------------------------------------------------------------------

describe('generateSeededRadio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('song seed: places seed at track 1 and excludes it from scorer output', async () => {
    const seed = makeSong({ id: 'seed-1', artist: 'Seed', title: 'Seed Song' });
    const others = Array.from({ length: 10 }, (_, i) =>
      makeSong({ id: `o${i}`, artist: `A${i}`, title: `t${i}` }),
    );
    vi.mocked(getSongsByIds).mockResolvedValue([seed]);
    vi.mocked(getBlendedRecommendations).mockResolvedValue({ songs: others, metadata: {} });

    const result = await generateSeededRadio('user-1', { kind: 'song', songId: 'seed-1' });

    expect(result.songs[0].id).toBe('seed-1');
    expect(result.seedInfo.seedSongIds).toEqual(['seed-1']);
    expect(result.seedInfo.seedArtists).toEqual(['Seed']);

    const scorerCall = vi.mocked(getBlendedRecommendations).mock.calls[0];
    expect(scorerCall[1]?.excludeSongIds).toContain('seed-1');
  });

  it('album seed: excludes album tracks from output', async () => {
    const album = Array.from({ length: 6 }, (_, i) =>
      makeSong({ id: `alb-${i}`, artist: 'AlbumArtist', title: `T${i}`, album: 'The Album' }),
    );
    const rec = Array.from({ length: 10 }, (_, i) =>
      makeSong({ id: `rec-${i}`, artist: `R${i}`, title: `rt${i}` }),
    );
    // Also sneak an album track into the scorer output to verify we strip it.
    rec.push(album[0]);
    vi.mocked(getSongs).mockResolvedValue(album);
    vi.mocked(getBlendedRecommendations).mockResolvedValue({ songs: rec, metadata: {} });

    const result = await generateSeededRadio('user-1', { kind: 'album', albumId: 'album-1' });

    const albumIds = new Set(album.map((s) => s.id));
    for (const s of result.songs) {
      expect(albumIds.has(s.id)).toBe(false);
    }
    expect(result.seedInfo.label).toContain('Album Radio');
  });

  it('playlist seed: excludes playlist tracks from output', async () => {
    const entry = Array.from({ length: 5 }, (_, i) => ({
      id: `pl-${i}`,
      title: `PT${i}`,
      artist: `PA${i}`,
      albumId: 'pa',
      duration: '180',
      track: '1',
    }));
    vi.mocked(getPlaylist).mockResolvedValue({
      id: 'pl-1',
      name: 'My List',
      songCount: 5,
      duration: 900,
      owner: 'me',
      public: false,
      created: '',
      changed: '',
      entry: entry as never,
    } as never);
    vi.mocked(getBlendedRecommendations).mockResolvedValue({
      songs: Array.from({ length: 10 }, (_, i) =>
        makeSong({ id: `r-${i}`, artist: `RA${i}`, title: `rt${i}` }),
      ),
      metadata: {},
    });

    const result = await generateSeededRadio('user-1', {
      kind: 'playlist',
      playlistId: 'pl-1',
    });

    const playlistIds = new Set(entry.map((e) => e.id));
    for (const s of result.songs) {
      expect(playlistIds.has(s.id)).toBe(false);
    }
    expect(result.seedInfo.label).toContain('My List');
  });

  it('artist seed: mix of seed-artist tracks + adjacent, honours variety knob', async () => {
    const catalog = Array.from({ length: 20 }, (_, i) =>
      makeSong({ id: `cat-${i}`, artist: 'TheArtist', title: `song${i}` }),
    );
    const adjacent = Array.from({ length: 20 }, (_, i) =>
      makeSong({ id: `adj-${i}`, artist: `Other${i}`, title: `adj${i}` }),
    );
    vi.mocked(getSongsByArtist).mockResolvedValue(catalog);
    vi.mocked(getBlendedRecommendations).mockResolvedValue({ songs: adjacent, metadata: {} });

    const result = await generateSeededRadio(
      'user-1',
      { kind: 'artist', artistId: 'artist-1' },
      { variety: 'low', size: 40 },
    );

    // Low variety = ~60% catalog → at least 18 of 40 should be TheArtist.
    const seedArtistCount = result.songs.filter((s) => s.artist === 'TheArtist').length;
    expect(seedArtistCount).toBeGreaterThanOrEqual(18);
    expect(result.seedInfo.seedArtists).toEqual(['TheArtist']);
  });

  it('artist seed: surfaces co-occurrence artists in the adjacent pool', async () => {
    const catalog = Array.from({ length: 10 }, (_, i) =>
      makeSong({ id: `cat-${i}`, artist: 'TheArtist', title: `song${i}` }),
    );
    // Make the scorer return NOTHING so any non-seed tracks in the output
    // can only come from the co-occurrence branch.
    vi.mocked(getSongsByArtist).mockImplementation(async (artistId: string) => {
      if (artistId === 'artist-1') return catalog;
      // Second call — co-occurrence lookup for 'cooc-artist'
      return [
        makeSong({ id: 'cooc-1', artist: 'CoocArtist', title: 'c1' }),
        makeSong({ id: 'cooc-2', artist: 'CoocArtist', title: 'c2' }),
      ];
    });
    vi.mocked(getBlendedRecommendations).mockResolvedValue({ songs: [], metadata: {} });
    vi.mocked(getRelatedArtists).mockResolvedValue([
      { artist: 'coocartist', score: 0.8, coplayCount: 5 },
    ]);
    vi.mocked(searchArtistsByName).mockResolvedValue([
      { id: 'cooc-id', name: 'CoocArtist' } as never,
    ]);

    const result = await generateSeededRadio(
      'user-1',
      { kind: 'artist', artistId: 'artist-1' },
      { variety: 'medium', size: 20 },
    );

    const coocCount = result.songs.filter((s) => s.artist === 'CoocArtist').length;
    expect(coocCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// interleaveByFraction — direct unit tests with deterministic rng
// ---------------------------------------------------------------------------

describe('interleaveByFraction', () => {
  function makeRng(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
  }

  const seed = 'Seed';
  const catalog = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeSong({ id: `c${i}`, artist: seed, title: `c${i}` }),
    );
  const scorer = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeSong({ id: `s${i}`, artist: `Other${i}`, title: `s${i}` }),
    );

  it('respects catalogTarget even when rng always picks catalog', () => {
    const out = __internal.interleaveByFraction(catalog(20), scorer(20), {
      size: 20,
      catalogTarget: 8,
      scorerTarget: 12,
      catalogFraction: 0.9,
      seedArtist: seed,
      rng: () => 0, // always "take catalog"
    });
    const fromSeed = out.filter((s) => s.artist === seed).length;
    expect(fromSeed).toBe(8);
    expect(out).toHaveLength(20);
  });

  it('falls back to the other pool when one is empty', () => {
    const out = __internal.interleaveByFraction(catalog(5), scorer(20), {
      size: 20,
      catalogTarget: 12,
      scorerTarget: 8,
      catalogFraction: 0.5,
      seedArtist: seed,
      rng: makeRng([0]), // prefer catalog, but it runs out after 5
    });
    expect(out).toHaveLength(20);
    expect(out.filter((s) => s.artist === seed)).toHaveLength(5);
    expect(out.filter((s) => s.artist !== seed)).toHaveLength(15);
  });

  it('stops at size even when both pools have more', () => {
    const out = __internal.interleaveByFraction(catalog(30), scorer(30), {
      size: 10,
      catalogTarget: 4,
      scorerTarget: 6,
      catalogFraction: 0.5,
      seedArtist: seed,
      rng: makeRng([0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9]),
    });
    expect(out).toHaveLength(10);
  });

  it('returns empty list when both pools are empty', () => {
    const out = __internal.interleaveByFraction([], [], {
      size: 10,
      catalogTarget: 6,
      scorerTarget: 4,
      catalogFraction: 0.6,
      seedArtist: seed,
    });
    expect(out).toEqual([]);
  });
});
