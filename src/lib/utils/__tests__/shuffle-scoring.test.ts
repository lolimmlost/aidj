import { describe, it, expect } from 'vitest';
import {
  generateCandidate,
  scoreCandidate,
  selectBestShuffle,
  identifyHookSongs,
} from '../shuffle-scoring';
import type { Song } from '@/lib/types/song';

// Helper to create a mock song
function makeSong(overrides: Partial<Song> & { id: string }): Song {
  return {
    name: overrides.id,
    title: overrides.title ?? overrides.id,
    albumId: 'album-1',
    duration: 200,
    track: 1,
    url: `/songs/${overrides.id}`,
    artist: 'Artist',
    genre: 'rock',
    ...overrides,
  };
}

function makeSongs(count: number, opts?: { artists?: string[]; genres?: string[] }): Song[] {
  const artists = opts?.artists ?? ['Artist A', 'Artist B', 'Artist C', 'Artist D'];
  const genres = opts?.genres ?? ['rock', 'pop', 'electronic', 'hip-hop'];
  return Array.from({ length: count }, (_, i) =>
    makeSong({
      id: `song-${i}`,
      artist: artists[i % artists.length],
      genre: genres[i % genres.length],
    }),
  );
}

const emptyOptions = { recentlyPlayedIds: [], skipCounts: {} };

