/**
 * Compound Scoring Service
 *
 * Phase 4 of the recommendation engine refactor.
 * Implements Platypush-inspired compound scoring for recommendations.
 *
 * The key insight: If 5 different songs you played all suggest "Song X",
 * then "Song X" should rank higher than a song only suggested by 1 played song.
 *
 * Formula: compound_score = SUM(match_score * recency_weight)
 *
 * @see docs/architecture/recommendation-engine-refactor.md
 */

import { db } from '../db';
import {
  compoundScores,
  listeningHistory,
  trackSimilarities,
  type CompoundScoreInsert,
} from '../db/schema';
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm';
import type { Song } from '@/lib/types/song';

// ============================================================================
// Constants
// ============================================================================

// How much weight to give recent vs older plays
// Exponential decay: weight = e^(-decay_rate * days_ago)
const RECENCY_DECAY_RATE = 0.15; // ~50% weight after 5 days

// Minimum score to include in recommendations
const MIN_COMPOUND_SCORE = 0.1;

// Maximum recommendations to return
const MAX_RECOMMENDATIONS = 50;

// Days to look back for listening history
const LOOKBACK_DAYS = 14;

// ============================================================================
// Types
// ============================================================================

export interface CompoundScoredSong {
  songId: string;
  artist: string;
  title: string;
  score: number;
  sourceCount: number;
  recencyWeightedScore: number;
}

export interface ScoringOptions {
  /** Maximum number of results */
  limit?: number;
  /** Days to look back for listening history */
  daysBack?: number;
  /** Song IDs to exclude */
  excludeSongIds?: string[];
  /** Artist names to exclude */
  excludeArtists?: string[];
  /** Minimum source count (how many different played songs suggest this) */
  minSourceCount?: number;
}

// ============================================================================
// Main Scoring Functions
// ============================================================================

/**
 * Calculate and store compound scores for a user
 * Should be called periodically or after significant listening activity
 *
 * The algorithm:
 * 1. Get user's recent listening history (songs played)
 * 2. For each played song, get its similar tracks from cache
 * 3. For each similar track, accumulate:
 *    - Raw score: sum of match scores from all source songs
 *    - Recency-weighted score: weight by how recently the source was played
 *    - Source count: how many different songs suggest this track
 * 4. Store/update compound scores in database
 *
 * @param userId - The user's ID
 * @param daysBack - How many days of history to consider
 */
