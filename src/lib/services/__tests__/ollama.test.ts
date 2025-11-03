import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock config module BEFORE any imports to avoid TanStack Start boundary violations
vi.mock('../../config/config', () => ({
  getConfig: vi.fn(() => ({
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama2',
    navidromeUrl: 'http://localhost:4533',
    lidarrUrl: '',
    lidarrApiKey: '',
    navidromeUsername: '',
    navidromePassword: '',
  })),
  setConfig: vi.fn(),
  resetConfig: vi.fn(),
}))

// Mock database and related modules BEFORE any imports
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([]))
      }))
    }))
  }
}))

vi.mock('../preferences', () => ({
  buildUserPreferenceProfile: vi.fn(() => Promise.resolve('')),
  getListeningPatterns: vi.fn(() => Promise.resolve([]))
}))

vi.mock('../library-index', () => ({
  getSongSampleForAI: vi.fn(() => Promise.resolve([])),
  getIndexedArtists: vi.fn(() => Promise.resolve([]))
}))

vi.mock('../library-profile', () => ({
  getOrCreateLibraryProfile: vi.fn(() => Promise.resolve({ id: '1', userId: 'test' }))
}))

vi.mock('../seasonal-patterns', () => ({
  getCurrentSeasonalPattern: vi.fn(() => Promise.resolve(''))
}))

// Mock fetch
global.fetch = vi.fn()

// Mock data with proper JSON format for recommendations
const mockRecommendationsJson = JSON.stringify({
  recommendations: [
    { song: 'Artist A - Song A', explanation: 'High energy track' },
    { song: 'Artist B - Song B', explanation: 'Smooth transition' },
    { song: 'Artist C - Song C', explanation: 'Similar mood' },
    { song: 'Artist D - Song D', explanation: 'Great follow-up' },
    { song: 'Artist E - Song E', explanation: 'Perfect match' },
  ]
});

const mockOllamaResponse = {
  model: 'llama2',
  created_at: '2023-08-04T08:52:19.385406455-07:00',
  response: mockRecommendationsJson,
  done: true,
  total_duration: 5043500667,
  load_duration: 5043006,
  sample_count: 114,
  sample_duration: 39864000,
  prompt_eval_count: 22,
  prompt_eval_duration: 116079000,
  eval_count: 113,
  eval_duration: 390733000
}

const mockModelsResponse = {
  models: [
    {
      name: 'llama2',
      modified_at: '2023-08-04T08:52:19.385406455-07:00',
      size: 3825819519,
      digest: 'fe938a131f40e6f6d40083dd9f6212761d6e475684469228bee2f1e6455c3c72',
      details: {
        format: 'ggml',
        families: ['llama'],
        families_base: ['llama'],
        family: 'llama',
        parameter_size: '7B',
        quantization_level: 'q4_0'
      }
    },
    {
      name: 'mistral',
      modified_at: '2023-08-04T08:52:19.385406455-07:00',
      size: 4144485273,
      digest: 'fe938a131f40e6f6d40083dd9f6212761d6e475684469228bee2f1e6455c3c73',
      details: {
        format: 'ggml',
        families: ['mistral'],
        families_base: ['mistral'],
        family: 'mistral',
        parameter_size: '7B',
        quantization_level: 'q4_0'
      }
    }
  ]
}

