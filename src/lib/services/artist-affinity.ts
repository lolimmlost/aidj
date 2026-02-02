/**
 * Artist Affinity Service
 *
 * Calculates and stores user affinity scores for artists based on:
 * - Play count (how many times user played songs by this artist)
 * - Liked count (how many songs by this artist are starred/liked)
 * - Skip count (how often songs by this artist are skipped)
 *
 * Affinity scores are used in the profile-based recommendation system
 * to give a 15% weight to artist preference.
 *
 * @see docs/architecture/profile-based-recommendations.md
 */

import { db } from '../db';
import {
  artistAffinities,
  listeningHistory,
  likedSongsSync,
  temporalPreferences,
  type ArtistAffinityInsert,
  type TemporalPreferenceInsert,
} from '../db/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

// ============================================================================
// Constants
// ============================================================================

// Weight factors for affinity calculation
const PLAY_WEIGHT = 0.5;      // Weight for play count
const LIKED_WEIGHT = 0.35;    // Weight for liked count (strong signal)
const SKIP_PENALTY = 0.15;    // Penalty for skip count

// Lookback period for affinity calculation
const AFFINITY_LOOKBACK_DAYS = 90;

// ============================================================================
// Types
// ============================================================================

export interface ArtistAffinityData {
  artist: string;
  affinityScore: number;
  playCount: number;
  likedCount: number;
  skipCount: number;
}

