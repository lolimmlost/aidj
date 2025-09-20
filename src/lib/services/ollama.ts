// Ollama service for AI recommendation generation
import { getConfig } from '../config/config';
import type { LibrarySummary } from './navidrome';
import { getLibrarySummary } from './navidrome';

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

class OllamaError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'OllamaError';
  }
}

async function retryFetch(fn: () => Promise<Response>, maxRetries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

export async function generateRecommendations({ prompt, model = DEFAULT_MODEL, userId }: RecommendationRequest & { userId?: string }): Promise<RecommendationResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let enhancedPrompt = prompt;
  if (userId) {
    try {
      const summary = await getLibrarySummary();
      const artistsList = summary.artists.map((a: { name: string; genres: string }) => `${a.name} (${a.genres})`).join(', ');
      const songsList = summary.songs.slice(0, 10).join(', '); // Top 10 as examples
      enhancedPrompt = `${prompt}. Use only songs from my library: artists [${artistsList}], example songs [${songsList}]. Suggest exact matches like "Artist - Title".`;
    } catch (error) {
      console.warn('Failed to fetch library summary for recommendations:', error);
    }
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
      throw new OllamaError('API_ERROR', `Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.response) {
      throw new OllamaError('PARSE_ERROR', 'No response from Ollama');
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
      throw new OllamaError('PARSE_ERROR', 'Invalid recommendations format');
    }
    return {
      recommendations: parsed.recommendations.map(r => ({ song: r.song, explanation: r.explanation })),
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OllamaError('TIMEOUT_ERROR', 'Ollama request timed out after 30s');
    }
    throw error;
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
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per AC8

  const topArtists = summary.artists.slice(0, 20).map((a: { name: string; genres: string }) => `${a.name} (${a.genres || 'Unknown'})`).join('; ');
  const topSongs = summary.songs.slice(0, 20).join('; '); // More examples for better matching
  const prompt = `Respond with ONLY valid JSON - no other text or explanations! STRICTLY use ONLY songs from my library. My library artists: [${topArtists}]. Example songs: [${topSongs}]. Generate exactly 10 songs for style "${style}" as "Artist - Title" format, where Artist and Title are EXACT matches from my library. If no exact match, do not suggest it - use only available. Format: {"playlist": [{"song": "Exact Artist - Exact Title", "explanation": "1 sentence why it fits ${style} from library"}]} . Double-check all suggestions are from the provided library list.`;

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
      throw new OllamaError('API_ERROR', `Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.response) {
      throw new OllamaError('PARSE_ERROR', 'No response from Ollama');
    }

    let parsed;
    try {
      parsed = JSON.parse(data.response) as { playlist: PlaylistSuggestion[] };
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response:', data.response);
      // Fallback: extract from text
      const fallback = data.response.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const recs = fallback.slice(0, 10).map((match: string) => {
        const song = match.replace(/song["']?\s*:\s*["']/, '').replace(/["']$/, '');
        return { song, explanation: 'Fits the requested style based on your library' };
      });
      return { playlist: recs };
    }
    if (!parsed.playlist || !Array.isArray(parsed.playlist)) {
      throw new OllamaError('PARSE_ERROR', 'Invalid playlist format');
    }
    return {
      playlist: parsed.playlist.slice(0, 10), // Ensure max 10
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OllamaError('TIMEOUT_ERROR', 'Ollama request timed out after 30s');
    }
    throw error;
  }
}