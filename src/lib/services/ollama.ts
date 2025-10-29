// Refactored Ollama service for AI recommendation generation
// This file now serves as the main entry point, delegating to specialized modules

import { ollamaClient } from './ollama/client';
import { checkOllamaRateLimit } from './ollama/rate-limiter';
import { buildRecommendationPrompt } from './ollama/prompt-builder';
import { parseRecommendationsResponse } from './ollama/response-parser';
import { generatePlaylist as generatePlaylistService } from './ollama/playlist-generator';
import { ServiceError } from '../utils';

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

  // Generate recommendations
  const ollamaStart = Date.now();
  const response = await ollamaClient.generate({
    model: model || ollamaClient.getDefaultModel(),
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. Generate 5 music recommendations based on: ${enhancedPrompt}. JSON: {"recommendations": [{"song": "Artist - Title", "explanation": "brief reason why recommended"}, ...]}`,
    stream: false,
  }, 20000); // 20s timeout for complex recommendations
  perfTimings.ollamaCall = Date.now() - ollamaStart;

  console.log('🤖 Raw Ollama response:', JSON.stringify(response).substring(0, 500));

  if (!response.response) {
    console.error('❌ No response field from Ollama:', response);
    throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
  }

  console.log('🤖 Ollama response text (first 500 chars):', response.response.substring(0, 500));

  // Parse the response
  const parseStart = Date.now();
  const result = parseRecommendationsResponse(response.response);
  perfTimings.parse = Date.now() - parseStart;

  // Performance summary logging
  perfTimings.total = Date.now() - perfStart;
  console.log('⏱️ Performance breakdown:', {
    promptBuild: `${perfTimings.promptBuild || 0}ms`,
    ollamaCall: `${perfTimings.ollamaCall || 0}ms`,
    parse: `${perfTimings.parse || 0}ms`,
    total: `${perfTimings.total}ms`,
  });

  return result;
}

// Model availability check (re-exported for backward compatibility)
export async function checkModelAvailability(model: string): Promise<boolean> {
  return await ollamaClient.checkModelAvailability(model, 5000);
}

// Playlist generation (re-exported for backward compatibility)
export async function generatePlaylist(request: PlaylistRequest): Promise<PlaylistResponse> {
  return await generatePlaylistService(request);
}