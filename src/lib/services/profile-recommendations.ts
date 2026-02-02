/**
 * Profile-Based Recommendation Service
 *
 * Main service for the profile-based AI DJ recommendation system.
 * Uses pre-computed profile data to generate recommendations with ZERO API calls.
 *
 * Profile Score Formula:
 * profileScore = (
 *   compoundScore * 0.30 +           // Pre-computed listening correlation
 *   likedBoost * 0.25 +              // Is this a liked/starred song?
 *   similarityScore * 0.20 +         // How similar to seed (from cache)
 *   artistAffinityScore * 0.15 +     // User's affinity for this artist
 *   (1 - skipPenalty) * 0.05 +       // Avoid frequently skipped
 *   temporalBoost * 0.05             // Time-of-day/season match
 * )
 *
 * @see docs/architecture/profile-based-recommendations.md
 */

import { db } from '../db';
import {
  trackSimilarities,
  compoundScores,
  likedSongsSync,
} from '../db/schema';
import { eq, and, gte, desc, inArray, ne, sql } from 'drizzle-orm';
import type { Song } from '@/lib/types/song';
import { getCompoundScoredRecommendations } from './compound-scoring';
import { getLikedSongIds } from './liked-songs-sync';
import {
  getArtistAffinity,
  getArtistAffinities,
  getTemporalGenreBoost,
  getCurrentTimeContext,
} from './artist-affinity';
import { calculateSkipScores } from './skip-scoring';
import { getSongsByIds } from './navidrome';

// ============================================================================
// Constants
// ============================================================================

// Profile score weights
const COMPOUND_WEIGHT = 0.30;      // Pre-computed listening correlation
const LIKED_WEIGHT = 0.25;         // Liked/starred songs (strong explicit signal)
const SIMILARITY_WEIGHT = 0.20;   // Similarity to seed song
const ARTIST_AFFINITY_WEIGHT = 0.15;  // User's artist affinity
const SKIP_AVOIDANCE_WEIGHT = 0.05;   // Avoid frequently skipped
const TEMPORAL_WEIGHT = 0.05;     // Time-of-day/season match

// Diversity constraints
const MAX_SONGS_PER_ARTIST = 1;    // Maximum songs from same artist in results
const MAX_SIMILAR_GENRE_RATIO = 0.7;  // Maximum 70% from same genre

// ============================================================================
// Types
// ============================================================================

export interface ProfileRecommendationOptions {
  /** Maximum number of recommendations to return */
  limit?: number;
  /** Song IDs to exclude */
  excludeSongIds?: string[];
  /** Artist names to exclude */
  excludeArtists?: string[];
  /** Enforce diversity constraints */
  enforceDiversity?: boolean;
}

