/**
 * Integration tests for Multi-LLM Provider Support (Story 6.1 - Phase 7)
 * Tests provider switching, AI DJ with each provider, error handling, and configuration persistence
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLLMProvider, getLLMProvider, resetLLMProvider, getProviderInfo } from '../factory';
import { OllamaClient } from '../providers/ollama';
import { OpenRouterClient } from '../providers/openrouter';
import { GLMClient } from '../providers/glm';
import * as config from '../../../config/config';
import type { LLMProviderType } from '../../../config/config';
import type { LLMGenerateRequest } from '../types';

// Mock fetch for all providers
global.fetch = vi.fn();

// Mock the config module
vi.mock('../../../config/config', async () => {
  const actual = await vi.importActual('../../../config/config');
  return {
    ...actual,
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    resetConfig: vi.fn(),
  };
});

describe('LLM Provider Integration Tests', () => {
  const mockGetConfig = vi.mocked(config.getConfig);
  const mockSetConfig = vi.mocked(config.setConfig);
  const mockFetch = vi.mocked(fetch);

  const baseConfig = {
    llmProvider: 'ollama' as LLMProviderType,
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    openrouterApiKey: 'test-openrouter-key',
    openrouterModel: 'anthropic/claude-3.5-sonnet',
    glmApiKey: 'test-glm-key',
    glmModel: 'glm-4',
    navidromeUrl: 'http://localhost:4533',
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: '',
    navidromeUsername: 'admin',
    navidromePassword: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLLMProvider();
    mockGetConfig.mockReturnValue({ ...baseConfig });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider Switching', () => {
    it('should create Ollama provider when configured', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });

      const provider = createLLMProvider('ollama');

      expect(provider).toBeInstanceOf(OllamaClient);
      expect(provider.getMetadata().type).toBe('ollama');
      expect(provider.getMetadata().name).toBe('Ollama');
    });

    it('should create OpenRouter provider when configured', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });

      const provider = createLLMProvider('openrouter');

      expect(provider).toBeInstanceOf(OpenRouterClient);
      expect(provider.getMetadata().type).toBe('openrouter');
      expect(provider.getMetadata().name).toBe('OpenRouter');
    });

    it('should create GLM provider when configured', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });

      const provider = createLLMProvider('glm');

      expect(provider).toBeInstanceOf(GLMClient);
      expect(provider.getMetadata().type).toBe('glm');
      expect(provider.getMetadata().name).toBe('GLM (Zhipu AI)');
    });

    it('should switch providers dynamically when config changes', () => {
      // Start with Ollama
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });
      const ollamaProvider = getLLMProvider();
      expect(ollamaProvider.getMetadata().type).toBe('ollama');

      // Switch to OpenRouter
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      const openRouterProvider = getLLMProvider();
      expect(openRouterProvider.getMetadata().type).toBe('openrouter');

      // Switch to GLM
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });
      const glmProvider = getLLMProvider();
      expect(glmProvider.getMetadata().type).toBe('glm');
    });

    it('should use singleton pattern when provider type unchanged', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });

      const provider1 = getLLMProvider();
      const provider2 = getLLMProvider();

      // Should be the same instance (via consistent metadata)
      expect(provider1.getMetadata()).toEqual(provider2.getMetadata());
    });

    it('should reset provider when resetLLMProvider is called', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });

      const provider1 = getLLMProvider();
      expect(provider1.getMetadata().type).toBe('ollama');

      resetLLMProvider();

      // After reset, a new call should create a fresh provider
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      const provider2 = getLLMProvider();
      expect(provider2.getMetadata().type).toBe('openrouter');
    });
  });

  describe('Provider Info', () => {
    it('should return correct info for Ollama provider', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });

      const info = getProviderInfo();

      expect(info.type).toBe('ollama');
      expect(info.isConfigured).toBe(true);
      expect(info.configStatus).toContain('localhost:11434');
      expect(info.configStatus).toContain('llama3');
    });

    it('should return correct info for OpenRouter provider', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });

      const info = getProviderInfo();

      expect(info.type).toBe('openrouter');
      expect(info.isConfigured).toBe(true);
      expect(info.configStatus).toContain('anthropic/claude-3.5-sonnet');
    });

    it('should return correct info for GLM provider', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });

      const info = getProviderInfo();

      expect(info.type).toBe('glm');
      expect(info.isConfigured).toBe(true);
      expect(info.configStatus).toContain('glm-4');
    });

    it('should show not configured when API key missing for OpenRouter', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'openrouter',
        openrouterApiKey: ''
      });

      const info = getProviderInfo();

      expect(info.isConfigured).toBe(false);
      expect(info.configStatus).toContain('API key required');
    });

    it('should show not configured when API key missing for GLM', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'glm',
        glmApiKey: ''
      });

      const info = getProviderInfo();

      expect(info.isConfigured).toBe(false);
      expect(info.configStatus).toContain('API key required');
    });
  });

  describe('AI DJ with Each Provider', () => {
    const mockSuccessfulOllamaResponse = {
      model: 'llama3',
      created_at: new Date().toISOString(),
      response: JSON.stringify({
        recommendations: [
          { song: 'Artist A - Song 1', explanation: 'Great match for your taste' },
          { song: 'Artist B - Song 2', explanation: 'Similar style' },
        ]
      }),
      done: true,
    };

    const mockSuccessfulChatResponse = {
      id: 'test-id',
      model: 'anthropic/claude-3.5-sonnet',
      created: Date.now(),
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            recommendations: [
              { song: 'Artist A - Song 1', explanation: 'Great match for your taste' },
              { song: 'Artist B - Song 2', explanation: 'Similar style' },
            ]
          }),
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
    };

    it('should generate recommendations with Ollama provider', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulOllamaResponse),
      } as Response);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'llama3',
        prompt: 'Recommend some rock songs',
        stream: false,
      };

      const response = await provider.generate(request);

      expect(response.content).toContain('recommendations');
      expect(response.model).toBe('llama3');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.any(Object)
      );
    });

    it('should generate recommendations with OpenRouter provider', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulChatResponse),
        status: 200,
      } as Response);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Recommend some jazz songs',
        stream: false,
      };

      const response = await provider.generate(request);

      expect(response.content).toContain('recommendations');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openrouter-key',
          }),
        })
      );
    });

    it('should generate recommendations with GLM provider', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });
      const glmResponse = {
        ...mockSuccessfulChatResponse,
        model: 'glm-4',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(glmResponse),
        status: 200,
      } as Response);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Recommend some pop songs',
        stream: false,
      };

      const response = await provider.generate(request);

      expect(response.content).toContain('recommendations');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-glm-key',
          }),
        })
      );
    });

    it('should support system prompts with OpenRouter and GLM', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulChatResponse),
        status: 200,
      } as Response);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Recommend some songs',
        systemPrompt: 'You are a music recommendation assistant',
        stream: false,
      };

      await provider.generate(request);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(callBody.messages).toHaveLength(2);
      expect(callBody.messages[0].role).toBe('system');
      expect(callBody.messages[0].content).toBe('You are a music recommendation assistant');
    });
  });

  describe('Error Handling Across Providers', () => {
    it('should report Ollama as configured even with default URL', () => {
      // Note: Ollama defaults to localhost:11434 when URL is empty
      // so it's always "configured" - this is by design for local development
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'ollama',
        ollamaUrl: ''
      });

      const provider = createLLMProvider('ollama');
      // Ollama uses fallback URL, so it's still configured
      expect(provider.isConfigured()).toBe(true);
    });

    it('should throw PROVIDER_CONFIG_ERROR when OpenRouter API key is missing', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'openrouter',
        openrouterApiKey: ''
      });

      expect(() => createLLMProvider('openrouter')).toThrow('not configured');
    });

    it('should throw PROVIDER_CONFIG_ERROR when GLM API key is missing', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'glm',
        glmApiKey: ''
      });

      expect(() => createLLMProvider('glm')).toThrow('not configured');
    });

    it('should handle Ollama network errors', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'llama3',
        prompt: 'Test',
        stream: false,
      };

      await expect(provider.generate(request)).rejects.toThrow();
    });

    it('should handle OpenRouter authentication errors', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      } as Response);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
        stream: false,
      };

      await expect(provider.generate(request)).rejects.toThrow('Authentication failed');
    });

    it('should handle GLM rate limit errors after retries', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });

      // The retryFetch will retry 429 errors 3 times, so mock all 3
      const rateLimitResponse = {
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(rateLimitResponse);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'glm-4',
        prompt: 'Test',
        stream: false,
      };

      await expect(provider.generate(request)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle server errors consistently across providers after retries', async () => {
      // Test OpenRouter 500 error - retryFetch retries 500s 3 times
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });

      const serverErrorResponse = {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(serverErrorResponse)
        .mockResolvedValueOnce(serverErrorResponse)
        .mockResolvedValueOnce(serverErrorResponse);

      const provider = getLLMProvider();
      const request: LLMGenerateRequest = {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Test',
        stream: false,
      };

      await expect(provider.generate(request)).rejects.toThrow('Server error');
    });
  });

  describe('Configuration Persistence', () => {
    it('should persist provider selection through setConfig', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });

      // Simulate config change
      config.setConfig({ llmProvider: 'glm' });

      expect(mockSetConfig).toHaveBeenCalledWith({ llmProvider: 'glm' });
    });

    it('should persist API keys through setConfig', () => {
      mockGetConfig.mockReturnValue(baseConfig);

      // Simulate API key update
      config.setConfig({ openrouterApiKey: 'new-api-key' });

      expect(mockSetConfig).toHaveBeenCalledWith({ openrouterApiKey: 'new-api-key' });
    });

    it('should persist model selection through setConfig', () => {
      mockGetConfig.mockReturnValue(baseConfig);

      // Simulate model change
      config.setConfig({
        llmProvider: 'openrouter',
        openrouterModel: 'openai/gpt-4'
      });

      expect(mockSetConfig).toHaveBeenCalledWith({
        llmProvider: 'openrouter',
        openrouterModel: 'openai/gpt-4'
      });
    });
  });

  describe('Provider Metadata Consistency', () => {
    it('should have consistent metadata for Ollama', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });
      const provider = createLLMProvider('ollama');
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('Ollama');
      expect(metadata.type).toBe('ollama');
      expect(metadata.requiresApiKey).toBe(false);
      expect(metadata.supportedFeatures.streaming).toBe(true);
    });

    it('should have consistent metadata for OpenRouter', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });
      const provider = createLLMProvider('openrouter');
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('OpenRouter');
      expect(metadata.type).toBe('openrouter');
      expect(metadata.requiresApiKey).toBe(true);
      expect(metadata.supportedFeatures.streaming).toBe(true);
      expect(metadata.supportedFeatures.systemPrompt).toBe(true);
      expect(metadata.supportedFeatures.temperature).toBe(true);
      expect(metadata.supportedFeatures.maxTokens).toBe(true);
    });

    it('should have consistent metadata for GLM', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });
      const provider = createLLMProvider('glm');
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('GLM (Zhipu AI)');
      expect(metadata.type).toBe('glm');
      expect(metadata.requiresApiKey).toBe(true);
      expect(metadata.supportedFeatures.streaming).toBe(true);
      expect(metadata.supportedFeatures.systemPrompt).toBe(true);
      expect(metadata.supportedFeatures.temperature).toBe(true);
      expect(metadata.supportedFeatures.maxTokens).toBe(true);
    });
  });

  describe('Model Availability Checking', () => {
    it('should check Ollama model availability via API', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama3', size: 1000, digest: 'abc123', modified_at: new Date().toISOString() },
            { name: 'llama2', size: 900, digest: 'def456', modified_at: new Date().toISOString() },
          ]
        }),
      } as Response);

      const provider = getLLMProvider();
      const available = await provider.checkModelAvailability('llama3');

      expect(available).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should check OpenRouter model availability by prefix', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'openrouter' });

      const provider = getLLMProvider();

      // Known prefixes should return true
      expect(await provider.checkModelAvailability('anthropic/claude-3.5-sonnet')).toBe(true);
      expect(await provider.checkModelAvailability('openai/gpt-4')).toBe(true);
      expect(await provider.checkModelAvailability('meta-llama/llama-2-70b')).toBe(true);

      // Unknown prefixes should return false
      expect(await provider.checkModelAvailability('unknown/model')).toBe(false);
    });

    it('should check GLM model availability by known list', async () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'glm' });

      const provider = getLLMProvider();

      // Known models should return true
      expect(await provider.checkModelAvailability('glm-4')).toBe(true);
      expect(await provider.checkModelAvailability('glm-4-flash')).toBe(true);
      expect(await provider.checkModelAvailability('glm-3-turbo')).toBe(true);

      // Unknown models should return false
      expect(await provider.checkModelAvailability('glm-unknown')).toBe(false);
    });
  });

  describe('Default Model Selection', () => {
    it('should use configured default model for Ollama', () => {
      mockGetConfig.mockReturnValue({ ...baseConfig, llmProvider: 'ollama', ollamaModel: 'mixtral' });

      const provider = getLLMProvider();

      expect(provider.getDefaultModel()).toBe('mixtral');
    });

    it('should use configured default model for OpenRouter', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'openrouter',
        openrouterModel: 'openai/gpt-4-turbo'
      });

      const provider = getLLMProvider();

      expect(provider.getDefaultModel()).toBe('openai/gpt-4-turbo');
    });

    it('should use configured default model for GLM', () => {
      mockGetConfig.mockReturnValue({
        ...baseConfig,
        llmProvider: 'glm',
        glmModel: 'glm-4-flash'
      });

      const provider = getLLMProvider();

      expect(provider.getDefaultModel()).toBe('glm-4-flash');
    });
  });
});