export async function calculateCompoundScores(
  userId: string,
  daysBack: number = LOOKBACK_DAYS
): Promise<number> {
  console.log(`📊 [CompoundScoring] Calculating scores for user ${userId} (${daysBack} days)`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const now = new Date();

  // Step 1: Get user's recent listening history with unique songs
  const recentPlays = await db
    .select({
      artist: listeningHistory.artist,
      title: listeningHistory.title,
      lastPlayed: sql<Date>`max(${listeningHistory.playedAt})`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .groupBy(listeningHistory.artist, listeningHistory.title)
    .limit(100); // Limit to avoid processing too many songs

  if (recentPlays.length === 0) {
    console.log(`📊 [CompoundScoring] No recent plays found for user ${userId}`);
    return 0;
  }

  console.log(`📊 [CompoundScoring] Found ${recentPlays.length} unique songs played`);

  // Step 2: Aggregate scores for similar tracks
  const scoreMap = new Map<string, {
    songId: string | null;
    artist: string;
    title: string;
    totalScore: number;
    recencyWeightedScore: number;
    sources: Set<string>;
  }>();

  for (const play of recentPlays) {
    // Get similar tracks for this played song
    const similarTracks = await db
      .select()
      .from(trackSimilarities)
      .where(
        and(
          eq(trackSimilarities.sourceArtist, play.artist),
          eq(trackSimilarities.sourceTitle, play.title),
          gte(trackSimilarities.expiresAt, new Date())
        )
      );

    if (similarTracks.length === 0) {
      continue;
    }

    // Calculate recency weight for this source song
    const daysSincePlay = (now.getTime() - play.lastPlayed.getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-RECENCY_DECAY_RATE * daysSincePlay);

    // Accumulate scores for each similar track
    for (const similar of similarTracks) {
      // Only include tracks that exist in library
      if (!similar.targetSongId) {
        continue;
      }

      const key = similar.targetSongId;
      const existing = scoreMap.get(key);

      if (existing) {
        existing.totalScore += similar.matchScore;
        existing.recencyWeightedScore += similar.matchScore * recencyWeight;
        existing.sources.add(`${play.artist}:${play.title}`);
      } else {
        scoreMap.set(key, {
          songId: similar.targetSongId,
          artist: similar.targetArtist,
          title: similar.targetTitle,
          totalScore: similar.matchScore,
          recencyWeightedScore: similar.matchScore * recencyWeight,
          sources: new Set([`${play.artist}:${play.title}`]),
        });
      }
    }
  }

  console.log(`📊 [CompoundScoring] Calculated scores for ${scoreMap.size} potential recommendations`);

  // Step 3: Store compound scores
  let stored = 0;
  for (const [songId, data] of scoreMap.entries()) {
    // Skip low-scoring tracks
    if (data.recencyWeightedScore < MIN_COMPOUND_SCORE) {
      continue;
    }

    const record: CompoundScoreInsert = {
      userId,
      songId: songId,
      artist: data.artist,
      title: data.title,
      score: data.totalScore,
      sourceCount: data.sources.size,
      recencyWeightedScore: data.recencyWeightedScore,
    };

    await db
      .insert(compoundScores)
      .values(record)
      .onConflictDoUpdate({
        target: [compoundScores.userId, compoundScores.songId],
        set: {
          score: record.score,
          sourceCount: record.sourceCount,
          recencyWeightedScore: record.recencyWeightedScore,
          calculatedAt: new Date(),
        },
      });

    stored++;
  }

  console.log(`📊 [CompoundScoring] Stored ${stored} compound scores for user ${userId}`);
  return stored;
}

/**
 * Get compound-scored recommendations for a user
 * Returns songs ranked by compound score (higher = better)
 */
export async function getCompoundScoredRecommendations(
  userId: string,
  options: ScoringOptions = {}
): Promise<CompoundScoredSong[]> {
  const {
    limit = MAX_RECOMMENDATIONS,
    excludeSongIds = [],
    excludeArtists = [],
    minSourceCount = 1,
  } = options;

  const results = await db
    .select()
    .from(compoundScores)
    .where(
      and(
        eq(compoundScores.userId, userId),
        gte(compoundScores.sourceCount, minSourceCount)
      )
    )
    .orderBy(desc(compoundScores.recencyWeightedScore))
    .limit(limit * 2); // Fetch extra to account for filtering

  // Apply exclusions
  const filtered = results.filter(r => {
    if (excludeSongIds.includes(r.songId)) {
      return false;
    }
    if (excludeArtists.some(ea => r.artist.toLowerCase().includes(ea.toLowerCase()))) {
      return false;
    }
    return true;
  });

  return filtered.slice(0, limit).map(r => ({
    songId: r.songId,
    artist: r.artist,
    title: r.title,
    score: r.score,
    sourceCount: r.sourceCount,
    recencyWeightedScore: r.recencyWeightedScore,
  }));
}

/**
 * Get compound score boost for a specific song
 * Used to enhance Last.fm recommendations with listening history data
 *
 * Returns 0 if no compound score exists
 * Returns 0-1 normalized boost based on recency-weighted score
 */
export async function getCompoundScoreBoost(
  userId: string,
  songId: string
): Promise<number> {
  const result = await db
    .select()
    .from(compoundScores)
    .where(
      and(
        eq(compoundScores.userId, userId),
        eq(compoundScores.songId, songId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    return 0;
  }

  // Normalize to 0-1 range (assuming max practical score is around 5)
  const normalizedScore = Math.min(result[0].recencyWeightedScore / 5, 1);
  return normalizedScore;
}

/**
 * Get compound score boosts for multiple songs at once
 * More efficient than calling getCompoundScoreBoost for each song
 */
export async function getCompoundScoreBoosts(
  userId: string,
  songIds: string[]
): Promise<Map<string, number>> {
  if (songIds.length === 0) {
    return new Map();
  }

  const results = await db
    .select()
    .from(compoundScores)
    .where(
      and(
        eq(compoundScores.userId, userId),
        inArray(compoundScores.songId, songIds)
      )
    );

  const boostMap = new Map<string, number>();
  for (const result of results) {
    const normalizedScore = Math.min(result.recencyWeightedScore / 5, 1);
    boostMap.set(result.songId, normalizedScore);
  }

  return boostMap;
}

/**
 * Clear compound scores for a user
 * Useful for testing or when user wants to reset recommendations
 */
export async function clearCompoundScores(userId: string): Promise<void> {
  await db
    .delete(compoundScores)
    .where(eq(compoundScores.userId, userId));

  console.log(`📊 [CompoundScoring] Cleared scores for user ${userId}`);
}

/**
 * Clean up old compound scores that haven't been updated recently
 * Scores older than 30 days are likely stale
 */
export async function cleanupStaleScores(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  await db
    .delete(compoundScores)
    .where(
      sql`${compoundScores.calculatedAt} < ${cutoffDate}`
    );

  // Drizzle doesn't always return row count, so we just log
  console.log(`📊 [CompoundScoring] Cleaned up stale scores older than ${daysOld} days`);
  return 0; // Return 0 as we can't reliably get count
}

// ============================================================================
// Integration with Recommendations Service
// ============================================================================

/**
 * Apply compound score boost to a list of recommendations
 * This enhances Last.fm results with personalized listening history data
 *
 * @param userId - The user's ID
 * @param songs - Songs from Last.fm or other source
 * @param boostWeight - How much to weight compound scores (0-1)
 * @returns Songs sorted by combined score
 */
export async function applyCompoundScoreBoost(
  userId: string,
  songs: Song[],
  boostWeight: number = 0.3
): Promise<Song[]> {
  if (songs.length === 0 || boostWeight <= 0) {
    return songs;
  }

  const songIds = songs.map(s => s.id);
  const boosts = await getCompoundScoreBoosts(userId, songIds);

  // If no boosts available, return original order
  if (boosts.size === 0) {
    return songs;
  }

  // Sort by combined score
  const scored = songs.map((song, index) => {
    const boost = boosts.get(song.id) || 0;
    // Original rank score (higher index = lower rank score)
    const rankScore = 1 - (index / songs.length);
    // Combined score
    const combinedScore = rankScore * (1 - boostWeight) + boost * boostWeight;
    return { song, combinedScore };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  console.log(`📊 [CompoundScoring] Applied boosts to ${songs.length} songs (${boosts.size} had scores)`);

  return scored.map(s => s.song);
}

// ============================================================================
// Full Profile Calculation
// ============================================================================

/**
 * Calculate complete user profile for AI DJ recommendations
 *
 * This is the main entry point for profile updates.
 * It orchestrates all profile-related calculations:
 * 1. Sync liked songs to feedback table
 * 2. Calculate compound scores from listening history
 * 3. Calculate artist affinities
 * 4. Calculate temporal preferences
 *
 * Should be called:
 * - On app startup (if profile data is stale)
 * - After significant listening activity (10+ plays)
 * - Via API endpoint (for manual refresh)
 *
 * @param userId - The user's ID
 * @param daysBack - Number of days to look back (default: 14)
 */
export async function calculateFullUserProfile(
  userId: string,
  daysBack: number = LOOKBACK_DAYS
): Promise<{
  compoundScores: number;
  artistAffinities: number;
  temporalPreferences: number;
  likedSongsSync: { synced: number; unstarred: number };
}> {
  console.log(`👤 [Profile] Starting full profile calculation for user ${userId}`);
  const startTime = Date.now();

  // Dynamically import to avoid circular dependencies
  const { syncLikedSongsToFeedback } = await import('./liked-songs-sync');
  const { calculateArtistAffinities, calculateTemporalPreferences } = await import('./artist-affinity');

  // Step 1: Sync liked songs to feedback table
  console.log(`👤 [Profile] Step 1/4: Syncing liked songs...`);
  let likedResult = { synced: 0, unstarred: 0 };
  try {
    const syncResult = await syncLikedSongsToFeedback(userId);
    likedResult = { synced: syncResult.synced, unstarred: syncResult.unstarred };
  } catch (error) {
    console.error(`👤 [Profile] Failed to sync liked songs:`, error);
    // Continue with other steps even if this fails
  }

  // Step 2: Calculate compound scores from listening history
  console.log(`👤 [Profile] Step 2/4: Calculating compound scores...`);
  const compoundCount = await calculateCompoundScores(userId, daysBack);

  // Step 3: Calculate artist affinities
  console.log(`👤 [Profile] Step 3/4: Calculating artist affinities...`);
  let artistCount = 0;
  try {
    artistCount = await calculateArtistAffinities(userId, daysBack * 6); // 90 days for artist affinity
  } catch (error) {
    console.error(`👤 [Profile] Failed to calculate artist affinities:`, error);
  }

  // Step 4: Calculate temporal preferences
  console.log(`👤 [Profile] Step 4/4: Calculating temporal preferences...`);
  let temporalCount = 0;
  try {
    temporalCount = await calculateTemporalPreferences(userId, daysBack * 6); // 90 days for temporal prefs
  } catch (error) {
    console.error(`👤 [Profile] Failed to calculate temporal preferences:`, error);
  }

  const elapsed = Date.now() - startTime;
  console.log(`👤 [Profile] Complete in ${elapsed}ms: ${compoundCount} compound scores, ${artistCount} artist affinities, ${temporalCount} temporal prefs, ${likedResult.synced} liked songs synced`);

  return {
    compoundScores: compoundCount,
    artistAffinities: artistCount,
    temporalPreferences: temporalCount,
    likedSongsSync: likedResult,
  };
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  RECENCY_DECAY_RATE,
  MIN_COMPOUND_SCORE,
  MAX_RECOMMENDATIONS,
  LOOKBACK_DAYS,
};
