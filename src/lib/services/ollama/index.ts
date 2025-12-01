// Main exports for the Ollama service
export { OllamaClient, ollamaClient } from './client';
export type { OllamaGenerateRequest, OllamaGenerateResponse, OllamaModel, OllamaTagsResponse } from './client';
export { checkOllamaRateLimit, getRateLimitConfig } from './rate-limiter';
export { buildRecommendationPrompt, buildPlaylistPrompt } from './prompt-builder';
export type { RecommendationPromptOptions, PlaylistPromptOptions, SourceMode as PromptSourceMode } from './prompt-builder';
export { parseRecommendationsResponse, parsePlaylistResponse } from './response-parser';
export type { RecommendationResponse, PlaylistSuggestion, PlaylistResponse } from './response-parser';
export { generatePlaylist } from './playlist-generator';
export type { PlaylistRequest, SourceMode } from './playlist-generator';