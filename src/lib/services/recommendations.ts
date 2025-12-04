/**
 * Unified Recommendation Service
 *
 * Consolidates all recommendation systems into a single service:
 * - Similar songs (library mode) - uses Last.fm getSimilarTracks
 * - Discovery songs (not in library) - uses Last.fm getSimilarTracks
 * - Mood-based songs - uses AI mood translation + smart playlist evaluation
 *
 * This replaces:
 * - ollama.ts (auto recommendations)
 * - ollama/playlist-generator.ts
 * - ai-dj/core.ts
 *
 * @see docs/architecture/recommendation-engine-refactor.md
 */

import { getLastFmClient } from './lastfm';
import type { EnrichedTrack } from './lastfm/types';
import { evaluateSmartPlaylistRules } from './smart-playlist-evaluator';
import { getSongsGlobal, type SubsonicSong } from './navidrome';
import type { Song } from '@/components/ui/audio-player';

// ============================================================================
// Types
// ============================================================================

export type RecommendationMode = 'similar' | 'discovery' | 'mood';

export interface RecommendationRequest {
  mode: RecommendationMode;
  /** For 'similar' and 'discovery' modes - the seed song */
  currentSong?: { artist: string; title: string };
  /** For 'mood' mode - natural language description */
  moodDescription?: string;
  /** Maximum number of songs to return */
  limit?: number;
  /** Song IDs to exclude from results */
  excludeSongIds?: string[];
  /** Artist names to exclude (for diversity) */
  excludeArtists?: string[];
}

export interface RecommendationResult {
  songs: Song[];
  source: 'lastfm' | 'smart-playlist' | 'fallback';
  mode: RecommendationMode;
  /** Optional metadata about the recommendation */
  metadata?: {
    totalCandidates?: number;
    filteredCount?: number;
    fallbackReason?: string;
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Single entry point for ALL recommendations
 *
 * @example
 * // Get similar songs from library
 * const result = await getRecommendations({
 *   mode: 'similar',
 *   currentSong: { artist: 'Radiohead', title: 'Karma Police' },
 *   limit: 10,
 * });
 *
 * @example
 * // Get discovery songs (not in library)
 * const result = await getRecommendations({
 *   mode: 'discovery',
 *   currentSong: { artist: 'Radiohead', title: 'Karma Police' },
 *   limit: 10,
 * });
 *
 * @example
 * // Get mood-based songs
 * const result = await getRecommendations({
 *   mode: 'mood',
 *   moodDescription: 'chill evening vibes for reading',
 *   limit: 20,
 * });
 */
export async function getRecommendations(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { mode } = request;

  console.log(`🎵 [Recommendations] Getting ${mode} recommendations`);

  switch (mode) {
    case 'similar':
      return getSimilarSongs(request);
    case 'discovery':
      return getDiscoverySongs(request);
    case 'mood':
      return getMoodBasedSongs(request);
    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(`Unknown recommendation mode: ${exhaustiveCheck}`);
    }
  }
}

// ============================================================================
// Similar Songs (Library Mode)
// ============================================================================

/**
 * Get similar songs that exist in the user's library
 * Uses Last.fm getSimilarTracks API with library enrichment
 *
 * This replaces:
 * - AI DJ auto-queue functionality
 * - Auto recommendations from ollama.ts
 */
async function getSimilarSongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { currentSong, limit = 10, excludeSongIds = [], excludeArtists = [] } = request;

  if (!currentSong) {
    throw new Error('currentSong required for similar mode');
  }

  const lastFm = getLastFmClient();

  if (!lastFm) {
    console.log('⚠️ [Recommendations] Last.fm not configured, using fallback');
    return fallbackToGenreRandom(currentSong, limit, 'lastfm_not_configured');
  }

