import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OllamaClient, ollamaClient } from '../ollama/client'
import type { OllamaGenerateRequest, OllamaGenerateResponse, OllamaTagsResponse } from '../ollama/client'

// Mock fetch
global.fetch = vi.fn()

// Mock config
vi.mock('../../config/config', () => ({
  getConfig: vi.fn(() => ({ 
    ollamaUrl: 'http://localhost:11434',
    navidromeUrl: 'http://localhost:4533'
  }))
}))

describe('Ollama Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('OllamaClient Class', () => {
    it('should create client with default values', () => {
      const client = new OllamaClient()
      
      expect(client.getBaseUrl()).toBe('http://localhost:11434')
      expect(client.getDefaultModel()).toBe('llama2')
    })

    it('should create client with custom values', () => {
      const client = new OllamaClient('http://custom:8080', 'custom-model')
      
      expect(client.getBaseUrl()).toBe('http://custom:8080')
      expect(client.getDefaultModel()).toBe('custom-model')
    })
  })

  describe('generate method', () => {
    it('should make successful generate request', async () => {
      const mockResponse: OllamaGenerateResponse = {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Test response',
        done: true,
        total_duration: 1000,
        load_duration: 100,
        eval_count: 10,
        eval_duration: 900
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt',
        stream: false
      }

      const result = await client.generate(request)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama2',
            prompt: 'Test prompt',
            stream: false
          }),
          signal: expect.any(AbortSignal)
        }
      )
      expect(result).toEqual(mockResponse)
    })

    it('should use default model when not specified', async () => {
      const mockResponse: OllamaGenerateResponse = {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Test response',
        done: true
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await client.generate(request)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          body: expect.stringContaining('"model":"llama2"')
        })
      )
    })

    it('should handle server errors (5xx)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await expect(client.generate(request)).rejects.toThrow('Ollama API error: 500 Internal Server Error')
    })

    it('should handle client errors (4xx)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await expect(client.generate(request)).rejects.toThrow('Ollama API error: 400 Bad Request')
    })

    it('should handle timeout errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          const abortError = new Error('Request timeout')
          abortError.name = 'AbortError'
          setTimeout(() => reject(abortError), 100)
        })
      )

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await expect(client.generate(request, 50)).rejects.toThrow('Ollama request timed out after 50ms')
    })

    it('should handle network errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new TypeError('Network error'))

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await expect(client.generate(request)).rejects.toThrow('Ollama request failed: Network error')
    })

    it('should retry on network failures', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            model: 'llama2',
            response: 'Success after retries',
            done: true
          }),
          status: 200
        } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const result = await client.generate(request)

      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(result.response).toBe('Success after retries')
    })

    it('should respect custom timeout', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          const abortError = new Error('Request timeout')
          abortError.name = 'AbortError'
          setTimeout(() => reject(abortError), 200)
        })
      )

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const startTime = Date.now()
      await expect(client.generate(request, 100)).rejects.toThrow('Ollama request timed out after 100ms')
      const endTime = Date.now()
      
      expect(endTime - startTime).toBeLessThan(200) // Should timeout before 200ms
    })
  })

  describe('checkModelAvailability method', () => {
    it('should return true when model is available', async () => {
      const mockTagsResponse: OllamaTagsResponse = {
        models: [
          {
            name: 'llama2',
            size: 1000000,
            digest: 'abc123',
            modified_at: '2023-01-01T00:00:00Z'
          },
          {
            name: 'mistral',
            size: 2000000,
            digest: 'def456',
            modified_at: '2023-01-02T00:00:00Z'
          }
        ]
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTagsResponse),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const isAvailable = await client.checkModelAvailability('llama2')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { signal: expect.any(AbortSignal) }
      )
      expect(isAvailable).toBe(true)
    })

    it('should return false when model is not available', async () => {
      const mockTagsResponse: OllamaTagsResponse = {
        models: [
          {
            name: 'mistral',
            size: 2000000,
            digest: 'def456',
            modified_at: '2023-01-02T00:00:00Z'
          }
        ]
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTagsResponse),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const isAvailable = await client.checkModelAvailability('llama2')

      expect(isAvailable).toBe(false)
    })

    it('should return false on API error', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response)

      const client = new OllamaClient()
      const isAvailable = await client.checkModelAvailability('llama2')

      expect(isAvailable).toBe(false)
    })

    it('should return false on timeout', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          const abortError = new Error('Request timeout')
          abortError.name = 'AbortError'
          setTimeout(() => reject(abortError), 100)
        })
      )

      const client = new OllamaClient()
      const isAvailable = await client.checkModelAvailability('llama2', 50)

      expect(isAvailable).toBe(false)
    })

    it('should use default timeout when not specified', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          const abortError = new Error('Request timeout')
          abortError.name = 'AbortError'
          setTimeout(() => reject(abortError), 6000)
        })
      )

      const client = new OllamaClient()
      const startTime = Date.now()
      const isAvailable = await client.checkModelAvailability('llama2')
      const endTime = Date.now()

      expect(isAvailable).toBe(false)
      expect(endTime - startTime).toBeLessThan(6000) // Should timeout before 6 seconds
    })
  })

  describe('Default client instance', () => {
    it('should export default client instance', () => {
      expect(ollamaClient).toBeInstanceOf(OllamaClient)
      expect(ollamaClient.getBaseUrl()).toBe('http://localhost:11434')
      expect(ollamaClient.getDefaultModel()).toBe('llama2')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON responses', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      await expect(client.generate(request)).rejects.toThrow()
    })

    it('should handle missing response field', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          model: 'llama2',
          created_at: '2023-01-01T00:00:00Z',
          done: true
          // Missing response field
        }),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const result = await client.generate(request)
      expect(result.response).toBeUndefined()
    })

    it('should handle empty response', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          model: 'llama2',
          created_at: '2023-01-01T00:00:00Z',
          response: '',
          done: true
        }),
        status: 200
      } as Response)

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const result = await client.generate(request)
      expect(result.response).toBe('')
    })
  })

  describe('Performance', () => {
    it('should complete requests within reasonable time', async () => {
      const mockResponse: OllamaGenerateResponse = {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Test response',
        done: true
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => {
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve(mockResponse),
            status: 200
          } as Response), 100)
        })
      )

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const startTime = performance.now()
      const result = await client.generate(request)
      const endTime = performance.now()

      expect(result).toEqual(mockResponse)
      expect(endTime - startTime).toBeGreaterThan(90) // Should take at least 100ms
      expect(endTime - startTime).toBeLessThan(200) // But not too long
    })

    it('should handle concurrent requests', async () => {
      const mockResponse: OllamaGenerateResponse = {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Test response',
        done: true
      }

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve(mockResponse),
            status: 200
          } as Response), 50)
        })
      )

      const client = new OllamaClient()
      const request: OllamaGenerateRequest = {
        model: 'llama2',
        prompt: 'Test prompt'
      }

      const promises = Array.from({ length: 5 }, () => client.generate(request))
      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(results[0]).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledTimes(5)
    })
  })
})