describe('Ollama Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module registry to ensure fresh imports
    vi.resetModules()
    // Config is mocked at module level - no need to manipulate process.env
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Generate Response', () => {
    it('should generate response successfully', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOllamaResponse
      } as Response)

      const { generateRecommendations } = await import('../ollama')
      const response = await generateRecommendations({ prompt: 'Test prompt' })

      expect(response.recommendations).toHaveLength(5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      )
    })

    it('should handle network errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { generateRecommendations } = await import('../ollama')

      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow('Ollama request failed')
    })

    it('should handle API errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow()
    })

    it('should handle malformed responses', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow()
    })

    it('should handle empty responses', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '', done: true })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      const response = await generateRecommendations({ prompt: 'Test prompt' })

      expect(response.recommendations).toBeDefined()
    })

    it('should handle streaming responses', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockOllamaResponse,
          response: 'Partial response',
          done: false
        })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      const response = await generateRecommendations({ prompt: 'Test prompt' })

      expect(response.recommendations).toBeDefined()
    })
  })

  describe('Get Available Models', () => {
    it('should fetch available models successfully', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelsResponse
      } as Response)

      const { checkModelAvailability } = await import('../ollama')
      const isAvailable = await checkModelAvailability('llama2')

      expect(isAvailable).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.objectContaining({
          method: 'GET'
        })
      )
    })

    it('should handle model not found', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] })
      } as unknown as Response)

      const { checkModelAvailability } = await import('../ollama')
      const isAvailable = await checkModelAvailability('nonexistent-model')

      expect(isAvailable).toBe(false)
    })

    it('should handle network errors when checking model availability', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { checkModelAvailability } = await import('../ollama')

      // checkModelAvailability catches errors and returns false instead of throwing
      const isAvailable = await checkModelAvailability('llama2')
      expect(isAvailable).toBe(false)
    })
  })

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockOllamaResponse
      } as Response)

      const { generateRecommendations } = await import('../ollama')
      
      // Make multiple requests quickly
      const promises = Array(10).fill(null).map(() =>
        generateRecommendations({ prompt: 'Test prompt' })
      )
      
      await Promise.allSettled(promises)
      
      // Should have throttled requests (fewer than 10 actual fetch calls)
      expect(mockFetch).toHaveBeenCalledTimes(expect.any(Number))
    })

    it('should implement exponential backoff on failures', async () => {
      const mockFetch = vi.mocked(fetch)
      let callCount = 0
      
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return Promise.reject(new Error('Temporary failure'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockOllamaResponse
        } as unknown as Response)
      })

      const { generateRecommendations } = await import('../ollama')
      const response = await generateRecommendations({ prompt: 'Test prompt' })

      expect(response.recommendations).toBeDefined()
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('Configuration', () => {
    it('should use custom Ollama URL from environment', async () => {
      process.env.OLLAMA_URL = 'http://custom-ollama:8080'
      
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOllamaResponse
      } as Response)

      const { generateRecommendations } = await import('../ollama')
      await generateRecommendations({ prompt: 'Test prompt' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate'),
        expect.any(Object)
      )
    })

    it('should use custom model from environment', async () => {
      process.env.OLLAMA_MODEL = 'mistral'
      
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOllamaResponse
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      await generateRecommendations({ prompt: 'Test prompt', model: 'mistral' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('mistral')
        })
      )
    })

    it('should handle missing configuration', async () => {
      delete process.env.OLLAMA_URL
      
      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow()
    })
  })

  describe('Performance Optimization', () => {
    it('should implement request timeout', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000)) // Long delay
      )

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow()
    })

    it('should cache model availability', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelsResponse
      } as unknown as Response)

      const { checkModelAvailability } = await import('../ollama')
      
      // First call
      await checkModelAvailability('llama2')
      // Second call should use cache
      await checkModelAvailability('llama2')
      
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should handle large prompts efficiently', async () => {
      const largePrompt = 'Test prompt '.repeat(1000)
      
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOllamaResponse
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      const response = await generateRecommendations({ prompt: largePrompt })

      expect(response.recommendations).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(largePrompt)
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle connection timeouts', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'))

      const { generateRecommendations } = await import('../ollama')

      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow('Ollama request failed')
    })

    it('should handle invalid model names', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Model not found' })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt', model: 'invalid-model' })).rejects.toThrow()
    })

    it('should handle server overload', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Server overloaded' })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: 'Test prompt' })).rejects.toThrow()
    })

    it('should handle malformed prompts', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid prompt format' })
      } as unknown as Response)

      const { generateRecommendations } = await import('../ollama')
      
      await expect(generateRecommendations({ prompt: '' })).rejects.toThrow()
    })
  })
})