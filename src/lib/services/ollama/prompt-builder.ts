// Prompt building utilities for Ollama API
import { getSongSampleForAI, getIndexedArtists } from '../library-index';
import { buildUserPreferenceProfile, getListeningPatterns } from '../preferences';
import { getCurrentSeasonalPattern } from '../seasonal-patterns';
import { getSeasonalKeywords, getCurrentSeason, getSeasonDisplay } from '../../utils/temporal';
import { getOrCreateLibraryProfile } from '../library-profile';
import { db } from '../../db';
import { userPreferences } from '../../db/schema';
import { eq } from 'drizzle-orm';

export interface RecommendationPromptOptions {
  userId?: string;
  useFeedbackForPersonalization?: boolean;
  excludeArtists?: string[];
  basePrompt: string;
}

export interface PlaylistPromptOptions {
  userId?: string;
  useFeedbackForPersonalization?: boolean;
  excludeArtists?: string[];
  style: string;
}

export async function buildRecommendationPrompt(options: RecommendationPromptOptions): Promise<string> {
  const {
    userId,
    useFeedbackForPersonalization = true,
    excludeArtists = [],
    basePrompt
  } = options;

  // Add debug logging for excluded artists
  if (excludeArtists && excludeArtists.length > 0) {
    console.log(`🚫 Ollama: Excluding ${excludeArtists.length} artists from recommendations:`, excludeArtists);
  }

  let enhancedPrompt = basePrompt;
  
  if (userId) {
    // Use library index instead of summary for accurate song data
    // Balance between variety and prompt size for local LLMs
    const songSample = await getSongSampleForAI(150); // Good sample size for variety
    const artists = await getIndexedArtists();

    const songListForPrompt = songSample.slice(0, 100).join('\n'); // 100 songs - balance of variety vs prompt size
    const artistsList = artists.slice(0, 60).join(', '); // 60 artists for more options

    console.log(`🎵 Using ${songSample.length} indexed songs and ${artists.length} artists for recommendations`);

    // Fetch user preference data for personalization (if privacy setting allows)
    let preferenceSection = '';
    let seasonalSection = '';
    let genreSection = '';
    
    if (useFeedbackForPersonalization) {
      try {
        const profile = await buildUserPreferenceProfile(userId);
        const patterns = await getListeningPatterns(userId);

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
        console.warn('⚠️ Failed to load user preferences, continuing with generic recommendations:', error);
      }
    } else {
      console.log(`🔒 Privacy setting disabled feedback personalization, using generic recommendations`);
    }

    // Fetch library genre profile for genre-based filtering (Story 3.7)
    try {
      const libraryProfile = await getOrCreateLibraryProfile(userId, false);

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
      console.warn('⚠️ Failed to load library genre profile, continuing without genre context:', genreError);
    }

    // Add timestamp to encourage different responses each time
    const timestamp = Date.now();
    const randomSeed = Math.random().toString(36).substring(7);

    // Add excluded artists to prompt
    const excludedArtistsText = excludeArtists.length > 0
      ? `ABSOLUTELY FORBIDDEN ARTISTS (do not recommend any songs by these artists): ${excludeArtists.join(', ')}`
      : '';

    enhancedPrompt = `${basePrompt}.

USER'S LIBRARY (complete list of available songs - ONLY use songs from this list):
${songListForPrompt}

ARTISTS IN LIBRARY: ${artistsList}
${preferenceSection}${genreSection}${seasonalSection}
${excludedArtistsText}
IMPORTANT - Generate DIFFERENT recommendations each time. Session seed: ${randomSeed}_${timestamp}

CRITICAL DIVERSITY RULES (STRICTLY ENFORCED - ZERO TOLERANCE):
1. ONLY recommend songs from the library list above - copy the EXACT format "Artist - Title"
2. NEVER recommend more than ONE song from the same artist in a single batch
3. AVOID artists that have been recommended in the last 8 hours
4. If you've recommended an artist 1+ times today, choose DIFFERENT artists
5. PRIORITIZE artists you haven't recommended in this session at all
6. ENSURE each batch of recommendations has maximum artist diversity
7. If you must repeat an artist, wait at least 8 hours between recommendations
8. ABSOLUTELY FORBIDDEN: NEVER recommend songs by excluded artists listed above
9. ZERO TOLERANCE: Any violation of these rules will result in immediate rejection
10. MANDATORY: Each recommendation must be from a DIFFERENT artist - no exceptions

RELEVANCE REQUIREMENTS:
8. Select songs that match the mood/style requested in the prompt
9. Consider the current song's energy, tempo, and emotional tone
10. Choose songs that flow naturally from the current playing song
11. If no specific mood requested, recommend diverse songs from the library
12. Format: "Artist - Title" exactly as shown in the library list
13. USE USER PREFERENCES to personalize recommendations (prioritize liked artists, avoid disliked)

GENRE AND ENERGY BALANCE:
14. Include songs from different genres when possible
15. Vary the energy levels and styles of recommended songs
16. Do not recommend songs that have been recently played or suggested
17. Ensure each recommendation provides a fresh listening experience
18. AVOID repeating artists from the last 15 songs played (increased from 10)
19. BALANCE between familiar favorites and new discoveries
20. CRITICAL: If you notice yourself recommending the same artists repeatedly, STOP and choose completely different artists
21. MANDATORY: Check each recommendation - if artist appears in recent history, choose a different song

CONTEXTUAL AWARENESS:
20. Consider the full listening session history for variety
21. If user has heard many songs from one genre, explore others
22. Mix up the tempo and mood between recommendations
23. Avoid suggesting songs that sound too similar to each other
24. Create a journey through different musical styles and emotions

VIOLATION CONSEQUENCES:
If you repeat artists or fail to provide diversity, the recommendations will be rejected.
Your goal is to recommend songs from my ACTUAL library that I'll enjoy based on my preferences.
Make sure each response is UNIQUE and DIVERSE with MAXIMUM ARTIST VARIETY.`;
  }

  return enhancedPrompt;
}

export async function buildPlaylistPrompt(options: PlaylistPromptOptions): Promise<string> {
  const {
    userId,
    useFeedbackForPersonalization = true,
    excludeArtists = [],
    style
  } = options;

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
  let excludedArtistsText = '';
  
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

  // Add excluded artists to prompt if provided
  if (excludeArtists.length > 0) {
    excludedArtistsText = `FORBIDDEN ARTISTS: Do NOT include any songs by these artists: ${excludeArtists.join(', ')}`;
  }

  return `You are a music playlist generator. You MUST ONLY use songs from the user's EXACT library listed below.

USER'S LIBRARY (complete list of available songs):
${songListForPrompt}

ARTISTS IN LIBRARY: ${artistsList}
${preferenceSection}
${excludedArtistsText}
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
}