// Playlist generation service using Ollama
import { ollamaClient } from './client';
import { checkOllamaRateLimit } from './rate-limiter';
import { buildPlaylistPrompt } from './prompt-builder';
import { parsePlaylistResponse } from './response-parser';
import { ServiceError } from '../../utils';

// Story 7.1: Source mode for playlist generation
export type SourceMode = 'library' | 'discovery' | 'mix';

export interface PlaylistRequest {
  style: string;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
  excludeArtists?: string[]; // Artists to exclude from playlist
  // Story 7.1: Source mode configuration
  sourceMode?: SourceMode; // Default: 'library'
  mixRatio?: number; // For mix mode: percentage of library songs (0-100), default: 70
}

export interface PlaylistSuggestion {
  song: string; // "Artist - Title"
  explanation: string;
  isDiscovery?: boolean; // Story 7.1: true if this is a discovery suggestion, false if from library
}

export interface PlaylistResponse {
  playlist: PlaylistSuggestion[];
}

export async function generatePlaylist({
  style,
  userId,
  useFeedbackForPersonalization = true,
  excludeArtists = [],
  sourceMode = 'library',
  mixRatio = 70
}: PlaylistRequest): Promise<PlaylistResponse> {
  // Rate limiting check
  if (!checkOllamaRateLimit('playlist_generation')) {
    console.warn('⚠️ Playlist generation rate limit reached, throttling request');
    throw new ServiceError('RATE_LIMIT_ERROR', 'Too many playlist requests. Please wait a moment before generating another.');
  }

  console.log(`🎯 Generating playlist with sourceMode: ${sourceMode}, mixRatio: ${mixRatio}%`);

  // Build the prompt
  const prompt = await buildPlaylistPrompt({
    userId,
    useFeedbackForPersonalization,
    excludeArtists,
    style,
    sourceMode,
    mixRatio
  });

  // Generate the playlist
  const response = await ollamaClient.generate({
    model: ollamaClient.getDefaultModel(),
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. ${prompt}`,
    stream: false,
  }, 20000); // 20s timeout for playlist generation

  console.log('🤖 Raw Ollama response for playlist:', JSON.stringify(response).substring(0, 500));

  // Handle both 'response' and 'content' fields (Ollama API can return either)
  const responseText = response.response || response.content;
  if (!responseText) {
    console.error('❌ No response/content field from Ollama:', response);
    throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
  }

  console.log('🤖 Ollama playlist response text (first 500 chars):', responseText.substring(0, 500));

  // Parse the response
  return parsePlaylistResponse(responseText);
}