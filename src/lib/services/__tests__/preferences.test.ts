/**
 * Unit tests for User Preference Profile Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildUserPreferenceProfile,
  getLikedArtists,
  getDislikedArtists,
  getListeningPatterns,
  clearPreferenceCache,
  clearAllPreferenceCaches,
} from '../preferences';
import type { UserPreferenceProfile, ListeningPatterns } from '../preferences';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(mockFeedbackData)),
        })),
      })),
    })),
  },
}));

// Mock feedback data
let mockFeedbackData: Array<{
  id: string;
  userId: string;
  songArtistTitle: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  timestamp: Date;
  source: string;
  recommendationCacheId: number | null;
}> = [];

describe('Preference Profile Service', () => {
  beforeEach(() => {
    // Clear caches before each test
    clearAllPreferenceCaches();

    // Reset mock data
    mockFeedbackData = [
      {
        id: '1',
        userId: 'user123',
        songArtistTitle: 'The Beatles - Hey Jude',
        feedbackType: 'thumbs_up',
        timestamp: new Date('2025-01-15'),
        source: 'recommendation',
        recommendationCacheId: null,
      },
      {
        id: '2',
        userId: 'user123',
        songArtistTitle: 'The Beatles - Let It Be',
        feedbackType: 'thumbs_up',
        timestamp: new Date('2025-01-16'),
        source: 'recommendation',
        recommendationCacheId: null,
      },
      {
        id: '3',
        userId: 'user123',
        songArtistTitle: 'Queen - Bohemian Rhapsody',
        feedbackType: 'thumbs_up',
        timestamp: new Date('2025-01-17'),
        source: 'recommendation',
        recommendationCacheId: null,
      },
      {
        id: '4',
        userId: 'user123',
        songArtistTitle: 'Nickelback - Photograph',
        feedbackType: 'thumbs_down',
        timestamp: new Date('2025-01-18'),
        source: 'recommendation',
        recommendationCacheId: null,
      },
      {
        id: '5',
        userId: 'user123',
        songArtistTitle: 'Nickelback - Rockstar',
        feedbackType: 'thumbs_down',
        timestamp: new Date('2025-01-19'),
        source: 'recommendation',
        recommendationCacheId: null,
      },
    ];
  });

  describe('buildUserPreferenceProfile', () => {
    it('should aggregate feedback into preference profile', async () => {
      const profile = await buildUserPreferenceProfile('user123');

      expect(profile.userId).toBe('user123');
      expect(profile.totalFeedbackCount).toBe(5);
      expect(profile.thumbsUpCount).toBe(3);
      expect(profile.thumbsDownCount).toBe(2);
      expect(profile.feedbackRatio).toBeCloseTo(0.6, 1);
    });

    it('should correctly aggregate liked artists by count', async () => {
      const profile = await buildUserPreferenceProfile('user123');

      expect(profile.likedArtists).toHaveLength(2);
      expect(profile.likedArtists[0]).toEqual({ artist: 'The Beatles', count: 2 });
      expect(profile.likedArtists[1]).toEqual({ artist: 'Queen', count: 1 });
    });

    it('should correctly aggregate disliked artists by count', async () => {
      const profile = await buildUserPreferenceProfile('user123');

      expect(profile.dislikedArtists).toHaveLength(1);
      expect(profile.dislikedArtists[0]).toEqual({ artist: 'Nickelback', count: 2 });
    });

    it('should include liked and disliked songs with timestamps', async () => {
      const profile = await buildUserPreferenceProfile('user123');

      expect(profile.likedSongs).toHaveLength(3);
      expect(profile.likedSongs[0].songArtistTitle).toBe('The Beatles - Hey Jude');

      expect(profile.dislikedSongs).toHaveLength(2);
      expect(profile.dislikedSongs[0].songArtistTitle).toBe('Nickelback - Photograph');
    });

    it('should cache preference profiles', async () => {
      const profile1 = await buildUserPreferenceProfile('user123');
      const profile2 = await buildUserPreferenceProfile('user123');

      // Should return the same cached object
      expect(profile1).toBe(profile2);
    });

    it('should handle users with no feedback', async () => {
      mockFeedbackData = [];

      const profile = await buildUserPreferenceProfile('user456');

      expect(profile.totalFeedbackCount).toBe(0);
      expect(profile.likedArtists).toHaveLength(0);
      expect(profile.dislikedArtists).toHaveLength(0);
      expect(profile.feedbackRatio).toBe(0);
    });
  });

  describe('getLikedArtists', () => {
    it('should return top liked artists up to limit', async () => {
      const artists = await getLikedArtists('user123', 1);

      expect(artists).toHaveLength(1);
      expect(artists[0]).toEqual({ artist: 'The Beatles', count: 2 });
    });

    it('should default to limit of 10', async () => {
      const artists = await getLikedArtists('user123');

      expect(artists).toHaveLength(2); // Only 2 unique liked artists in mock data
    });
  });

  describe('getDislikedArtists', () => {
    it('should return top disliked artists up to limit', async () => {
      const artists = await getDislikedArtists('user123', 5);

      expect(artists).toHaveLength(1); // Only 1 unique disliked artist in mock data
      expect(artists[0]).toEqual({ artist: 'Nickelback', count: 2 });
    });
  });

  describe('getListeningPatterns', () => {
    it('should detect when user has enough data', async () => {
      const patterns = await getListeningPatterns('user123');

      expect(patterns.hasEnoughData).toBe(true); // 5 feedback entries
    });

    it('should detect when user does not have enough data', async () => {
      mockFeedbackData = mockFeedbackData.slice(0, 3); // Only 3 entries

      const patterns = await getListeningPatterns('user123');

      expect(patterns.hasEnoughData).toBe(false);
      expect(patterns.insights).toContain('Not enough feedback data yet. Keep rating songs to improve recommendations!');
    });

    it('should identify preferred artists', async () => {
      const patterns = await getListeningPatterns('user123');

      expect(patterns.preferredArtists).toContain('The Beatles');
      expect(patterns.preferredArtists).toContain('Queen');
    });

    it('should identify avoided artists', async () => {
      const patterns = await getListeningPatterns('user123');

      expect(patterns.avoidedArtists).toContain('Nickelback');
    });

    it('should generate positive taste insight for high feedback ratio', async () => {
      mockFeedbackData = mockFeedbackData.filter(f => f.feedbackType === 'thumbs_up'); // All positive
      // Add 2 more to reach minimum threshold of 5
      mockFeedbackData.push(
        {
          id: '6',
          userId: 'user123',
          songArtistTitle: 'Good Song 1 - Title',
          feedbackType: 'thumbs_up',
          timestamp: new Date(),
          source: 'recommendation',
          recommendationCacheId: null,
        },
        {
          id: '7',
          userId: 'user123',
          songArtistTitle: 'Good Song 2 - Title',
          feedbackType: 'thumbs_up',
          timestamp: new Date(),
          source: 'recommendation',
          recommendationCacheId: null,
        }
      );

      const patterns = await getListeningPatterns('user123');

      expect(patterns.insights.some(i => i.includes('positive taste'))).toBe(true);
    });

    it('should generate selective taste insight for low feedback ratio', async () => {
      mockFeedbackData = mockFeedbackData.filter(f => f.feedbackType === 'thumbs_down'); // All negative
      // Add 2 more to reach minimum threshold
      mockFeedbackData.push(
        {
          id: '6',
          userId: 'user123',
          songArtistTitle: 'Bad Song 1 - Title',
          feedbackType: 'thumbs_down',
          timestamp: new Date(),
          source: 'recommendation',
          recommendationCacheId: null,
        },
        {
          id: '7',
          userId: 'user123',
          songArtistTitle: 'Bad Song 2 - Title',
          feedbackType: 'thumbs_down',
          timestamp: new Date(),
          source: 'recommendation',
          recommendationCacheId: null,
        },
        {
          id: '8',
          userId: 'user123',
          songArtistTitle: 'Bad Song 3 - Title',
          feedbackType: 'thumbs_down',
          timestamp: new Date(),
          source: 'recommendation',
          recommendationCacheId: null,
        }
      );

      const patterns = await getListeningPatterns('user123');

      expect(patterns.insights.some(i => i.includes('selective taste'))).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache for specific user', async () => {
      const profile1 = await buildUserPreferenceProfile('user123');
      clearPreferenceCache('user123');
      const profile2 = await buildUserPreferenceProfile('user123');

      // Should be different objects (not cached)
      expect(profile1).not.toBe(profile2);
    });

    it('should clear all caches', async () => {
      await buildUserPreferenceProfile('user123');
      await buildUserPreferenceProfile('user456');

      clearAllPreferenceCaches();

      const profile1 = await buildUserPreferenceProfile('user123');
      const profile2 = await buildUserPreferenceProfile('user456');

      // Both should be fresh (not from cache)
      expect(profile1).toBeDefined();
      expect(profile2).toBeDefined();
    });
  });
});
