// Playlist generation service using Ollama
import { ollamaClient } from './client';
import { checkOllamaRateLimit } from './rate-limiter';
import { buildPlaylistPrompt } from './prompt-builder';
import { parsePlaylistResponse } from './response-parser';
import { ServiceError } from '../../utils';

export interface PlaylistRequest {
  style: string;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
  excludeArtists?: string[]; // Artists to exclude from playlist
}

export interface PlaylistSuggestion {
  song: string; // "Artist - Title"
  explanation: string;
}

export interface PlaylistResponse {
  playlist: PlaylistSuggestion[];
}

export async function generatePlaylist({
  style,
  userId,
  useFeedbackForPersonalization = true,
  excludeArtists = []
}: PlaylistRequest): Promise<PlaylistResponse> {
  // Rate limiting check
  if (!checkOllamaRateLimit('playlist_generation')) {
    console.warn('⚠️ Playlist generation rate limit reached, throttling request');
    throw new ServiceError('RATE_LIMIT_ERROR', 'Too many playlist requests. Please wait a moment before generating another.');
  }

  // Build the prompt
  const prompt = await buildPlaylistPrompt({
    userId,
    useFeedbackForPersonalization,
    excludeArtists,
    style
  });

  // Generate the playlist
  const response = await ollamaClient.generate({
    model: ollamaClient.getDefaultModel(),
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. ${prompt}`,
    stream: false,
  }, 20000); // 20s timeout for playlist generation

  console.log('🤖 Raw Ollama response for playlist:', JSON.stringify(response).substring(0, 500));

  if (!response.response) {
    console.error('❌ No response field from Ollama:', response);
    throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
  }

  console.log('🤖 Ollama playlist response text (first 500 chars):', response.response.substring(0, 500));

  // Parse the response
  return parsePlaylistResponse(response.response);
}