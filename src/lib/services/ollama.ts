// Ollama service for AI recommendation generation
import { getConfig } from '../config/config';
import type { LibrarySummary } from './navidrome';
import { getLibrarySummary } from './navidrome';
import { ServiceError } from '../utils';
import { getSongSampleForAI, getIndexedArtists } from './library-index';
import { buildUserPreferenceProfile, getListeningPatterns } from './preferences';
import { getCurrentSeasonalPattern } from './seasonal-patterns';
import { getSeasonalKeywords, getCurrentSeason, getSeasonDisplay } from '../utils/temporal';
import { getOrCreateLibraryProfile } from './library-profile';
import { db } from '../db';
import { userPreferences } from '../db/schema';
import { eq } from 'drizzle-orm';

const OLLAMA_BASE_URL = getConfig().ollamaUrl || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama2';

// Rate limiting - increased for local Ollama instances
const ollamaRequestQueue = new Map<string, number[]>();
const OLLAMA_RATE_LIMIT_WINDOW = 60000; // 1 minute
const OLLAMA_RATE_LIMIT_MAX_REQUESTS = 30; // Max 30 AI requests per minute for local instances

function checkOllamaRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - OLLAMA_RATE_LIMIT_WINDOW;

  if (!ollamaRequestQueue.has(key)) {
    ollamaRequestQueue.set(key, [now]);
    return true;
  }

  const requests = ollamaRequestQueue.get(key)!;
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= OLLAMA_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  ollamaRequestQueue.set(key, validRequests);
  return true;
}