export interface TemporalPreferenceData {
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  season: 'spring' | 'summer' | 'fall' | 'winter' | null;
  genre: string;
  preferenceScore: number;
  playCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get time slot from hour of day
 */
function getTimeSlot(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Get season from month
 */
function getSeason(month: number): 'spring' | 'summer' | 'fall' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

/**
 * Get current time context
 */
export function getCurrentTimeContext() {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1;

  return {
    timeSlot: getTimeSlot(hour),
    season: getSeason(month),
  };
}

// ============================================================================
// Artist Affinity Functions
// ============================================================================

/**
 * Calculate artist affinity scores for a user
 *
 * This function:
 * 1. Aggregates play counts by artist from listening history
 * 2. Counts liked songs by artist
 * 3. Counts skips by artist
 * 4. Calculates normalized affinity score
 * 5. Stores results in artistAffinities table
 *
 * @param userId - The user's ID
 * @param daysBack - Number of days to look back (default: 90)
 * @returns Number of artist affinities calculated
 */
export async function calculateArtistAffinities(
  userId: string,
  daysBack: number = AFFINITY_LOOKBACK_DAYS
): Promise<number> {
  console.log(`🎨 [ArtistAffinity] Calculating affinities for user ${userId} (${daysBack} days)`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Step 1: Get play counts and skip counts by artist
  const artistStats = await db
    .select({
      artist: listeningHistory.artist,
      playCount: sql<number>`count(*)`.as('play_count'),
      skipCount: sql<number>`sum(case when ${listeningHistory.skipDetected} = 1 then 1 else 0 end)`.as('skip_count'),
      totalPlayTime: sql<number>`coalesce(sum(${listeningHistory.playDuration}), 0)`.as('total_play_time'),
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .groupBy(listeningHistory.artist);

  if (artistStats.length === 0) {
    console.log(`🎨 [ArtistAffinity] No listening history found for user ${userId}`);
    return 0;
  }

  console.log(`🎨 [ArtistAffinity] Found ${artistStats.length} artists in listening history`);

  // Step 2: Get liked song counts by artist
  const likedStats = await db
    .select({
      artist: likedSongsSync.artist,
      likedCount: sql<number>`count(*)`.as('liked_count'),
    })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    )
    .groupBy(likedSongsSync.artist);

  // Build a map of artist -> liked count
  const likedCountMap = new Map<string, number>();
  for (const stat of likedStats) {
    likedCountMap.set(stat.artist.toLowerCase(), stat.likedCount);
  }

  // Step 3: Find max values for normalization
  const maxPlayCount = Math.max(...artistStats.map(s => s.playCount), 1);
  const maxLikedCount = Math.max(...likedStats.map(s => s.likedCount), 1);
  const maxSkipCount = Math.max(...artistStats.map(s => Number(s.skipCount) || 0), 1);

  // Step 4: Calculate and store affinity scores
  let stored = 0;

  for (const stat of artistStats) {
    const normalizedArtist = stat.artist.toLowerCase();
    const likedCount = likedCountMap.get(normalizedArtist) || 0;

    // Normalize values to 0-1 range
    const normalizedPlayCount = stat.playCount / maxPlayCount;
    const normalizedLikedCount = likedCount / maxLikedCount;
    const normalizedSkipCount = (Number(stat.skipCount) || 0) / maxSkipCount;

    // Calculate affinity score
    // Formula: (play_weight * plays + liked_weight * likes) * (1 - skip_penalty * skips)
    const baseScore = (PLAY_WEIGHT * normalizedPlayCount) + (LIKED_WEIGHT * normalizedLikedCount);
    const skipPenalty = 1 - (SKIP_PENALTY * normalizedSkipCount);
    const affinityScore = Math.max(0, Math.min(1, baseScore * skipPenalty));

    const record: ArtistAffinityInsert = {
      userId,
      artist: normalizedArtist,
      affinityScore,
      playCount: stat.playCount,
      likedCount,
      skipCount: Number(stat.skipCount) || 0,
      totalPlayTime: Number(stat.totalPlayTime) || 0,
    };

    await db
      .insert(artistAffinities)
      .values(record)
      .onConflictDoUpdate({
        target: [artistAffinities.userId, artistAffinities.artist],
        set: {
          affinityScore: record.affinityScore,
          playCount: record.playCount,
          likedCount: record.likedCount,
          skipCount: record.skipCount,
          totalPlayTime: record.totalPlayTime,
          calculatedAt: new Date(),
        },
      });

    stored++;
  }

  console.log(`🎨 [ArtistAffinity] Stored ${stored} artist affinities for user ${userId}`);
  return stored;
}

/**
 * Get artist affinity score for a specific artist
 *
 * @param userId - The user's ID
 * @param artist - Artist name
 * @returns Affinity score (0-1) or 0 if not found
 */
export async function getArtistAffinity(
  userId: string,
  artist: string
): Promise<number> {
  const normalizedArtist = artist.toLowerCase();

  const result = await db
    .select({ affinityScore: artistAffinities.affinityScore })
    .from(artistAffinities)
    .where(
      and(
        eq(artistAffinities.userId, userId),
        eq(artistAffinities.artist, normalizedArtist)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].affinityScore : 0;
}

/**
 * Get top artists by affinity for a user
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of artists to return
 * @returns Array of artist affinity data
 */
export async function getTopArtistsByAffinity(
  userId: string,
  limit: number = 20
): Promise<ArtistAffinityData[]> {
  const results = await db
    .select()
    .from(artistAffinities)
    .where(eq(artistAffinities.userId, userId))
    .orderBy(desc(artistAffinities.affinityScore))
    .limit(limit);

  return results.map(r => ({
    artist: r.artist,
    affinityScore: r.affinityScore,
    playCount: r.playCount,
    likedCount: r.likedCount,
    skipCount: r.skipCount,
  }));
}

/**
 * Get multiple artist affinities at once
 * More efficient than calling getArtistAffinity for each artist
 *
 * @param userId - The user's ID
 * @param artists - Array of artist names
 * @returns Map of artist -> affinity score
 */
export async function getArtistAffinities(
  userId: string,
  artists: string[]
): Promise<Map<string, number>> {
  if (artists.length === 0) {
    return new Map();
  }

  const normalizedArtists = artists.map(a => a.toLowerCase());

  const results = await db
    .select({
      artist: artistAffinities.artist,
      affinityScore: artistAffinities.affinityScore,
    })
    .from(artistAffinities)
    .where(eq(artistAffinities.userId, userId));

  const affinityMap = new Map<string, number>();
  for (const result of results) {
    if (normalizedArtists.includes(result.artist)) {
      affinityMap.set(result.artist, result.affinityScore);
    }
  }

  return affinityMap;
}

// ============================================================================
// Temporal Preference Functions
// ============================================================================

/**
 * Calculate temporal preferences (genre preferences by time of day/season)
 *
 * @param userId - The user's ID
 * @param daysBack - Number of days to look back
 * @returns Number of temporal preferences calculated
 */
export async function calculateTemporalPreferences(
  userId: string,
  daysBack: number = AFFINITY_LOOKBACK_DAYS
): Promise<number> {
  console.log(`⏰ [TemporalPrefs] Calculating preferences for user ${userId} (${daysBack} days)`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Get listening history with genre and timestamp
  const history = await db
    .select({
      genre: listeningHistory.genre,
      playedAt: listeningHistory.playedAt,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    );

  if (history.length === 0) {
    console.log(`⏰ [TemporalPrefs] No listening history found for user ${userId}`);
    return 0;
  }

  // Aggregate by time slot + season + genre
  const prefMap = new Map<string, { count: number; timeSlot: string; season: string; genre: string }>();

  for (const play of history) {
    if (!play.genre) continue;

    const playDate = new Date(play.playedAt);
    const hour = playDate.getHours();
    const month = playDate.getMonth() + 1;

    const timeSlot = getTimeSlot(hour);
    const season = getSeason(month);

    const key = `${timeSlot}:${season}:${play.genre.toLowerCase()}`;
    const existing = prefMap.get(key);

    if (existing) {
      existing.count++;
    } else {
      prefMap.set(key, {
        count: 1,
        timeSlot,
        season,
        genre: play.genre.toLowerCase(),
      });
    }
  }

  if (prefMap.size === 0) {
    console.log(`⏰ [TemporalPrefs] No genre data in listening history`);
    return 0;
  }

  // Find max count for normalization
  const maxCount = Math.max(...Array.from(prefMap.values()).map(v => v.count));

  // Store temporal preferences
  let stored = 0;

  for (const [, data] of prefMap) {
    const preferenceScore = data.count / maxCount;

    const record: TemporalPreferenceInsert = {
      userId,
      timeSlot: data.timeSlot as 'morning' | 'afternoon' | 'evening' | 'night',
      season: data.season as 'spring' | 'summer' | 'fall' | 'winter',
      genre: data.genre,
      preferenceScore,
      playCount: data.count,
    };

    await db
      .insert(temporalPreferences)
      .values(record)
      .onConflictDoUpdate({
        target: [
          temporalPreferences.userId,
          temporalPreferences.timeSlot,
          temporalPreferences.season,
          temporalPreferences.genre,
        ],
        set: {
          preferenceScore: record.preferenceScore,
          playCount: record.playCount,
          calculatedAt: new Date(),
        },
      });

    stored++;
  }

  console.log(`⏰ [TemporalPrefs] Stored ${stored} temporal preferences for user ${userId}`);
  return stored;
}

/**
 * Get temporal boost for a genre at current time
 *
 * @param userId - The user's ID
 * @param genre - Genre to check
 * @returns Preference score (0-1) or 0 if not found
 */
export async function getTemporalGenreBoost(
  userId: string,
  genre: string
): Promise<number> {
  const { timeSlot, season } = getCurrentTimeContext();
  const normalizedGenre = genre.toLowerCase();

  const result = await db
    .select({ preferenceScore: temporalPreferences.preferenceScore })
    .from(temporalPreferences)
    .where(
      and(
        eq(temporalPreferences.userId, userId),
        eq(temporalPreferences.timeSlot, timeSlot),
        eq(temporalPreferences.season, season),
        eq(temporalPreferences.genre, normalizedGenre)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].preferenceScore : 0;
}

/**
 * Get preferred genres for current time context
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of genres to return
 * @returns Array of temporal preference data
 */
export async function getPreferredGenresForNow(
  userId: string,
  limit: number = 10
): Promise<TemporalPreferenceData[]> {
  const { timeSlot, season } = getCurrentTimeContext();

  const results = await db
    .select()
    .from(temporalPreferences)
    .where(
      and(
        eq(temporalPreferences.userId, userId),
        eq(temporalPreferences.timeSlot, timeSlot),
        eq(temporalPreferences.season, season)
      )
    )
    .orderBy(desc(temporalPreferences.preferenceScore))
    .limit(limit);

  return results.map(r => ({
    timeSlot: r.timeSlot,
    season: r.season,
    genre: r.genre,
    preferenceScore: r.preferenceScore,
    playCount: r.playCount,
  }));
}

// ============================================================================
// Profile Update Functions
// ============================================================================

/**
 * Calculate full user profile (artist affinities + temporal preferences)
 * Should be called periodically or after significant listening activity
 *
 * @param userId - The user's ID
 * @param daysBack - Number of days to look back
 */
export async function calculateUserProfile(
  userId: string,
  daysBack: number = AFFINITY_LOOKBACK_DAYS
): Promise<{ artistCount: number; temporalCount: number }> {
  console.log(`👤 [Profile] Calculating full profile for user ${userId}`);

  const artistCount = await calculateArtistAffinities(userId, daysBack);
  const temporalCount = await calculateTemporalPreferences(userId, daysBack);

  console.log(`👤 [Profile] Complete: ${artistCount} artists, ${temporalCount} temporal prefs`);

  return { artistCount, temporalCount };
}

/**
 * Clear all profile data for a user
 * Useful for testing or when user wants to reset
 *
 * @param userId - The user's ID
 */
export async function clearUserProfile(userId: string): Promise<void> {
  await db
    .delete(artistAffinities)
    .where(eq(artistAffinities.userId, userId));

  await db
    .delete(temporalPreferences)
    .where(eq(temporalPreferences.userId, userId));

  console.log(`👤 [Profile] Cleared profile data for user ${userId}`);
}
