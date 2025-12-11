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
import { translateMoodToQuery, toEvaluatorFormat, extractLastFmTags } from './mood-translator';
import type { Song } from '@/lib/types/song';
import { getConfigAsync } from '@/lib/config/config';
import {
  applyCompoundScoreBoost,
  getCompoundScoredRecommendations,
} from './compound-scoring';

/**
 * Get the Last.fm client, initializing with API key from config if needed
 */
async function getLastFmClientWithConfig() {
  const config = await getConfigAsync();
  if (!config.lastfmApiKey) {
    return null;
  }
  return getLastFmClient(config.lastfmApiKey);
}

// ============================================================================
// Types
// ============================================================================

export type RecommendationMode = 'similar' | 'discovery' | 'mood' | 'personalized';

export interface RecommendationRequest {
  mode: RecommendationMode;
  /** For 'similar' and 'discovery' modes - the seed song */
  currentSong?: { artist: string; title: string };
  /** For 'mood' and 'discovery' modes - natural language description for genre-first discovery */
  moodDescription?: string;
  /** Maximum number of songs to return */
  limit?: number;
  /** Song IDs to exclude from results */
  excludeSongIds?: string[];
  /** Artist names to exclude (for diversity) */
  excludeArtists?: string[];
  /** User ID for personalized compound scoring (Phase 4) */
  userId?: string;
  /** Weight for compound score boost (0-1, default 0.3) */
  compoundScoreWeight?: number;
}

