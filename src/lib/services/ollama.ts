// LLM service for AI recommendation generation
// Now provider-agnostic - works with Ollama, OpenRouter, or GLM
// This file maintains backward compatibility while using the provider factory

import { getLLMProvider } from './llm/factory';
import { checkOllamaRateLimit } from './ollama/rate-limiter';
import { buildRecommendationPrompt } from './ollama/prompt-builder';
import { parseRecommendationsResponse } from './ollama/response-parser';
import { generatePlaylist as generatePlaylistService } from './ollama/playlist-generator';
import { ServiceError } from '../utils';
import type { LLMGenerateRequest } from './llm/types';

// Re-export types for backward compatibility
export interface RecommendationRequest {
  prompt: string;
  model?: string;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
  excludeArtists?: string[]; // Artists to exclude from recommendations
}

export interface RecommendationResponse {
  recommendations: { song: string; explanation: string }[];
}

export interface PlaylistRequest {
  style: string;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
  excludeArtists?: string[]; // Artists to exclude from playlist
}

export interface PlaylistResponse {
  playlist: { song: string; explanation: string }[];
}

// Main recommendation generation function
export async function generateRecommendations({
  prompt,
  model,
  userId,
  useFeedbackForPersonalization = true,
  excludeArtists = []
}: RecommendationRequest): Promise<RecommendationResponse> {
  // Performance monitoring - start timer
  const perfStart = Date.now();
  const perfTimings: Record<string, number> = {};

  // Rate limiting check
  const rateLimitKey = userId ? `recommendations_${userId}` : 'recommendations_anonymous';
  if (!checkOllamaRateLimit(rateLimitKey)) {
    console.warn('⚠️ AI recommendation rate limit reached, throttling request');
    throw new ServiceError('RATE_LIMIT_ERROR', 'Too many AI requests. Please wait a moment before refreshing.');
  }

  // Build the enhanced prompt
  const promptStart = Date.now();
  const enhancedPrompt = await buildRecommendationPrompt({
    userId,
    useFeedbackForPersonalization,
    excludeArtists,
    basePrompt: prompt
  });
  perfTimings.promptBuild = Date.now() - promptStart;

  // Generate recommendations using the configured LLM provider
  const llmStart = Date.now();
  const provider = getLLMProvider();

  // Request 8 recommendations to have a larger pool for diversity selection
  // Use higher temperature (0.85) to encourage more creative/varied responses
  const llmRequest: LLMGenerateRequest = {
    model: model || provider.getDefaultModel(),
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. Generate 8 DIVERSE music recommendations based on: ${enhancedPrompt}. Ensure variety - different artists, genres, and styles. JSON: {"recommendations": [{"song": "Artist - Title", "explanation": "brief reason why recommended"}, ...]}`,
    stream: false,
    temperature: 0.85, // Higher temperature for more variety
    maxTokens: 1536,   // Enough tokens for 8 recommendations
  };

  const response = await provider.generate(llmRequest, 45000); // 45s timeout for local LLM
  perfTimings.llmCall = Date.now() - llmStart;

  console.log(`🤖 Raw ${provider.getMetadata().name} response:`, JSON.stringify(response).substring(0, 500));

  if (!response.content) {
    console.error(`❌ No content from ${provider.getMetadata().name}:`, response);
    throw new ServiceError('LLM_PARSE_ERROR', `No response from ${provider.getMetadata().name}`);
  }

  console.log(`🤖 ${provider.getMetadata().name} response text (first 500 chars):`, response.content.substring(0, 500));

  // Parse the response
  const parseStart = Date.now();
  const result = parseRecommendationsResponse(response.content);
  perfTimings.parse = Date.now() - parseStart;

  // Performance summary logging
  perfTimings.total = Date.now() - perfStart;
  console.log('⏱️ Performance breakdown:', {
    promptBuild: `${perfTimings.promptBuild || 0}ms`,
    llmCall: `${perfTimings.llmCall || 0}ms`,
    parse: `${perfTimings.parse || 0}ms`,
    total: `${perfTimings.total}ms`,
  });

  return result;
}

// Model availability check (now uses configured provider)
export async function checkModelAvailability(model: string): Promise<boolean> {
  const provider = getLLMProvider();
  return await provider.checkModelAvailability(model, 5000);
}

// Playlist generation (re-exported for backward compatibility)
export async function generatePlaylist(request: PlaylistRequest): Promise<PlaylistResponse> {
  return await generatePlaylistService(request);
}