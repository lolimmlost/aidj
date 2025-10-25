import { describe, it, expect } from 'vitest';
import { calculateGenreSimilarity, rankRecommendations } from '../genre-matcher';
import type { LibraryProfile } from '@/lib/db/schema';

describe('Genre Matcher Service', () => {
  const mockLibraryProfile: LibraryProfile = {
    id: 'profile1',
    userId: 'user1',
    genreDistribution: {
      Rock: 0.4,
      Electronic: 0.25,
      Jazz: 0.2,
      'Hip-Hop': 0.15,
    },
    topKeywords: ['psychedelic', 'indie', 'alternative', 'experimental', 'underground'],
    totalSongs: 250,
    lastAnalyzed: new Date(),
    refreshNeeded: false,
  };

  describe('calculateGenreSimilarity', () => {
    it('should return high score for exact genre match', () => {
      const recommendation = {
        song: 'Pink Floyd - Comfortably Numb',
        explanation: 'A classic rock masterpiece with psychedelic elements',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should match "rock" and "psychedelic" keywords
      expect(score).toBeGreaterThan(0.15);
    });

    it('should return medium score for partial match', () => {
      const recommendation = {
        song: 'Daft Punk - Get Lucky',
        explanation: 'An electronic dance hit with funk influences',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should match "electronic" genre
      expect(score).toBeGreaterThan(0.05);
      expect(score).toBeLessThan(0.5);
    });

    it('should return low score for no match', () => {
      const recommendation = {
        song: 'Taylor Swift - Shake It Off',
        explanation: 'A catchy pop anthem perfect for dancing',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Pop is not in library genres
      expect(score).toBeLessThan(0.3);
    });

    it('should detect genres in recommendation text', () => {
      const recommendation = {
        song: 'Miles Davis - So What',
        explanation: 'Essential jazz album showcasing modal improvisation',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should detect "jazz" in explanation
      expect(score).toBeGreaterThan(0.1);
    });

    it('should match keywords from library profile', () => {
      const recommendation = {
        song: 'Tame Impala - Let It Happen',
        explanation: 'Psychedelic indie rock with experimental production',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should match multiple keywords: "psychedelic", "indie", "experimental"
      expect(score).toBeGreaterThan(0.2);
    });

    it('should handle recommendations with multiple genre matches', () => {
      const recommendation = {
        song: 'Radiohead - Paranoid Android',
        explanation: 'Alternative rock with electronic and experimental elements',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should match "rock", "electronic", "experimental", "alternative"
      expect(score).toBeGreaterThan(0.2);
    });

    it('should return 0 for empty genre distribution', () => {
      const emptyProfile: LibraryProfile = {
        ...mockLibraryProfile,
        genreDistribution: {},
      };

      const recommendation = {
        song: 'Test - Song',
        explanation: 'Rock music',
      };

      const score = calculateGenreSimilarity(emptyProfile, recommendation);

      expect(score).toBe(0);
    });

    it('should handle case-insensitive matching', () => {
      const recommendation = {
        song: 'The Beatles - A Day in the Life',
        explanation: 'PSYCHEDELIC ROCK masterpiece',
      };

      const score = calculateGenreSimilarity(mockLibraryProfile, recommendation);

      // Should match regardless of case
      expect(score).toBeGreaterThan(0.15);
    });
  });

  describe('rankRecommendations', () => {
    const mockRecommendations = [
      {
        song: 'Pink Floyd - Comfortably Numb',
        explanation: 'Classic psychedelic rock',
      },
      {
        song: 'Taylor Swift - Shake It Off',
        explanation: 'Pop anthem',
      },
      {
        song: 'Daft Punk - Get Lucky',
        explanation: 'Electronic funk',
      },
      {
        song: 'Miles Davis - So What',
        explanation: 'Jazz masterpiece',
      },
      {
        song: 'Radiohead - Paranoid Android',
        explanation: 'Alternative rock with electronic elements',
      },
    ];

    it('should filter out recommendations below threshold', () => {
      const ranked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.15);

      // Taylor Swift (pop) should be filtered out (score < 0.15)
      expect(ranked.length).toBeLessThan(mockRecommendations.length);
      expect(ranked.some(r => r.song.includes('Taylor Swift'))).toBe(false);
    });

    it('should sort recommendations by score descending', () => {
      const ranked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.1);

      // Scores should be in descending order
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].genreScore).toBeGreaterThanOrEqual(ranked[i].genreScore);
      }
    });

    it('should include genreScore in results', () => {
      const ranked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.05);

      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].genreScore).toBeDefined();
      expect(ranked[0].genreScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0].genreScore).toBeLessThanOrEqual(1);
    });

    it('should preserve song and explanation fields', () => {
      const ranked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.05);

      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].song).toBeDefined();
      expect(ranked[0].explanation).toBeDefined();
    });

    it('should handle custom threshold', () => {
      const strictRanked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.6);
      const lenientRanked = rankRecommendations(mockLibraryProfile, mockRecommendations, 0.2);

      // Strict threshold should filter more
      expect(strictRanked.length).toBeLessThan(lenientRanked.length);
    });

    it('should return empty array when all recommendations below threshold', () => {
      const recommendations = [
        { song: 'Song 1', explanation: 'Country music' },
        { song: 'Song 2', explanation: 'Death metal' },
      ];

      const ranked = rankRecommendations(mockLibraryProfile, recommendations, 0.8);

      // Country and death metal shouldn't match the profile well
      expect(ranked.length).toBe(0);
    });

    it('should handle empty recommendations array', () => {
      const ranked = rankRecommendations(mockLibraryProfile, [], 0.3);

      expect(ranked).toEqual([]);
    });
  });
});
