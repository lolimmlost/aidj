// Common LLM Provider types and interfaces
// Provides abstraction layer for multiple LLM providers (Ollama, OpenRouter, GLM)

export type ProviderType = 'ollama' | 'openrouter' | 'glm';

// Common generation request format
export interface LLMGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

// Common generation response format
export interface LLMGenerateResponse {
  content: string;
  model: string;
  totalTokens?: number;
  metadata?: {
    created_at?: string;
    done?: boolean;
    total_duration?: number;
    eval_count?: number;
    [key: string]: unknown;
  };
}

// Provider metadata
export interface ProviderMetadata {
  name: string;
  type: ProviderType;
  requiresApiKey: boolean;
  supportedFeatures: {
    streaming: boolean;
    systemPrompt: boolean;
    temperature: boolean;
    maxTokens: boolean;
  };
}

// Main provider interface that all providers must implement
export interface LLMProvider {
  // Core methods
  generate(request: LLMGenerateRequest, timeoutMs?: number): Promise<LLMGenerateResponse>;
  checkModelAvailability(model: string, timeoutMs?: number): Promise<boolean>;

  // Provider information
  getMetadata(): ProviderMetadata;
  getDefaultModel(): string;

  // Provider-specific configuration
  isConfigured(): boolean;
}

// Provider-specific error types
export type ProviderErrorCode =
  | 'PROVIDER_API_ERROR'
  | 'PROVIDER_TIMEOUT_ERROR'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT_ERROR'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_INVALID_REQUEST'
  | 'PROVIDER_SERVER_ERROR';

// Common provider configuration
export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
}
