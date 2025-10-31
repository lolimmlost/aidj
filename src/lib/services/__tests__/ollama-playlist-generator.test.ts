import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  generatePlaylist,
  type PlaylistRequest,
  type PlaylistResponse
} from '../ollama/playlist-generator'

// Mock dependencies
vi.mock('../ollama/client', () => ({
  ollamaClient: {
    generate: vi.fn(),
    getDefaultModel: vi.fn(() => 'llama2')
  }
}))

vi.mock('../ollama/rate-limiter', () => ({
  checkOllamaRateLimit: vi.fn(() => true)
}))

vi.mock('../ollama/prompt-builder', () => ({
  buildPlaylistPrompt: vi.fn()
}))

vi.mock('../ollama/response-parser', () => ({
  parsePlaylistResponse: vi.fn()
}))

describe('Ollama Playlist Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('generatePlaylist', () => {
    const mockPlaylistResponse: PlaylistResponse = {
      playlist: [
        { song: 'Artist A - Song A', explanation: 'High energy track' },
        { song: 'Artist B - Song B', explanation: 'Smooth transition' },
        { song: 'Artist C - Song C', explanation: 'Similar mood' }
      ]
    }

    it('should generate playlist with valid request', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      const mockPrompt = 'Generate a high-energy playlist'
      vi.mocked(buildPlaylistPrompt).mockResolvedValue(mockPrompt)
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'high-energy',
        userId: 'user-123',
        useFeedbackForPersonalization: true,
        excludeArtists: ['Artist X']
      }

      const result = await generatePlaylist(request)

      expect(buildPlaylistPrompt).toHaveBeenCalledWith({
        userId: 'user-123',
        useFeedbackForPersonalization: true,
        excludeArtists: ['Artist X'],
        style: 'high-energy'
      })
      expect(ollamaClient.generate).toHaveBeenCalledWith({
        model: 'llama2',
        prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. ${mockPrompt}`,
        stream: false
      }, 20000)
      expect(parsePlaylistResponse).toHaveBeenCalledWith(JSON.stringify(mockPlaylistResponse))
      expect(result).toEqual(mockPlaylistResponse)
    })

    it('should use default values when not provided', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Default playlist prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'chill'
      }

      const result = await generatePlaylist(request)

      expect(buildPlaylistPrompt).toHaveBeenCalledWith({
        userId: undefined,
        useFeedbackForPersonalization: true,
        excludeArtists: [],
        style: 'chill'
      })
      expect(result).toEqual(mockPlaylistResponse)
    })

    it('should handle rate limiting', async () => {
      const { checkOllamaRateLimit } = await import('../ollama/rate-limiter')
      
      vi.mocked(checkOllamaRateLimit).mockReturnValue(false)

      const request: PlaylistRequest = {
        style: 'party'
      }

      await expect(generatePlaylist(request)).rejects.toThrow(
        'Too many playlist requests. Please wait a moment before generating another.'
      )
    })

    it('should handle Ollama API errors', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(ollamaClient.generate).mockRejectedValue(new Error('API unavailable'))

      const request: PlaylistRequest = {
        style: 'rock'
      }

      await expect(generatePlaylist(request)).rejects.toThrow('API unavailable')
    })

    it('should handle empty response from Ollama', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: '',
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'jazz'
      }

      await expect(generatePlaylist(request)).rejects.toThrow('No response from Ollama')
    })

    it('should handle malformed JSON response', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: 'Invalid JSON response',
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })
      
      const parseError = new Error('Invalid JSON format')
      vi.mocked(parsePlaylistResponse).mockImplementation(() => {
        throw parseError
      })

      const request: PlaylistRequest = {
        style: 'electronic'
      }

      await expect(generatePlaylist(request)).rejects.toThrow(parseError)
    })

    it('should handle excluded artists correctly', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt with exclusions')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'mixed',
        excludeArtists: ['Artist 1', 'Artist 2', 'Artist 3']
      }

      await generatePlaylist(request)

      expect(buildPlaylistPrompt).toHaveBeenCalledWith({
        userId: undefined,
        useFeedbackForPersonalization: true,
        excludeArtists: ['Artist 1', 'Artist 2', 'Artist 3'],
        style: 'mixed'
      })
    })

    it('should handle user personalization correctly', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Personalized prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'personal',
        userId: 'user-456',
        useFeedbackForPersonalization: false
      }

      await generatePlaylist(request)

      expect(buildPlaylistPrompt).toHaveBeenCalledWith({
        userId: 'user-456',
        useFeedbackForPersonalization: false,
        excludeArtists: [],
        style: 'personal'
      })
    })

    it('should use correct timeout for playlist generation', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'test'
      }

      await generatePlaylist(request)

      expect(ollamaClient.generate).toHaveBeenCalledWith(
        expect.any(Object),
        20000 // 20 second timeout
      )
    })

    it('should handle streaming disabled correctly', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(mockPlaylistResponse),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'test'
      }

      await generatePlaylist(request)

      expect(ollamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false
        }),
        20000
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      
      const timeoutError = new Error('Request timeout')
      timeoutError.name = 'AbortError'
      vi.mocked(ollamaClient.generate).mockRejectedValue(timeoutError)

      const request: PlaylistRequest = {
        style: 'timeout-test'
      }

      await expect(generatePlaylist(request)).rejects.toThrow('Request timeout')
    })

    it('should handle service errors', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(ollamaClient.generate).mockRejectedValue(new Error('Service unavailable'))

      const request: PlaylistRequest = {
        style: 'error-test'
      }

      await expect(generatePlaylist(request)).rejects.toThrow('Service unavailable')
    })

    it('should handle prompt building errors', async () => {
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      
      vi.mocked(buildPlaylistPrompt).mockRejectedValue(new Error('Failed to build prompt'))

      const request: PlaylistRequest = {
        style: 'prompt-error-test'
      }

      await expect(generatePlaylist(request)).rejects.toThrow('Failed to build prompt')
    })
  })

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => resolve({
            response: JSON.stringify(mockPlaylistResponse),
            model: 'llama2',
            created_at: '2023-01-01T00:00:00Z',
            done: true
          }), 100)
        })
      )

      const request: PlaylistRequest = {
        style: 'performance-test'
      }

      const startTime = performance.now()
      const result = await generatePlaylist(request)
      const endTime = performance.now()

      expect(result).toEqual(mockPlaylistResponse)
      expect(endTime - startTime).toBeGreaterThan(90) // Should take at least 100ms
      expect(endTime - startTime).toBeLessThan(200) // But not too long
    })

    it('should handle concurrent requests', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(mockPlaylistResponse)
      vi.mocked(ollamaClient.generate).mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => resolve({
            response: JSON.stringify(mockPlaylistResponse),
            model: 'llama2',
            created_at: '2023-01-01T00:00:00Z',
            done: true
          }), 50)
        })
      )

      const request: PlaylistRequest = {
        style: 'concurrent-test'
      }

      const promises = Array.from({ length: 3 }, () => generatePlaylist(request))
      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual(mockPlaylistResponse)
      expect(ollamaClient.generate).toHaveBeenCalledTimes(3)
    })
  })

  describe('Response Validation', () => {
    it('should handle empty playlist response', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      const emptyPlaylist: PlaylistResponse = { playlist: [] }
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(emptyPlaylist)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(emptyPlaylist),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'empty-test'
      }

      const result = await generatePlaylist(request)

      expect(result.playlist).toEqual([])
      expect(result).toEqual(emptyPlaylist)
    })

    it('should handle large playlist response', async () => {
      const { ollamaClient } = await import('../ollama/client')
      const { buildPlaylistPrompt } = await import('../ollama/prompt-builder')
      const { parsePlaylistResponse } = await import('../ollama/response-parser')
      
      const largePlaylist: PlaylistResponse = {
        playlist: Array.from({ length: 50 }, (_, i) => ({
          song: `Artist ${i} - Song ${i}`,
          explanation: `Explanation ${i}`
        }))
      }
      
      vi.mocked(buildPlaylistPrompt).mockResolvedValue('Test prompt')
      vi.mocked(parsePlaylistResponse).mockReturnValue(largePlaylist)
      vi.mocked(ollamaClient.generate).mockResolvedValue({
        response: JSON.stringify(largePlaylist),
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        done: true
      })

      const request: PlaylistRequest = {
        style: 'large-test'
      }

      const result = await generatePlaylist(request)

      expect(result.playlist).toHaveLength(50)
      expect(result).toEqual(largePlaylist)
    })
  })
})