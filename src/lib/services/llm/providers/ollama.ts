// Ollama LLM Provider implementation
import { getConfig } from '../../../config/config';
import { ServiceError } from '../../../utils';
import type {
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  ProviderMetadata,
} from '../types';

// Lazy initialization to avoid server-side environment variable access during module load
// TanStack Start requires config access to happen at runtime, not module initialization
function getOllamaBaseUrl(): string {
  return getConfig().ollamaUrl || 'http://localhost:11434';
}

function getDefaultModel(): string {
  return getConfig().ollamaModel || 'llama2';
}

// Ollama-specific types (kept for backward compatibility)
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number; // max tokens equivalent
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

async function retryFetch(fn: () => Promise<Response>, maxRetries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 500; // Faster backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

export class OllamaClient implements LLMProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl?: string, defaultModel?: string) {
    // Lazy config access at construction time, not module load time
    this.baseUrl = baseUrl || getOllamaBaseUrl();
    this.defaultModel = defaultModel || getDefaultModel();
  }

  // Function overloads for backward compatibility
  async generate(request: OllamaGenerateRequest, timeoutMs?: number): Promise<OllamaGenerateResponse>;
  async generate(request: LLMGenerateRequest, timeoutMs?: number): Promise<LLMGenerateResponse>;
  async generate(request: LLMGenerateRequest | OllamaGenerateRequest, timeoutMs = 20000): Promise<LLMGenerateResponse | OllamaGenerateResponse> {
    // Always convert request and call Ollama
    const ollamaRequest: OllamaGenerateRequest = {
      model: request.model || this.defaultModel,
      prompt: request.prompt,
      stream: request.stream || false,
    };

    // Add options for temperature and max tokens if provided
    const llmRequest = request as LLMGenerateRequest;
    if (llmRequest.temperature !== undefined || llmRequest.maxTokens !== undefined) {
      ollamaRequest.options = {};
      if (llmRequest.temperature !== undefined) {
        ollamaRequest.options.temperature = llmRequest.temperature;
      }
      if (llmRequest.maxTokens !== undefined) {
        ollamaRequest.options.num_predict = llmRequest.maxTokens;
      }
    }

    const ollamaResponse = await this.generateOllama(ollamaRequest, timeoutMs);

    // Always return the new LLMGenerateResponse format for consistency
    // This ensures the provider interface works correctly
    return {
      content: ollamaResponse.response,
      model: ollamaResponse.model,
      totalTokens: ollamaResponse.eval_count,
      metadata: {
        created_at: ollamaResponse.created_at,
        done: ollamaResponse.done,
        total_duration: ollamaResponse.total_duration,
        eval_count: ollamaResponse.eval_count,
        load_duration: ollamaResponse.load_duration,
        eval_duration: ollamaResponse.eval_duration,
      },
    };
  }

  async checkModelAvailability(model: string, timeoutMs = 5000): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return false;
      const data = await response.json() as OllamaTagsResponse;
      return data.models.some((m: OllamaModel) => m.name === model);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn('Model availability check timed out');
      }
      return false;
    }
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'Ollama',
      type: 'ollama',
      requiresApiKey: false,
      supportedFeatures: {
        streaming: true,
        systemPrompt: false, // Ollama uses prompt only
        temperature: true,    // Now supported for variety
        maxTokens: true,      // Now supported
      },
    };
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  isConfigured(): boolean {
    // Ollama doesn't require API key, just check if baseUrl is set
    return !!this.baseUrl;
  }

  // Ollama-specific methods (for backward compatibility)
  async generateOllama(request: OllamaGenerateRequest, timeoutMs = 20000): Promise<OllamaGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build request body with optional options
      const requestBody: Record<string, unknown> = {
        model: request.model || this.defaultModel,
        prompt: request.prompt,
        stream: request.stream || false,
      };

      // Add options (temperature, num_predict) if provided
      if (request.options) {
        requestBody.options = request.options;
      }

      const response = await retryFetch(() => fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }));

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500) {
          throw new ServiceError('SERVER_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
        }
        throw new ServiceError('OLLAMA_API_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as OllamaGenerateResponse;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ServiceError('OLLAMA_TIMEOUT_ERROR', `Ollama request timed out after ${timeoutMs}ms`);
      }
      if (error instanceof ServiceError && (error.code === 'OLLAMA_TIMEOUT_ERROR' || error.code === 'SERVER_ERROR' || error instanceof TypeError)) {
        throw error;
      }
      throw new ServiceError('OLLAMA_API_ERROR', `Ollama request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Lazy default client instance to avoid config access during module load
// This ensures TanStack Start client/server boundary is respected
let _defaultClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!_defaultClient) {
    _defaultClient = new OllamaClient();
  }
  return _defaultClient;
}

// Maintain backward compatibility with existing code
export const ollamaClient = new Proxy({} as OllamaClient, {
  get(_target, prop) {
    const client = getOllamaClient();
    const value = client[prop as keyof OllamaClient];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});
