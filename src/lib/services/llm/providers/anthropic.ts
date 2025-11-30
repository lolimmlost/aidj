// Anthropic LLM Provider implementation
// Supports Anthropic API and compatible proxies (like z.ai)
import { ServiceError } from '../../../utils';
import type {
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  ProviderMetadata,
} from '../types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

// Anthropic uses a messages API format
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

async function retryFetch(
  fn: () => Promise<Response>,
  maxRetries = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      // Don't retry on client errors (4xx) except 429 (rate limit) and 529 (overloaded)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      // Retry on 429, 529 and 5xx errors
      if (response.status === 429 || response.status === 529 || response.status >= 500) {
        if (attempt === maxRetries) return response;
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

export class AnthropicClient implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel = 'claude-sonnet-4-5-20250514',
    baseUrl = ANTHROPIC_BASE_URL
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async generate(request: LLMGenerateRequest, timeoutMs = 60000): Promise<LLMGenerateResponse> {
    if (!this.apiKey) {
      throw new ServiceError('PROVIDER_AUTH_ERROR', 'Anthropic API key is required');
    }

    // Convert LLMGenerateRequest to Anthropic messages format
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: request.prompt,
      },
    ];

    const anthropicRequest: AnthropicRequest = {
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxTokens || 4096,
      stream: request.stream || false,
    };

    // Anthropic uses 'system' as a top-level parameter, not in messages
    if (request.systemPrompt) {
      anthropicRequest.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Determine the endpoint - handle both direct Anthropic and proxy endpoints
    let endpoint = `${this.baseUrl}/messages`;
    // If using z.ai proxy with /api/anthropic path, don't add /messages
    if (this.baseUrl.includes('/api/anthropic')) {
      endpoint = this.baseUrl;
    }

    try {
      const response = await retryFetch(() => fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicRequest),
        signal: controller.signal,
      }));

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as AnthropicErrorResponse | null;
        const errorMessage = errorData?.error?.message || `Anthropic API error: ${response.status}`;

        if (response.status === 401) {
          throw new ServiceError('PROVIDER_AUTH_ERROR', `Authentication failed: ${errorMessage}`);
        }
        if (response.status === 429) {
          throw new ServiceError('PROVIDER_RATE_LIMIT_ERROR', `Rate limit exceeded: ${errorMessage}`);
        }
        if (response.status === 404) {
          throw new ServiceError('PROVIDER_MODEL_NOT_FOUND', `Model not found: ${errorMessage}`);
        }
        if (response.status === 529) {
          throw new ServiceError('PROVIDER_SERVER_ERROR', `API overloaded: ${errorMessage}`);
        }
        if (response.status >= 500) {
          throw new ServiceError('PROVIDER_SERVER_ERROR', `Server error: ${errorMessage}`);
        }
        throw new ServiceError('PROVIDER_API_ERROR', errorMessage);
      }

      const data = await response.json() as AnthropicResponse;

      if (!data.content || data.content.length === 0) {
        throw new ServiceError('PROVIDER_API_ERROR', 'No response content returned');
      }

      // Extract text from content blocks
      const textContent = data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      return {
        content: textContent,
        model: data.model,
        totalTokens: data.usage ? data.usage.input_tokens + data.usage.output_tokens : undefined,
        metadata: {
          id: data.id,
          stop_reason: data.stop_reason,
          usage: data.usage,
        },
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ServiceError('PROVIDER_TIMEOUT_ERROR', `Request timed out after ${timeoutMs}ms`);
      }
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('PROVIDER_API_ERROR', `Anthropic request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async checkModelAvailability(model: string): Promise<boolean> {
    // Known Anthropic models
    const knownModels = [
      'claude-sonnet-4-5-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];

    // Also accept model names that start with known prefixes
    const knownPrefixes = ['claude-3', 'claude-sonnet', 'claude-opus', 'claude-haiku'];

    return knownModels.includes(model) || knownPrefixes.some(prefix => model.startsWith(prefix));
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'Anthropic',
      type: 'anthropic',
      requiresApiKey: true,
      supportedFeatures: {
        streaming: true,
        systemPrompt: true,
        temperature: true,
        maxTokens: true,
      },
    };
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}
