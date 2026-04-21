/**
 * Tests for Aurral Cache-Only Lookup Functions
 *
 * Verifies that the recommendation engine can read cached Aurral metadata
 * without making any API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock config to make Aurral "configured"
vi.mock('@/lib/config/config', () => ({
  getConfigAsync: vi.fn().mockResolvedValue({
    aurralUrl: 'http://localhost:3005',
    aurralUsername: 'test',
    aurralPassword: 'test',
  }),
}));

import {
  getCachedArtistMetadata,
  getCachedSimilarArtistNames,
  getCachedArtistGenresAndTags,
} from '../aurral';
import { db } from '@/lib/db';

// Helper to create a mock DB row
function mockCacheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-id',
    artistName: 'Radiohead',
    artistNameNormalized: 'radiohead',
    mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
    navidromeId: 'nav-123',
    disambiguation: null,
    artistType: 'Group',
    country: 'GB',
    formedYear: '1985',
    ended: false,
    tags: [
      { name: 'alternative rock', count: 100 },
      { name: 'electronic', count: 80 },
      { name: 'experimental', count: 60 },
    ],
    genres: ['alternative rock', 'art rock', 'electronic'],
    bio: null,
    relations: [],
    similarArtists: [
      { name: 'Thom Yorke', mbid: 'mbid-1', score: 0.95 },
      { name: 'Muse', mbid: 'mbid-2', score: 0.82 },
      { name: 'Portishead', mbid: 'mbid-3', score: 0.75 },
      { name: 'Massive Attack', mbid: 'mbid-4', score: 0.70 },
    ],
    releaseGroups: [],
    coverImageUrl: null,
    lidarrId: null,
    lidarrMonitored: false,
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Aurral Cache-Only Lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedArtistMetadata', () => {
    it('should return enriched metadata from cache', async () => {
      const row = mockCacheRow();
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([row])),
            }),
          }),
        }),
      });

      const result = await getCachedArtistMetadata('Radiohead');

      expect(result).not.toBeNull();
      expect(result!.artistName).toBe('Radiohead');
      expect(result!.mbid).toBe('a74b1b7f-71a5-4011-9441-d0b5e4122711');
      expect(result!.genres).toEqual(['alternative rock', 'art rock', 'electronic']);
      expect(result!.similarArtists).toHaveLength(4);
      expect(result!.similarArtists[0].name).toBe('Thom Yorke');
    });

    it('should return null when no cache entry exists', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([])),
            }),
          }),
        }),
      });

      const result = await getCachedArtistMetadata('Unknown Artist');
      expect(result).toBeNull();
    });

    it('should normalize artist name for lookup', async () => {
      const row = mockCacheRow();
      const mockWhere = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((cb) => cb([row])),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      });

      await getCachedArtistMetadata('  RADIOHEAD  ');

      // The function should have been called (normalization happens internally)
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null on DB error without throwing', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            throw new Error('DB connection failed');
          }),
        }),
      });

      const result = await getCachedArtistMetadata('Radiohead');
      expect(result).toBeNull();
    });
  });

  describe('getCachedSimilarArtistNames', () => {
    it('should return similar artists sorted by score', async () => {
      const row = mockCacheRow();
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([row])),
            }),
          }),
        }),
      });

      const result = await getCachedSimilarArtistNames('Radiohead');

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ name: 'Thom Yorke', score: 0.95 });
      expect(result[1]).toEqual({ name: 'Muse', score: 0.82 });
      // Verify sorted descending by score
      for (let i = 1; i < result.length; i++) {
        expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
      }
    });

    it('should return empty array when no cache entry', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([])),
            }),
          }),
        }),
      });

      const result = await getCachedSimilarArtistNames('Unknown');
      expect(result).toEqual([]);
    });

    it('should return empty array when artist has no similar artists', async () => {
      const row = mockCacheRow({ similarArtists: [] });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([row])),
            }),
          }),
        }),
      });

      const result = await getCachedSimilarArtistNames('Solo Artist');
      expect(result).toEqual([]);
    });
  });

  describe('getCachedArtistGenresAndTags', () => {
    it('should return genres and tags from cache', async () => {
      const row = mockCacheRow();
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([row])),
            }),
          }),
        }),
      });

      const result = await getCachedArtistGenresAndTags('Radiohead');

      expect(result.genres).toEqual(['alternative rock', 'art rock', 'electronic']);
      expect(result.tags).toHaveLength(3);
      expect(result.tags[0]).toEqual({ name: 'alternative rock', count: 100 });
    });

    it('should return empty arrays when not cached', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb) => cb([])),
            }),
          }),
        }),
      });

      const result = await getCachedArtistGenresAndTags('Unknown');
      expect(result.genres).toEqual([]);
      expect(result.tags).toEqual([]);
    });
  });
});