export interface ScoredCandidate {
  songId: string;
  artist: string;
  title: string;
  genre?: string;
  profileScore: number;
  components: {
    compoundScore: number;
    likedBoost: number;
    similarityScore: number;
    artistAffinity: number;
    skipAvoidance: number;
    temporalBoost: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get cached similar tracks for a seed song (NO API CALL)
 */
async function getCachedSimilarTracks(
  artist: string,
  title: string,
  limit: number = 50
): Promise<Array<{ songId: string; artist: string; title: string; matchScore: number }>> {
  const similarTracks = await db
    .select({
      songId: trackSimilarities.targetSongId,
      artist: trackSimilarities.targetArtist,
      title: trackSimilarities.targetTitle,
      matchScore: trackSimilarities.matchScore,
    })
    .from(trackSimilarities)
    .where(
      and(
        eq(trackSimilarities.sourceArtist, artist),
        eq(trackSimilarities.sourceTitle, title),
        gte(trackSimilarities.expiresAt, new Date())
      )
    )
    .orderBy(desc(trackSimilarities.matchScore))
    .limit(limit);

  // Filter out null songIds (tracks not in library)
  return similarTracks.filter(t => t.songId !== null) as Array<{
    songId: string;
    artist: string;
    title: string;
    matchScore: number;
  }>;
}

/**
 * Get liked songs from the same genre as the seed song
 */
async function getLikedSongsInGenre(
  userId: string,
  seedGenre: string | undefined,
  limit: number = 20
): Promise<string[]> {
  if (!seedGenre) return [];

  // Get all liked song IDs
  const likedSongs = await db
    .select({
      songId: likedSongsSync.songId,
    })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    )
    .limit(limit * 2); // Get extra to filter

  return likedSongs.map(s => s.songId);
}

/**
 * Merge candidates from different sources and deduplicate
 */
function mergeCandidates(
  similarTracks: Array<{ songId: string; artist: string; title: string; matchScore: number }>,
  compoundRecommendations: Array<{ songId: string; artist: string; title: string; recencyWeightedScore: number }>,
  likedSongIds: string[]
): Map<string, { artist: string; title: string; similarityScore: number; isFromCompound: boolean; isLiked: boolean }> {
  const candidateMap = new Map<string, {
    artist: string;
    title: string;
    similarityScore: number;
    isFromCompound: boolean;
    isLiked: boolean;
  }>();

  // Add similar tracks
  for (const track of similarTracks) {
    candidateMap.set(track.songId, {
      artist: track.artist,
      title: track.title,
      similarityScore: track.matchScore,
      isFromCompound: false,
      isLiked: false,
    });
  }

  // Add compound recommendations (merge if already present)
  for (const rec of compoundRecommendations) {
    const existing = candidateMap.get(rec.songId);
    if (existing) {
      existing.isFromCompound = true;
    } else {
      candidateMap.set(rec.songId, {
        artist: rec.artist,
        title: rec.title,
        similarityScore: 0, // Not directly similar to seed
        isFromCompound: true,
        isLiked: false,
      });
    }
  }

  // Mark liked songs
  for (const songId of likedSongIds) {
    const existing = candidateMap.get(songId);
    if (existing) {
      existing.isLiked = true;
    }
  }

  return candidateMap;
}

/**
 * Enforce diversity constraints on scored candidates
 */
function enforceDiversity(
  candidates: ScoredCandidate[],
  maxPerArtist: number = MAX_SONGS_PER_ARTIST
): ScoredCandidate[] {
  const artistCounts = new Map<string, number>();
  const result: ScoredCandidate[] = [];

  // Sort by profile score descending
  const sorted = [...candidates].sort((a, b) => b.profileScore - a.profileScore);

  for (const candidate of sorted) {
    const normalizedArtist = candidate.artist.toLowerCase();
    const currentCount = artistCounts.get(normalizedArtist) || 0;

    if (currentCount < maxPerArtist) {
      result.push(candidate);
      artistCounts.set(normalizedArtist, currentCount + 1);
    }
  }

  return result;
}

// ============================================================================
// Main Recommendation Function
// ============================================================================

/**
 * Get profile-based recommendations for a seed song
 *
 * This function:
 * 1. Gets cached similar tracks for seed (NO API call)
 * 2. Gets top compound-scored songs (pre-computed)
 * 3. Gets liked songs
 * 4. Merges all candidates
 * 5. Scores each candidate using profile weights
 * 6. Applies diversity rules
 * 7. Returns top N recommendations
 *
 * @param userId - The user's ID
 * @param seedSong - The currently playing song
 * @param options - Recommendation options
 * @returns Array of recommended songs
 */
export async function getProfileBasedRecommendations(
  userId: string,
  seedSong: Song,
  options: ProfileRecommendationOptions = {}
): Promise<Song[]> {
  const {
    limit = 1, // Default to 1 for drip-feed model
    excludeSongIds = [],
    excludeArtists = [],
    enforceDiversity: shouldEnforceDiversity = true,
  } = options;

  console.log(`🎯 [ProfileRec] Getting recommendations for "${seedSong.artist} - ${seedSong.title || seedSong.name}"`);

  const seedTitle = seedSong.title || seedSong.name;
  const seedArtist = seedSong.artist || 'Unknown';
  const seedGenre = seedSong.genre;

  // Step 1: Get cached similar tracks (NO API call)
  const similarTracks = await getCachedSimilarTracks(seedArtist, seedTitle, 50);
  console.log(`🎯 [ProfileRec] Found ${similarTracks.length} cached similar tracks`);

  // Step 2: Get top compound-scored songs (pre-computed)
  const compoundRecommendations = await getCompoundScoredRecommendations(userId, {
    limit: 30,
    excludeSongIds,
    excludeArtists,
  });
  console.log(`🎯 [ProfileRec] Found ${compoundRecommendations.length} compound-scored songs`);

  // Step 3: Get liked songs
  const likedSongIds = await getLikedSongIds(userId);
  const likedSongIdsArray = Array.from(likedSongIds);
  console.log(`🎯 [ProfileRec] User has ${likedSongIds.size} liked songs`);

  // Step 4: Merge candidates
  const candidateMap = mergeCandidates(similarTracks, compoundRecommendations, likedSongIdsArray);
  console.log(`🎯 [ProfileRec] Merged ${candidateMap.size} unique candidates`);

  if (candidateMap.size === 0) {
    console.log(`🎯 [ProfileRec] No candidates found, returning empty`);
    return [];
  }

  // Filter out excluded songs and artists
  const excludeSet = new Set([...excludeSongIds, seedSong.id]);
  const excludeArtistsLower = excludeArtists.map(a => a.toLowerCase());

  for (const [songId, candidate] of candidateMap) {
    if (excludeSet.has(songId) || excludeArtistsLower.includes(candidate.artist.toLowerCase())) {
      candidateMap.delete(songId);
    }
  }

  console.log(`🎯 [ProfileRec] ${candidateMap.size} candidates after exclusions`);

  // Step 5: Score each candidate
  const candidateSongIds = Array.from(candidateMap.keys());

  // Get artist affinities for all candidate artists
  const candidateArtists = Array.from(new Set(
    Array.from(candidateMap.values()).map(c => c.artist)
  ));
  const artistAffinities = await getArtistAffinities(userId, candidateArtists);

  // Get compound scores for candidates
  const compoundScoreMap = new Map<string, number>();
  for (const rec of compoundRecommendations) {
    // Normalize to 0-1 range (assuming max practical score is around 5)
    compoundScoreMap.set(rec.songId, Math.min(rec.recencyWeightedScore / 5, 1));
  }

  // Create mock songs for skip scoring
  const mockSongs: Song[] = Array.from(candidateMap.entries()).map(([songId, candidate]) => ({
    id: songId,
    name: candidate.title,
    title: candidate.title,
    artist: candidate.artist,
    albumId: '',
    duration: 0,
    track: 0,
    url: '',
  }));

  // Get skip scores
  const skipScores = await calculateSkipScores(mockSongs, { userId });

  // Score candidates
  const scoredCandidates: ScoredCandidate[] = [];

  for (const [songId, candidate] of candidateMap) {
    // Get component scores
    const compoundScore = compoundScoreMap.get(songId) || 0;
    const likedBoost = candidate.isLiked ? 1.0 : 0;
    const similarityScore = candidate.similarityScore;
    const artistAffinity = artistAffinities.get(candidate.artist.toLowerCase()) || 0;

    // Skip avoidance (invert skip penalty)
    const skipScore = skipScores.get(songId);
    const skipAvoidance = skipScore ? (1 - skipScore.skipPenalty) : 1.0;

    // Temporal boost (would need genre info - default to 0 for now)
    const temporalBoost = seedGenre ? await getTemporalGenreBoost(userId, seedGenre) : 0;

    // Calculate weighted profile score
    const profileScore = (
      compoundScore * COMPOUND_WEIGHT +
      likedBoost * LIKED_WEIGHT +
      similarityScore * SIMILARITY_WEIGHT +
      artistAffinity * ARTIST_AFFINITY_WEIGHT +
      skipAvoidance * SKIP_AVOIDANCE_WEIGHT +
      temporalBoost * TEMPORAL_WEIGHT
    );

    scoredCandidates.push({
      songId,
      artist: candidate.artist,
      title: candidate.title,
      genre: seedGenre, // Placeholder - would need to look up actual genre
      profileScore,
      components: {
        compoundScore,
        likedBoost,
        similarityScore,
        artistAffinity,
        skipAvoidance,
        temporalBoost,
      },
    });
  }

  console.log(`🎯 [ProfileRec] Scored ${scoredCandidates.length} candidates`);

  // Step 6: Apply diversity rules
  let finalCandidates = scoredCandidates;
  if (shouldEnforceDiversity) {
    finalCandidates = enforceDiversity(scoredCandidates, MAX_SONGS_PER_ARTIST);
    console.log(`🎯 [ProfileRec] ${finalCandidates.length} candidates after diversity enforcement`);
  }

  // Step 7: Get top N and fetch full song data
  const topCandidates = finalCandidates
    .sort((a, b) => b.profileScore - a.profileScore)
    .slice(0, limit);

  if (topCandidates.length === 0) {
    console.log(`🎯 [ProfileRec] No candidates remaining after filtering`);
    return [];
  }

  // Log top candidates for debugging
  console.log(`🎯 [ProfileRec] Top ${topCandidates.length} candidates:`);
  for (const candidate of topCandidates) {
    console.log(`   - "${candidate.artist} - ${candidate.title}" (score: ${candidate.profileScore.toFixed(3)})`);
    console.log(`     compound=${candidate.components.compoundScore.toFixed(2)}, liked=${candidate.components.likedBoost.toFixed(2)}, similar=${candidate.components.similarityScore.toFixed(2)}, artist=${candidate.components.artistAffinity.toFixed(2)}`);
  }

  // Fetch full song data from Navidrome using IDs directly (NO SEARCH API CALLS)
  const songIds = topCandidates.map(c => c.songId);
  let songs: Song[] = [];

  try {
    songs = await getSongsByIds(songIds);
    console.log(`🎯 [ProfileRec] Fetched ${songs.length} songs by ID`);
  } catch (error) {
    console.error(`🎯 [ProfileRec] Failed to fetch songs by ID:`, error);
  }

  console.log(`🎯 [ProfileRec] Returning ${songs.length} recommendations`);
  return songs;
}

/**
 * Get recommendations purely from liked songs (for cold start)
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of recommendations
 * @returns Array of liked songs (shuffled)
 */
export async function getRecommendationsFromLikedSongs(
  userId: string,
  limit: number = 5
): Promise<Song[]> {
  const likedSongs = await db
    .select()
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    )
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  // Fetch songs by ID directly (NO SEARCH API CALLS)
  const songIds = likedSongs.map(s => s.songId);

