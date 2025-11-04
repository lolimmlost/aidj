// GLM (Zhipu AI) LLM Provider implementation
// GLM provides Chinese-focused LLM models via chat completions API
import { ServiceError } from '../../../utils';
import type {
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  ProviderMetadata,
} from '../types';

const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

// GLM uses a chat completions format similar to OpenAI
interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMChatRequest {
  model: string;
  messages: GLMMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  top_p?: number;
}

interface GLMChatResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GLMErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
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
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      // Retry on 429 and 5xx errors
      if (response.status === 429 || response.status >= 500) {
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

export class GLMClient implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'glm-4', baseUrl = GLM_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async generate(request: LLMGenerateRequest, timeoutMs = 30000): Promise<LLMGenerateResponse> {
    if (!this.apiKey) {
      throw new ServiceError('PROVIDER_AUTH_ERROR', 'GLM API key is required');
    }

    // Convert LLMGenerateRequest to GLM chat format
    const messages: GLMMessage[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: request.prompt,
    });

    const chatRequest: GLMChatRequest = {
      model: request.model || this.defaultModel,
      messages,
      stream: request.stream || false,
    };

    if (request.maxTokens) {
      chatRequest.max_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      chatRequest.temperature = request.temperature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await retryFetch(() => fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(chatRequest),
        signal: controller.signal,
      }));

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as GLMErrorResponse | null;
        const errorMessage = errorData?.error?.message || `GLM API error: ${response.status}`;

        if (response.status === 401) {
          throw new ServiceError('PROVIDER_AUTH_ERROR', `Authentication failed: ${errorMessage}`);
        }
        if (response.status === 429) {
          throw new ServiceError('PROVIDER_RATE_LIMIT_ERROR', `Rate limit exceeded: ${errorMessage}`);
        }
        if (response.status === 404) {
          throw new ServiceError('PROVIDER_MODEL_NOT_FOUND', `Model not found: ${errorMessage}`);
        }
        if (response.status >= 500) {
          throw new ServiceError('PROVIDER_SERVER_ERROR', `Server error: ${errorMessage}`);
        }
        throw new ServiceError('PROVIDER_API_ERROR', errorMessage);
      }

      const data = await response.json() as GLMChatResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new ServiceError('PROVIDER_API_ERROR', 'No response choices returned');
      }

      return {
        content: data.choices[0].message.content,
        model: data.model,
        totalTokens: data.usage?.total_tokens,
        metadata: {
          id: data.id,
          created: data.created,
          finish_reason: data.choices[0].finish_reason,
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
      throw new ServiceError('PROVIDER_API_ERROR', `GLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async checkModelAvailability(model: string, timeoutMs = 5000): Promise<boolean> {
    // GLM known models
    const knownModels = [
      'glm-4',
      'glm-4-flash',
      'glm-3-turbo',
      'glm-4-plus',
      'glm-4-air',
      'glm-4-airx',
    ];

    return knownModels.includes(model);
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'GLM (Zhipu AI)',
      type: 'glm',
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