describe('shuffle-scoring', () => {
  describe('generateCandidate', () => {
    it('returns all songs without loss or duplication', () => {
      const songs = makeSongs(50);
      const result = generateCandidate(songs, emptyOptions);
      expect(result.length).toBe(songs.length);
      const ids = new Set(result.map(s => s.id));
      expect(ids.size).toBe(songs.length);
    });

    it('handles very small arrays (≤2)', () => {
      const songs = makeSongs(2);
      const result = generateCandidate(songs, emptyOptions);
      expect(result.length).toBe(2);
      const ids = new Set(result.map(s => s.id));
      expect(ids.size).toBe(2);
    });

    it('handles single-artist songs', () => {
      const songs = makeSongs(10, { artists: ['Solo Artist'] });
      const result = generateCandidate(songs, emptyOptions);
      expect(result.length).toBe(10);
    });
  });

  describe('scoreCandidate', () => {
    it('returns a value between 0 and 1', () => {
      const songs = makeSongs(20);
      const candidate = generateCandidate(songs, emptyOptions);
      const score = scoreCandidate(candidate, emptyOptions);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('penalizes recently-played songs in early positions', () => {
      const songs = makeSongs(20);
      // Place recently played songs first (bad arrangement)
      const recentlyPlayedIds = songs.slice(0, 5).map(s => s.id);
      const badCandidate = [...songs]; // recently played at front
      const goodCandidate = [...songs.slice(5), ...songs.slice(0, 5)]; // pushed to back

      const badScore = scoreCandidate(badCandidate, { recentlyPlayedIds, skipCounts: {} });
      const goodScore = scoreCandidate(goodCandidate, { recentlyPlayedIds, skipCounts: {} });

      expect(goodScore).toBeGreaterThan(badScore);
    });

    it('penalizes same-artist adjacencies', () => {
      // All same artist = worst adjacency score
      const sameArtist = makeSongs(10, { artists: ['Same'] });
      const diverseArtist = makeSongs(10);

      const sameScore = scoreCandidate(sameArtist, emptyOptions);
      const diverseScore = scoreCandidate(diverseArtist, emptyOptions);

      expect(diverseScore).toBeGreaterThan(sameScore);
    });

    it('penalizes genre clustering', () => {
      // 3 same genre in a row
      const clustered = [
        makeSong({ id: '1', genre: 'rock' }),
        makeSong({ id: '2', genre: 'rock' }),
        makeSong({ id: '3', genre: 'rock' }),
        makeSong({ id: '4', genre: 'pop' }),
        makeSong({ id: '5', genre: 'jazz' }),
      ];
      const spread = [
        makeSong({ id: '1', genre: 'rock' }),
        makeSong({ id: '2', genre: 'pop' }),
        makeSong({ id: '3', genre: 'jazz' }),
        makeSong({ id: '4', genre: 'rock' }),
        makeSong({ id: '5', genre: 'rock' }),
      ];

      const clusteredScore = scoreCandidate(clustered, emptyOptions);
      const spreadScore = scoreCandidate(spread, emptyOptions);

      expect(spreadScore).toBeGreaterThan(clusteredScore);
    });

    it('penalizes frequently-skipped songs in early positions', () => {
      const songs = makeSongs(10);
      const skipCounts: Record<string, number> = { 'song-0': 5, 'song-1': 5 };
      // Skipped songs at front
      const badOrder = [...songs];
      // Skipped songs at back
      const goodOrder = [...songs.slice(2), ...songs.slice(0, 2)];

      const badScore = scoreCandidate(badOrder, { recentlyPlayedIds: [], skipCounts });
      const goodScore = scoreCandidate(goodOrder, { recentlyPlayedIds: [], skipCounts });

      expect(goodScore).toBeGreaterThan(badScore);
    });
  });

  describe('selectBestShuffle', () => {
    it('returns all songs without loss or duplication', () => {
      const songs = makeSongs(200);
      const result = selectBestShuffle(songs, emptyOptions);
      expect(result.length).toBe(200);
      const ids = new Set(result.map(s => s.id));
      expect(ids.size).toBe(200);
    });

    it('handles empty array', () => {
      expect(selectBestShuffle([], emptyOptions)).toEqual([]);
    });

    it('handles small arrays (<10) with single candidate', () => {
      const songs = makeSongs(5);
      const result = selectBestShuffle(songs, emptyOptions);
      expect(result.length).toBe(5);
    });

    it('produces better-scored results than a single random shuffle (statistical)', () => {
      const songs = makeSongs(50);
      const recentlyPlayedIds = songs.slice(0, 10).map(s => s.id);
      const options = { recentlyPlayedIds, skipCounts: {} };

      // selectBestShuffle picks the best of N candidates
      const bestShuffle = selectBestShuffle(songs, options);
      const bestScore = scoreCandidate(bestShuffle, options);

      // Generate 10 random single candidates and compare
      let singleBestScore = -Infinity;
      for (let i = 0; i < 10; i++) {
        const single = generateCandidate(songs, options);
        singleBestScore = Math.max(singleBestScore, scoreCandidate(single, options));
      }

      // The multi-candidate approach should generally equal or beat random
      // Allow a small margin since randomness can sometimes produce good results
      expect(bestScore).toBeGreaterThanOrEqual(singleBestScore * 0.9);
    });

    it('completes within 200ms for 200 songs × 50 candidates', () => {
      const songs = makeSongs(200);
      const start = performance.now();
      selectBestShuffle(songs, emptyOptions);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    it('uses 20 candidates for >500 songs (performance)', () => {
      const songs = makeSongs(501);
      const start = performance.now();
      const result = selectBestShuffle(songs, emptyOptions);
      const elapsed = performance.now() - start;
      expect(result.length).toBe(501);
      // Should still be fast with reduced candidate count
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('identifyHookSongs', () => {
    it('identifies songs played 3+ times with low skip count', () => {
      const songs = makeSongs(10);
      // song-0 played 4 times, song-1 played 3 times, song-2 played 2 times
      const recentlyPlayedIds = [
        'song-0', 'song-0', 'song-0', 'song-0',
        'song-1', 'song-1', 'song-1',
        'song-2', 'song-2',
      ];
      const skipCounts = { 'song-1': 3 }; // song-1 skipped too much

      const hooks = identifyHookSongs(songs, recentlyPlayedIds, skipCounts);

      expect(hooks.has('song-0')).toBe(true);  // 4 plays, 0 skips = hook
      expect(hooks.has('song-1')).toBe(false);  // 3 plays but 3 skips = not a hook
      expect(hooks.has('song-2')).toBe(false);  // only 2 plays = not a hook
    });

    it('only includes songs present in the input array', () => {
      const songs = makeSongs(3); // song-0, song-1, song-2
      const recentlyPlayedIds = [
        'song-0', 'song-0', 'song-0',
        'song-999', 'song-999', 'song-999', // not in songs array
      ];

      const hooks = identifyHookSongs(songs, recentlyPlayedIds, {});
      expect(hooks.has('song-0')).toBe(true);
      expect(hooks.has('song-999')).toBe(false);
    });
  });

  describe('opening stretch optimization', () => {
    it('places diverse artists in first 5 positions', () => {
      const songs = makeSongs(30);
      const result = selectBestShuffle(songs, emptyOptions);
      const first5Artists = result.slice(0, 5).map(s => s.artist?.toLowerCase());
      const uniqueArtists = new Set(first5Artists);
      // With 4 different artists and 5 positions, expect at least 3 unique
      expect(uniqueArtists.size).toBeGreaterThanOrEqual(3);
    });

    it('swaps a hook song into the opening if available', () => {
      // Use 10 different artists to avoid artist-dedup conflicts in opening
      const artists = Array.from({ length: 10 }, (_, i) => `Artist ${i}`);
      const songs = makeSongs(20, { artists });
      // Make song-10 a hook song (played 5 times, no skips)
      // song-10 at index 10, artist = artists[10 % 10] = 'Artist 0'
      const recentlyPlayedIds = Array(5).fill('song-10');
      const options = { recentlyPlayedIds, skipCounts: {} };

      // Run multiple times since there's randomness involved
      let hookInOpening = 0;
      for (let i = 0; i < 20; i++) {
        const result = selectBestShuffle(songs, options);
        if (result.slice(0, 5).some(s => s.id === 'song-10')) {
          hookInOpening++;
        }
      }
      // Hook should appear in opening more often than not (scoring bonus drives this)
      expect(hookInOpening).toBeGreaterThan(5);
    });
  });
});
