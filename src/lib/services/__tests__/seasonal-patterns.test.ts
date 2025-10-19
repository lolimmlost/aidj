/**
 * Seasonal Pattern Detection Tests
 * Story 3.11: Task 7.1 - Unit tests for seasonal pattern detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectSeasonalPreferences,
  analyzeMonthlyFeedback,
  getCurrentSeasonalPattern,
  hasSeasonalPatterns,
} from '../seasonal-patterns';
import { db } from '../../db';
import { recommendationFeedback } from '../../db/schema';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  },
}));

describe('Seasonal Pattern Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectSeasonalPreferences', () => {
    it('should return empty patterns when insufficient feedback', async () => {
      // Mock database to return 5 feedback items (below MIN_FEEDBACK_THRESHOLD of 10)
      const mockFeedback = Array(5).fill(null).map((_, i) => ({
        id: `fb-${i}`,
        userId: 'user1',
        songArtistTitle: `Artist ${i} - Song ${i}`,
        feedbackType: 'thumbs_up' as const,
        season: 'fall' as const,
        timestamp: new Date(),
        month: 10,
        dayOfWeek: 1,
        hourOfDay: 12,
      }));

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      } as any);

      const result = await detectSeasonalPreferences('user1');

      expect(result.patterns).toHaveLength(0);
      expect(result.userId).toBe('user1');
    });

    it('should detect patterns when sufficient feedback exists', async () => {
      // Mock database to return 20 feedback items (above threshold)
      const mockFeedback = Array(20).fill(null).map((_, i) => ({
        id: `fb-${i}`,
        userId: 'user1',
        songArtistTitle: `Horror Band ${i % 3} - Spooky Song ${i}`,
        feedbackType: 'thumbs_up' as const,
        season: 'fall' as const,
        timestamp: new Date(),
        month: 10,
        dayOfWeek: 1,
        hourOfDay: 12,
      }));

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      } as any);

      const result = await detectSeasonalPreferences('user1');

      expect(result.patterns.length).toBeGreaterThan(0);
      const fallPattern = result.patterns.find(p => p.season === 'fall');
      expect(fallPattern).toBeDefined();
      if (fallPattern) {
        expect(fallPattern.thumbsUpCount).toBe(20);
        expect(fallPattern.totalFeedback).toBe(20);
        expect(fallPattern.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeMonthlyFeedback', () => {
    it('should return null for months with insufficient data', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await analyzeMonthlyFeedback('user1', 10);
      expect(result).toBeNull();
    });

    it('should extract top artists from monthly feedback', async () => {
      const mockFeedback = Array(15).fill(null).map((_, i) => ({
        id: `fb-${i}`,
        userId: 'user1',
        songArtistTitle: `Artist ${i % 3} - Song ${i}`,
        feedbackType: 'thumbs_up' as const,
        season: 'fall' as const,
        month: 10,
        timestamp: new Date(),
        dayOfWeek: 1,
        hourOfDay: 12,
      }));

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      } as any);

      const result = await analyzeMonthlyFeedback('user1', 10);

      expect(result).toBeDefined();
      if (result) {
        expect(result.preferredArtists).toContain('Artist 0');
        expect(result.month).toBe(10);
        expect(result.season).toBe('fall');
      }
    });
  });

  describe('hasSeasonalPatterns', () => {
    it('should return false when no patterns detected', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await hasSeasonalPatterns('user1');
      expect(result).toBe(false);
    });

    it('should return true when patterns exist', async () => {
      const mockFeedback = Array(20).fill(null).map((_, i) => ({
        id: `fb-${i}`,
        userId: 'user1',
        songArtistTitle: `Artist ${i} - Song ${i}`,
        feedbackType: 'thumbs_up' as const,
        season: 'fall' as const,
        month: 10,
        timestamp: new Date(),
        dayOfWeek: 1,
        hourOfDay: 12,
      }));

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      } as any);

      const result = await hasSeasonalPatterns('user1');
      expect(result).toBe(true);
    });
  });
});
