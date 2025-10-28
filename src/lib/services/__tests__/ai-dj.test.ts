// AI DJ Service Tests
// Story 3.9: AI DJ Toggle Mode

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkQueueThreshold,
  checkCooldown,
  generateContextualRecommendations,
  prepareAIDJQueueMetadata,
  type AIContext,
} from '../ai-dj';
import * as ollamaService from '../ollama';
import * as genreMatcher from '../genre-matcher';
import * as libraryProfile from '../library-profile';
import * as navidromeService from '../navidrome';

// Mock dependencies
vi.mock('../ollama');
vi.mock('../genre-matcher');
vi.mock('../library-profile');
vi.mock('../navidrome');
vi.mock('../preferences', () => ({
  buildUserPreferenceProfile: vi.fn(),
  getListeningPatterns: vi.fn(),
}));
vi.mock('../../db', () => ({
  db: vi.fn(),
}));

describe('AI DJ Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkQueueThreshold', () => {
    it('should return true when queue has exactly threshold songs remaining', () => {
      expect(checkQueueThreshold(5, 8, 2)).toBe(true); // 8 - 5 - 1 = 2 remaining
    });

    it('should return true when queue has less than threshold songs remaining', () => {
      expect(checkQueueThreshold(9, 10, 2)).toBe(true); // 10 - 9 - 1 = 0 remaining
    });

    it('should return false when queue has more than threshold songs remaining', () => {
      expect(checkQueueThreshold(0, 10, 2)).toBe(false); // 10 - 0 - 1 = 9 remaining
    });

    it('should handle threshold of 1 song', () => {
      expect(checkQueueThreshold(8, 10, 1)).toBe(true); // 10 - 8 - 1 = 1 remaining
      expect(checkQueueThreshold(7, 10, 1)).toBe(false); // 10 - 7 - 1 = 2 remaining
    });

    it('should handle threshold of 5 songs', () => {
      expect(checkQueueThreshold(4, 10, 5)).toBe(true); // 10 - 4 - 1 = 5 remaining
      expect(checkQueueThreshold(3, 10, 5)).toBe(false); // 10 - 3 - 1 = 6 remaining
    });

    it('should handle empty queue (0 remaining)', () => {
      expect(checkQueueThreshold(0, 1, 2)).toBe(true); // 1 - 0 - 1 = 0 remaining
    });

    it('should handle single song in queue', () => {
      expect(checkQueueThreshold(0, 1, 1)).toBe(true); // 1 - 0 - 1 = 0 remaining
      expect(checkQueueThreshold(0, 1, 5)).toBe(true); // 1 - 0 - 1 = 0 remaining
    });
  });

  describe('checkCooldown', () => {
    it('should return true when cooldown has passed', () => {
      const now = Date.now();
      const lastQueueTime = now - 31000; // 31 seconds ago
      expect(checkCooldown(lastQueueTime, 30000)).toBe(true);
    });

    it('should return true when cooldown is exactly met', () => {
      const now = Date.now();
      const lastQueueTime = now - 30000; // 30 seconds ago
      expect(checkCooldown(lastQueueTime, 30000)).toBe(true);
    });

    it('should return false when cooldown has not passed', () => {
      const now = Date.now();
      const lastQueueTime = now - 15000; // 15 seconds ago
      expect(checkCooldown(lastQueueTime, 30000)).toBe(false);
    });

    it('should return false when last queue was very recent', () => {
      const now = Date.now();
      const lastQueueTime = now - 1000; // 1 second ago
      expect(checkCooldown(lastQueueTime, 30000)).toBe(false);
    });

    it('should return true when lastQueueTime is 0 (first run)', () => {
      expect(checkCooldown(0, 30000)).toBe(true);
    });

    it('should handle custom cooldown periods', () => {
      const now = Date.now();
      const lastQueueTime61 = now - 61000; // 61 seconds ago
      const lastQueueTime59 = now - 59000; // 59 seconds ago
      expect(checkCooldown(lastQueueTime61, 60000)).toBe(true); // 61s ago, 60s cooldown = passed
      expect(checkCooldown(lastQueueTime59, 60000)).toBe(false); // 59s ago, 60s cooldown = not passed
    });
  });

  describe('generateContextualRecommendations', () => {
    const mockCurrentSong = {
      id: '1',
      name: 'Test Song',
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      albumId: 'album-1',
      duration: 180,
      track: 1,
      url: '/stream/1',
    };

    const mockRecentQueue = [
      {
        id: '2',
        name: 'Recent Song 1',
        title: 'Recent Song 1',
        artist: 'Artist 1',
        albumId: 'album-2',
        duration: 200,
        track: 1,
        url: '/stream/2',
      },
      {
        id: '3',
        name: 'Recent Song 2',
        title: 'Recent Song 2',
        artist: 'Artist 2',
        albumId: 'album-3',
        duration: 190,
        track: 2,
        url: '/stream/3',
      },
    ];

    const mockContext: AIContext = {
      currentSong: mockCurrentSong,
      recentQueue: mockRecentQueue,
    };

    it('should generate recommendations based on current song context', async () => {
      const mockRecommendations = {
        recommendations: [
          { song: 'Recommended Song 1', explanation: 'Similar genre' },
          { song: 'Recommended Song 2', explanation: 'Similar artist' },
        ],
      };

      const mockLibrarySongs = [
        { ...mockCurrentSong, id: 'rec-1', name: 'Recommended Song 1' },
        { ...mockCurrentSong, id: 'rec-2', name: 'Recommended Song 2' },
      ];

      vi.mocked(ollamaService.generateRecommendations).mockResolvedValue(mockRecommendations);
      vi.mocked(navidromeService.getSongsGlobal).mockResolvedValue(mockLibrarySongs);

      const result = await generateContextualRecommendations(mockContext, 2);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Recommended Song 1');
      expect(result[1].name).toBe('Recommended Song 2');
      expect(ollamaService.generateRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Test Song'),
          useFeedbackForPersonalization: true,
        })
      );
    });

    it('should apply genre filtering when user ID is provided', async () => {
      const mockRecommendations = {
        recommendations: [
          { song: 'Recommended Song 1', explanation: 'Rock song', genreScore: 0.8 },
          { song: 'Recommended Song 2', explanation: 'Pop song', genreScore: 0.3 },
        ],
      };

      const mockLibraryProfile = {
        userId: 'user-1',
        topGenres: ['Rock'],
      };

      const mockLibrarySongs = [
        { ...mockCurrentSong, id: 'rec-1', name: 'Recommended Song 1' },
      ];

      vi.mocked(ollamaService.generateRecommendations).mockResolvedValue(mockRecommendations);
      vi.mocked(libraryProfile.getOrCreateLibraryProfile).mockResolvedValue(mockLibraryProfile as any);
      vi.mocked(genreMatcher.rankRecommendations).mockResolvedValue([
        { song: 'Recommended Song 1', explanation: 'Rock song', genreScore: 0.8 },
      ]);
      vi.mocked(navidromeService.getSongsGlobal).mockResolvedValue(mockLibrarySongs);

      const result = await generateContextualRecommendations(
        mockContext,
        2,
        'user-1',
        true
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Recommended Song 1');
      expect(libraryProfile.getOrCreateLibraryProfile).toHaveBeenCalledWith('user-1');
      expect(genreMatcher.rankRecommendations).toHaveBeenCalled();
    });

    it('should handle Ollama timeout error', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      vi.mocked(ollamaService.generateRecommendations).mockRejectedValue(abortError);

      await expect(
        generateContextualRecommendations(mockContext, 2)
      ).rejects.toThrow(/timeout|timed out|abort/i);
    });

    it('should handle no recommendations returned', async () => {
      vi.mocked(ollamaService.generateRecommendations).mockResolvedValue({
        recommendations: [],
      });

      await expect(
        generateContextualRecommendations(mockContext, 2)
      ).rejects.toThrow(/could not generate/i);
    });

    it('should handle song matching failures gracefully', async () => {
      const mockRecommendations = {
        recommendations: [
          { song: 'Nonexistent Song', explanation: 'Does not exist' },
        ],
      };

      vi.mocked(ollamaService.generateRecommendations).mockResolvedValue(mockRecommendations);
      vi.mocked(navidromeService.getSongsGlobal).mockResolvedValue([]); // No songs found

      await expect(
        generateContextualRecommendations(mockContext, 2)
      ).rejects.toThrow(/could not match/i);
    });

    it('should respect batch size limit', async () => {
      const mockRecommendations = {
        recommendations: Array.from({ length: 10 }, (_, i) => ({
          song: `Song ${i + 1}`,
          explanation: 'Test',
          genreScore: 0.9,
        })),
      };

      const mockLibrarySongs = Array.from({ length: 10 }, (_, i) => ({
        ...mockCurrentSong,
        id: `song-${i + 1}`,
        name: `Song ${i + 1}`,
      }));

      vi.mocked(ollamaService.generateRecommendations).mockResolvedValue(mockRecommendations);
      vi.mocked(navidromeService.getSongsGlobal).mockResolvedValue(mockLibrarySongs);

      const result = await generateContextualRecommendations(mockContext, 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('prepareAIDJQueueMetadata', () => {
    it('should generate metadata for queued songs', () => {
      const mockSongs = [
        { id: '1', name: 'Song 1' } as any,
        { id: '2', name: 'Song 2' } as any,
      ];

      const metadata = prepareAIDJQueueMetadata(mockSongs);

      expect(metadata).toHaveLength(2);
      expect(metadata[0].aiQueued).toBe(true);
      expect(metadata[0].queuedBy).toBe('ai-dj');
      expect(metadata[0].queuedAt).toBeGreaterThan(0);
    });

    it('should use consistent timestamp for all songs in batch', () => {
      const mockSongs = [
        { id: '1', name: 'Song 1' } as any,
        { id: '2', name: 'Song 2' } as any,
        { id: '3', name: 'Song 3' } as any,
      ];

      const metadata = prepareAIDJQueueMetadata(mockSongs);

      const firstTimestamp = metadata[0].queuedAt;
      expect(metadata.every(m => m.queuedAt === firstTimestamp)).toBe(true);
    });

    it('should handle empty song array', () => {
      const metadata = prepareAIDJQueueMetadata([]);
      expect(metadata).toEqual([]);
    });
  });
});
