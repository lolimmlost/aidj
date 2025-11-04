// LLM Provider Factory
// Creates the appropriate LLM provider based on configuration
import { getConfig } from '../../config/config';
import { OllamaClient } from './providers/ollama';
import { OpenRouterClient } from './providers/openrouter';
import { GLMClient } from './providers/glm';
import { ServiceError } from '../../utils';
import type { LLMProvider } from './types';
import type { LLMProviderType } from '../../config/config';

/**
 * Creates an LLM provider instance based on the specified provider type
 * @param providerType The type of provider to create (ollama | openrouter | glm)
 * @returns Configured LLM provider instance
 * @throws ServiceError if provider is not configured correctly
 */
export function createLLMProvider(providerType: LLMProviderType): LLMProvider {
  const config = getConfig();

  switch (providerType) {
    case 'ollama': {
      const client = new OllamaClient(config.ollamaUrl, config.ollamaModel);
      if (!client.isConfigured()) {
        throw new ServiceError(
          'PROVIDER_CONFIG_ERROR',
          'Ollama provider is not configured. Please set ollamaUrl in configuration.'
        );
      }
      return client;
    }

    case 'openrouter': {
      const client = new OpenRouterClient(
        config.openrouterApiKey,
        config.openrouterModel
      );
      if (!client.isConfigured()) {
        throw new ServiceError(
          'PROVIDER_CONFIG_ERROR',
          'OpenRouter provider is not configured. Please set openrouterApiKey in configuration or OPENROUTER_API_KEY environment variable.'
        );
      }
      return client;
    }

    case 'glm': {
      const client = new GLMClient(
        config.glmApiKey,
        config.glmModel
      );
      if (!client.isConfigured()) {
        throw new ServiceError(
          'PROVIDER_CONFIG_ERROR',
          'GLM provider is not configured. Please set glmApiKey in configuration or GLM_API_KEY environment variable.'
        );
      }
      return client;
    }

    default: {
      // TypeScript will catch this at compile time, but handle at runtime too
      const exhaustiveCheck: never = providerType;
      throw new ServiceError(
        'PROVIDER_CONFIG_ERROR',
        `Unknown LLM provider type: ${exhaustiveCheck}`
      );
    }
  }
}

/**
 * Singleton instance of the current LLM provider
 * Recreated when provider type changes
 */
let currentProvider: LLMProvider | null = null;
let currentProviderType: LLMProviderType | null = null;

/**
 * Gets the current LLM provider instance
 * Creates a new instance if provider type has changed or no instance exists
 * This is the primary way to access the LLM provider throughout the application
 *
 * @returns The configured LLM provider instance
 * @throws ServiceError if provider is not configured correctly
 */
export function getLLMProvider(): LLMProvider {
  const config = getConfig();
  const configuredProvider = config.llmProvider;

  // Create new provider if type changed or doesn't exist
  if (!currentProvider || currentProviderType !== configuredProvider) {
    console.log(`🔄 Switching LLM provider to: ${configuredProvider}`);
    currentProvider = createLLMProvider(configuredProvider);
    currentProviderType = configuredProvider;
  }

  return currentProvider;
}

/**
 * Resets the provider singleton
 * Useful for testing or when configuration changes
 */
export function resetLLMProvider(): void {
  currentProvider = null;
  currentProviderType = null;
}

/**
 * Gets information about the current provider without creating an instance
 * @returns Provider type and configuration status
 */
export function getProviderInfo() {
  const config = getConfig();
  const providerType = config.llmProvider;

  let isConfigured = false;
  let configStatus = '';

  switch (providerType) {
    case 'ollama':
      isConfigured = !!config.ollamaUrl;
      configStatus = isConfigured
        ? `Connected to ${config.ollamaUrl} using ${config.ollamaModel}`
        : 'Not configured - ollamaUrl required';
      break;

    case 'openrouter':
      isConfigured = !!config.openrouterApiKey;
      configStatus = isConfigured
        ? `Using ${config.openrouterModel}`
        : 'Not configured - API key required';
      break;

    case 'glm':
      isConfigured = !!config.glmApiKey;
      configStatus = isConfigured
        ? `Using ${config.glmModel}`
        : 'Not configured - API key required';
      break;
  }

  return {
    type: providerType,
    isConfigured,
    configStatus,
  };
}
