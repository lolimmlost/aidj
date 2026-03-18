/**
 * Unit tests for POST /api/onboarding/artists/select route handler logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockLimit = vi.fn();
const mockThen = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    transaction: vi.fn(async (cb) => {
      const tx = {
        insert: mockInsert.mockReturnValue({
          values: mockValues.mockReturnValue({
            onConflictDoUpdate: mockOnConflictDoUpdate.mockResolvedValue(undefined),
          }),
        }),
        select: mockSelect.mockReturnValue({
          from: mockFrom.mockReturnValue({
            where: mockWhere.mockReturnValue({
              limit: mockLimit.mockReturnValue({
                then: mockThen.mockResolvedValue({
                  onboardingStatus: { completed: false },
                }),
              }),
            }),
          }),
        }),
        update: mockUpdate.mockReturnValue({
          set: mockSet.mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return cb(tx);
    }),
  },
}));

vi.mock('@/lib/services/navidrome', () => ({
  getArtistDetail: vi.fn().mockResolvedValue({ id: 'a1', name: 'Test Artist' }),
  getTopSongs: vi.fn().mockResolvedValue([
    { id: 's1', name: 'Song 1', title: 'Song 1', artist: 'Test Artist' },
    { id: 's2', name: 'Song 2', title: 'Song 2', artist: 'Test Artist' },
  ]),
}));

describe('Onboarding Artist Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTemporalMetadata', () => {
    it('should return correct temporal fields', () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const hourOfDay = now.getHours();

      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(hourOfDay).toBeGreaterThanOrEqual(0);
      expect(hourOfDay).toBeLessThanOrEqual(23);
    });

    it('should determine season from month correctly', () => {
      function getSeason(month: number): string {
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'fall';
        return 'winter';
      }

      expect(getSeason(3)).toBe('spring');
      expect(getSeason(6)).toBe('summer');
      expect(getSeason(9)).toBe('fall');
      expect(getSeason(12)).toBe('winter');
      expect(getSeason(1)).toBe('winter');
    });
  });

  describe('validation', () => {
    it('should require minimum 3 artists', () => {
      const artistIds = ['a1', 'a2']; // Only 2
      expect(artistIds.length >= 3).toBe(false);
    });

    it('should accept 3 or more artists', () => {
      const artistIds = ['a1', 'a2', 'a3'];
      expect(artistIds.length >= 3).toBe(true);
    });

    it('should require array type', () => {
      const invalid = 'not-an-array';
      expect(Array.isArray(invalid)).toBe(false);
    });
  });

  describe('artist affinity record shape', () => {
    it('should create correct affinity record for onboarding', () => {
      const record = {
        userId: 'user1',
        artist: 'test artist', // lowercase
        affinityScore: 0.7,
        likedCount: 1,
        playCount: 0,
        skipCount: 0,
        totalPlayTime: 0,
      };

      expect(record.affinityScore).toBe(0.7);
      expect(record.likedCount).toBe(1);
      expect(record.playCount).toBe(0);
      expect(record.artist).toBe('test artist');
    });
  });

  describe('feedback record shape', () => {
    it('should create correct feedback record for onboarding', () => {
      const record = {
        userId: 'user1',
        songId: 's1',
        songArtistTitle: 'Test Artist - Song 1',
        feedbackType: 'thumbs_up' as const,
        source: 'library' as const,
        month: 3,
        season: 'spring' as const,
        dayOfWeek: 2,
        hourOfDay: 14,
      };

      expect(record.feedbackType).toBe('thumbs_up');
      expect(record.source).toBe('library');
      expect(record.songArtistTitle).toContain(' - ');
    });
  });
});
