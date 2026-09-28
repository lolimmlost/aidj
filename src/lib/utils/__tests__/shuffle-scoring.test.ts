import { describe, it, expect } from 'vitest';
import { shuffleSongs, artistKey, unshuffleUpcoming } from '../shuffle-scoring';
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

      let totalAdjacencies = 0;
      const runs = 20;
      for (let r = 0; r < runs; r++) {
        const result = shuffleSongs(songs);
        expect(result.length).toBe(10);
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].artist === result[i + 1].artist) totalAdjacencies++;
        }
      }
      // 5 of each artist, perfect interleave = 0 adjacencies per run; average should be low
      expect(totalAdjacencies / runs).toBeLessThan(3);
    });
  });

  it('is fast for large playlists', () => {
    // Largest real playlist is ~4,200 songs.
    const songs = Array.from({ length: 5000 }, (_, i) =>
      makeSong({ id: `s${i}`, artist: `Artist ${i % 700}`, albumId: `alb${i % 1500}` }),
    );
    const start = performance.now();
    shuffleSongs(songs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  describe('recently played', () => {
    it('places recently heard songs after all the others', () => {
      const songs = makeSongs(40, { artists: ['A', 'B', 'C', 'D', 'E'] });
      const recent = new Set(songs.slice(0, 10).map((s) => s.id));
      for (let r = 0; r < 20; r++) {
        const result = shuffleSongs(songs, { recentlyPlayedIds: recent });
        expect(result.slice(0, 30).every((s) => !recent.has(s.id))).toBe(true);
        expect(new Set(result.map((s) => s.id)).size).toBe(40);
      }
    });

    it('still shuffles when everything was heard recently', () => {
      const songs = makeSongs(12);
      const result = shuffleSongs(songs, { recentlyPlayedIds: new Set(songs.map((s) => s.id)) });
      expect(new Set(result.map((s) => s.id)).size).toBe(12);
    });
  });

  describe('artistKey', () => {
    it('groups collaborations with the lead artist', () => {
      const key = (artist: string) => artistKey(makeSong({ id: 'x', artist }));
      expect(key('Kai Wachi & LEVEL UP')).toBe(key('Kai Wachi'));
      expect(key('Drake feat. Rihanna')).toBe(key('Drake'));
      expect(key('The Weeknd')).toBe(key('Weeknd'));
      expect(key('Beyoncé')).toBe(key('Beyonce'));
      expect(key('')).not.toBe(artistKey(makeSong({ id: 'y', artist: '' })));
    });
  });

  // A playlist shaped like a real one: a few artists own most of the songs.
  // Compares against the previous algorithm (Fisher–Yates + one repair pass).
  describe('spread vs previous shuffle', () => {
    const skewed = (() => {
      const sizes = [30, 20, 14, 10, 8, 6, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1];
      const out: Song[] = [];
      sizes.forEach((n, a) => {
        for (let i = 0; i < n; i++) {
          out.push(makeSong({ id: `a${a}-${i}`, artist: `Artist ${a}`, albumId: `alb${a}-${i % 3}` }));
        }
      });
      return out;
    })();

    function previousShuffle(songs: Song[]): Song[] {
      const r = [...songs];
      for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
      }
      for (let i = 0; i < r.length - 1; i++) {
        if (r[i].artist !== r[i + 1].artist) continue;
        for (let j = i + 2; j < r.length; j++) {
          if (r[j].artist === r[i].artist) continue;
          const before = r[j - 1]?.artist;
          const after = r[j + 1]?.artist;
          if (before !== r[i + 1].artist && after !== r[i + 1].artist) {
            [r[i + 1], r[j]] = [r[j], r[i + 1]];
            break;
          }
        }
      }
      return r;
    }

    /** Same-artist pairs within `window` positions of each other. */
    function nearRepeats(order: Song[], window: number): number {
      let n = 0;
      for (let i = 0; i < order.length; i++) {
        for (let d = 1; d <= window && i + d < order.length; d++) {
          if (order[i].artist === order[i + d].artist) n++;
        }
      }
      return n;
    }

    /** Worst stretch: most songs by one artist inside any 10-song window. */
    function worstBurst(order: Song[]): number {
      let worst = 0;
      for (let i = 0; i + 10 <= order.length; i++) {
        const counts = new Map<string, number>();
        for (const s of order.slice(i, i + 10)) counts.set(s.artist!, (counts.get(s.artist!) ?? 0) + 1);
        worst = Math.max(worst, ...counts.values());
      }
      return worst;
    }

    const RUNS = 300;
    const average = (f: (order: Song[]) => number, shuffle: (s: Song[]) => Song[]) => {
      let total = 0;
      for (let r = 0; r < RUNS; r++) total += f(shuffle(skewed));
      return total / RUNS;
    };

    it('has far fewer same-artist songs close together', () => {
      const before = average((o) => nearRepeats(o, 3), previousShuffle);
      const after = average((o) => nearRepeats(o, 3), (s) => shuffleSongs(s));
      // Measured: ~37 → ~6 (2026-09-28).
      expect(after).toBeLessThan(before * 0.3);
    });

    it('never lets one artist dominate a 10-song stretch', () => {
      const before = average(worstBurst, previousShuffle);
      const after = average(worstBurst, (s) => shuffleSongs(s));
      expect(after).toBeLessThan(before);
      // The biggest artist is 30/120 = 25% of the list → ~2.5 per 10 when spread evenly.
      expect(after).toBeLessThanOrEqual(3.2);
    });

    it('still varies: repeated shuffles open differently', () => {
      const openings = new Set<string>();
      for (let r = 0; r < 50; r++) openings.add(shuffleSongs(skewed).slice(0, 5).map((s) => s.id).join());
      expect(openings.size).toBeGreaterThan(45);
    });

    it('spreads an album within its artist', () => {
      const songs = [
        ...Array.from({ length: 6 }, (_, i) => makeSong({ id: `x${i}`, artist: 'X', albumId: i < 3 ? 'one' : 'two' })),
        ...Array.from({ length: 12 }, (_, i) => makeSong({ id: `o${i}`, artist: `Other ${i}` })),
      ];
      let sameAlbumRuns = 0;
      for (let r = 0; r < 200; r++) {
        const xs = shuffleSongs(songs).filter((s) => s.artist === 'X');
        for (let i = 0; i < xs.length - 1; i++) if (xs[i].albumId === xs[i + 1].albumId) sameAlbumRuns++;
      }
      // Alternating albums → 0 per run; a plain shuffle averages ~2.
      expect(sameAlbumRuns / 200).toBeLessThan(0.5);
    });
  });
});


describe('unshuffleUpcoming', () => {
  const s = (id: string) => ({ id, name: id, albumId: 'a', duration: 1, track: 1, url: '' }) as Song;
  const ids = (songs: Song[]) => songs.map((x) => x.id).join('');

  it('continues in original order from the current song, then wraps', () => {
    const original = ['a', 'b', 'c', 'd', 'e', 'f'].map(s);
    // Playing "c"; still to come, shuffled:
    const upcoming = ['f', 'a', 'e', 'b', 'd'].map(s);
    expect(ids(unshuffleUpcoming(upcoming, original, 'c'))).toBe('defab');
  });

  it('keeps songs added while shuffled after the song they followed', () => {
    const original = ['a', 'b', 'c', 'd'].map(s);
    const upcoming = ['d', 'X', 'b', 'Y'].map(s);
    expect(ids(unshuffleUpcoming(upcoming, original, 'a'))).toBe('bYdX');
  });
});
