import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '../../utils';
import { generateRecommendations, checkModelAvailability, generatePlaylist } from '../ollama';

// Mock config and env
vi.mock('../../config/config', () => ({
  getConfig: vi.fn(() => ({ ollamaUrl: 'http://localhost:11434' })),
}));

vi.mock('../navidrome', () => ({
  getLibrarySummary: vi.fn(() => Promise.resolve({
    artists: [
      { name: 'Artist1', genres: 'Rock' },
      { name: 'Artist2', genres: 'Metal' },
    ],
    songs: ['Song1', 'Song2', 'Song3'],
  })),
}));

describe('Ollama Service', () => {
  const mockUserId = 'user123';
  const mockPrompt = 'rock music';
  const mockModel = 'llama2';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRecommendations', () => {
    it('parses successful response and returns recommendations (AC3)', async () => {
      const mockResponse = {
        response: '{"recommendations": [{"song": "Song1", "explanation": "Based on rock preferences"}, {"song": "Song2", "explanation": "Based on rock preferences"}]}',
      };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      const result = await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

      expect(result.recommendations).toHaveLength(2);
      expect(result.recommendations[0].song).toBe('Song1');
      expect(result.recommendations[0].explanation).toBe('Based on rock preferences');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      if (vi.mocked(global.fetch).mock.calls.length === 0) {
        throw new Error('Fetch was not called');
      }
      const callArgs = vi.mocked(global.fetch).mock.calls[0][1]!;
      const bodyStr = callArgs.body as string;
      const bodyObj = JSON.parse(bodyStr);
      expect(bodyObj).toEqual(expect.objectContaining({
        model: mockModel,
        prompt: expect.stringContaining('Generate 5 music recommendations based on: rock music'),
        stream: false
      }));
    });
  });

    it('throws ServiceError for API error (AC3)', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        statusText: 'Bad Gateway',
      } as Response));

      const promise = generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      expect(error.code).toBe('OLLAMA_API_ERROR');
    });

    it('uses fallback for parse error without throwing (AC3)', async () => {
      const mockResponse = { response: 'invalid json' };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      const result = await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });
      expect(result.recommendations).toEqual([]);
    });

    it('retries on failure with exponential backoff (AC5)', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ response: '{"recommendations": [{"song": "Song1", "explanation": "test"}]}' }),
        } as Response);
    
      await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });
    
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }, { timeout: 15000 });

    it('throws timeout error after 30s (AC4)', async () => {
      global.fetch = vi.fn(() => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')));
  
      const promise = generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      expect(error.code).toBe('OLLAMA_TIMEOUT_ERROR');
    });
  });

  describe('checkModelAvailability', () => {
    it('returns true if model available (AC4)', async () => {
      const mockData = { models: [{ name: 'llama2' }] };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response));

      const result = await checkModelAvailability('llama2');

      expect(result).toBe(true);
    });

    it('returns false if model not available (AC4)', async () => {
      const mockData = { models: [{ name: 'other' }] };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response));

      const result = await checkModelAvailability('llama2');

      expect(result).toBe(false);
    });

    it('returns false on timeout (AC4)', async () => {
      global.fetch = vi.fn(() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        return Promise.resolve({
          ok: true,
          json: vi.fn(() => Promise.resolve({ models: [] })),
          headers: new Headers(),
          status: 200,
          statusText: 'OK',
          type: 'basic' as ResponseType,
          redirected: false,
          url: '',
          signal: controller.signal,
        } as unknown as Response);
      });

      const result = await checkModelAvailability('llama2');

      expect(result).toBe(false);
    });
  });

  describe('generatePlaylist', () => {
    const mockStyle = 'rock';
    const mockSummary = {
      artists: [
        { name: 'Artist1', genres: 'Rock' },
        { name: 'Artist2', genres: 'Metal' },
      ],
      songs: ['Song1', 'Song2', 'Song3'],
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('constructs prompt with library summary and style', async () => {
      const mockResponse = {
        response: '{"playlist": [{"song": "Artist1 - Song1", "explanation": "Fits rock theme"}]}',
      };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));
  
      await generatePlaylist({ style: mockStyle, summary: mockSummary });
  
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      if (vi.mocked(global.fetch).mock.calls.length === 0) {
        throw new Error('Fetch was not called');
      }
      const callArgs = vi.mocked(global.fetch).mock.calls[0][1]!;
      const bodyStr = callArgs.body as string;
      const bodyObj = JSON.parse(bodyStr);
      expect(bodyObj).toEqual(expect.objectContaining({
        model: 'llama2',
        prompt: expect.stringContaining('Generate exactly 10 songs for style "rock"'),
        stream: false
      }));
    });

    it('parses JSON response successfully', async () => {
      const mockResponse = {
        response: '{"playlist": [{"song": "Artist1 - Song1", "explanation": "Rock classic"}]}',
      };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      const result = await generatePlaylist({ style: mockStyle, summary: mockSummary });

      expect(result.playlist).toHaveLength(1);
      expect(result.playlist[0].song).toBe('Artist1 - Song1');
      expect(result.playlist[0].explanation).toBe('Rock classic');
    });

    it('uses fallback extraction on parse error', async () => {
      const mockResponse = {
        response: 'Invalid JSON but song: "Artist1 - Song1" explanation: fits',
      };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      const result = await generatePlaylist({ style: mockStyle, summary: mockSummary });

      expect(result.playlist).toHaveLength(1);
      expect(result.playlist[0].song).toBe('Artist1 - Song1');
      expect(result.playlist[0].explanation).toBe('Fits the requested style based on your library');
    });


    it('throws timeout error after 5s', async () => {
      global.fetch = vi.fn(() => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')));
    
      const promise = generatePlaylist({ style: mockStyle, summary: mockSummary });
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      expect(error.code).toBe('OLLAMA_TIMEOUT_ERROR');
    });
  });

  // Caching is handled in UI (localStorage/TanStack Query), not service. Tests for UI caching in component tests