  try {
    const songs = await getSongsByIds(songIds);
    console.log(`🎯 [ProfileRec] Fetched ${songs.length} liked songs by ID`);
    return songs;
  } catch (error) {
    console.error(`🎯 [ProfileRec] Failed to fetch liked songs by ID:`, error);
    return [];
  }
}

/**
 * Check if user has enough profile data for profile-based recommendations
 *
 * @param userId - The user's ID
 * @returns True if user has sufficient profile data
 */
export async function hasProfileData(userId: string): Promise<boolean> {
  // Check if user has any compound scores
  const scores = await db
    .select({ count: sql<number>`count(*)` })
    .from(compoundScores)
    .where(eq(compoundScores.userId, userId));

  const compoundCount = scores[0]?.count || 0;

  // Check if user has any liked songs synced
  const liked = await db
    .select({ count: sql<number>`count(*)` })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    );

  const likedCount = liked[0]?.count || 0;

  // User has profile data if they have either compound scores or liked songs
  return compoundCount > 0 || likedCount > 0;
}

// ============================================================================
// Exports
// ============================================================================

export {
  COMPOUND_WEIGHT,
  LIKED_WEIGHT,
  SIMILARITY_WEIGHT,
  ARTIST_AFFINITY_WEIGHT,
  SKIP_AVOIDANCE_WEIGHT,
  TEMPORAL_WEIGHT,
  MAX_SONGS_PER_ARTIST,
};
