import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the services
const mockSearch = vi.fn()
const mockSearchArtistsFull = vi.fn()
const mockAddArtistToQueue = vi.fn()
const mockIsArtistAdded = vi.fn()
const mockSearchNavidrome = vi.fn()
const mockAuthGetSession = vi.fn()

vi.mock('../../../lib/services/lidarr', () => ({
  search: () => mockSearch(),
  searchArtistsFull: () => mockSearchArtistsFull(),
  addArtistToQueue: () => mockAddArtistToQueue(),
  isArtistAdded: () => mockIsArtistAdded()
}))

vi.mock('../../../lib/services/navidrome', () => ({
  search: () => mockSearchNavidrome()
}))

vi.mock('../../../lib/auth/server', () => ({
  auth: {
    api: {
      getSession: () => mockAuthGetSession()
    }
  }
}))

// Import types
import type { LidarrArtist } from '../../../lib/services/lidarr'
import type { Song } from '../../../lib/services/navidrome'

// Mock data
const mockSearchResults = {
  artists: [
    {
      id: '1',
      name: 'Test Artist',
      genres: ['Rock'],
      status: 'active'
    }
  ],
  albums: [
    {
      id: '1',
      title: 'Test Album',
      artistId: '1',
      releaseDate: '2023-01-01'
    }
  ]
}

const mockArtist: LidarrArtist = {
  id: 1,
  artistName: 'Test Artist',
  foreignArtistId: 'foreign-123',
  images: [],
  links: [],
  genres: ['Rock'],
  status: 'active'
}

const mockNavidromeResults: Song[] = [
  {
    id: 'navidrome-123',
    name: 'Test Song',
    albumId: 'album-123',
    duration: 180,
    track: 1,
    url: '/api/navidrome/stream/navidrome-123'
  }
]

describe('Lidarr API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Search Route', () => {
    it('should search for content successfully', async () => {
      mockSearch.mockResolvedValue(mockSearchResults)

      const { ServerRoute } = await import('../lidarr/search')
      const request = new Request('http://localhost:3000/api/lidarr/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' })
      })

      // Access the POST method directly from the methods object
      const postHandler = ServerRoute.methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockSearchResults)
      expect(mockSearch).toHaveBeenCalledWith('test')
    })

    it('should handle empty query', async () => {
      const { ServerRoute } = await import('../lidarr/search')
      const request = new Request('http://localhost:3000/api/lidarr/search', {
        method: 'POST',
        body: JSON.stringify({ query: '' })
      })

      const postHandler = ServerRoute.methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ artists: [], albums: [] })
    })

    it('should handle service errors', async () => {
      mockSearch.mockRejectedValue(new Error('Service error'))

      const { ServerRoute } = await import('../lidarr/search')
      const request = new Request('http://localhost:3000/api/lidarr/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' })
      })

      const postHandler = ServerRoute.methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.code).toBe('GENERAL_API_ERROR')
      expect(data.message).toBe('Service error')
    })
  })

  describe('Add Route', () => {
    it('should add artist successfully', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })
      mockSearchArtistsFull.mockResolvedValue([mockArtist])
      mockSearchNavidrome.mockResolvedValue([])
      mockIsArtistAdded.mockResolvedValue(false)
      mockAddArtistToQueue.mockResolvedValue(undefined)

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Test Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toContain('Added "Test Artist" to Lidarr queue')
      expect(mockAddArtistToQueue).toHaveBeenCalledWith(mockArtist)
    })

    it('should require authentication', async () => {
      mockAuthGetSession.mockResolvedValue(null)

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Test Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should validate song format', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Invalid song format' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid song format')
    })

    it('should handle artist not found', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })
      mockSearchArtistsFull.mockResolvedValue([])

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Unknown Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Artist not found in Lidarr search')
    })

    it('should handle artist already in Navidrome', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })
      mockSearchArtistsFull.mockResolvedValue([mockArtist])
      mockSearchNavidrome.mockResolvedValue(mockNavidromeResults)

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Test Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Artist already available in your music library')
    })

    it('should handle artist already requested in Lidarr', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })
      mockSearchArtistsFull.mockResolvedValue([mockArtist])
      mockSearchNavidrome.mockResolvedValue([])
      mockIsArtistAdded.mockResolvedValue(true)

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Test Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Artist already requested in Lidarr')
    })

    it('should handle service errors', async () => {
      mockAuthGetSession.mockResolvedValue({ user: { id: 'user-123' } })
      mockSearchArtistsFull.mockRejectedValue(new Error('Service error'))

      const { ServerRoute } = await import('../lidarr/add')
      const request = new Request('http://localhost:3000/api/lidarr/add', {
        method: 'POST',
        body: JSON.stringify({ song: 'Test Artist - Test Song' })
      })

      const postHandler = (ServerRoute as unknown as { _methods: { POST: (ctx: { request: Request }) => Promise<Response> } })._methods.POST
      const response = await postHandler({ request })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.code).toBe('GENERAL_API_ERROR')
      expect(data.message).toBe('Service error')
    })
  })
})