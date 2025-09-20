import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRecommendations, checkModelAvailability } from '../ollama';
import { db } from '../../db';
import { recommendationsCache } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';

// Mock config and env
vi.mock('../../config/config', () => ({
  getConfig: vi.fn(() => ({ ollamaUrl: 'http://localhost:11434' })),
}));

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mockhash'),
  })),
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
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
        response: '{"songs": ["Song1", "Song2"], "explanation": "Based on rock preferences"}',
      };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      const result = await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

      expect(result.recommendations).toEqual(['Song1', 'Song2']);
      expect(result.explanation).toBe('Based on rock preferences');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/generate'), expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(expect.objectContaining({
          model: mockModel,
          prompt: expect.stringContaining(mockPrompt),
        })),
      }));
    });

    it('throws OllamaError for API error (AC3)', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        statusText: 'Bad Gateway',
      } as Response));

      await expect(generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId })).rejects.toThrow('API_ERROR');
    });

    it('throws OllamaError for parse error (AC3)', async () => {
      const mockResponse = { response: 'invalid json' };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      await expect(generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId })).rejects.toThrow('PARSE_ERROR');
    });

    it('retries on failure with exponential backoff (AC5)', async () => {
      const fetchCalls = vi.fn();
      global.fetch = fetchCalls;
      fetchCalls.mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ response: '{"songs": ["Song1"], "explanation": "test"}' }),
        } as Response);

      await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

      expect(fetchCalls).toHaveBeenCalledTimes(3);
    });

    it('caches and returns from cache if valid (AC6)', async () => {
      const mockCache = [{ recommendations: ['Song1'], explanation: 'cached' }];
      vi.mocked(db.select).mockResolvedValueOnce(mockCache);

      const result = await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

      expect(result.recommendations).toEqual(['Song1']);
      expect(vi.mocked(db.select).mock.calls[0][1].where).toMatchObject(and(
        eq(recommendationsCache.userId, mockUserId),
        eq(recommendationsCache.promptHash, 'mockhash'),
        gt(recommendationsCache.expiresAt, expect.any(Date))
      ));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('generates and caches if no valid cache (AC6)', async () => {
      vi.mocked(db.select).mockResolvedValueOnce([]); // No cache
      const mockResponse = { response: '{"songs": ["Song1"], "explanation": "new"}' };
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response));

      await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

      expect(vi.mocked(db.insert).toHaveBeenCalledWith(recommendationsCache, expect.objectContaining({
        values: expect.objectContaining({
          userId: mockUserId,
          promptHash: 'mockhash',
          recommendations: ['Song1'],
          explanation: 'new',
          expiresAt: expect.any(Date),
        }),
      }));
    });

    it('throws timeout error after 5s (AC4)', async () => {
      global.fetch = vi.fn(() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100); // Abort early for test
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: '{}' }),
          signal: controller.signal,
        } as any);
      });

      await expect(generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId })).rejects.toThrow('TIMEOUT_ERROR');
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
          json: () => Promise.resolve({ models: [] }),
          signal: controller.signal,
        } as any);
      });

      const result = await checkModelAvailability('llama2');

      expect(result).toBe(false);
    });
  });