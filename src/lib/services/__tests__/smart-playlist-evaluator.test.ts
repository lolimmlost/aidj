import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateSmartPlaylistRules } from '../smart-playlist-evaluator';
import * as navidrome from '../navidrome';

// Mock the navidrome service
vi.mock('../navidrome');

describe('Smart Playlist Evaluator', () => {
  const mockSongs = [
    {
      id: '1',
      title: 'Song One',
      artist: 'Artist A',
      album: 'Album X',
      albumId: 'album1',
      duration: '200',
      track: '1',
      year: 2020,
      genre: 'Rock',
      playCount: 5,
      rating: 4,
      loved: false,
    },
    {
      id: '2',
      title: 'Song Two',
      artist: 'Artist B',
      album: 'Album Y',
      albumId: 'album2',
      duration: '180',
      track: '2',
      year: 2021,
      genre: 'Pop',
      playCount: 0,
      rating: 5,
      loved: true,
    },
    {
      id: '3',
      title: 'Classic Hit',
      artist: 'Artist A',
      album: 'Album Z',
      albumId: 'album3',
      duration: '240',
      track: '1',
      year: 1985,
      genre: 'Rock',
      playCount: 10,
      rating: 3,
      loved: false,
    },
    {
      id: '4',
      title: 'Never Played',
      artist: 'Artist C',
      album: 'Album W',
      albumId: 'album4',
      duration: '150',
      track: '1',
      year: 2023,
      genre: 'Electronic',
      playCount: 0,
      rating: 0,
      loved: false,
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    // Mock getSongsGlobal to return our test songs
    vi.spyOn(navidrome, 'getSongsGlobal').mockResolvedValue(
      mockSongs.map(s => ({ ...s, name: s.title }))
    );
  });

  describe('Basic Filtering', () => {
    it('should filter songs by genre (is operator)', async () => {
      const rules = {
        all: [{ is: { genre: 'Rock' } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['1', '3']);
    });

    it('should filter songs by year (gt operator)', async () => {
      const rules = {
        all: [{ gt: { year: 2019 } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['1', '2', '4']);
    });

    it('should filter songs by rating (lt operator)', async () => {
      const rules = {
        all: [{ lt: { rating: 4 } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['3', '4']);
    });

    it('should filter songs by loved status (boolean)', async () => {
      const rules = {
        all: [{ is: { loved: true } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter songs by year range (inTheRange operator)', async () => {
      const rules = {
        all: [{ inTheRange: { year: [2020, 2022] } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['1', '2']);
    });
  });

  describe('String Operators', () => {
    it('should filter by title contains', async () => {
      const rules = {
        all: [{ contains: { title: 'Song' } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['1', '2']);
    });

    it('should filter by artist startsWith', async () => {
      const rules = {
        all: [{ startsWith: { artist: 'Artist A' } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['1', '3']);
    });

    it('should filter by title notContains', async () => {
      const rules = {
        all: [{ notContains: { title: 'Classic' } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['1', '2', '4']);
    });
  });

  describe('Complex Conditions', () => {
    it('should handle multiple AND conditions (all)', async () => {
      const rules = {
        all: [
          { is: { genre: 'Rock' } },
          { gt: { year: 2000 } },
        ],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should handle OR conditions (any)', async () => {
      const rules = {
        any: [
          { is: { genre: 'Pop' } },
          { is: { genre: 'Electronic' } },
        ],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['2', '4']);
    });

    it('should handle nested conditions', async () => {
      const rules = {
        all: [
          { lt: { playCount: 5 } },
          {
            any: [
              { is: { rating: 5 } },
              { is: { loved: true } },
            ],
          },
        ],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('Sorting', () => {
    it('should sort by year ascending', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        sort: 'year',
        order: 'asc' as const,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result.map(s => s.year)).toEqual([1985, 2020, 2021, 2023]);
    });

    it('should sort by year descending', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        sort: 'year',
        order: 'desc' as const,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result.map(s => s.year)).toEqual([2023, 2021, 2020, 1985]);
    });

    it('should sort randomly', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        sort: 'random',
      };

      const result = await evaluateSmartPlaylistRules(rules);

      // Just verify we get all songs, order will be random
      expect(result).toHaveLength(4);
    });

    it('should sort by title ascending', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        sort: 'title',
        order: 'asc' as const,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result.map(s => s.title)).toEqual(['Classic Hit', 'Never Played', 'Song One', 'Song Two']);
    });
  });

  describe('Limits', () => {
    it('should limit results to specified number', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        limit: 2,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
    });

    it('should apply limit after sorting', async () => {
      const rules = {
        all: [{ gt: { year: 0 } }],
        sort: 'year',
        order: 'desc' as const,
        limit: 2,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.year)).toEqual([2023, 2021]);
    });
  });

  describe('Preset Simulations', () => {
    it('should simulate "Never Played" preset', async () => {
      const rules = {
        name: 'Never Played',
        all: [{ is: { playCount: 0 } }],
        sort: 'album',
        limit: 100,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
      // Sorted by album: "Album W" (id:4) comes before "Album Y" (id:2)
      expect(result.map(s => s.id)).toEqual(['4', '2']);
    });

    it('should simulate "Favorites" preset', async () => {
      const rules = {
        name: 'Favorites - Less than 5 plays',
        all: [
          { lt: { playCount: 5 } },
          { any: [{ is: { rating: 5 } }, { is: { loved: true } }] },
        ],
        sort: 'random',
        limit: 100,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should simulate "Unrated Songs" preset', async () => {
      const rules = {
        name: 'Unsorted - Rating',
        all: [{ lt: { rating: 1 } }],
        sort: 'artist',
        order: 'desc' as const,
        limit: 200,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should simulate "80s & 90s Classics" preset', async () => {
      const rules = {
        name: 'Classic Hits',
        all: [{ inTheRange: { year: [1980, 1999] } }],
        sort: 'random',
        limit: 100,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });
  });

  describe('Edge Cases', () => {
    it('should return all songs when no conditions specified', async () => {
      const rules = {};

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(4);
    });

    it('should handle empty all array', async () => {
      const rules = {
        all: [],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(4);
    });

    it('should handle empty any array', async () => {
      const rules = {
        any: [],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(4);
    });

    it('should handle conditions that match no songs', async () => {
      const rules = {
        all: [{ is: { genre: 'Jazz' } }],
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(0);
    });

    it('should handle limit larger than result set', async () => {
      const rules = {
        all: [{ is: { genre: 'Rock' } }],
        limit: 100,
      };

      const result = await evaluateSmartPlaylistRules(rules);

      expect(result).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle getSongsGlobal failure', async () => {
      vi.spyOn(navidrome, 'getSongsGlobal').mockRejectedValue(new Error('Navidrome unavailable'));

      const rules = {
        all: [{ is: { genre: 'Rock' } }],
      };

      await expect(evaluateSmartPlaylistRules(rules)).rejects.toThrow('Navidrome unavailable');
    });
  });
});
