import { describe, it, expect } from 'vitest';
import { shuffleSongs } from '../shuffle-scoring';
import type { Song } from '@/lib/types/song';

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

function makeSongs(count: number, opts?: { artists?: string[] }): Song[] {
  const artists = opts?.artists ?? ['Artist A', 'Artist B', 'Artist C', 'Artist D'];
  return Array.from({ length: count }, (_, i) =>
    makeSong({
      id: `song-${i}`,
      artist: artists[i % artists.length],
    }),
  );
}

describe('shuffleSongs', () => {
  it('returns all songs without loss or duplication', () => {
    const songs = makeSongs(50);
    const result = shuffleSongs(songs);
    expect(result.length).toBe(songs.length);
    const ids = new Set(result.map(s => s.id));
    expect(ids.size).toBe(songs.length);
  });

  it('handles empty array', () => {
    expect(shuffleSongs([])).toEqual([]);
  });

  it('handles single song', () => {
    const songs = makeSongs(1);
    const result = shuffleSongs(songs);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(songs[0].id);
  });

  it('handles two songs', () => {
    const songs = makeSongs(2);
    const result = shuffleSongs(songs);
    expect(result.length).toBe(2);
    const ids = new Set(result.map(s => s.id));
    expect(ids.size).toBe(2);
  });

  it('produces different orderings (not deterministic)', () => {
    const songs = makeSongs(20);
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(shuffleSongs(songs).map(s => s.id).join(','));
    }
    // With 20 songs, 10 shuffles should produce at least 2 different orderings
    expect(results.size).toBeGreaterThan(1);
  });

  describe('artist separation', () => {
    it('avoids back-to-back same-artist songs when possible', () => {
      // 3 artists × 5 songs each = 15 songs
      const songs = makeSongs(15, { artists: ['A', 'B', 'C'] });

      let totalAdjacencies = 0;
      const runs = 20;
      for (let i = 0; i < runs; i++) {
        const result = shuffleSongs(songs);
        for (let j = 0; j < result.length - 1; j++) {
          if (result[j].artist === result[j + 1].artist) {
            totalAdjacencies++;
          }
        }
      }

      // Average adjacencies per shuffle should be very low
      const avgAdjacencies = totalAdjacencies / runs;
      expect(avgAdjacencies).toBeLessThan(2);
    });

    it('handles single-artist playlists gracefully', () => {
      const songs = makeSongs(10, { artists: ['Solo Artist'] });
      const result = shuffleSongs(songs);
      expect(result.length).toBe(10);
      const ids = new Set(result.map(s => s.id));
      expect(ids.size).toBe(10);
    });

    it('handles two-artist playlists', () => {
      const songs = makeSongs(10, { artists: ['A', 'B'] });
      const result = shuffleSongs(songs);
      expect(result.length).toBe(10);

      let adjacencies = 0;
      for (let i = 0; i < result.length - 1; i++) {
        if (result[i].artist === result[i + 1].artist) adjacencies++;
      }
      // 5 of each artist, perfect interleave = 0 adjacencies
      expect(adjacencies).toBeLessThanOrEqual(1);
    });
  });

  it('is fast for large playlists', () => {
    const songs = makeSongs(1000);
    const start = performance.now();
    shuffleSongs(songs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
