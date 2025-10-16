// Ollama service for AI recommendation generation
import { getConfig } from '../config/config';
import type { LibrarySummary } from './navidrome';
import { getLibrarySummary } from './navidrome';
import { ServiceError } from '../utils';

const OLLAMA_BASE_URL = getConfig().ollamaUrl || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama2';

interface RecommendationRequest {
  prompt: string;
  model?: string;
  userId?: string;
}

interface RecommendationResponse {
  recommendations: { song: string; explanation: string }[];
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

export async function generateRecommendations({ prompt, model = DEFAULT_MODEL, userId }: RecommendationRequest & { userId?: string }): Promise<RecommendationResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for better responsiveness

  let enhancedPrompt = prompt;
  if (userId) {
    const summary = await getLibrarySummary();
    const artistsList = summary.artists.map((a: { name: string; genres: string }) => `${a.name} (${a.genres})`).join(', ');
    const songsList = summary.songs.slice(0, 10).join(', '); // Top 10 as examples
    enhancedPrompt = `${prompt}. Based on my library: artists [${artistsList}], example songs [${songsList}].

    IMPORTANT: Recommend songs that MATCH THE STYLE and GENRE of my library artists. If I have artists like "Artist1 (rock)" and "Artist2 (metal)", suggest other popular songs in those genres that would likely be in my collection.
    Use the format "Artist - Title" for consistency. Prioritize songs by the same artists or similar artists in my preferred genres.`;
  }

  const url = `${OLLAMA_BASE_URL}/api/generate`;
  const body = {
    model,
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. Generate 5 music recommendations based on: ${enhancedPrompt}. JSON: {"recommendations": [{"song": "Artist - Title", "explanation": "brief reason why recommended"}, ...]}`,
    stream: false,
  };

  try {
    const response = await retryFetch(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }));

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ServiceError('SERVER_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
      }
      throw new ServiceError('OLLAMA_API_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.response) {
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
    }

    let parsed;
    try {
      parsed = JSON.parse(data.response) as { recommendations: { song: string; explanation: string }[] };
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response:', data.response);
      // Fallback: extract songs from text
      const fallback = data.response.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const recs = fallback.slice(0, 5).map((match: string) => ({ song: match.replace(/song["']?\s*:\s*["']/, '').replace(/["']$/, ''), explanation: 'Recommended based on your preferences' }));
      return { recommendations: recs };
    }
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'Invalid recommendations format');
    }
    return {
      recommendations: parsed.recommendations.map(r => ({ song: r.song, explanation: r.explanation })),
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceError('OLLAMA_TIMEOUT_ERROR', 'Ollama request timed out after 10s');
    }
    if (error instanceof ServiceError && (error.code === 'OLLAMA_TIMEOUT_ERROR' || error.code === 'SERVER_ERROR' || error instanceof TypeError)) {
      throw error;
    }
    throw new ServiceError('OLLAMA_API_ERROR', `Ollama request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Stub for model loading check (AC4)
export async function checkModelAvailability(model: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const url = `${OLLAMA_BASE_URL}/api/tags`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return false;
    const data = await response.json();
    return data.models.some((m: { name: string }) => m.name === model);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('Model availability check timed out');
    }
    return false;
  }
}

interface PlaylistRequest {
  style: string;
  summary: LibrarySummary;
}

interface PlaylistSuggestion {
  song: string; // "Artist - Title"
  explanation: string;
}

interface PlaylistResponse {
  playlist: PlaylistSuggestion[];
}

export async function generatePlaylist({ style, summary }: PlaylistRequest): Promise<PlaylistResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per AC7

  const topArtists = summary.artists.slice(0, 12).map((a: { name: string; genres: string }) => `${a.name} (${a.genres || 'Unknown'})`).join('; ');
  const topSongs = summary.songs.slice(0, 8).join('; '); // Increased for more variety
  const prompt = `Respond with ONLY valid JSON - no other text or explanations! STRICTLY use ONLY songs from my library. My library artists: [${topArtists}]. Example songs: [${topSongs}].

IMPORTANT: Generate exactly 5 DIFFERENT songs that match the style "${style}". Each suggestion must be a UNIQUE song that genuinely fits the requested style.

For style "${style}":
- If Halloween: choose spooky, dark, mysterious, or themed songs
- If rock: choose guitar-heavy, energetic, or classic rock songs
- If party: choose upbeat, danceable, or celebration songs
- If holiday: choose festive, seasonal, or celebration songs
- For other styles: match the mood and genre appropriately

Format: {"playlist": [{"song": "Exact Artist - Exact Title", "explanation": "How this song fits ${style}"}, ...]}

CRITICAL: Each song must be an EXACT match from my library list. No duplicates. No songs not in my library.`;

  const url = `${OLLAMA_BASE_URL}/api/generate`;
  const body = {
    model: DEFAULT_MODEL,
    prompt,
    stream: false,
  };

  try {
    const response = await retryFetch(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }));

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ServiceError('OLLAMA_API_ERROR', `Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.response) {
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
    }

    let parsed;
    try {
      parsed = JSON.parse(data.response) as { playlist: PlaylistSuggestion[] };
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response:', data.response);
      // Fallback: extract from text
      const fallback = data.response.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const recs = fallback.slice(0, 5).map((match: string) => {
        const song = match.replace(/song["']?\s*:\s*["']/, '').replace(/["']$/, '');
        return { song, explanation: 'Fits the requested style based on your library' };
      });
      return { playlist: recs };
    }
    if (!parsed.playlist || !Array.isArray(parsed.playlist)) {
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'Invalid playlist format');
    }
    return {
      playlist: parsed.playlist.slice(0, 5), // MVP: Ensure max 5
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('⏰ Ollama request timed out after 5s');
      throw new ServiceError('OLLAMA_TIMEOUT_ERROR', 'Ollama request timed out after 5s');
    }
    console.error('💥 Ollama playlist generation error:', error);
    throw error;
  }
}