import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OpenRouterClient } from '../providers/openrouter';
import type { LLMGenerateRequest } from '../types';

// Mock fetch
global.fetch = vi.fn();

describe('OpenRouterClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should create client with API key and default model', () => {
      const client = new OpenRouterClient('test-api-key');

      expect(client.getDefaultModel()).toBe('anthropic/claude-3.5-sonnet');
      expect(client.isConfigured()).toBe(true);
    });

    it('should create client with custom model', () => {
      const client = new OpenRouterClient('test-api-key', 'openai/gpt-4');

      expect(client.getDefaultModel()).toBe('openai/gpt-4');
    });

    it('should return false for isConfigured when no API key', () => {
      const client = new OpenRouterClient('');

      expect(client.isConfigured()).toBe(false);
    });
  });

  describe('Provider Metadata', () => {
    it('should return correct provider metadata', () => {
      const client = new OpenRouterClient('test-api-key');
      const metadata = client.getMetadata();

      expect(metadata.name).toBe('OpenRouter');
      expect(metadata.type).toBe('openrouter');
      expect(metadata.requiresApiKey).toBe(true);
      expect(metadata.supportedFeatures.streaming).toBe(true);
      expect(metadata.supportedFeatures.systemPrompt).toBe(true);
      expect(metadata.supportedFeatures.temperature).toBe(true);
      expect(metadata.supportedFeatures.maxTokens).toBe(true);
    });
  });

  describe('generate method', () => {
    it('should throw error when API key is missing', async () => {
      const client = new OpenRouterClient('');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test prompt',
      };

      await expect(client.generate(request)).rejects.toThrow('OpenRouter API key is required');
    });

    it('should make successful generation request', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'anthropic/claude-3.5-sonnet',
        created: 1234567890,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200,
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test prompt',
      };

      const result = await client.generate(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );

      expect(result.content).toBe('Test response');
      expect(result.model).toBe('anthropic/claude-3.5-sonnet');
      expect(result.totalTokens).toBe(30);
    });

    it('should include system prompt when provided', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'anthropic/claude-3.5-sonnet',
        created: 1234567890,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200,
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test prompt',
        systemPrompt: 'You are a helpful assistant',
        temperature: 0.7,
        maxTokens: 100,
      };

      await client.generate(request);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs?.body as string);

      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('You are a helpful assistant');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('Test prompt');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(100);
    });

    it('should handle 401 authentication error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      } as Response);

      const client = new OpenRouterClient('invalid-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Authentication failed');
    });

    it('should handle 429 rate limit error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded' },
        }),
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle 500 server error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: { message: 'Internal server error' },
        }),
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Server error');
    });

    it('should handle 404 model not found error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: { message: 'Model not found' },
        }),
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'invalid/model',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Model not found');
    });

    it('should handle timeout errors', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({}),
            } as Response);
          }, 60000); // Longer than timeout
        })
      );

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      const generatePromise = client.generate(request, 5000);

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(5000);

      await expect(generatePromise).rejects.toThrow('timed out');
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('OpenRouter request failed');
    });

    it('should handle empty response choices', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'anthropic/claude-3.5-sonnet',
        created: 1234567890,
        choices: [],
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200,
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('No response choices returned');
    });
  });

  describe('checkModelAvailability method', () => {
    it('should return true for known model prefixes', async () => {
      const client = new OpenRouterClient('test-api-key');

      expect(await client.checkModelAvailability('anthropic/claude-3.5-sonnet')).toBe(true);
      expect(await client.checkModelAvailability('openai/gpt-4')).toBe(true);
      expect(await client.checkModelAvailability('meta-llama/llama-2-70b')).toBe(true);
      expect(await client.checkModelAvailability('google/gemini-pro')).toBe(true);
    });

    it('should return false for unknown model prefixes', async () => {
      const client = new OpenRouterClient('test-api-key');

      expect(await client.checkModelAvailability('unknown/model')).toBe(false);
      expect(await client.checkModelAvailability('invalid-model')).toBe(false);
    });
  });

  describe('Retry logic', () => {
    it('should retry on 500 errors with exponential backoff', async () => {
      const mockFetch = vi.mocked(fetch);

      // First two attempts fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Server error' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Server error' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: 'chatcmpl-123',
            model: 'anthropic/claude-3.5-sonnet',
            created: 1234567890,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Success after retry' },
                finish_reason: 'stop',
              },
            ],
          }),
        } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      const resultPromise = client.generate(request);

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.content).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 401 errors', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
      } as Response);

      const client = new OpenRouterClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Authentication failed');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });
  });
});
