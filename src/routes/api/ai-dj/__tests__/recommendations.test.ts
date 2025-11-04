import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the AI DJ service
vi.mock('@/lib/services/ai-dj', () => ({
  generateContextualRecommendations: vi.fn(),
}))

import { generateContextualRecommendations } from '@/lib/services/ai-dj'
import { POST } from '../recommendations'

describe('AI DJ Recommendations API', () => {
  const mockCurrentSong = {
    id: '1',
    name: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'album-1',
    duration: 180,
    track: 1,
    url: 'http://example.com/song1.mp3'
  }

  const mockRecentQueue = [
    {
      id: '2',
      name: 'Recent Song 1',
      artist: 'Artist 2',
      album: 'Album 2',
      albumId: 'album-2',
      duration: 200,
      track: 1,
      url: 'http://example.com/song2.mp3'
    },
    {
      id: '3',
      name: 'Recent Song 2',
      artist: 'Artist 3',
      album: 'Album 3',
      albumId: 'album-3',
      duration: 220,
      track: 1,
      url: 'http://example.com/song3.mp3'
    }
  ]

  const mockRecommendations = [
    {
      id: '4',
      name: 'Recommended Song 1',
      artist: 'Rec Artist 1',
      album: 'Rec Album 1',
      albumId: 'album-4',
      duration: 190,
      track: 1,
      url: 'http://example.com/song4.mp3'
    },
    {
      id: '5',
      name: 'Recommended Song 2',
      artist: 'Rec Artist 2',
      album: 'Rec Album 2',
      albumId: 'album-5',
      duration: 210,
      track: 1,
      url: 'http://example.com/song5.mp3'
    },
    {
      id: '6',
      name: 'Recommended Song 3',
      artist: 'Rec Artist 3',
      album: 'Rec Album 3',
      albumId: 'album-6',
      duration: 195,
      track: 1,
      url: 'http://example.com/song6.mp3'
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/ai-dj/recommendations', () => {
    it('should generate recommendations successfully with valid request', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: true
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        recommendations: mockRecommendations,
        skipAutoRefresh: false
      })
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        {
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          fullPlaylist: undefined,
          currentSongIndex: undefined
        },
        3,
        undefined,
        true,
        [],
        []
      )
    })

    it('should use default batch size when not provided', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        expect.any(Object),
        3,
        undefined,
        false,
        [],
        []
      )
    })

    it('should handle excluded songs and artists', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const excludeSongIds = ['song-1', 'song-2']
      const excludeArtists = ['Artist A', 'Artist B']

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: true,
          excludeSongIds,
          excludeArtists
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        expect.any(Object),
        3,
        undefined,
        true,
        excludeSongIds,
        excludeArtists
      )
    })

    it('should handle skipAutoRefresh flag', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false,
          skipAutoRefresh: true
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.skipAutoRefresh).toBe(true)
    })

    it('should handle fullPlaylist and currentSongIndex', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const fullPlaylist = [...mockRecentQueue, mockCurrentSong]
      const currentSongIndex = 2

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          fullPlaylist,
          currentSongIndex,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        {
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          fullPlaylist,
          currentSongIndex
        },
        3,
        undefined,
        false,
        [],
        []
      )
    })

    it('should return 400 when currentSong is missing', async () => {
      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Current song is required')
      expect(generateContextualRecommendations).not.toHaveBeenCalled()
    })

    it('should return 400 when currentSong is null', async () => {
      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: null,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Current song is required')
    })

    it('should return 500 when AI service throws an error', async () => {
      const errorMessage = 'AI service unavailable'
      vi.mocked(generateContextualRecommendations).mockRejectedValue(new Error(errorMessage))

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe(errorMessage)
    })

    it('should handle non-Error exceptions', async () => {
      vi.mocked(generateContextualRecommendations).mockRejectedValue('Unknown error')

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to generate AI DJ recommendations')
    })

    it('should handle empty recentQueue', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: [],
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        {
          currentSong: mockCurrentSong,
          recentQueue: [],
          fullPlaylist: undefined,
          currentSongIndex: undefined
        },
        3,
        undefined,
        false,
        [],
        []
      )
    })

    it('should handle missing recentQueue by using empty array', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          recentQueue: []
        }),
        3,
        undefined,
        false,
        [],
        []
      )
    })

    it('should handle large batch sizes', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 10,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(generateContextualRecommendations).toHaveBeenCalledWith(
        expect.any(Object),
        10,
        undefined,
        false,
        [],
        []
      )
    })

    it('should return correct Content-Type header', async () => {
      vi.mocked(generateContextualRecommendations).mockResolvedValue(mockRecommendations)

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          recentQueue: mockRecentQueue,
          batchSize: 3,
          useFeedbackForPersonalization: false
        })
      })

      const response = await POST({ request })
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })
})
