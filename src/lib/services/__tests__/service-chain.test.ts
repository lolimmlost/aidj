import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRecommendations } from '../ollama';
import { getLibrarySummary } from '../navidrome';
import { ServiceError } from '../../utils';

// Mock the services
vi.mock('../navidrome', () => ({
  getLibrarySummary: vi.fn(),
}));

vi.mock('../config/config', () => ({
  getConfig: vi.fn(() => ({ ollamaUrl: 'http://localhost:11434' })),
}));

describe('Service Chain Integration Tests', () => {
  const mockPrompt = 'rock music';
  const mockModel = 'llama2';
  const mockUserId = 'user123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates Navidrome error in Ollama recommendations (AC5)', async () => {
    // Mock getLibrarySummary to throw ServiceError
    const mockNavError = new ServiceError('NAVIDROME_API_ERROR', 'Library fetch failed');
    vi.mocked(getLibrarySummary).mockRejectedValue(mockNavError);

    // Mock fetch to simulate Ollama call (but error should propagate before)
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: '{}' }),
    } as Response));

    const promise = generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });
    await expect(promise).rejects.toBeInstanceOf(ServiceError);
    const error = await promise.catch(e => e);
    expect(error).toBe(mockNavError); // Same instance or same code/message
    expect(error.code).toBe('NAVIDROME_API_ERROR');
    expect(vi.mocked(getLibrarySummary)).toHaveBeenCalled();
  });

  it('handles successful chain without errors', async () => {
    // Mock successful library summary
    vi.mocked(getLibrarySummary).mockResolvedValue({
      artists: [{ name: 'Test Artist', genres: 'Rock' }],
      songs: ['Test Song'],
    });

    // Mock Ollama response
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        response: '{"recommendations": [{"song": "Test Song", "explanation": "Test"}]}',
      }),
    } as Response));

    const result = await generateRecommendations({ prompt: mockPrompt, model: mockModel, userId: mockUserId });

    expect(result.recommendations).toHaveLength(1);
    expect(vi.mocked(getLibrarySummary)).toHaveBeenCalled();
  });
});