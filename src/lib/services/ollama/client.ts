// DEPRECATED: This file re-exports from the new LLM provider location for backward compatibility
// Please update imports to use: import { OllamaClient } from '../llm/providers/ollama'

export {
  OllamaClient,
  getOllamaClient,
  ollamaClient,
  type OllamaGenerateRequest,
  type OllamaGenerateResponse,
  type OllamaModel,
  type OllamaTagsResponse,
} from '../llm/providers/ollama';