interface RecommendationRequest {
  prompt: string;
  model?: string;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
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

export async function generateRecommendations({ prompt, model = DEFAULT_MODEL, userId, useFeedbackForPersonalization = true }: RecommendationRequest & { userId?: string }): Promise<RecommendationResponse> {
  // Performance monitoring - start timer
  const perfStart = Date.now();
  const perfTimings: Record<string, number> = {};

  // Rate limiting check
  const rateLimitKey = userId ? `recommendations_${userId}` : 'recommendations_anonymous';
  if (!checkOllamaRateLimit(rateLimitKey)) {
    console.warn('⚠️ AI recommendation rate limit reached, throttling request');
    throw new ServiceError('RATE_LIMIT_ERROR', 'Too many AI requests. Please wait a moment before refreshing.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for better responsiveness

  let enhancedPrompt = prompt;
  if (userId) {
    // Use library index instead of summary for accurate song data
    const libStart = Date.now();
    const songSample = await getSongSampleForAI(80);
    const artists = await getIndexedArtists();
    perfTimings.libraryFetch = Date.now() - libStart;

    const songListForPrompt = songSample.slice(0, 40).join('\n'); // Show 40 songs
    const artistsList = artists.slice(0, 30).join(', ');

    console.log(`🎵 Using ${songSample.length} indexed songs and ${artists.length} artists for recommendations`);

    // Fetch user preference data for personalization (if privacy setting allows)
    let preferenceSection = '';
    let seasonalSection = '';
    let genreSection = '';
    const prefStart = Date.now();
    if (useFeedbackForPersonalization) {
      try {
        const profile = await buildUserPreferenceProfile(userId);
        const patterns = await getListeningPatterns(userId);
        perfTimings.preferenceFetch = Date.now() - prefStart;

        if (patterns.hasEnoughData) {
          // User has enough feedback data - personalize recommendations
          const likedArtistsList = profile.likedArtists.slice(0, 5).map(a => a.artist).join(', ');
          const dislikedArtistsList = profile.dislikedArtists.slice(0, 3).map(a => a.artist).join(', ');

          preferenceSection = `
USER PREFERENCES (use this to personalize recommendations):
LIKED ARTISTS: ${likedArtistsList || 'None yet'}
DISLIKED ARTISTS: ${dislikedArtistsList || 'None yet'}
LISTENING PATTERNS: ${patterns.insights.join('. ')}
FEEDBACK STATS: ${profile.thumbsUpCount} likes, ${profile.thumbsDownCount} dislikes

PERSONALIZATION RULES:
- Prioritize songs from liked artists
- Avoid songs from disliked artists
- Match the user's listening patterns and insights
`;
          console.log(`🎯 Personalizing with ${profile.totalFeedbackCount} feedback items`);
        } else {
          console.log(`ℹ️ Not enough feedback data yet (${profile.totalFeedbackCount} items), using generic recommendations`);
        }

        // Seasonal context (Story 3.11) - Check if user has enabled seasonal recommendations
        try {
          const userPrefs = await db
            .select()
            .from(userPreferences)
            .where(eq(userPreferences.userId, userId))
            .limit(1)
            .then(rows => rows[0]);

          const seasonalEnabled = userPrefs?.recommendationSettings?.enableSeasonalRecommendations !== false;

          if (seasonalEnabled) {
            const currentMonth = new Date().getMonth() + 1;
            const currentSeason = getCurrentSeason();
            const seasonalKeywords = getSeasonalKeywords(currentMonth);
            const seasonalPattern = await getCurrentSeasonalPattern(userId);

            if (seasonalPattern && seasonalPattern.confidence >= 0.7) {
              const topSeasonalArtists = seasonalPattern.preferredArtists.slice(0, 3).join(', ');
              seasonalSection = `
SEASONAL CONTEXT (${getSeasonDisplay(currentSeason)}):
User historically enjoys: ${topSeasonalArtists} during ${currentSeason}
Seasonal keywords: ${seasonalKeywords.join(', ')}
Seasonal preference strength: ${(seasonalPattern.confidence * 100).toFixed(0)}%

SEASONAL ADJUSTMENT:
- Blend seasonal preferences (80%) with year-round favorites (20%)
- If seasonal keywords apply, prioritize matching songs from library
`;
              console.log(`🍂 Adding seasonal context for ${currentSeason} (confidence: ${seasonalPattern.confidence.toFixed(2)})`);
            } else if (seasonalKeywords.length > 0) {
              // No historical data, but current month has seasonal significance
              seasonalSection = `
SEASONAL CONTEXT (${getSeasonDisplay(currentSeason)}):
Current month keywords: ${seasonalKeywords.join(', ')}
Suggest relevant seasonal music if available in library
`;
              console.log(`🍂 Adding seasonal keywords for current month (no historical data yet)`);
            }
          } else {
            console.log(`🔒 Seasonal recommendations disabled by user preference`);
          }
        } catch (seasonalError) {
          console.warn('⚠️ Failed to load seasonal patterns:', seasonalError);
        }
      } catch (error) {
        perfTimings.preferenceFetch = Date.now() - prefStart;
        console.warn('⚠️ Failed to load user preferences, continuing with generic recommendations:', error);
      }
    } else {
      perfTimings.preferenceFetch = Date.now() - prefStart;
      console.log(`🔒 Privacy setting disabled feedback personalization, using generic recommendations`);
    }

    // Fetch library genre profile for genre-based filtering (Story 3.7)
    const genreStart = Date.now();
    try {
      const libraryProfile = await getOrCreateLibraryProfile(userId, false);
      perfTimings.genreProfileFetch = Date.now() - genreStart;

      if (libraryProfile && Object.keys(libraryProfile.genreDistribution).length > 0) {
        // Format genre distribution for prompt: "Rock: 40%, Electronic: 25%, ..."
        const genreEntries = Object.entries(libraryProfile.genreDistribution)
          .sort((a, b) => b[1] - a[1]) // Sort by percentage descending
          .slice(0, 5) // Top 5 genres
          .map(([genre, percentage]) => `${genre}: ${(percentage * 100).toFixed(0)}%`)
          .join(', ');

        const topKeywords = libraryProfile.topKeywords.slice(0, 10).join(', ');

        genreSection = `
LIBRARY GENRE PROFILE:
Your library is ${genreEntries}
Common keywords: ${topKeywords}

GENRE MATCHING RULES:
- Prioritize recommendations that match your dominant genres
- Use keywords to understand your music style preferences
- Balance genre matching with song variety
`;
        console.log(`🎸 Adding genre profile context: ${genreEntries}`);
      }
    } catch (genreError) {
      perfTimings.genreProfileFetch = Date.now() - genreStart;
      console.warn('⚠️ Failed to load library genre profile, continuing without genre context:', genreError);
    }

    // Add timestamp to encourage different responses each time
    const timestamp = Date.now();
    const randomSeed = Math.random().toString(36).substring(7);

    enhancedPrompt = `${prompt}.

USER'S LIBRARY (complete list of available songs - ONLY use songs from this list):
${songListForPrompt}

ARTISTS IN LIBRARY: ${artistsList}
${preferenceSection}${genreSection}${seasonalSection}
IMPORTANT - Generate DIFFERENT recommendations each time. Session seed: ${randomSeed}_${timestamp}

RULES:
1. ONLY recommend songs from the library list above - copy the EXACT format "Artist - Title"
2. Choose DIFFERENT songs each time - never repeat the same recommendations
3. Select songs that match the mood/style requested in the prompt
4. If no specific mood requested, recommend diverse songs from the library
5. Format: "Artist - Title" exactly as shown in the library list
6. USE USER PREFERENCES to personalize recommendations (prioritize liked artists, avoid disliked)

Your goal is to recommend songs from my ACTUAL library that I'll enjoy based on my preferences. Make sure each response is UNIQUE.`;
  }

  const url = `${OLLAMA_BASE_URL}/api/generate`;
  const body = {
    model,
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. Generate 5 music recommendations based on: ${enhancedPrompt}. JSON: {"recommendations": [{"song": "Artist - Title", "explanation": "brief reason why recommended"}, ...]}`,
    stream: false,
  };

  try {
    const ollamaStart = Date.now();
    const response = await retryFetch(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }));
    perfTimings.ollamaCall = Date.now() - ollamaStart;

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ServiceError('SERVER_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
      }
      throw new ServiceError('OLLAMA_API_ERROR', `Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('🤖 Raw Ollama response:', JSON.stringify(data).substring(0, 500));

    if (!data.response) {
      console.error('❌ No response field from Ollama:', data);
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'No response from Ollama');
    }

    console.log('🤖 Ollama response text (first 500 chars):', data.response.substring(0, 500));

    // Clean up response: remove markdown code blocks if present
    let cleanedResponse = data.response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
      console.log('🧹 Removed markdown code blocks from response');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
      console.log('🧹 Removed markdown code blocks from response');
    }

    // Fix truncated JSON by ensuring it's complete
    if (cleanedResponse.includes('"recommendations"') && !cleanedResponse.trim().endsWith('}')) {
      // Try to fix incomplete JSON
      const openBraces = (cleanedResponse.match(/{/g) || []).length;
      const closeBraces = (cleanedResponse.match(/}/g) || []).length;
      const openBrackets = (cleanedResponse.match(/\[/g) || []).length;
      const closeBrackets = (cleanedResponse.match(/]/g) || []).length;

      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        console.log('🔧 Attempting to fix incomplete JSON...');
        if (openBrackets > closeBrackets) cleanedResponse += ']';
        if (openBraces > closeBraces) cleanedResponse += '}';
        console.log('🔧 Added missing brackets/braces');
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanedResponse) as { recommendations: { song: string; explanation: string }[] };
      console.log('✅ Successfully parsed recommendations:', parsed.recommendations?.length || 0);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('❌ Cleaned response text:', cleanedResponse);

      // Fallback: extract songs from partial/broken JSON or conversational text
      let matches: Array<{song: string; explanation: string}> = [];

      // Try to extract from JSON-like format: "song": "Artist - Title"
      const jsonSongPattern = /"song"\s*:\s*"([^"]+)"/gi;
      const jsonMatches = [...cleanedResponse.matchAll(jsonSongPattern)];
      if (jsonMatches.length > 0) {
        matches = jsonMatches.slice(0, 5).map(match => ({
          song: match[1],
          explanation: 'Recommended based on your preferences'
        }));
        console.log('🔧 Extracted songs from partial JSON:', matches.length);
      } else {
        // Fallback to conversational text patterns
        const patterns = [
          /(?:Artist[\s-]*:?\s*([^-\n]+?)\s*[-–]\s*(?:Title|Song)[\s-]*:?\s*([^\n(]+))/gi,
          /\d+\.\s*(?:Artist[\s-]*)?(?:Title[\s-]*)?:?\s*([^-\n]+?)\s*[-–]\s*([^\n(]+)/gi,
        ];

        for (const pattern of patterns) {
          const found = [...cleanedResponse.matchAll(pattern)];
          if (found.length > 0) {
            matches = found.slice(0, 5).map(match => {
              const artist = match[1].trim();
              const title = match[2].trim().split(/\s*\(/)[0].trim();
              return {
                song: `${artist} - ${title}`,
                explanation: 'Recommended based on your preferences'
              };
            });
            console.log('🔧 Fallback pattern matched:', matches.length, 'songs');
            break;
          }
        }
      }

      if (matches.length === 0) {
        console.error('❌ No songs could be parsed from response');
      }

      return { recommendations: matches };
    }
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new ServiceError('OLLAMA_PARSE_ERROR', 'Invalid recommendations format');
    }

    // Performance summary logging
    perfTimings.total = Date.now() - perfStart;
    console.log('⏱️ Performance breakdown:', {
      libraryFetch: `${perfTimings.libraryFetch || 0}ms`,
      preferenceFetch: `${perfTimings.preferenceFetch || 0}ms`,
      genreProfileFetch: `${perfTimings.genreProfileFetch || 0}ms`,
      ollamaCall: `${perfTimings.ollamaCall || 0}ms`,
      total: `${perfTimings.total}ms`,
    });

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
  summary?: LibrarySummary;
  userId?: string;
  useFeedbackForPersonalization?: boolean; // Privacy setting
}

interface PlaylistSuggestion {
  song: string; // "Artist - Title"
  explanation: string;
}

interface PlaylistResponse {
  playlist: PlaylistSuggestion[];
}

export async function generatePlaylist({ style, summary, userId, useFeedbackForPersonalization = true }: PlaylistRequest): Promise<PlaylistResponse> {
  // Rate limiting check
  if (!checkOllamaRateLimit('playlist_generation')) {
    console.warn('⚠️ Playlist generation rate limit reached, throttling request');
    throw new ServiceError('RATE_LIMIT_ERROR', 'Too many playlist requests. Please wait a moment before generating another.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per AC7

  // Get indexed library data for better context
  console.log('📚 Fetching indexed library data for AI context...');
  const songSample = await getSongSampleForAI(80); // Get 80 actual songs from library
  const artists = await getIndexedArtists();

  // Format songs list for prompt (show first 60 for readability)
  const songListForPrompt = songSample.slice(0, 60).join('\n');
  const artistsList = artists.slice(0, 30).join(', ');

  console.log(`🎵 Using ${songSample.length} indexed songs and ${artists.length} artists for context`);

  // Fetch user preference data for personalization (if privacy setting allows)
  let preferenceSection = '';
  if (userId && useFeedbackForPersonalization) {
    try {
      const profile = await buildUserPreferenceProfile(userId);
      const patterns = await getListeningPatterns(userId);

      if (patterns.hasEnoughData) {
        const likedArtistsList = profile.likedArtists.slice(0, 5).map(a => a.artist).join(', ');
        const dislikedArtistsList = profile.dislikedArtists.slice(0, 3).map(a => a.artist).join(', ');

        preferenceSection = `
USER PREFERENCES:
LIKED ARTISTS: ${likedArtistsList || 'None yet'}
DISLIKED ARTISTS: ${dislikedArtistsList || 'None yet'}
LISTENING PATTERNS: ${patterns.insights.join('. ')}

PERSONALIZATION: Prioritize songs from liked artists while matching the style. Avoid disliked artists.
`;
        console.log(`🎯 Personalizing playlist with ${profile.totalFeedbackCount} feedback items`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load user preferences for playlist, continuing without personalization:', error);
    }
  } else if (userId && !useFeedbackForPersonalization) {
    console.log(`🔒 Privacy setting disabled feedback personalization for playlist`);
  }

  const prompt = `You are a music playlist generator. You MUST ONLY use songs from the user's EXACT library listed below.

USER'S LIBRARY (complete list of available songs):
${songListForPrompt}

ARTISTS IN LIBRARY: ${artistsList}
${preferenceSection}
TASK: Create a 5-song playlist for style "${style}"

RULES:
1. ONLY use songs from the library list above - copy the EXACT format "Artist - Title"
2. Each song must genuinely match the "${style}" theme/mood
3. No duplicates
4. No songs not in the list above

For style "${style}":
- If Halloween: choose spooky, dark, mysterious, or horror-themed songs
- If rock: choose guitar-heavy, energetic, or classic rock songs
- If party: choose upbeat, danceable, or celebration songs
- If chill/relaxing: choose mellow, ambient, or calm songs
- Match the mood appropriately for other styles

OUTPUT FORMAT (valid JSON only, no other text):
{"playlist": [{"song": "Artist - Title", "explanation": "Why this fits ${style}"}, ...]}

Generate exactly 5 songs now:`;

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
      console.error('⏰ Ollama request timed out after 10s');
      throw new ServiceError('OLLAMA_TIMEOUT_ERROR', 'Ollama request timed out after 10s');
    }
    console.error('💥 Ollama playlist generation error:', error);
    throw error;
  }
}