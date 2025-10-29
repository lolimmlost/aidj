// Core Ollama API client
import { getConfig } from '../../config/config';
import { ServiceError } from '../../utils';

const OLLAMA_BASE_URL = getConfig().ollamaUrl || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama2';

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
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

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl?: string, defaultModel?: string) {
    this.baseUrl = baseUrl || OLLAMA_BASE_URL;
    this.defaultModel = defaultModel || DEFAULT_MODEL;
  }

  async generate(request: OllamaGenerateRequest, timeoutMs = 20000): Promise<OllamaGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await retryFetch(() => fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          prompt: request.prompt,
          stream: request.stream || false,
        }),
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

  getDefaultModel(): string {
    return this.defaultModel;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Default client instance
export const ollamaClient = new OllamaClient();