  try {
    // Request more than needed to account for filtering
    const similar = await lastFm.getSimilarTracks(
      currentSong.artist,
      currentSong.title,
      limit * 3
    );

    console.log(`📊 [Recommendations] Last.fm returned ${similar.length} similar tracks`);

    // Filter to library songs only
    const inLibrary = similar
      .filter(t => t.inLibrary && t.navidromeId)
      .filter(t => !excludeSongIds.includes(t.navidromeId!))
      .filter(t => !excludeArtists.some(ea =>
        t.artist.toLowerCase().includes(ea.toLowerCase())
      ));

    console.log(`📚 [Recommendations] ${inLibrary.length} tracks in library after filtering`);

    // Apply diversity (limit repeat artists)
    const diverse = applyDiversity(inLibrary);

    if (diverse.length === 0) {
      console.log('⚠️ [Recommendations] No library matches, using fallback');
      return fallbackToGenreRandom(currentSong, limit, 'no_library_matches');
    }

    return {
      songs: diverse.slice(0, limit).map(enrichedTrackToSong),
      source: 'lastfm',
      mode: 'similar',
      metadata: {
        totalCandidates: similar.length,
        filteredCount: inLibrary.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Last.fm error:', error);
    return fallbackToGenreRandom(currentSong, limit, 'lastfm_error');
  }
}

// ============================================================================
// Discovery Songs (Not in Library)
// ============================================================================

/**
 * Get similar songs that are NOT in the user's library
 * These are candidates for Lidarr download or manual acquisition
 *
 * This replaces the discovery mode from Story 7.2
 */
async function getDiscoverySongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { currentSong, limit = 10 } = request;

  if (!currentSong) {
    throw new Error('currentSong required for discovery mode');
  }

  const lastFm = getLastFmClient();

  if (!lastFm) {
    throw new Error('Last.fm required for discovery mode');
  }

  try {
    const similar = await lastFm.getSimilarTracks(
      currentSong.artist,
      currentSong.title,
      limit * 3
    );

    // Filter to songs NOT in library, sorted by match score
    const notInLibrary = similar
      .filter(t => !t.inLibrary)
      .sort((a, b) => (b.match || 0) - (a.match || 0));

    console.log(`🔍 [Recommendations] Found ${notInLibrary.length} discovery candidates`);

    return {
      songs: notInLibrary.slice(0, limit).map(enrichedTrackToDiscoverySong),
      source: 'lastfm',
      mode: 'discovery',
      metadata: {
        totalCandidates: similar.length,
        filteredCount: notInLibrary.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Last.fm error in discovery mode:', error);
    throw error;
  }
}

// ============================================================================
// Mood-Based Songs (Smart Playlist)
// ============================================================================

/**
 * Get songs based on mood/style description
 * Uses AI to translate mood to smart playlist query, then evaluates against library
 *
 * NOTE: Phase 2 will implement the mood-translator.ts service.
 * For now, this uses a simple keyword-based approach as a placeholder.
 */
async function getMoodBasedSongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { moodDescription, limit = 20 } = request;

  if (!moodDescription) {
    throw new Error('moodDescription required for mood mode');
  }

  console.log(`🎭 [Recommendations] Processing mood: "${moodDescription}"`);

  // Phase 1: Simple keyword-based query building
  // Phase 2 will replace this with AI translation via mood-translator.ts
  const query = buildSimpleMoodQuery(moodDescription);

  console.log(`📝 [Recommendations] Generated query:`, JSON.stringify(query));

  try {
    // Evaluate smart playlist rules against library
    const songs = await evaluateSmartPlaylistRules({
      ...query,
      limit,
    });

    console.log(`✅ [Recommendations] Smart playlist returned ${songs.length} songs`);

    return {
      songs: songs.map(subsonicSongToSong),
      source: 'smart-playlist',
      mode: 'mood',
      metadata: {
        totalCandidates: songs.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Smart playlist error:', error);
    // Fallback to random high-rated songs
    return fallbackToRandom(limit, 'smart_playlist_error');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Apply diversity rules to avoid too many songs from the same artist
 * Limits to max 2 songs per artist
 */
function applyDiversity(tracks: EnrichedTrack[]): EnrichedTrack[] {
  const artistCounts = new Map<string, number>();
  const MAX_PER_ARTIST = 2;

  return tracks.filter(track => {
    const artistLower = track.artist.toLowerCase();
    const count = artistCounts.get(artistLower) || 0;

    if (count >= MAX_PER_ARTIST) {
      return false;
    }

    artistCounts.set(artistLower, count + 1);
    return true;
  });
}

/**
 * Convert EnrichedTrack to Song format for playback
 */
function enrichedTrackToSong(track: EnrichedTrack): Song {
  return {
    id: track.navidromeId!,
    name: track.name,
    title: track.name,
    artist: track.artist,
    albumId: '', // Will be populated by caller if needed
    album: track.navidromeAlbum,
    duration: track.duration || 0,
    track: 0,
    url: `/api/navidrome/stream/${track.navidromeId}`,
  };
}

/**
 * Convert EnrichedTrack to Song format for discovery (not playable)
 */
function enrichedTrackToDiscoverySong(track: EnrichedTrack): Song {
  return {
    id: `discovery-${track.artist}-${track.name}`.replace(/\s+/g, '-'),
    name: track.name,
    title: track.name,
    artist: track.artist,
    albumId: '',
    duration: track.duration || 0,
    track: 0,
    url: track.url || '', // Last.fm URL, not playable
  };
}

/**
 * Convert SubsonicSong to Song format
 */
function subsonicSongToSong(song: SubsonicSong): Song {
  return {
    id: song.id,
    name: song.title,
    title: song.title,
    artist: song.artist,
    albumId: song.albumId,
    album: song.album,
    duration: parseInt(song.duration) || 0,
    track: parseInt(song.track) || 0,
    url: `/api/navidrome/stream/${song.id}`,
  };
}

// Type for mood query conditions - supports string, number, and tuples for ranges
type MoodQueryCondition = Record<string, Record<string, string | number | [number, number]>>;

/**
 * Simple keyword-based mood query builder
 * This is a placeholder - Phase 2 will implement proper AI translation
 */
function buildSimpleMoodQuery(mood: string): {
  all?: MoodQueryCondition[];
  any?: MoodQueryCondition[];
  sort?: string;
} {
  const moodLower = mood.toLowerCase();

  // Check for common mood keywords and build appropriate query
  const query: {
    all?: MoodQueryCondition[];
    any?: MoodQueryCondition[];
    sort?: string;
  } = {
    sort: 'random',
  };

  // Energy-based keywords
  if (moodLower.includes('chill') || moodLower.includes('relax') || moodLower.includes('calm')) {
    query.any = [
      { contains: { genre: 'ambient' } },
      { contains: { genre: 'chill' } },
      { contains: { genre: 'acoustic' } },
      { contains: { genre: 'jazz' } },
    ];
  } else if (moodLower.includes('party') || moodLower.includes('energy') || moodLower.includes('dance')) {
    query.any = [
      { contains: { genre: 'dance' } },
      { contains: { genre: 'electronic' } },
      { contains: { genre: 'pop' } },
      { contains: { genre: 'edm' } },
    ];
  } else if (moodLower.includes('workout') || moodLower.includes('gym') || moodLower.includes('exercise')) {
    query.any = [
      { contains: { genre: 'rock' } },
      { contains: { genre: 'metal' } },
      { contains: { genre: 'electronic' } },
      { contains: { genre: 'hip-hop' } },
    ];
  } else if (moodLower.includes('focus') || moodLower.includes('study') || moodLower.includes('work')) {
    query.any = [
      { contains: { genre: 'classical' } },
      { contains: { genre: 'ambient' } },
      { contains: { genre: 'instrumental' } },
      { contains: { genre: 'lo-fi' } },
    ];
  } else if (moodLower.includes('sad') || moodLower.includes('melancholy')) {
    query.any = [
      { contains: { genre: 'indie' } },
      { contains: { genre: 'folk' } },
      { contains: { genre: 'acoustic' } },
      { contains: { genre: 'singer-songwriter' } },
    ];
  } else if (moodLower.includes('happy') || moodLower.includes('upbeat') || moodLower.includes('joy')) {
    query.any = [
      { contains: { genre: 'pop' } },
      { contains: { genre: 'indie' } },
      { contains: { genre: 'funk' } },
      { contains: { genre: 'soul' } },
    ];
  }

  // Decade-based keywords
  if (moodLower.includes('80s') || moodLower.includes('eighties')) {
    query.all = [
      ...(query.all || []),
      { inTheRange: { year: [1980, 1989] } },
    ];
  } else if (moodLower.includes('90s') || moodLower.includes('nineties')) {
    query.all = [
      ...(query.all || []),
      { inTheRange: { year: [1990, 1999] } },
    ];
  } else if (moodLower.includes('2000s')) {
    query.all = [
      ...(query.all || []),
      { inTheRange: { year: [2000, 2009] } },
    ];
  }

  // If no specific mood detected, default to highly rated songs
  if (!query.all && !query.any) {
    query.all = [
      { gt: { rating: 3 } },
    ];
  }

  return query;
}

/**
 * Fallback to genre-based random songs from library
 * Used when Last.fm is unavailable or returns no matches
 */
async function fallbackToGenreRandom(
  currentSong: { artist: string; title: string },
  limit: number,
  reason: string
): Promise<RecommendationResult> {
  console.log(`🔄 [Recommendations] Falling back to genre random (${reason})`);

  try {
    // Get random songs from library, excluding current artist
    const songs = await getSongsGlobal(0, limit * 2);

    const filtered = songs
      .filter(s => !s.artist.toLowerCase().includes(currentSong.artist.toLowerCase()))
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    return {
      songs: filtered.map(subsonicSongToSong),
      source: 'fallback',
      mode: 'similar',
      metadata: {
        fallbackReason: reason,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Fallback error:', error);
    return {
      songs: [],
      source: 'fallback',
      mode: 'similar',
      metadata: {
        fallbackReason: `${reason}_and_fallback_failed`,
      },
    };
  }
}

/**
 * Fallback to random songs from library
 * Used when smart playlist evaluation fails
 */
async function fallbackToRandom(
  limit: number,
  reason: string
): Promise<RecommendationResult> {
  console.log(`🔄 [Recommendations] Falling back to random (${reason})`);

  try {
    const songs = await getSongsGlobal(0, limit * 2);

    const randomized = songs
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    return {
      songs: randomized.map(subsonicSongToSong),
      source: 'fallback',
      mode: 'mood',
      metadata: {
        fallbackReason: reason,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Fallback error:', error);
    return {
      songs: [],
      source: 'fallback',
      mode: 'mood',
      metadata: {
        fallbackReason: `${reason}_and_fallback_failed`,
      },
    };
  }
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  applyDiversity,
  enrichedTrackToSong,
  enrichedTrackToDiscoverySong,
  subsonicSongToSong,
  buildSimpleMoodQuery,
};
