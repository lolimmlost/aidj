/**
 * Tests for Recommendation Analytics Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../db';
import { recommendationFeedback } from '../../db/schema';
import {
  getTasteEvolutionTimeline,
  getRecommendationQualityMetrics,
  getActivityTrends,
  getDiscoveryInsights,
  clearAnalyticsCache,
} from '../recommendation-analytics';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('Recommendation Analytics Service', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalyticsCache();
  });

  describe('getTasteEvolutionTimeline', () => {
    it('should return empty timeline when no feedback exists', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getTasteEvolutionTimeline(mockUserId, 30);

      expect(result.dataPoints).toHaveLength(0);
      expect(result.periodType).toBe('week');
    });

    it('should group feedback by week for 30-day period', async () => {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const mockFeedback = [
        {
          id: '1',
          userId: mockUserId,
          songArtistTitle: 'Artist A - Song 1',
          feedbackType: 'thumbs_up',
          timestamp: now,
          source: 'recommendation',
          recommendationCacheId: null,
        },
        {
          id: '2',
          userId: mockUserId,
          songArtistTitle: 'Artist B - Song 2',
          feedbackType: 'thumbs_down',
          timestamp: weekAgo,
          source: 'recommendation',
          recommendationCacheId: null,
        },
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getTasteEvolutionTimeline(mockUserId, 30);

      expect(result.periodType).toBe('week');
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });

    it('should use monthly periods for 365-day range', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getTasteEvolutionTimeline(mockUserId, 365);

      expect(result.periodType).toBe('month');
    });

    it('should cache results for 1 hour', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      await getTasteEvolutionTimeline(mockUserId, 30);
      await getTasteEvolutionTimeline(mockUserId, 30);

      // Should only call DB once due to caching
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRecommendationQualityMetrics', () => {
    it('should return zero metrics when no feedback exists', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getRecommendationQualityMetrics(mockUserId);

      expect(result.totalRecommendations).toBe(0);
      expect(result.acceptanceRate).toBe(0);
      expect(result.qualityTrend).toBe('stable');
    });

    it('should calculate acceptance rate correctly', async () => {
      const mockFeedback = [
        { feedbackType: 'thumbs_up', timestamp: new Date() },
        { feedbackType: 'thumbs_up', timestamp: new Date() },
        { feedbackType: 'thumbs_up', timestamp: new Date() },
        { feedbackType: 'thumbs_down', timestamp: new Date() },
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getRecommendationQualityMetrics(mockUserId);

      expect(result.totalRecommendations).toBe(4);
      expect(result.thumbsUpCount).toBe(3);
      expect(result.thumbsDownCount).toBe(1);
      expect(result.acceptanceRate).toBe(0.75);
    });

    it('should detect improving quality trend', async () => {
      const mockFeedback = [
        // Older feedback - lower acceptance
        { feedbackType: 'thumbs_down', timestamp: new Date('2024-01-01') },
        { feedbackType: 'thumbs_down', timestamp: new Date('2024-01-02') },
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-01-03') },
        { feedbackType: 'thumbs_down', timestamp: new Date('2024-01-04') },
        { feedbackType: 'thumbs_down', timestamp: new Date('2024-01-05') },
        // Recent feedback - higher acceptance
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-02-01') },
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-02-02') },
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-02-03') },
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-02-04') },
        { feedbackType: 'thumbs_up', timestamp: new Date('2024-02-05') },
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getRecommendationQualityMetrics(mockUserId);

      expect(result.qualityTrend).toBe('improving');
    });
  });

  describe('getActivityTrends', () => {
    it('should return empty trends when no feedback exists', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getActivityTrends(mockUserId);

      expect(result.totalFeedbackCount).toBe(0);
      expect(result.peakDayOfWeek).toBeNull();
      expect(result.peakHourOfDay).toBeNull();
    });

    it('should identify peak day and hour correctly', async () => {
      // Create feedback for Monday at 14:00 (most frequent)
      const monday14 = new Date('2024-01-15T14:30:00'); // Monday
      const mockFeedback = [
        { timestamp: monday14 },
        { timestamp: monday14 },
        { timestamp: monday14 },
        { timestamp: new Date('2024-01-16T10:00:00') }, // Tuesday
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getActivityTrends(mockUserId);

      expect(result.peakDayOfWeek).toBe(1); // Monday
      expect(result.peakHourOfDay).toBe(14); // 2 PM
      expect(result.totalFeedbackCount).toBe(4);
    });

    it('should generate listening pattern insights', async () => {
      const saturdayNight = new Date('2024-01-20T20:00:00'); // Saturday evening
      const mockFeedback = [
        { timestamp: saturdayNight },
        { timestamp: saturdayNight },
        { timestamp: new Date('2024-01-21T20:00:00') }, // Sunday evening
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getActivityTrends(mockUserId);

      expect(result.listeningPatternInsights.length).toBeGreaterThan(0);
      expect(result.listeningPatternInsights.some(i => i.includes('evening'))).toBe(true);
    });
  });

  describe('getDiscoveryInsights', () => {
    it('should return zero discoveries when no feedback exists', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getDiscoveryInsights(mockUserId, 30);

      expect(result.newArtistsDiscovered).toBe(0);
      expect(result.genreDiversityScore).toBe(0);
      expect(result.diversityTrend).toBe('stable');
    });

    it('should identify new artists discovered', async () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

      const mockFeedback = [
        // Historical: Artist A
        {
          songArtistTitle: 'Artist A - Song 1',
          feedbackType: 'thumbs_up',
          timestamp: twoMonthsAgo,
        },
        // Recent: Artist B (new)
        {
          songArtistTitle: 'Artist B - Song 2',
          feedbackType: 'thumbs_up',
          timestamp: now,
        },
        // Recent: Artist C (new)
        {
          songArtistTitle: 'Artist C - Song 3',
          feedbackType: 'thumbs_up',
          timestamp: now,
        },
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getDiscoveryInsights(mockUserId, 30);

      expect(result.newArtistsDiscovered).toBe(2); // Artist B and C
      expect(result.newArtistNames).toContain('Artist B');
      expect(result.newArtistNames).toContain('Artist C');
    });

    it('should calculate diversity score using Shannon entropy', async () => {
      const now = new Date();
      const mockFeedback = [
        // Diverse: 3 different artists, equal distribution
        { songArtistTitle: 'Artist A - Song 1', feedbackType: 'thumbs_up', timestamp: now },
        { songArtistTitle: 'Artist B - Song 2', feedbackType: 'thumbs_up', timestamp: now },
        { songArtistTitle: 'Artist C - Song 3', feedbackType: 'thumbs_up', timestamp: now },
      ];

      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockFeedback),
      };
      (db.select as any).mockReturnValue(mockDb);

      const result = await getDiscoveryInsights(mockUserId, 30);

      // High diversity (equal distribution) should be close to 1.0
      expect(result.genreDiversityScore).toBeGreaterThan(0.9);
    });
  });

  describe('Cache management', () => {
    it('should clear user-specific cache', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockDb);

      await getTasteEvolutionTimeline(mockUserId, 30);
      clearAnalyticsCache(mockUserId);
      await getTasteEvolutionTimeline(mockUserId, 30);

      // Should call DB twice (cache cleared)
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });
});
