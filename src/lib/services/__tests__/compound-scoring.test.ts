/**
 * Tests for the Compound Scoring Service
 *
 * Phase 4: Platypush-inspired compound scoring for recommendations
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

import {
  calculateCompoundScores,
  getCompoundScoredRecommendations,
  getCompoundScoreBoost,
  getCompoundScoreBoosts,
  clearCompoundScores,
  applyCompoundScoreBoost,
  RECENCY_DECAY_RATE,
  MIN_COMPOUND_SCORE,
  LOOKBACK_DAYS,
} from '../compound-scoring';
import { db } from '@/lib/db';
import type { Song } from '@/lib/types/song';

describe('Compound Scoring Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constants', () => {
    it('should have reasonable recency decay rate', () => {
      // Should give ~50% weight after 5 days
      const fiveDayWeight = Math.exp(-RECENCY_DECAY_RATE * 5);
      expect(fiveDayWeight).toBeGreaterThan(0.4);
      expect(fiveDayWeight).toBeLessThan(0.6);
    });

    it('should have reasonable minimum compound score', () => {
      expect(MIN_COMPOUND_SCORE).toBeLessThan(1);
      expect(MIN_COMPOUND_SCORE).toBeGreaterThan(0);
    });

    it('should have reasonable lookback period', () => {
      expect(LOOKBACK_DAYS).toBeGreaterThanOrEqual(7);
      expect(LOOKBACK_DAYS).toBeLessThanOrEqual(30);
    });
  });

  describe('calculateCompoundScores', () => {
    it('should return 0 when no listening history', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const count = await calculateCompoundScores('user-123');

      expect(count).toBe(0);
    });

    it('should process listening history and calculate scores', async () => {
      // Mock listening history
      const mockSelectHistory = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { artist: 'Radiohead', title: 'Karma Police', lastPlayed: new Date() },
              ]),
            }),
          }),
        }),
      });

      // Mock similar tracks (empty to keep test simple)
      const mockSelectSimilar = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      let callCount = 0;
      (db.select as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mockSelectHistory();
        return mockSelectSimilar();
      });

      const count = await calculateCompoundScores('user-123', 7);

      // Should have attempted to process listening history
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('getCompoundScoredRecommendations', () => {
    it('should return recommendations sorted by score', async () => {
      const mockRecommendations = [
        { songId: 'song-1', artist: 'Artist 1', title: 'Song 1', score: 2.5, sourceCount: 3, recencyWeightedScore: 2.0 },
        { songId: 'song-2', artist: 'Artist 2', title: 'Song 2', score: 1.5, sourceCount: 2, recencyWeightedScore: 1.2 },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockRecommendations),
            }),
          }),
        }),
      });

      const recommendations = await getCompoundScoredRecommendations('user-123');

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].score).toBe(2.5);
    });

    it('should exclude specified song IDs', async () => {
      const mockRecommendations = [
        { songId: 'song-1', artist: 'Artist 1', title: 'Song 1', score: 2.5, sourceCount: 3, recencyWeightedScore: 2.0 },
        { songId: 'song-2', artist: 'Artist 2', title: 'Song 2', score: 1.5, sourceCount: 2, recencyWeightedScore: 1.2 },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockRecommendations),
            }),
          }),
        }),
      });

      const recommendations = await getCompoundScoredRecommendations('user-123', {
        excludeSongIds: ['song-1'],
      });

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].songId).toBe('song-2');
    });

    it('should exclude specified artists', async () => {
      const mockRecommendations = [
        { songId: 'song-1', artist: 'Artist 1', title: 'Song 1', score: 2.5, sourceCount: 3, recencyWeightedScore: 2.0 },
        { songId: 'song-2', artist: 'Artist 2', title: 'Song 2', score: 1.5, sourceCount: 2, recencyWeightedScore: 1.2 },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockRecommendations),
            }),
          }),
        }),
      });

      const recommendations = await getCompoundScoredRecommendations('user-123', {
        excludeArtists: ['Artist 1'],
      });

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].artist).toBe('Artist 2');
    });
  });

  describe('getCompoundScoreBoost', () => {
    it('should return 0 when no score exists', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const boost = await getCompoundScoreBoost('user-123', 'song-456');

      expect(boost).toBe(0);
    });

    it('should return normalized boost when score exists', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ recencyWeightedScore: 2.5 }]),
          }),
        }),
      });

      const boost = await getCompoundScoreBoost('user-123', 'song-456');

      // 2.5 / 5 = 0.5 (normalized)
      expect(boost).toBe(0.5);
    });

    it('should cap boost at 1.0', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ recencyWeightedScore: 10 }]),
          }),
        }),
      });

      const boost = await getCompoundScoreBoost('user-123', 'song-456');

      expect(boost).toBe(1);
    });
  });

  describe('getCompoundScoreBoosts', () => {
    it('should return empty map for empty song list', async () => {
      const boosts = await getCompoundScoreBoosts('user-123', []);

      expect(boosts.size).toBe(0);
    });

    it('should return boosts for multiple songs', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { songId: 'song-1', recencyWeightedScore: 2.0 },
            { songId: 'song-2', recencyWeightedScore: 3.0 },
          ]),
        }),
      });

      const boosts = await getCompoundScoreBoosts('user-123', ['song-1', 'song-2', 'song-3']);

      expect(boosts.size).toBe(2);
      expect(boosts.get('song-1')).toBe(0.4); // 2.0 / 5
      expect(boosts.get('song-2')).toBe(0.6); // 3.0 / 5
      expect(boosts.has('song-3')).toBe(false); // No score
    });
  });

  describe('clearCompoundScores', () => {
    it('should delete all scores for a user', async () => {
      (db.delete as Mock).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await clearCompoundScores('user-123');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('applyCompoundScoreBoost', () => {
    it('should return original order when no boosts available', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const songs: Song[] = [
        { id: 'song-1', title: 'Song 1', name: 'Song 1', artist: 'Artist', album: '', duration: '180', track: '1', url: '' },
        { id: 'song-2', title: 'Song 2', name: 'Song 2', artist: 'Artist', album: '', duration: '180', track: '2', url: '' },
      ];

      const result = await applyCompoundScoreBoost('user-123', songs, 0.3);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('song-1');
    });

    it('should reorder songs based on compound scores', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { songId: 'song-2', recencyWeightedScore: 5 }, // Max boost
          ]),
        }),
      });

      const songs: Song[] = [
        { id: 'song-1', title: 'Song 1', name: 'Song 1', artist: 'Artist', album: '', duration: '180', track: '1', url: '' },
        { id: 'song-2', title: 'Song 2', name: 'Song 2', artist: 'Artist', album: '', duration: '180', track: '2', url: '' },
      ];

      // With boost weight 1.0, song-2 should move to top
      const result = await applyCompoundScoreBoost('user-123', songs, 1.0);

      expect(result[0].id).toBe('song-2');
    });

    it('should return original order when boost weight is 0', async () => {
      const songs: Song[] = [
        { id: 'song-1', title: 'Song 1', name: 'Song 1', artist: 'Artist', album: '', duration: '180', track: '1', url: '' },
        { id: 'song-2', title: 'Song 2', name: 'Song 2', artist: 'Artist', album: '', duration: '180', track: '2', url: '' },
      ];

      const result = await applyCompoundScoreBoost('user-123', songs, 0);

      expect(result[0].id).toBe('song-1');
    });
  });
});
