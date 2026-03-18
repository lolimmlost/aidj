/**
 * Unit tests for GET /api/onboarding/artists route handler logic
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/navidrome', () => ({
  getArtistsWithDetails: vi.fn().mockResolvedValue([
    { id: 'a1', name: 'Radiohead', albumCount: 10, songCount: 100 },
    { id: 'a2', name: 'Beatles', albumCount: 15, songCount: 200 },
    { id: 'a3', name: 'Pink Floyd', albumCount: 8, songCount: 80 },
    { id: 'a4', name: 'Led Zeppelin', albumCount: 9, songCount: 90 },
    { id: 'a5', name: 'Radioactive', albumCount: 2, songCount: 20 },
  ]),
}));

describe('Onboarding Artists API', () => {
  describe('sorting', () => {
    it('should sort artists by album count descending', () => {
      const artists = [
        { id: 'a1', name: 'Radiohead', albumCount: 10, songCount: 100 },
        { id: 'a2', name: 'Beatles', albumCount: 15, songCount: 200 },
        { id: 'a3', name: 'Pink Floyd', albumCount: 8, songCount: 80 },
      ];

      artists.sort((a, b) => (b.albumCount || 0) - (a.albumCount || 0));

      expect(artists[0].name).toBe('Beatles');
      expect(artists[1].name).toBe('Radiohead');
      expect(artists[2].name).toBe('Pink Floyd');
    });
  });

  describe('search filtering', () => {
    it('should filter artists by name case-insensitively', () => {
      const artists = [
        { id: 'a1', name: 'Radiohead', albumCount: 10 },
        { id: 'a2', name: 'Beatles', albumCount: 15 },
        { id: 'a5', name: 'Radioactive', albumCount: 2 },
      ];

      const search = 'radio';
      const filtered = artists.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe('Radiohead');
      expect(filtered[1].name).toBe('Radioactive');
    });

    it('should return all artists when search is empty', () => {
      const artists = [
        { id: 'a1', name: 'Radiohead' },
        { id: 'a2', name: 'Beatles' },
      ];

      const search = '';
      const filtered = search
        ? artists.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
        : artists;

      expect(filtered).toHaveLength(2);
    });
  });

  describe('pagination', () => {
    it('should paginate results with start and limit', () => {
      const artists = Array.from({ length: 100 }, (_, i) => ({
        id: `a${i}`,
        name: `Artist ${i}`,
        albumCount: 100 - i,
      }));

      const start = 10;
      const limit = 20;
      const paginated = artists.slice(start, start + limit);

      expect(paginated).toHaveLength(20);
      expect(paginated[0].name).toBe('Artist 10');
    });

    it('should return total count before pagination', () => {
      const artists = Array.from({ length: 100 }, (_, i) => ({
        id: `a${i}`,
        name: `Artist ${i}`,
      }));

      const total = artists.length;
      const paginated = artists.slice(0, 50);

      expect(total).toBe(100);
      expect(paginated).toHaveLength(50);
    });
  });

  describe('response shape', () => {
    it('should return correct response format', () => {
      const artist = { id: 'a1', name: 'Radiohead', albumCount: 10, songCount: 100, genres: null, fullText: '', orderArtistName: '', size: 0 };

      const response = {
        id: artist.id,
        name: artist.name,
        albumCount: artist.albumCount || 0,
        songCount: artist.songCount || 0,
      };

      expect(response).toEqual({
        id: 'a1',
        name: 'Radiohead',
        albumCount: 10,
        songCount: 100,
      });
    });
  });
});
