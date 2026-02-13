/**
 * Tests for the Listening History Service
 *
 * Phase 4: Listening history tracking for compound scoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock the database module before importing the service
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the Last.fm client
vi.mock('@/lib/services/lastfm', () => ({
  getLastFmClient: vi.fn(),
}));

// Mock config
vi.mock('@/lib/config/config', () => ({
  getConfigAsync: vi.fn().mockResolvedValue({ lastfmApiKey: 'test-api-key' }),
}));

import {
  recordSongPlay,
  getRecentListeningHistory,
  getUniqueSongsPlayed,
  getCachedSimilarTracks,
  COMPLETION_THRESHOLD,
  MAX_SIMILAR_TRACKS_PER_SONG,
} from '../listening-history';
import { db } from '@/lib/db';
// getLastFmClient import removed - unused in tests

describe('Listening History Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constants', () => {
    it('should have correct completion threshold (80%)', () => {
      expect(COMPLETION_THRESHOLD).toBe(0.8);
    });

    it('should have reasonable max similar tracks limit', () => {
      expect(MAX_SIMILAR_TRACKS_PER_SONG).toBeLessThanOrEqual(50);
      expect(MAX_SIMILAR_TRACKS_PER_SONG).toBeGreaterThanOrEqual(10);
    });
  });

  describe('recordSongPlay', () => {
    it('should record a song play in the database', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      (db.insert as Mock).mockReturnValue(mockInsert());

      await recordSongPlay('user-123', {
        songId: 'song-456',
        artist: 'Radiohead',
        title: 'Karma Police',
        album: 'OK Computer',
        genre: 'Alternative Rock',
        duration: 263,
      }, 250);

      expect(db.insert).toHaveBeenCalled();
    });

    it('should mark song as completed when played > 80%', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((record) => {
          // 90% of song played = completed
          expect(record.completed).toBe(1);
          return Promise.resolve(undefined);
        }),
      });
      (db.insert as Mock).mockReturnValue(mockInsert());

      await recordSongPlay('user-123', {
        songId: 'song-456',
        artist: 'Radiohead',
        title: 'Karma Police',
        duration: 100,
      }, 90); // 90% played

      expect(db.insert).toHaveBeenCalled();
    });

    it('should not mark song as completed when played < 80%', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((record) => {
          // 50% of song played = not completed
          expect(record.completed).toBe(0);
          return Promise.resolve(undefined);
        }),
      });
      (db.insert as Mock).mockReturnValue(mockInsert());

      await recordSongPlay('user-123', {
        songId: 'song-456',
        artist: 'Radiohead',
        title: 'Karma Police',
        duration: 100,
      }, 50); // 50% played

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('getRecentListeningHistory', () => {
    it('should return empty array when no history', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const history = await getRecentListeningHistory('user-123');

      expect(history).toEqual([]);
    });

    it('should return formatted history records', async () => {
      const mockHistory = [
        {
          songId: 'song-1',
          artist: 'Artist 1',
          title: 'Song 1',
          album: 'Album 1',
          genre: 'Rock',
          playedAt: new Date('2024-01-15'),
          completed: 1,
        },
        {
          songId: 'song-2',
          artist: 'Artist 2',
          title: 'Song 2',
          album: null,
          genre: null,
          playedAt: new Date('2024-01-14'),
          completed: 0,
        },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockHistory),
            }),
          }),
        }),
      });

      const history = await getRecentListeningHistory('user-123', 50, 7);

      expect(history).toHaveLength(2);
      expect(history[0].completed).toBe(true);
      expect(history[1].completed).toBe(false);
      expect(history[0].artist).toBe('Artist 1');
    });
  });

  describe('getUniqueSongsPlayed', () => {
    it('should return unique songs with play counts', async () => {
      const mockResults = [
        { artist: 'Radiohead', title: 'Karma Police', playCount: 5, lastPlayed: new Date() },
        { artist: 'Radiohead', title: 'Paranoid Android', playCount: 3, lastPlayed: new Date() },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockResults),
            }),
          }),
        }),
      });

      const songs = await getUniqueSongsPlayed('user-123', 7);

      expect(songs).toHaveLength(2);
      expect(songs[0].playCount).toBe(5);
    });
  });

  describe('getCachedSimilarTracks', () => {
    it('should return cached similarities when available', async () => {
      const mockSimilarities = [
        {
          targetArtist: 'Similar Artist',
          targetTitle: 'Similar Song',
          targetSongId: 'similar-123',
          matchScore: 0.85,
        },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSimilarities),
          }),
        }),
      });

      const similar = await getCachedSimilarTracks('Radiohead', 'Karma Police');

      expect(similar).toHaveLength(1);
      expect(similar[0].matchScore).toBe(0.85);
    });

    it('should return empty array when no cache available', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const similar = await getCachedSimilarTracks('Unknown Artist', 'Unknown Song');

      expect(similar).toEqual([]);
    });
  });
});
