/**
 * Temporal Utilities Tests
 * Story 3.11: Task 7.1 - Unit tests for temporal functions
 */

import { describe, it, expect } from 'vitest';
import {
  extractTemporalMetadata,
  getSeason,
  getCurrentSeason,
  getSeasonalKeywords,
  getSeasonDisplay,
  getMonthName,
} from '../temporal';

describe('Temporal Utilities', () => {
  describe('extractTemporalMetadata', () => {
    it('should extract correct temporal metadata from a date', () => {
      const date = new Date('2024-10-15T14:30:00'); // October 15, 2024, 2:30 PM
      const metadata = extractTemporalMetadata(date);

      expect(metadata.month).toBe(10);
      expect(metadata.season).toBe('fall');
      expect(metadata.hourOfDay).toBe(14);
      // dayOfWeek depends on what day of week Oct 15, 2024 is
      expect(metadata.dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(metadata.dayOfWeek).toBeLessThanOrEqual(7);
    });

    it('should handle Sunday as day 7', () => {
      const sunday = new Date('2024-10-13T10:00:00'); // Sunday
      const metadata = extractTemporalMetadata(sunday);
      expect(metadata.dayOfWeek).toBe(7);
    });

    it('should handle Monday as day 1', () => {
      const monday = new Date('2024-10-14T10:00:00'); // Monday
      const metadata = extractTemporalMetadata(monday);
      expect(metadata.dayOfWeek).toBe(1);
    });
  });

  describe('getSeason', () => {
    it('should return spring for March-May', () => {
      expect(getSeason(3)).toBe('spring');
      expect(getSeason(4)).toBe('spring');
      expect(getSeason(5)).toBe('spring');
    });

    it('should return summer for June-August', () => {
      expect(getSeason(6)).toBe('summer');
      expect(getSeason(7)).toBe('summer');
      expect(getSeason(8)).toBe('summer');
    });

    it('should return fall for September-November', () => {
      expect(getSeason(9)).toBe('fall');
      expect(getSeason(10)).toBe('fall');
      expect(getSeason(11)).toBe('fall');
    });

    it('should return winter for December-February', () => {
      expect(getSeason(12)).toBe('winter');
      expect(getSeason(1)).toBe('winter');
      expect(getSeason(2)).toBe('winter');
    });
  });

  describe('getSeasonalKeywords', () => {
    it('should return Halloween keywords for October', () => {
      const keywords = getSeasonalKeywords(10);
      expect(keywords).toContain('Halloween');
      expect(keywords).toContain('spooky');
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should return holiday keywords for December', () => {
      const keywords = getSeasonalKeywords(12);
      expect(keywords).toContain('holiday');
      expect(keywords).toContain('festive');
    });

    it('should return summer keywords for July', () => {
      const keywords = getSeasonalKeywords(7);
      expect(keywords).toContain('summer');
      expect(keywords).toContain('beach vibes');
    });

    it('should return empty array for months without special keywords', () => {
      const keywords = getSeasonalKeywords(3);
      expect(keywords).toEqual([]);
    });
  });

  describe('getSeasonDisplay', () => {
    it('should return formatted season names with emojis', () => {
      expect(getSeasonDisplay('spring')).toContain('Spring');
      expect(getSeasonDisplay('summer')).toContain('Summer');
      expect(getSeasonDisplay('fall')).toContain('Fall');
      expect(getSeasonDisplay('winter')).toContain('Winter');
    });
  });

  describe('getMonthName', () => {
    it('should return correct month names', () => {
      expect(getMonthName(1)).toBe('January');
      expect(getMonthName(6)).toBe('June');
      expect(getMonthName(12)).toBe('December');
    });

    it('should handle invalid month numbers', () => {
      expect(getMonthName(0)).toBe('Unknown');
      expect(getMonthName(13)).toBe('Unknown');
    });
  });

  describe('getCurrentSeason', () => {
    it('should return a valid season', () => {
      const season = getCurrentSeason();
      expect(['spring', 'summer', 'fall', 'winter']).toContain(season);
    });
  });
});
