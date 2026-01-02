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
import { getSongsGlobal, getRandomSongs, search, type SubsonicSong } from './navidrome';
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

/** Queue context for smarter fallback recommendations */
export interface QueueContext {
  genres: string[];    // Most common genres in queue (sorted by frequency)
  artists: string[];   // Most common artists in queue
  avgDuration?: number; // Average song duration
  artistBatchCounts?: Record<string, number>; // Phase 1.2: How many songs queued per artist in last 2 hours
  genreExploration?: number; // Phase 4.2: Genre exploration level 0-100 (0=strict, 100=adventurous)
}

export interface RecommendationRequest {
  mode: RecommendationMode;
  /** For 'similar' and 'discovery' modes - the seed song */
  currentSong?: { artist: string; title: string; genre?: string };
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
  /** Queue context for smarter fallback (genres, artists from current queue) */
  queueContext?: QueueContext;
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
    queueContext,
  } = request;

  if (!currentSong) {
    throw new Error('currentSong required for similar mode');
  }

  const lastFm = await getLastFmClientWithConfig();

  if (!lastFm) {
    console.log('⚠️ [Recommendations] Last.fm not configured, using fallback');
    return fallbackToGenreRandom(currentSong, limit, 'lastfm_not_configured', queueContext);
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

    // Apply diversity (limit repeat artists) - Phase 1.2: Pass artist batch counts
    const diverse = applyDiversity(inLibrary, queueContext?.artistBatchCounts);

    if (diverse.length === 0) {
      console.log('⚠️ [Recommendations] No library matches from Last.fm, trying artist fallback');
      // First, try to find other songs by the same artist in the library
      const artistFallback = await fallbackToSameArtist(currentSong, limit, excludeSongIds);
      if (artistFallback.songs.length > 0) {
        return artistFallback;
      }
      // If no same-artist songs, fall back to genre-based random
      return fallbackToGenreRandom(currentSong, limit, 'no_library_matches', queueContext);
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

    // Phase 3.3: Apply skip-based scoring if userId is provided
    let skipScoringApplied = false;
    let skipFilteredCount = 0;

    if (userId) {
      try {
        const { filterFrequentlySkipped, applySortBySkipScore } = await import('./skip-scoring');

        const beforeCount = songs.length;

        // Filter out songs with very high skip rates (>70%)
        songs = await filterFrequentlySkipped(songs, userId, 0.7);
        skipFilteredCount = beforeCount - songs.length;

        // Reorder remaining songs by skip penalty (lower penalty = better)
        if (songs.length > 0) {
          songs = await applySortBySkipScore(songs, userId);
          skipScoringApplied = true;
        }

        if (skipFilteredCount > 0) {
          console.log(`⏭️ [Recommendations] Skip scoring filtered ${skipFilteredCount} frequently-skipped songs`);
        }
      } catch (error) {
        console.warn('⚠️ [Recommendations] Skip scoring failed, using original order:', error);
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
        skipScoringApplied,
        skipFilteredCount,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Last.fm error:', error);
    return fallbackToGenreRandom(currentSong, limit, 'lastfm_error', queueContext);
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
 * Phase 1.2: Now considers cross-batch artist counts
 *
 * Limits:
 * - Max 2 songs per artist per batch
 * - Max 5 songs per artist across batches (2-hour window)
 */
function applyDiversity(
  tracks: EnrichedTrack[],
  artistBatchCounts?: Record<string, number>
): EnrichedTrack[] {
  const artistCounts = new Map<string, number>();
  const MAX_PER_BATCH = 2;
  const MAX_ACROSS_BATCHES = 5; // Phase 1.2: Hard limit across 2-hour window

  return tracks.filter(track => {
    const artistLower = track.artist.toLowerCase();

    // Phase 1.2: Check cross-batch limit first
    if (artistBatchCounts) {
      const crossBatchCount = artistBatchCounts[artistLower] || 0;
      if (crossBatchCount >= MAX_ACROSS_BATCHES) {
        console.log(`🎵 [Diversity] Skipping "${track.artist}" - already queued ${crossBatchCount} songs in last 2 hours (max ${MAX_ACROSS_BATCHES})`);
        return false;
      }
    }

    // Check per-batch limit
    const batchCount = artistCounts.get(artistLower) || 0;
    if (batchCount >= MAX_PER_BATCH) {
      return false;
    }

    artistCounts.set(artistLower, batchCount + 1);
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
 * Fallback to other songs by the SAME ARTIST in the library
 * This is the first fallback when Last.fm similar tracks aren't found
 * Users expect "if I have more songs by this artist, find them"
 *
 * Phase 1.1: Limited to max 3 songs to prevent artist exhaustion
 */
async function fallbackToSameArtist(
  currentSong: { artist: string; title: string; genre?: string },
  limit: number,
  excludeSongIds: string[] = []
): Promise<RecommendationResult> {
  console.log(`🎤 [Recommendations] Trying same-artist fallback for "${currentSong.artist}"`);

  // Phase 1.1: Hard limit to prevent queuing entire artist discography
  const MAX_SAME_ARTIST_SONGS = 3;
  const effectiveLimit = Math.min(limit, MAX_SAME_ARTIST_SONGS);

  try {
    // Search for songs by the same artist using Navidrome search
    const artistSongs = await search(currentSong.artist, 0, limit * 3);

    // Filter to only songs that:
    // 1. Are by the same artist (case-insensitive match)
    // 2. Are NOT the current song
    // 3. Are NOT in the exclusion list
    const currentTitleLower = currentSong.title.toLowerCase();
    const artistLower = currentSong.artist.toLowerCase();

    const filtered = artistSongs.filter(song => {
      const songArtistLower = (song.artist || '').toLowerCase();
      const songTitleLower = (song.title || song.name || '').toLowerCase();

      // Must be same artist
      const isSameArtist = songArtistLower === artistLower ||
        songArtistLower.includes(artistLower) ||
        artistLower.includes(songArtistLower);

      // Must not be the current song
      const isNotCurrentSong = songTitleLower !== currentTitleLower;

      // Must not be excluded
      const isNotExcluded = !excludeSongIds.includes(song.id);

      return isSameArtist && isNotCurrentSong && isNotExcluded;
    });

    console.log(`🎵 [Recommendations] Found ${filtered.length} other songs by "${currentSong.artist}" (limiting to ${effectiveLimit})`);

    if (filtered.length === 0) {
      return {
        songs: [],
        source: 'fallback',
        mode: 'similar',
        metadata: {
          fallbackReason: 'no_same_artist_songs',
        },
      };
    }

    // Shuffle and return limited results (max 3 songs)
    const shuffled = filtered
      .sort(() => Math.random() - 0.5)
      .slice(0, effectiveLimit);

    // Convert to proper Song format with streaming URLs
    const songs: Song[] = shuffled.map(song => ({
      id: song.id,
      name: song.title || song.name || 'Unknown',
      title: song.title || song.name || 'Unknown',
      artist: song.artist || currentSong.artist,
      albumId: song.albumId || '',
      album: song.album || '',
      duration: typeof song.duration === 'number' ? song.duration : parseInt(String(song.duration)) || 0,
      track: typeof song.track === 'number' ? song.track : parseInt(String(song.track)) || 0,
      url: `/api/navidrome/stream/${song.id}`,
    }));

    console.log(`✅ [Recommendations] Returning ${songs.length} songs by same artist "${currentSong.artist}"`);

    return {
      songs,
      source: 'fallback',
      mode: 'similar',
      metadata: {
        fallbackReason: 'same_artist_fallback',
        totalCandidates: artistSongs.length,
        filteredCount: filtered.length,
      },
    };
  } catch (error) {
    console.error('❌ [Recommendations] Same-artist fallback error:', error);
    return {
      songs: [],
      source: 'fallback',
      mode: 'similar',
      metadata: {
        fallbackReason: 'same_artist_fallback_error',
      },
    };
  }
}

/**
 * Fallback to genre-based random songs from library
 * Uses Navidrome's native random sort for truly random selection
 * Prioritizes genres from queue context if available, then current song genre
 *
 * Phase 2.2: Enhanced with genre hierarchy for smarter similarity matching
 */
async function fallbackToGenreRandom(
  currentSong: { artist: string; title: string; genre?: string },
  limit: number,
  reason: string,
  queueContext?: QueueContext
): Promise<RecommendationResult> {
  console.log(`🔄 [Recommendations] Falling back to genre random (${reason})`);

  // Phase 2.2: Import genre hierarchy functions
  const { getGenreSimilarity, normalizeGenre, getRelatedGenres } = await import('./genre-hierarchy');

  try {
    // Use Navidrome's native random sort (not offset 0 which always returns same songs)
    // Request larger pool (10x or min 100) to find enough genre matches
    const poolSize = Math.max(limit * 10, 100);
    const songs = await getRandomSongs(poolSize);
    console.log(`🎲 [Recommendations] Got ${songs.length} random songs from Navidrome`);

    // Filter out current artist and any artists from queue context that we want variety from
    const excludeArtists = new Set<string>([currentSong.artist.toLowerCase()]);

    // Phase 1.2: Also exclude artists that hit the cross-batch limit
    if (queueContext?.artistBatchCounts) {
      const MAX_ACROSS_BATCHES = 5;
      for (const [artist, count] of Object.entries(queueContext.artistBatchCounts)) {
        if (count >= MAX_ACROSS_BATCHES) {
          excludeArtists.add(artist.toLowerCase());
        }
      }
    }

    // Optionally exclude overrepresented artists from queue (if they appear 3+ times)
    if (queueContext?.artists) {
      // Don't filter out ALL queue artists, just avoid the most common one
      // to add some variety
      const topArtist = queueContext.artists[0];
      if (topArtist) {
        excludeArtists.add(topArtist.toLowerCase());
      }
    }

    let filtered = songs.filter(s =>
      !excludeArtists.has(s.artist?.toLowerCase() || '')
    );

    // Build target genres list: queue context genres first, then current song genre
    const targetGenres: string[] = [];
    if (queueContext?.genres && queueContext.genres.length > 0) {
      // Use top 5 genres from queue (increased from 3)
      targetGenres.push(...queueContext.genres.slice(0, 5).map(g => normalizeGenre(g)));
      console.log(`📊 [Recommendations] Using queue context genres: ${targetGenres.join(', ')}`);
    }
    if (currentSong.genre) {
      const normalizedGenre = normalizeGenre(currentSong.genre);
      if (!targetGenres.includes(normalizedGenre)) {
        targetGenres.push(normalizedGenre);
      }
    }

    // Phase 2.2: Expand target genres with related genres from hierarchy
    const expandedGenres = new Set<string>(targetGenres);
    for (const genre of targetGenres.slice(0, 3)) { // Only expand top 3 to avoid noise
      const related = getRelatedGenres(genre, 5);
      for (const r of related) {
        if (r.score >= 0.5) { // Only add highly related genres
          expandedGenres.add(r.genre);
        }
      }
    }
    console.log(`🎵 [Genre Hierarchy] Expanded ${targetGenres.length} genres to ${expandedGenres.size} with related genres`);

    // Phase 2.2: Score each song by genre similarity (not just string matching)
    if (targetGenres.length > 0) {
      const scoredSongs: Array<{ song: SubsonicSong; score: number }> = [];

      for (const song of filtered) {
        const songGenre = normalizeGenre(song.genre || '');
        if (!songGenre) {
          // Songs without genre get a low score but aren't excluded
          scoredSongs.push({ song, score: 0.1 });
          continue;
        }

        // Find best match against all target genres
        let bestScore = 0;
        for (const targetGenre of targetGenres) {
          const similarity = getGenreSimilarity(songGenre, targetGenre);
          if (similarity > bestScore) {
            bestScore = similarity;
          }
        }

        // Also check against expanded related genres (with penalty)
        if (bestScore < 0.5) {
          for (const relatedGenre of expandedGenres) {
            if (targetGenres.includes(relatedGenre)) continue; // Already checked
            const similarity = getGenreSimilarity(songGenre, relatedGenre) * 0.7; // 30% penalty for indirect match
            if (similarity > bestScore) {
              bestScore = similarity;
            }
          }
        }

        scoredSongs.push({ song, score: bestScore });
      }

      // Sort by score (descending)
      scoredSongs.sort((a, b) => b.score - a.score);

      // Phase 2.2: Smart selection - high scorers first, then variety
      const highScorers = scoredSongs.filter(s => s.score >= 0.5);
      const mediumScorers = scoredSongs.filter(s => s.score >= 0.2 && s.score < 0.5);
      const lowScorers = scoredSongs.filter(s => s.score < 0.2);

      console.log(`🎵 [Genre Hierarchy] Scored ${scoredSongs.length} songs: ${highScorers.length} high (>=0.5), ${mediumScorers.length} medium, ${lowScorers.length} low`);

      // Phase 4.2: Dynamic selection strategy based on genre exploration level
      // 0 = strict (90% high, 10% medium), 50 = balanced (70% high, 30% medium), 100 = adventurous (50% high, 50% medium+low)
      const explorationLevel = queueContext?.genreExploration ?? 50; // Default to balanced

      // Calculate target percentages dynamically
      // Linear interpolation: highPercent = 0.9 - (exploration * 0.004)
      // At 0: 90%, at 50: 70%, at 100: 50%
      const highPercent = 0.9 - (explorationLevel * 0.004);
      const mediumPercent = 1 - highPercent;

      const targetHigh = Math.ceil(limit * highPercent);
      const targetMedium = Math.ceil(limit * mediumPercent);

      console.log(`🎛️ [Genre Exploration] Level: ${explorationLevel}% - targeting ${Math.round(highPercent * 100)}% high scorers, ${Math.round(mediumPercent * 100)}% medium/low`);

      const selected: SubsonicSong[] = [];

      // Add high scorers (shuffled)
      const shuffledHigh = highScorers.sort(() => Math.random() - 0.5);
      for (const s of shuffledHigh.slice(0, targetHigh)) {
        selected.push(s.song);
      }

      // Phase 4.2: Add medium/low scorers based on exploration level
      // At high exploration (>70), include some low scorers for discovery
      const includeLowScorers = explorationLevel > 70;
      const varietyPool = includeLowScorers
        ? [...mediumScorers, ...lowScorers]
        : mediumScorers;

      const shuffledVariety = varietyPool.sort(() => Math.random() - 0.5);
      for (const s of shuffledVariety.slice(0, targetMedium)) {
        selected.push(s.song);
      }

      // Fill remaining with whatever is available
      if (selected.length < limit) {
        const remaining = [
          ...shuffledHigh.slice(targetHigh),
          ...shuffledVariety.slice(targetMedium),
        ];
        for (const s of remaining) {
          if (selected.length >= limit) break;
          if (!selected.includes(s.song)) {
            selected.push(s.song);
          }
        }
      }

      filtered = selected;
    } else {
      // No target genres - just shuffle
      filtered = filtered.sort(() => Math.random() - 0.5).slice(0, limit);
    }

    console.log(`✅ [Recommendations] Returning ${filtered.length} fallback songs with genre hierarchy scoring`);

    return {
      songs: filtered.map(subsonicSongToSong),
      source: 'fallback',
      mode: 'similar',
      metadata: {
        fallbackReason: reason,
        genreFiltered: targetGenres.length > 0,
        queueContextUsed: !!(queueContext?.genres?.length),
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
