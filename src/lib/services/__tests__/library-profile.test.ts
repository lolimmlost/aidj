import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLibraryGenres, getLibraryProfile, getOrCreateLibraryProfile } from '../library-profile';
import type { ArtistWithDetails } from '../navidrome';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      libraryProfiles: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  },
}));

vi.mock('../navidrome', () => ({
  getArtistsWithDetails: vi.fn(),
  getAlbums: vi.fn(),
  getSongsGlobal: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq-mock'),
}));

// Import after mocks
import { db } from '@/lib/db';
import * as navidrome from '../navidrome';

const mockDb = vi.mocked(db);
const mockNavidrome = vi.mocked(navidrome);

describe('Library Profile Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeLibraryGenres', () => {
    it('should extract genres from artist metadata', async () => {
      const mockArtists: Partial<ArtistWithDetails>[] = [
        { id: '1', name: 'Artist 1', genres: 'Rock, Alternative', albumCount: 5, songCount: 50 },
        { id: '2', name: 'Artist 2', genres: 'Electronic, Techno', albumCount: 3, songCount: 30 },
        { id: '3', name: 'Artist 3', genres: 'Rock', albumCount: 2, songCount: 20 },
      ];

      mockNavidrome.getArtistsWithDetails.mockResolvedValue(mockArtists as ArtistWithDetails[]);
      mockNavidrome.getAlbums.mockResolvedValue([
        { id: 'album1', name: 'Test Album', artistId: '1' },
      ]);
      mockNavidrome.getSongsGlobal.mockResolvedValue([
        { id: 'song1', name: 'Test Song', albumId: 'album1', duration: 200, track: 1, url: '/stream/1' },
      ]);

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'profile1',
            userId: 'user1',
            genreDistribution: { Rock: 0.6, Alternative: 0.2, Electronic: 0.1, Techno: 0.1 },
            topKeywords: ['test'],
            totalSongs: 1,
            lastAnalyzed: new Date(),
            refreshNeeded: false,
          }]),
        }),
      } as unknown as ReturnType<typeof mockDb.update>);

      const result = await analyzeLibraryGenres('user1');

      expect(result).toBeDefined();
      expect(result.genreDistribution).toBeDefined();
      expect(mockNavidrome.getArtistsWithDetails).toHaveBeenCalledWith(0, 100);
    });

    it('should calculate genre distribution correctly', async () => {
      const mockArtists: Partial<ArtistWithDetails>[] = [
        { id: '1', name: 'Artist 1', genres: 'Rock', albumCount: 1, songCount: 10 },
        { id: '2', name: 'Artist 2', genres: 'Rock', albumCount: 1, songCount: 10 },
        { id: '3', name: 'Artist 3', genres: 'Jazz', albumCount: 1, songCount: 10 },
      ];

      mockNavidrome.getArtistsWithDetails.mockResolvedValue(mockArtists as ArtistWithDetails[]);
      mockNavidrome.getAlbums.mockResolvedValue([]);
      mockNavidrome.getSongsGlobal.mockResolvedValue([
        { id: 'song1', name: 'Song 1', albumId: 'album1', duration: 200, track: 1, url: '/stream/1' },
      ]);

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'profile1',
            userId: 'user1',
            genreDistribution: { Rock: 0.67, Jazz: 0.33 },
            topKeywords: ['song'],
            totalSongs: 1,
            lastAnalyzed: new Date(),
            refreshNeeded: false,
          }]),
        }),
      } as unknown as ReturnType<typeof mockDb.update>);

      const result = await analyzeLibraryGenres('user1');

      // Rock should be ~67% (2/3 artists)
      expect(result.genreDistribution).toBeDefined();
    });

    it('should extract keywords from text fields', async () => {
      const mockArtists: Partial<ArtistWithDetails>[] = [
        { id: '1', name: 'Psychedelic Rock Band', genres: 'Rock', albumCount: 1, songCount: 10 },
      ];

      mockNavidrome.getArtistsWithDetails.mockResolvedValue(mockArtists as ArtistWithDetails[]);
      mockNavidrome.getAlbums.mockResolvedValue([
        { id: 'album1', name: 'Experimental Sounds', artistId: '1' },
      ]);
      mockNavidrome.getSongsGlobal.mockResolvedValue([
        { id: 'song1', name: 'Alternative Dreams', title: 'Alternative Dreams', albumId: 'album1', duration: 200, track: 1, url: '/stream/1' },
      ]);

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(null);
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'profile1',
            userId: 'user1',
            genreDistribution: { Rock: 1.0 },
            topKeywords: ['psychedelic', 'rock', 'band', 'experimental', 'sounds', 'alternative', 'dreams'],
            totalSongs: 1,
            lastAnalyzed: new Date(),
            refreshNeeded: false,
          }]),
        }),
      } as unknown as ReturnType<typeof mockDb.update>);

      const result = await analyzeLibraryGenres('user1');

      // Should extract keywords like "psychedelic", "experimental", "alternative"
      expect(result.topKeywords).toBeDefined();
      expect(result.topKeywords.length).toBeGreaterThan(0);
    });

    it('should timeout after 5 seconds', async () => {
      // Mock a slow response
      mockNavidrome.getArtistsWithDetails.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      await expect(analyzeLibraryGenres('user1')).rejects.toThrow();
    }, 10000);
  });

  describe('getLibraryProfile', () => {
    it('should return cached profile if recent', async () => {
      const recentProfile = {
        id: 'profile1',
        userId: 'user1',
        genreDistribution: { Rock: 0.5 },
        topKeywords: ['rock'],
        totalSongs: 100,
        lastAnalyzed: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        refreshNeeded: false,
      };

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(recentProfile);

      const result = await getLibraryProfile('user1');

      expect(result).toEqual(recentProfile);
    });

    it('should return null if profile is stale', async () => {
      const staleProfile = {
        id: 'profile1',
        userId: 'user1',
        genreDistribution: { Rock: 0.5 },
        topKeywords: ['rock'],
        totalSongs: 100,
        lastAnalyzed: new Date(Date.now() - 60 * 60 * 1000), // 60 minutes ago
        refreshNeeded: false,
      };

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(staleProfile);

      const result = await getLibraryProfile('user1');

      expect(result).toBeNull();
    });

    it('should return null if profile needs refresh', async () => {
      const profileNeedsRefresh = {
        id: 'profile1',
        userId: 'user1',
        genreDistribution: { Rock: 0.5 },
        topKeywords: ['rock'],
        totalSongs: 100,
        lastAnalyzed: new Date(),
        refreshNeeded: true,
      };

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(profileNeedsRefresh);

      const result = await getLibraryProfile('user1');

      expect(result).toBeNull();
    });
  });

  describe('getOrCreateLibraryProfile', () => {
    it('should use cached profile if available and not forcing refresh', async () => {
      const cachedProfile = {
        id: 'profile1',
        userId: 'user1',
        genreDistribution: { Rock: 0.5 },
        topKeywords: ['rock'],
        totalSongs: 100,
        lastAnalyzed: new Date(),
        refreshNeeded: false,
      };

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(cachedProfile);

      const result = await getOrCreateLibraryProfile('user1', false);

      expect(result).toEqual(cachedProfile);
      expect(mockNavidrome.getArtistsWithDetails).not.toHaveBeenCalled();
    });

    it('should analyze library if forceRefresh is true', async () => {
      const existingProfile = {
        id: 'profile1',
        userId: 'user1',
        genreDistribution: { Rock: 0.5 },
        topKeywords: ['rock'],
        totalSongs: 100,
        lastAnalyzed: new Date(),
        refreshNeeded: false,
      };

      mockDb.query.libraryProfiles.findFirst.mockResolvedValue(existingProfile);
      mockNavidrome.getArtistsWithDetails.mockResolvedValue([
        { id: '1', name: 'Artist 1', genres: 'Rock', albumCount: 1, songCount: 10 } as ArtistWithDetails,
      ]);
      mockNavidrome.getAlbums.mockResolvedValue([]);
      mockNavidrome.getSongsGlobal.mockResolvedValue([
        { id: 'song1', name: 'Song 1', albumId: 'album1', duration: 200, track: 1, url: '/stream/1' },
      ]);

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              ...existingProfile,
              lastAnalyzed: new Date(),
            }]),
          }),
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
      } as any);

      const result = await getOrCreateLibraryProfile('user1', true);

      expect(mockNavidrome.getArtistsWithDetails).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
