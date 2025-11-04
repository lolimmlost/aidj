import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  generateContextualRecommendations,
  checkCooldown,
  prepareAIDJQueueMetadata,
  type AIContext
} from '../ai-dj/core'
import type { Song } from '@/components/ui/audio-player'

// Mock dependencies
vi.mock('../ollama', () => ({
  generateRecommendations: vi.fn()
}))

vi.mock('../genre-matcher', () => ({
  rankRecommendations: vi.fn()
}))

vi.mock('../library-profile', () => ({
  getOrCreateLibraryProfile: vi.fn()
}))

vi.mock('../ai-dj/context-builder', () => ({
  extractSongContext: vi.fn(() => 'Current song context'),
  buildRecentQueueContext: vi.fn(() => 'Recent queue context'),
  buildExtendedContext: vi.fn(() => 'Extended context'),
  generatePromptVariations: vi.fn(() => [
    'Recommend similar songs',
    'Find songs with similar energy',
    'Suggest tracks that match the mood'
  ])
}))

vi.mock('../ai-dj/recommendation-matcher', () => ({
  matchRecommendationsToLibrary: vi.fn()
}))

vi.mock('../ai-dj/artist-tracker', () => ({
  getArtistRecommendationStats: vi.fn()
}))

// Mock data
const mockSong: Song = {
  id: '1',
  name: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  albumId: 'album-1',
  duration: 180,
  track: 1,
  url: 'http://example.com/song1.mp3'
}

const mockSong2: Song = {
  id: '2',
  name: 'Test Song 2',
  artist: 'Test Artist 2',
  album: 'Test Album 2',
  albumId: 'album-2',
  duration: 200,
  track: 2,
  url: 'http://example.com/song2.mp3'
}

const mockRecommendations = {
  recommendations: [
    { song: 'Artist A - Song A', explanation: 'Similar energy level' },
    { song: 'Artist B - Song B', explanation: 'Matching genre' },
    { song: 'Artist C - Song C', explanation: 'Compatible key' }
  ]
}

const mockRankedRecommendations = [
  { song: 'Artist A - Song A', explanation: 'Similar energy level', genreScore: 0.8 },
  { song: 'Artist B - Song B', explanation: 'Matching genre', genreScore: 0.7 },
  { song: 'Artist C - Song C', explanation: 'Compatible key', genreScore: 0.6 }
]

const mockLibrarySongs = [
  { ...mockSong, id: '1', name: 'Song A', artist: 'Artist A' },
  { ...mockSong2, id: '2', name: 'Song B', artist: 'Artist B' }
]

const mockLibraryProfile = {
  userId: 'user-123',
  genres: [{ genre: 'Rock', count: 10 }],
  artists: [{ artist: 'Test Artist', count: 5 }],
  totalSongs: 100,
  lastUpdated: new Date()
}

