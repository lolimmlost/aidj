/**
 * Mood-to-Navidrome Criteria Fallback
 *
 * Maps mood preset IDs and mood descriptions to Navidrome-native
 * searchSongsByCriteria() parameters. Used as a fallback when
 * AI mood translation or smart playlist evaluation fails.
 *
 * Fallback chain: AI mood translation → getSimilarSongs → mood criteria → random
 */

import { getSimilarSongs, searchSongsByCriteria, type SubsonicSong } from './navidrome';

// ============================================================================
// Types
// ============================================================================

export interface MoodCriteria {
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  artists?: string[];
  rating?: number;
  recentlyAdded?: '7d' | '30d' | '90d';
}

// ============================================================================
// Mood Preset → Criteria Mapping
// ============================================================================

/**
 * Maps STYLE_PRESET IDs (from quick-actions.tsx) to Navidrome search criteria.
 * These are hardcoded fallbacks that work without AI/LLM.
 */
const PRESET_CRITERIA: Record<string, MoodCriteria> = {
  chill: {
    genre: ['ambient', 'acoustic', 'downtempo', 'chill', 'lo-fi', 'jazz', 'soft', 'mellow'],
  },
  energetic: {
    genre: ['rock', 'electronic', 'metal', 'punk', 'dance', 'edm', 'hip-hop', 'power'],
  },
  party: {
    genre: ['dance', 'electronic', 'edm', 'house', 'techno', 'pop', 'disco', 'club'],
  },
  focus: {
    genre: ['instrumental', 'classical', 'ambient', 'lo-fi', 'soundtrack', 'post-rock', 'piano'],
  },
  discover: {
    // Discovery uses random with low play count - no genre filter
  },
  similar: {
    // Similar depends on current song - handled by getSimilarSongs fallback
  },
};

/**
 * Maps mood description keywords to search criteria.
 * Broader than preset IDs, covers free-text mood descriptions.
 */
const MOOD_KEYWORD_CRITERIA: Array<{ keywords: string[]; criteria: MoodCriteria }> = [
  {
    keywords: ['chill', 'relax', 'calm', 'mellow', 'peaceful', 'unwind', 'downtempo'],
    criteria: { genre: ['ambient', 'acoustic', 'downtempo', 'chill', 'lo-fi', 'jazz'] },
  },
  {
    keywords: ['energy', 'energetic', 'workout', 'gym', 'exercise', 'pump', 'power'],
    criteria: { genre: ['rock', 'electronic', 'metal', 'hip-hop', 'edm', 'punk'] },
  },
  {
    keywords: ['party', 'dance', 'club', 'rave', 'night out'],
    criteria: { genre: ['dance', 'electronic', 'edm', 'house', 'techno', 'pop', 'disco'] },
  },
  {
    keywords: ['focus', 'study', 'work', 'concentrate', 'deep work', 'productivity'],
    criteria: { genre: ['instrumental', 'classical', 'ambient', 'lo-fi', 'soundtrack', 'piano'] },
  },
  {
    keywords: ['sad', 'melancholy', 'blue', 'emotional', 'heartbreak'],
    criteria: { genre: ['indie', 'folk', 'acoustic', 'singer-songwriter', 'ballad'] },
  },
  {
    keywords: ['happy', 'upbeat', 'joy', 'cheerful', 'fun', 'feel good'],
    criteria: { genre: ['pop', 'indie', 'funk', 'soul', 'disco'] },
  },
  {
    keywords: ['romantic', 'love', 'date', 'intimate'],
    criteria: { genre: ['soul', 'r&b', 'jazz', 'ballad', 'romantic'] },
  },
  {
    keywords: ['driving', 'road trip', 'car', 'highway'],
    criteria: { genre: ['rock', 'classic rock', 'indie', 'country', 'pop'] },
  },
  {
    keywords: ['sleep', 'night', 'bedtime', 'lullaby'],
    criteria: { genre: ['ambient', 'classical', 'new age', 'meditation'] },
  },
  {
    keywords: ['morning', 'wake up', 'sunrise', 'breakfast', 'coffee'],
    criteria: { genre: ['acoustic', 'folk', 'indie', 'pop', 'lo-fi'] },
  },
  {
    keywords: ['angry', 'intense', 'aggressive', 'rage'],
    criteria: { genre: ['metal', 'hardcore', 'punk', 'industrial'] },
  },
];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get criteria for a mood preset ID (from STYLE_PRESETS)
 */
export function getCriteriaForPreset(presetId: string): MoodCriteria | null {
  return PRESET_CRITERIA[presetId] || null;
}

/**
 * Get criteria by matching keywords in a mood description
 */
export function getCriteriaForMood(moodDescription: string): MoodCriteria | null {
  const lower = moodDescription.toLowerCase();

  for (const { keywords, criteria } of MOOD_KEYWORD_CRITERIA) {
    if (keywords.some(kw => lower.includes(kw))) {
      return criteria;
    }
  }

  return null;
}

/**
 * Full fallback chain for mood-based recommendations.
 * Tries each strategy in order until one returns results.
 *
 * Chain: getSimilarSongs(currentSongId) → mood criteria → null
 *
 * @param moodDescription - The mood/style description
 * @param currentSongId - Optional current playing song ID for similarity-based fallback
 * @param limit - Max songs to return
 * @returns Songs from Navidrome, or null if all fallbacks fail
 */
export async function getMoodFallbackSongs(
  moodDescription: string,
  currentSongId: string | undefined,
  limit: number = 20
): Promise<{ songs: SubsonicSong[]; source: 'similar-songs' | 'mood-criteria' } | null> {

  // Strategy 1: getSimilarSongs if we have a current song
  if (currentSongId) {
    try {
      console.log(`🔄 [MoodFallback] Trying getSimilarSongs for song ${currentSongId}`);
      const similar = await getSimilarSongs(currentSongId, limit);
      if (similar.length > 0) {
        console.log(`✅ [MoodFallback] getSimilarSongs returned ${similar.length} songs`);
        return { songs: similar, source: 'similar-songs' };
      }
      console.log('⚠️ [MoodFallback] getSimilarSongs returned no results');
    } catch (error) {
      console.warn('⚠️ [MoodFallback] getSimilarSongs failed:', error);
    }
  }

  // Strategy 2: Mood-mapped criteria → searchSongsByCriteria
  const criteria = getCriteriaForMood(moodDescription);
  if (criteria && criteria.genre && criteria.genre.length > 0) {
    try {
      console.log(`🔄 [MoodFallback] Trying searchSongsByCriteria with genres: ${criteria.genre.join(', ')}`);
      const songs = await searchSongsByCriteria(criteria, limit);
      if (songs.length > 0) {
        console.log(`✅ [MoodFallback] searchSongsByCriteria returned ${songs.length} songs`);
        return { songs, source: 'mood-criteria' };
      }
      console.log('⚠️ [MoodFallback] searchSongsByCriteria returned no results');
    } catch (error) {
      console.warn('⚠️ [MoodFallback] searchSongsByCriteria failed:', error);
    }
  }

  // All fallbacks exhausted
  console.log('⚠️ [MoodFallback] All fallback strategies exhausted');
  return null;
}
