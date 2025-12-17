import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GLMClient } from '../providers/glm';
import type { LLMGenerateRequest } from '../types';

// Mock fetch
global.fetch = vi.fn();

describe('GLMClient', () => {
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
      const client = new GLMClient('test-api-key');

      expect(client.getDefaultModel()).toBe('glm-4');
      expect(client.isConfigured()).toBe(true);
    });

    it('should create client with custom model', () => {
      const client = new GLMClient('test-api-key', 'glm-4-flash');

      expect(client.getDefaultModel()).toBe('glm-4-flash');
    });

    it('should return false for isConfigured when no API key', () => {
      const client = new GLMClient('');

      expect(client.isConfigured()).toBe(false);
    });
  });

  describe('Provider Metadata', () => {
    it('should return correct provider metadata', () => {
      const client = new GLMClient('test-api-key');
      const metadata = client.getMetadata();

      expect(metadata.name).toBe('GLM (Zhipu AI)');
      expect(metadata.type).toBe('glm');
      expect(metadata.requiresApiKey).toBe(true);
      expect(metadata.supportedFeatures.streaming).toBe(true);
      expect(metadata.supportedFeatures.systemPrompt).toBe(true);
      expect(metadata.supportedFeatures.temperature).toBe(true);
      expect(metadata.supportedFeatures.maxTokens).toBe(true);
    });
  });

  describe('generate method', () => {
    it('should throw error when API key is missing', async () => {
      const client = new GLMClient('');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test prompt',
      };

      await expect(client.generate(request)).rejects.toThrow('GLM API key is required');
    });

    it('should make successful generation request', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'glm-4',
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

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test prompt',
      };

      const result = await client.generate(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );

      expect(result.content).toBe('Test response');
      expect(result.model).toBe('glm-4');
      expect(result.totalTokens).toBe(30);
    });

    it('should include system prompt when provided', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'glm-4',
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

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
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

      const client = new GLMClient('invalid-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Authentication failed');
    });

    it('should handle 429 rate limit error', async () => {
      const mockFetch = vi.mocked(fetch);
      // Mock all 3 retry attempts
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
        } as Response);

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      // Start promise and immediately attach rejection handler to avoid unhandled rejection
      const promise = client.generate(request).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Rate limit exceeded');
    });

    it('should handle 500 server error', async () => {
      const mockFetch = vi.mocked(fetch);
      // Mock all 3 retry attempts
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
        } as Response);

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      // Start promise and immediately attach rejection handler to avoid unhandled rejection
      const promise = client.generate(request).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Server error');
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

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'invalid-model',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Model not found');
    });

    it('should handle timeout errors', async () => {
      const mockFetch = vi.mocked(fetch);
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      await expect(client.generate(request, 5000)).rejects.toThrow('timed out');
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.mocked(fetch);
      // Mock all 3 retry attempts for network errors
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      // Start promise and immediately attach rejection handler to avoid unhandled rejection
      const promise = client.generate(request).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('GLM request failed');
    });

    it('should handle empty response choices', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'glm-4',
        created: 1234567890,
        choices: [],
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        status: 200,
      } as Response);

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('No response choices returned');
    });
  });

  describe('checkModelAvailability method', () => {
    it('should return true for known GLM models', async () => {
      const client = new GLMClient('test-api-key');

      expect(await client.checkModelAvailability('glm-4')).toBe(true);
      expect(await client.checkModelAvailability('glm-4-flash')).toBe(true);
      expect(await client.checkModelAvailability('glm-3-turbo')).toBe(true);
      expect(await client.checkModelAvailability('glm-4-plus')).toBe(true);
      expect(await client.checkModelAvailability('glm-4-air')).toBe(true);
      expect(await client.checkModelAvailability('glm-4-airx')).toBe(true);
    });

    it('should return false for unknown models', async () => {
      const client = new GLMClient('test-api-key');

      expect(await client.checkModelAvailability('unknown-model')).toBe(false);
      expect(await client.checkModelAvailability('gpt-4')).toBe(false);
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
            model: 'glm-4',
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

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
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

      const client = new GLMClient('test-api-key');
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
      };

      await expect(client.generate(request)).rejects.toThrow('Authentication failed');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });
  });
});
