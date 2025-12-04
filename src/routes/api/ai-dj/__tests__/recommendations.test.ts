import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the unified recommendations service
vi.mock('@/lib/services/recommendations', () => ({
  getRecommendations: vi.fn(),
}))

import { getRecommendations } from '@/lib/services/recommendations'
import { POST } from '../recommendations'

describe('AI DJ Recommendations API', () => {
  const mockCurrentSong = {
    id: '1',
    name: 'Test Song',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'album-1',
    duration: 180,
    track: 1,
    url: 'http://example.com/song1.mp3'
  }

  const mockRecommendedSongs = [
    {
      id: '4',
      name: 'Recommended Song 1',
      title: 'Recommended Song 1',
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
      title: 'Recommended Song 2',
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
      title: 'Recommended Song 3',
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
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.recommendations).toEqual(mockRecommendedSongs)
      expect(data.skipAutoRefresh).toBe(false)
      expect(data.source).toBe('lastfm')
      expect(getRecommendations).toHaveBeenCalledWith({
        mode: 'similar',
        currentSong: {
          artist: 'Test Artist',
          title: 'Test Song'
        },
        limit: 3,
        excludeSongIds: [],
        excludeArtists: []
      })
    })

    it('should use default batch size when not provided', async () => {
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong
        })
      })

      const response = await POST({ request })

      expect(response.status).toBe(200)
      expect(getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 3 // default batch size
        })
      )
    })

    it('should handle excluded songs and artists', async () => {
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const excludeSongIds = ['song-1', 'song-2']
      const excludeArtists = ['Artist A', 'Artist B']

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3,
          excludeSongIds,
          excludeArtists
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeSongIds,
          excludeArtists
        })
      )
    })

    it('should handle skipAutoRefresh flag', async () => {
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3,
          skipAutoRefresh: true
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.skipAutoRefresh).toBe(true)
    })

    it('should return 400 when currentSong is missing', async () => {
      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize: 3
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Current song is required')
      expect(getRecommendations).not.toHaveBeenCalled()
    })

    it('should return 400 when currentSong is null', async () => {
      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: null,
          batchSize: 3
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toBe('Current song is required')
    })

    it('should return 500 when recommendations service throws an error', async () => {
      const errorMessage = 'Recommendations service unavailable'
      vi.mocked(getRecommendations).mockRejectedValue(new Error(errorMessage))

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe(errorMessage)
    })

    it('should handle non-Error exceptions', async () => {
      vi.mocked(getRecommendations).mockRejectedValue('Unknown error')

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3
        })
      })

      const response = await POST({ request })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toBe('Failed to generate AI DJ recommendations')
    })

    it('should handle large batch sizes', async () => {
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 10
        })
      })

      const response = await POST({ request })
      expect(response.status).toBe(200)
      expect(getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10
        })
      )
    })

    it('should return correct Content-Type header', async () => {
      vi.mocked(getRecommendations).mockResolvedValue({
        songs: mockRecommendedSongs,
        source: 'lastfm',
        mode: 'similar'
      })

      const request = new Request('http://localhost/api/ai-dj/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSong: mockCurrentSong,
          batchSize: 3
        })
      })

      const response = await POST({ request })
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })
})