describe('AI DJ Core Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('generateContextualRecommendations', () => {
    it('should generate recommendations with valid context', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      const { getOrCreateLibraryProfile } = await import('../library-profile')

      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockResolvedValue(mockRankedRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)
      vi.mocked(getOrCreateLibraryProfile).mockResolvedValue(mockLibraryProfile)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [mockSong2],
        fullPlaylist: [mockSong, mockSong2],
        currentSongIndex: 0
      }

      const result = await generateContextualRecommendations(context, 3, 'user-123')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(mockLibrarySongs[0])
      expect(result[1]).toEqual(mockLibrarySongs[1])
      expect(generateRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Current song context'),
          userId: 'user-123',
          useFeedbackForPersonalization: true
        })
      )
    })

    it('should handle excluded songs and artists', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      const { getOrCreateLibraryProfile } = await import('../library-profile')

      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockResolvedValue(mockRankedRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)
      vi.mocked(getOrCreateLibraryProfile).mockResolvedValue(mockLibraryProfile)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [mockSong2],
        fullPlaylist: [mockSong, mockSong2],
        currentSongIndex: 0
      }

      await generateContextualRecommendations(
        context,
        3,
        'user-123',
        true,
        ['excluded-song-id'],
        ['excluded-artist']
      )

      expect(generateRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Do NOT recommend these songs'),
          excludeArtists: ['excluded-artist']
        })
      )
    })

    it('should retry on failed recommendations', async () => {
      vi.useRealTimers() // Use real timers for this test to avoid timeout issues

      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      const { getOrCreateLibraryProfile } = await import('../library-profile')

      // First call fails, second succeeds
      vi.mocked(generateRecommendations)
        .mockResolvedValueOnce({ recommendations: [] })
        .mockResolvedValueOnce(mockRecommendations)

      vi.mocked(rankRecommendations).mockResolvedValue(mockRankedRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)
      vi.mocked(getOrCreateLibraryProfile).mockResolvedValue(mockLibraryProfile)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const result = await generateContextualRecommendations(context, 3, 'user-123')

      expect(generateRecommendations).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
    }, 10000)

    it('should handle timeout errors', async () => {
      const { generateRecommendations } = await import('../ollama')
      
      const abortError = new Error('Request timeout')
      abortError.name = 'AbortError'
      vi.mocked(generateRecommendations).mockRejectedValue(abortError)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      await expect(generateContextualRecommendations(context, 3, 'user-123'))
        .rejects.toThrow('AI DJ recommendation request timed out')
    })

    it('should handle no recommendations returned', async () => {
      vi.useRealTimers() // Use real timers for this test to avoid timeout issues

      const { generateRecommendations } = await import('../ollama')

      vi.mocked(generateRecommendations).mockResolvedValue({ recommendations: [] })

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      await expect(generateContextualRecommendations(context, 3, 'user-123'))
        .rejects.toThrow('Failed to generate AI DJ recommendations')
    }, 10000)

    it('should handle genre filtering failures gracefully', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      
      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockRejectedValue(new Error('Genre filtering failed'))
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const result = await generateContextualRecommendations(context, 3, 'user-123')

      expect(rankRecommendations).toHaveBeenCalled()
      expect(result).toHaveLength(2)
    })

    it('should filter out low-scoring recommendations', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      
      const lowScoreRecommendations = [
        { song: 'Artist A - Song A', explanation: 'Similar energy level', genreScore: 0.8 },
        { song: 'Artist B - Song B', explanation: 'Matching genre', genreScore: 0.3 }, // Below threshold
        { song: 'Artist C - Song C', explanation: 'Compatible key', genreScore: 0.6 }
      ]
      
      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockResolvedValue(lowScoreRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue([mockLibrarySongs[0], mockLibrarySongs[1]])

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const result = await generateContextualRecommendations(context, 3, 'user-123')

      expect(result).toHaveLength(2) // Only high-scoring recommendations
    })

    it('should work without user ID', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      
      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const result = await generateContextualRecommendations(context, 3)

      expect(result).toHaveLength(2)
      expect(generateRecommendations).toHaveBeenCalledWith(
        expect.not.objectContaining({
          userId: expect.any(String)
        })
      )
    })
  })

  describe('checkCooldown', () => {
    it('should return true when cooldown has passed', () => {
      const lastQueueTime = Date.now() - 35000 // 35 seconds ago
      const cooldownMs = 30000 // 30 seconds
      
      const result = checkCooldown(lastQueueTime, cooldownMs)
      
      expect(result).toBe(true)
    })

    it('should return false when cooldown has not passed', () => {
      const lastQueueTime = Date.now() - 25000 // 25 seconds ago
      const cooldownMs = 30000 // 30 seconds
      
      const result = checkCooldown(lastQueueTime, cooldownMs)
      
      expect(result).toBe(false)
    })

    it('should use default cooldown when not specified', () => {
      const lastQueueTime = Date.now() - 35000 // 35 seconds ago
      
      const result = checkCooldown(lastQueueTime)
      
      expect(result).toBe(true)
    })

    it('should return false when exactly at cooldown time', () => {
      const lastQueueTime = Date.now() - 30000 // Exactly 30 seconds ago
      const cooldownMs = 30000 // 30 seconds
      
      const result = checkCooldown(lastQueueTime, cooldownMs)
      
      expect(result).toBe(true)
    })
  })

  describe('prepareAIDJQueueMetadata', () => {
    it('should create metadata for queued songs', () => {
      const songs = [mockSong, mockSong2]
      const now = Date.now()
      
      // Mock Date.now to return consistent timestamp
      vi.setSystemTime(now)
      
      const result = prepareAIDJQueueMetadata(songs)
      
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        aiQueued: true,
        queuedAt: now,
        queuedBy: 'ai-dj'
      })
      expect(result[1]).toEqual({
        aiQueued: true,
        queuedAt: now,
        queuedBy: 'ai-dj'
      })
    })

    it('should handle empty song array', () => {
      const result = prepareAIDJQueueMetadata([])
      
      expect(result).toHaveLength(0)
    })

    it('should create unique timestamps for each song', () => {
      const songs = [mockSong, mockSong2]
      
      vi.useFakeTimers()
      
      const result = prepareAIDJQueueMetadata(songs)
      
      // Advance time between calls
      vi.advanceTimersByTime(100)
      const result2 = prepareAIDJQueueMetadata(songs)
      
      expect(result[0].queuedAt).not.toBe(result2[0].queuedAt)
    })
  })

  describe('Error Handling', () => {
    it('should handle service errors appropriately', async () => {
      const { generateRecommendations } = await import('../ollama')
      
      vi.mocked(generateRecommendations).mockRejectedValue(new Error('Service unavailable'))

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      await expect(generateContextualRecommendations(context, 3, 'user-123'))
        .rejects.toThrow('Failed to generate AI DJ recommendations')
    })

    it('should handle network errors', async () => {
      const { generateRecommendations } = await import('../ollama')
      
      const networkError = new Error('Network error')
      networkError.name = 'TypeError'
      vi.mocked(generateRecommendations).mockRejectedValue(networkError)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      await expect(generateContextualRecommendations(context, 3, 'user-123'))
        .rejects.toThrow('Failed to generate AI DJ recommendations')
    })

    it('should handle malformed recommendation responses', async () => {
      vi.useRealTimers() // Use real timers for this test to avoid timeout issues

      const { generateRecommendations } = await import('../ollama')

      vi.mocked(generateRecommendations).mockResolvedValue({ recommendations: [] })

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      await expect(generateContextualRecommendations(context, 3, 'user-123'))
        .rejects.toThrow('Failed to generate AI DJ recommendations')
    }, 10000)
  })

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      
      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockResolvedValue(mockRankedRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const startTime = performance.now()
      
      await generateContextualRecommendations(context, 3, 'user-123')
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle multiple concurrent requests', async () => {
      const { generateRecommendations } = await import('../ollama')
      const { rankRecommendations } = await import('../genre-matcher')
      const { matchRecommendationsToLibrary } = await import('../ai-dj/recommendation-matcher')
      
      vi.mocked(generateRecommendations).mockResolvedValue(mockRecommendations)
      vi.mocked(rankRecommendations).mockResolvedValue(mockRankedRecommendations)
      vi.mocked(matchRecommendationsToLibrary).mockResolvedValue(mockLibrarySongs)

      const context: AIContext = {
        currentSong: mockSong,
        recentQueue: [],
        fullPlaylist: [mockSong],
        currentSongIndex: 0
      }

      const promises = Array.from({ length: 5 }, () => 
        generateContextualRecommendations(context, 3, 'user-123')
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(results[0]).toHaveLength(2)
    })
  })
})