/**
 * Seasonal Pattern Detection Tests
 * Story 3.11: Task 7.1 - Unit tests for seasonal pattern detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectSeasonalPreferences,
  analyzeMonthlyFeedback,
  hasSeasonalPatterns,
} from '../seasonal-patterns';
import { db } from '../../db';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(),
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

      // Each db.select() call returns a new chain that resolves to mockFeedback
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
      } as any));

      const result = await detectSeasonalPreferences('user1');

      expect(result.patterns).toHaveLength(0);
      expect(result.userId).toBe('user1');
    });

    it('should detect patterns when sufficient feedback exists', async () => {
      // detectSeasonalPreferences queries each season separately
      // Need 50+ items with high thumbs up ratio to pass confidence threshold (0.7)
      const createMockFeedback = (season: string, count: number) =>
        Array(count).fill(null).map((_, i) => ({
          id: `fb-${season}-${i}`,
          userId: 'user1',
          songArtistTitle: `Horror Band ${i % 3} - Spooky Song ${i}`,
          feedbackType: 'thumbs_up' as const,
          season,
          timestamp: new Date(),
          month: 10,
          dayOfWeek: 1,
          hourOfDay: 12,
        }));

      // Track which query we're on (seasons: spring, summer, fall, winter)
      let queryCallCount = 0;

      // Each db.select() call must return a fresh chain
      vi.mocked(db.select).mockImplementation(() => {
        queryCallCount++;
        const currentQuery = queryCallCount;

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(
              // fall is the 3rd season queried - use 50+ items for confidence >= 0.7
              currentQuery === 3 ? createMockFeedback('fall', 50) : []
            ),
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
        } as any;
      });

      const result = await detectSeasonalPreferences('user1');

      expect(result.patterns.length).toBeGreaterThan(0);
      const fallPattern = result.patterns.find(p => p.season === 'fall');
      expect(fallPattern).toBeDefined();
      if (fallPattern) {
        expect(fallPattern.thumbsUpCount).toBe(50);
        expect(fallPattern.totalFeedback).toBe(50);
        expect(fallPattern.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });
  });

  describe('analyzeMonthlyFeedback', () => {
    it('should return null for months with insufficient data', async () => {
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
      } as any));

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

      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockFeedback),
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
      } as any));

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
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
      } as any));

      const result = await hasSeasonalPatterns('user1');
      expect(result).toBe(false);
    });

    it('should return true when patterns exist', async () => {
      // Need 50+ items with high thumbs up ratio to pass confidence threshold (0.7)
      const createMockFeedback = (season: string, count: number) =>
        Array(count).fill(null).map((_, i) => ({
          id: `fb-${season}-${i}`,
          userId: 'user1',
          songArtistTitle: `Artist ${i} - Song ${i}`,
          feedbackType: 'thumbs_up' as const,
          season,
          month: 10,
          timestamp: new Date(),
          dayOfWeek: 1,
          hourOfDay: 12,
        }));

      // Track which query we're on (seasons: spring, summer, fall, winter)
      let queryCallCount = 0;

      // Each db.select() call must return a fresh chain
      vi.mocked(db.select).mockImplementation(() => {
        queryCallCount++;
        const currentQuery = queryCallCount;

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(
              // summer is the 2nd season queried - use 50+ items for confidence >= 0.7
              currentQuery === 2 ? createMockFeedback('summer', 50) : []
            ),
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock for complex drizzle query chain
        } as any;
      });

      const result = await hasSeasonalPatterns('user1');
      expect(result).toBe(true);
    });
  });
});