export interface RecommendationResult {
  songs: Song[];
  source: 'lastfm' | 'smart-playlist' | 'fallback' | 'compound';
  mode: RecommendationMode;
  /** Optional metadata about the recommendation */
  metadata?: {
    totalCandidates?: number;
    filteredCount?: number;
    fallbackReason?: string;
    /** Whether compound scoring was applied */
    compoundScoreApplied?: boolean;
    /** Number of songs that had compound scores */
    compoundScoredCount?: number;
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
    case 'personalized':
      return getPersonalizedSongs(request);
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
 * Phase 4 Enhancement: When userId is provided, applies compound scoring
 * based on the user's listening history for better personalization.
 *
 * This replaces:
 * - AI DJ auto-queue functionality
 * - Auto recommendations from ollama.ts
 */
async function getSimilarSongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const {
    currentSong,
    limit = 10,
    excludeSongIds = [],
    excludeArtists = [],
    userId,
    compoundScoreWeight = 0.3,
  } = request;

  if (!currentSong) {
    throw new Error('currentSong required for similar mode');
  }

  const lastFm = await getLastFmClientWithConfig();

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

    // Convert to Song format
    let songs = diverse.slice(0, limit).map(enrichedTrackToSong);

    // Phase 4: Apply compound score boost if userId is provided
    let compoundScoreApplied = false;
    let compoundScoredCount = 0;

    if (userId && compoundScoreWeight > 0) {
      try {
        const originalOrder = songs.map(s => s.id);
        songs = await applyCompoundScoreBoost(userId, songs, compoundScoreWeight);
        compoundScoreApplied = true;

        // Count how many songs changed position (indicates compound scoring was effective)
        compoundScoredCount = songs.filter((s, i) => s.id !== originalOrder[i]).length;

        if (compoundScoredCount > 0) {
          console.log(`📊 [Recommendations] Compound scoring reordered ${compoundScoredCount} songs`);
        }
      } catch (error) {
        console.warn('⚠️ [Recommendations] Compound scoring failed, using original order:', error);
      }
    }

    return {
      songs,
      source: 'lastfm',
      mode: 'similar',
      metadata: {
        totalCandidates: similar.length,
        filteredCount: inLibrary.length,
        compoundScoreApplied,
        compoundScoredCount,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Last.fm error:', error);
    return fallbackToGenreRandom(currentSong, limit, 'lastfm_error');
  }
}

// ============================================================================
// Discovery Songs (Not in Library) - Genre-First Approach
// ============================================================================

/**
 * Get discovery songs that are NOT in the user's library
 * Uses a genre-first approach for better variety:
 *
 * 1. PRIMARY: tag.gettoptracks - Get popular tracks by genre/mood tags
 * 2. SECONDARY: artist.getsimilar → artist.gettoptracks - Find similar artists, then their top tracks
 * 3. FALLBACK: track.getsimilar - Original approach for variety
 *
 * This replaces the old approach that only used track.getsimilar (too narrow)
 */
async function getDiscoverySongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { currentSong, limit = 10, moodDescription } = request;

  const lastFm = await getLastFmClientWithConfig();

  if (!lastFm) {
    throw new Error('Last.fm API key not configured. Please add your Last.fm API key in Settings → Services.');
  }

  const allDiscoveries: EnrichedTrack[] = [];
  const seenKeys = new Set<string>();

  // Helper to add unique tracks
  const addUniqueTracks = (tracks: EnrichedTrack[]) => {
    for (const track of tracks) {
      const key = `${track.artist.toLowerCase()}-${track.name.toLowerCase()}`;
      if (!seenKeys.has(key) && !track.inLibrary) {
        seenKeys.add(key);
        allDiscoveries.push(track);
      }
    }
  };

  try {
    // =========================================================================
    // STRATEGY 1: Genre/Tag-based discovery (PRIMARY)
    // Query Last.fm tag.gettoptracks for mood-matching tags
    // =========================================================================
    if (moodDescription) {
      const tags = extractLastFmTags(moodDescription);
      console.log(`🏷️ [Recommendations] Extracted tags for "${moodDescription}":`, tags.slice(0, 5));

      // Query up to 3 tags for variety
      const tagsToQuery = tags.slice(0, 3);
      for (const tag of tagsToQuery) {
        try {
          const tagTracks = await lastFm.getTopTracksByTag(tag, Math.ceil(limit * 2));
          const notInLibrary = tagTracks.filter(t => !t.inLibrary);
          addUniqueTracks(notInLibrary);
          console.log(`🎵 [Recommendations] Tag "${tag}": ${notInLibrary.length} discoveries`);
        } catch (err) {
          console.warn(`⚠️ [Recommendations] Failed to get tracks for tag "${tag}":`, err);
        }
      }
    }

    // =========================================================================
    // STRATEGY 2: Similar Artists → Top Tracks (SECONDARY)
    // Find artists similar to the seed, then get their popular tracks
    // =========================================================================
    if (currentSong && allDiscoveries.length < limit * 2) {
      try {
        console.log(`🎤 [Recommendations] Finding similar artists to "${currentSong.artist}"`);
        const similarArtists = await lastFm.getSimilarArtists(currentSong.artist, 5);

        // Get top tracks from similar artists (not in library)
        for (const artist of similarArtists.filter(a => !a.inLibrary).slice(0, 3)) {
          try {
            const topTracks = await lastFm.getTopTracks(artist.name, Math.ceil(limit));
            const notInLibrary = topTracks.filter(t => !t.inLibrary);
            addUniqueTracks(notInLibrary);
            console.log(`🎵 [Recommendations] Similar artist "${artist.name}": ${notInLibrary.length} discoveries`);
          } catch (err) {
            console.warn(`⚠️ [Recommendations] Failed to get top tracks for "${artist.name}":`, err);
          }
        }
      } catch (err) {
        console.warn('⚠️ [Recommendations] Failed to get similar artists:', err);
      }
    }

    // =========================================================================
    // STRATEGY 3: Similar Tracks (FALLBACK for variety)
    // Original approach - use sparingly for additional variety
    // =========================================================================
    if (currentSong && allDiscoveries.length < limit) {
      try {
        console.log(`🔍 [Recommendations] Fallback: Getting similar tracks to "${currentSong.artist} - ${currentSong.title}"`);
        const similarTracks = await lastFm.getSimilarTracks(
          currentSong.artist,
          currentSong.title,
          limit * 2
        );
        const notInLibrary = similarTracks.filter(t => !t.inLibrary);
        addUniqueTracks(notInLibrary);
        console.log(`🎵 [Recommendations] Similar tracks fallback: ${notInLibrary.length} discoveries`);
      } catch (err) {
        console.warn('⚠️ [Recommendations] Failed to get similar tracks:', err);
      }
    }

    // Shuffle and limit results
    const shuffled = allDiscoveries.sort(() => Math.random() - 0.5);
    const finalResults = shuffled.slice(0, limit);

    console.log(`✅ [Recommendations] Discovery complete: ${finalResults.length} unique tracks from ${allDiscoveries.length} candidates`);

    return {
      songs: finalResults.map(enrichedTrackToDiscoverySong),
      source: 'lastfm',
      mode: 'discovery',
      metadata: {
        totalCandidates: allDiscoveries.length,
        filteredCount: finalResults.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Discovery mode error:', error);
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
 * Phase 2: Now uses mood-translator.ts for AI-powered mood→query translation
 */
async function getMoodBasedSongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { moodDescription, limit = 20 } = request;

  if (!moodDescription) {
    throw new Error('moodDescription required for mood mode');
  }

  console.log(`🎭 [Recommendations] Processing mood: "${moodDescription}"`);

  try {
    // Use AI-powered mood translator (falls back to keywords if LLM unavailable)
    const moodQuery = await translateMoodToQuery(moodDescription);

    // Convert to evaluator format
    const evaluatorQuery = toEvaluatorFormat(moodQuery);

    console.log(`📝 [Recommendations] Generated query:`, JSON.stringify(evaluatorQuery));

    // Evaluate smart playlist rules against library
    const songs = await evaluateSmartPlaylistRules({
      ...evaluatorQuery,
      limit: moodQuery.limit || limit,
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
// Personalized Recommendations (Compound Score Only)
// ============================================================================

/**
 * Get personalized recommendations based purely on listening history
 * Uses compound scoring - songs suggested by multiple played songs rank higher
 *
 * Phase 4: This mode doesn't require a seed song - it's based entirely on
 * the user's listening history and accumulated similarity data.
 *
 * @example
 * const result = await getRecommendations({
 *   mode: 'personalized',
 *   userId: 'user-123',
 *   limit: 20,
 * });
 */
async function getPersonalizedSongs(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const {
    limit = 20,
    excludeSongIds = [],
    excludeArtists = [],
    userId,
  } = request;

  if (!userId) {
    throw new Error('userId required for personalized mode');
  }

  console.log(`📊 [Recommendations] Getting personalized recommendations for user ${userId}`);

  try {
    // Get compound-scored recommendations
    const recommendations = await getCompoundScoredRecommendations(userId, {
      limit: limit * 2, // Get extra to account for filtering
      excludeSongIds,
      excludeArtists,
      minSourceCount: 2, // Require at least 2 source songs for stronger signal
    });

    if (recommendations.length === 0) {
      console.log('⚠️ [Recommendations] No compound scores available, using fallback');
      return fallbackToRandom(limit, 'no_compound_scores');
    }

    // Convert compound scores to Song objects
    // We need to fetch actual song data from Navidrome
    const songs: Song[] = [];
    for (const rec of recommendations.slice(0, limit)) {
      songs.push({
        id: rec.songId,
        title: rec.title,
        name: rec.title,
        artist: rec.artist,
        album: '',
        duration: '0',
        track: '0',
        url: `/api/navidrome/stream/${rec.songId}`,
      });
    }

    console.log(`✅ [Recommendations] Returning ${songs.length} personalized recommendations`);

    return {
      songs,
      source: 'compound',
      mode: 'personalized',
      metadata: {
        totalCandidates: recommendations.length,
        compoundScoreApplied: true,
        compoundScoredCount: songs.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Compound scoring error:', error);
    return fallbackToRandom(limit, 'compound_scoring_error');
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
};
