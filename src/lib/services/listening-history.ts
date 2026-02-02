/**
 * Listening History Service
 *
 * Phase 4 of the recommendation engine refactor.
 * Tracks song plays and fetches similar tracks from Last.fm
 * to build compound scores for better recommendations.
 *
 * @see docs/architecture/recommendation-engine-refactor.md
 */

import { db } from '../db';
import {
  listeningHistory,
  trackSimilarities,
  type ListeningHistoryInsert,
  type TrackSimilarityInsert,
} from '../db/schema';
import { eq, and, gte, desc, sql, lte, inArray } from 'drizzle-orm';
import { getLastFmClient } from './lastfm';
import { getConfigAsync } from '@/lib/config/config';

// ============================================================================
// Constants
// ============================================================================

// Minimum percentage of song that must be played to count as "completed"
const COMPLETION_THRESHOLD = 0.8; // 80%

// How many recent plays to consider for similarity fetching
const MAX_RECENT_PLAYS_FOR_SIMILARITY = 50;

// Maximum similar tracks to fetch per song
const MAX_SIMILAR_TRACKS_PER_SONG = 30;

// Days to look back for listening history in recommendations
const DEFAULT_LOOKBACK_DAYS = 7;

// ============================================================================
// Listening History Tracking
// ============================================================================

/**
 * Record a song play in the listening history
 *
 * @param userId - The user's ID
 * @param song - Song details
 * @param playDuration - How long the song was played (seconds)
 *
 * @example
 * await recordSongPlay(userId, {
 *   songId: 'abc123',
 *   artist: 'Radiohead',
 *   title: 'Karma Police',
 *   album: 'OK Computer',
 *   genre: 'Alternative Rock',
 *   duration: 263,
 * }, 250);
 */
// Phase 3.1: Skip detection constants
const SKIP_MIN_PLAY_SECONDS = 5; // Must play at least 5 seconds to count as a skip (not accidental)
const SKIP_MAX_PERCENTAGE = 0.3; // Less than 30% played = skip

export async function recordSongPlay(
  userId: string,
  song: {
    songId: string;
    artist: string;
    title: string;
    album?: string;
    genre?: string;
    duration?: number;
  },
  playDuration?: number
): Promise<void> {
  const completed = playDuration && song.duration
    ? (playDuration / song.duration >= COMPLETION_THRESHOLD ? 1 : 0)
    : 0;

  // Phase 3.1: Detect skips
  // A skip is when:
  // - The song played for at least 5 seconds (not accidental)
  // - The song played for less than 30% of its duration
  // - The song was not completed
  let skipDetected = 0;
  if (playDuration && song.duration && playDuration >= SKIP_MIN_PLAY_SECONDS) {
    const playPercentage = playDuration / song.duration;
    if (playPercentage < SKIP_MAX_PERCENTAGE && completed === 0) {
      skipDetected = 1;
      console.log(`⏭️ [ListeningHistory] Skip detected: ${song.artist} - ${song.title} (played ${Math.round(playPercentage * 100)}%)`);
    }
  }

  const record: ListeningHistoryInsert = {
    userId,
    songId: song.songId,
    artist: song.artist,
    title: song.title,
    album: song.album || null,
    genre: song.genre || null,
    playDuration: playDuration || null,
    songDuration: song.duration || null,
    completed,
    skipDetected,
  };

  await db.insert(listeningHistory).values(record);

  console.log(`📊 [ListeningHistory] Recorded play: ${song.artist} - ${song.title} (completed: ${completed === 1}, skipped: ${skipDetected === 1})`);

  // Trigger async similarity fetch (don't await - fire and forget)
  fetchAndStoreSimilarTracks(song.artist, song.title).catch(err => {
    console.warn('⚠️ [ListeningHistory] Failed to fetch similar tracks:', err);
  });
}

/**
 * Get a user's recent listening history
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of records to return
 * @param daysBack - How many days to look back
 */
export async function getRecentListeningHistory(
  userId: string,
  limit: number = 50,
  daysBack: number = DEFAULT_LOOKBACK_DAYS
): Promise<Array<{
  songId: string;
  artist: string;
  title: string;
  album: string | null;
  genre: string | null;
  playedAt: Date;
  completed: boolean;
}>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select()
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit);

  return results.map(r => ({
    songId: r.songId,
    artist: r.artist,
    title: r.title,
    album: r.album,
    genre: r.genre,
    playedAt: r.playedAt,
    completed: r.completed === 1,
  }));
}

/**
 * Get unique songs played by a user in a time period
 * Used for compound score calculation
 */
export async function getUniqueSongsPlayed(
  userId: string,
  daysBack: number = DEFAULT_LOOKBACK_DAYS
): Promise<Array<{ artist: string; title: string; playCount: number; lastPlayed: Date }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      artist: listeningHistory.artist,
      title: listeningHistory.title,
      playCount: sql<number>`count(*)::int`,
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
    .orderBy(desc(sql`max(${listeningHistory.playedAt})`));

  return results;
}

// ============================================================================
// Track Similarity Storage
// ============================================================================

/**
 * Fetch similar tracks from Last.fm and store in database
 * Called asynchronously after a song play is recorded
 */
async function fetchAndStoreSimilarTracks(
  artist: string,
  title: string
): Promise<void> {
  // Check if we already have fresh similarity data
  const existing = await db
    .select()
    .from(trackSimilarities)
    .where(
      and(
        eq(trackSimilarities.sourceArtist, artist),
        eq(trackSimilarities.sourceTitle, title),
        gte(trackSimilarities.expiresAt, new Date())
      )
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(`📊 [ListeningHistory] Similarity cache hit for ${artist} - ${title}`);
    return;
  }

  // Fetch from Last.fm
  const config = await getConfigAsync();
  if (!config.lastfmApiKey) {
    console.log('⚠️ [ListeningHistory] Last.fm API key not configured, skipping similarity fetch');
    return;
  }

  const lastFm = getLastFmClient(config.lastfmApiKey);
  if (!lastFm) {
    return;
  }

  try {
    const similarTracks = await lastFm.getSimilarTracks(artist, title, MAX_SIMILAR_TRACKS_PER_SONG);

    if (similarTracks.length === 0) {
      console.log(`📊 [ListeningHistory] No similar tracks found for ${artist} - ${title}`);
      return;
    }

    // Prepare records for insertion
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day cache

    const records: TrackSimilarityInsert[] = similarTracks.map(track => ({
      sourceArtist: artist,
      sourceTitle: title,
      targetArtist: track.artist,
      targetTitle: track.name,
      targetSongId: track.navidromeId || null,
      matchScore: track.match || 0,
      expiresAt,
    }));

    // Upsert (insert or update on conflict)
    for (const record of records) {
      await db
        .insert(trackSimilarities)
        .values(record)
        .onConflictDoUpdate({
          target: [
            trackSimilarities.sourceArtist,
            trackSimilarities.sourceTitle,
            trackSimilarities.targetArtist,
            trackSimilarities.targetTitle,
          ],
          set: {
            matchScore: record.matchScore,
            targetSongId: record.targetSongId,
            fetchedAt: new Date(),
            expiresAt: record.expiresAt,
          },
        });
    }

    console.log(`📊 [ListeningHistory] Stored ${records.length} similar tracks for ${artist} - ${title}`);
  } catch (error) {
    console.error(`❌ [ListeningHistory] Failed to fetch/store similarities for ${artist} - ${title}:`, error);
  }
}

/**
 * Get cached similar tracks for a song
 */
export async function getCachedSimilarTracks(
  artist: string,
  title: string
): Promise<Array<{
  targetArtist: string;
  targetTitle: string;
  targetSongId: string | null;
  matchScore: number;
}>> {
  const results = await db
    .select({
      targetArtist: trackSimilarities.targetArtist,
      targetTitle: trackSimilarities.targetTitle,
      targetSongId: trackSimilarities.targetSongId,
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
    .orderBy(desc(trackSimilarities.matchScore));

  return results;
}

/**
 * Refresh expired similarity data
 * Can be called periodically by a background job
 */
export async function refreshExpiredSimilarities(limit: number = 50): Promise<number> {
  const expired = await db
    .select({
      sourceArtist: trackSimilarities.sourceArtist,
      sourceTitle: trackSimilarities.sourceTitle,
    })
    .from(trackSimilarities)
    .where(lte(trackSimilarities.expiresAt, new Date()))
    .groupBy(trackSimilarities.sourceArtist, trackSimilarities.sourceTitle)
    .limit(limit);

  let refreshed = 0;
  for (const track of expired) {
    try {
      // Delete old data first
      await db
        .delete(trackSimilarities)
        .where(
          and(
            eq(trackSimilarities.sourceArtist, track.sourceArtist),
            eq(trackSimilarities.sourceTitle, track.sourceTitle)
          )
        );

      // Fetch fresh data
      await fetchAndStoreSimilarTracks(track.sourceArtist, track.sourceTitle);
      refreshed++;
    } catch (error) {
      console.warn(`⚠️ [ListeningHistory] Failed to refresh similarities for ${track.sourceArtist} - ${track.sourceTitle}:`, error);
    }
  }

  if (refreshed > 0) {
    console.log(`📊 [ListeningHistory] Refreshed ${refreshed} expired similarity records`);
  }

  return refreshed;
}

// ============================================================================
// Phase 3.1: Skip Statistics Functions
// ============================================================================

/**
 * Get skip statistics for songs
 * Returns skip rate (skips / total plays) for each song
 */
export async function getSkipRatesForSongs(
  userId: string,
  songIds: string[],
  daysBack: number = 30
): Promise<Map<string, { skipRate: number; totalPlays: number; skips: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      songId: listeningHistory.songId,
      totalPlays: sql<number>`count(*)::int`,
      skips: sql<number>`sum(${listeningHistory.skipDetected})::int`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate),
        inArray(listeningHistory.songId, songIds)
      )
    )
    .groupBy(listeningHistory.songId);

  const skipRates = new Map<string, { skipRate: number; totalPlays: number; skips: number }>();

  for (const row of results) {
    const skips = row.skips || 0;
    const totalPlays = row.totalPlays || 1;
    skipRates.set(row.songId, {
      skipRate: skips / totalPlays,
      totalPlays,
      skips,
    });
  }

  return skipRates;
}

/**
 * Get skip rates by artist
 * Useful for deprioritizing artists the user frequently skips
 */
export async function getSkipRatesByArtist(
  userId: string,
  daysBack: number = 30
): Promise<Map<string, { skipRate: number; totalPlays: number; skips: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      artist: listeningHistory.artist,
      totalPlays: sql<number>`count(*)::int`,
      skips: sql<number>`sum(${listeningHistory.skipDetected})::int`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .groupBy(listeningHistory.artist);

  const skipRates = new Map<string, { skipRate: number; totalPlays: number; skips: number }>();

  for (const row of results) {
    const skips = row.skips || 0;
    const totalPlays = row.totalPlays || 1;
    skipRates.set(row.artist.toLowerCase(), {
      skipRate: skips / totalPlays,
      totalPlays,
      skips,
    });
  }

  return skipRates;
}

/**
 * Get frequently skipped songs (skip rate > threshold)
 * Useful for filtering out songs that should be avoided
 */
export async function getFrequentlySkippedSongs(
  userId: string,
  minSkipRate: number = 0.5, // At least 50% skip rate
  minPlays: number = 3, // At least 3 plays to have confidence
  daysBack: number = 30
): Promise<Array<{ songId: string; artist: string; title: string; skipRate: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      songId: listeningHistory.songId,
      artist: listeningHistory.artist,
      title: listeningHistory.title,
      totalPlays: sql<number>`count(*)::int`,
      skips: sql<number>`sum(${listeningHistory.skipDetected})::int`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .groupBy(
      listeningHistory.songId,
      listeningHistory.artist,
      listeningHistory.title
    )
    .having(sql`count(*) >= ${minPlays}`);

  return results
    .map(row => ({
      songId: row.songId,
      artist: row.artist,
      title: row.title,
      skipRate: (row.skips || 0) / (row.totalPlays || 1),
    }))
    .filter(row => row.skipRate >= minSkipRate);
}

// ============================================================================
// Phase: Dashboard Analytics
// ============================================================================

/**
 * Get listening stats for a specific date range.
 * Used for period-over-period comparison cards on the dashboard.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.1
 */
export async function getListeningStatsByPeriod(
  userId: string,
  start: Date,
  end: Date
): Promise<{
  totalPlays: number;
  uniqueTracks: number;
  uniqueArtists: number;
  totalMinutesListened: number;
  completionRate: number;
}> {
  const results = await db
    .select({
      totalPlays: sql<number>`count(*)::int`,
      uniqueTracks: sql<number>`count(distinct ${listeningHistory.songId})::int`,
      uniqueArtists: sql<number>`count(distinct ${listeningHistory.artist})::int`,
      totalSeconds: sql<number>`coalesce(sum(${listeningHistory.playDuration}), 0)::int`,
      completedCount: sql<number>`coalesce(sum(${listeningHistory.completed}), 0)::int`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, start),
        lte(listeningHistory.playedAt, end)
      )
    );

  const row = results[0];
  const totalPlays = row?.totalPlays || 0;

  return {
    totalPlays,
    uniqueTracks: row?.uniqueTracks || 0,
    uniqueArtists: row?.uniqueArtists || 0,
    totalMinutesListened: Math.round((row?.totalSeconds || 0) / 60),
    completionRate: totalPlays > 0 ? Math.round((row?.completedCount || 0) / totalPlays * 100) : 0,
  };
}

/**
 * Get listening activity grouped by hour of day.
 * Used for the listening hour distribution chart.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.2
 */
export async function getListeningByHour(
  userId: string,
  start?: Date,
  end?: Date
): Promise<Array<{ hour: number; plays: number }>> {
  const conditions = [eq(listeningHistory.userId, userId)];
  if (start) conditions.push(gte(listeningHistory.playedAt, start));
  if (end) conditions.push(lte(listeningHistory.playedAt, end));

  const results = await db
    .select({
      hour: sql<number>`extract(hour from ${listeningHistory.playedAt})::int`,
      plays: sql<number>`count(*)::int`,
    })
    .from(listeningHistory)
    .where(and(...conditions))
    .groupBy(sql`extract(hour from ${listeningHistory.playedAt})`)
    .orderBy(sql`extract(hour from ${listeningHistory.playedAt})`);

  // Fill in all 24 hours (some may have 0 plays)
  const hourMap = new Map(results.map(r => [r.hour, r.plays]));
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    plays: hourMap.get(i) || 0,
  }));
}

/**
 * Get artist diversity metric for a given period.
 * Shannon entropy: higher = more diverse listening.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.3
 */
export async function getArtistDiversity(
  userId: string,
  start: Date,
  end: Date
): Promise<{ entropy: number; uniqueArtists: number; totalPlays: number }> {
  const results = await db
    .select({
      artist: listeningHistory.artist,
      plays: sql<number>`count(*)::int`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, start),
        lte(listeningHistory.playedAt, end)
      )
    )
    .groupBy(listeningHistory.artist);

  const totalPlays = results.reduce((sum, r) => sum + r.plays, 0);
  if (totalPlays === 0) return { entropy: 0, uniqueArtists: 0, totalPlays: 0 };

  // Shannon entropy: -sum(p * ln(p))
  let entropy = 0;
  for (const row of results) {
    const p = row.plays / totalPlays;
    if (p > 0) entropy -= p * Math.log(p);
  }

  return {
    entropy: Math.round(entropy * 100) / 100,
    uniqueArtists: results.length,
    totalPlays,
  };
}

/**
 * Detect longest continuous listening sessions.
 * A session is defined as consecutive plays with no gap > gapMinutes.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.5
 */
export async function getLongestSessions(
  userId: string,
  start: Date,
  end: Date,
  gapMinutes: number = 15,
  limit: number = 5
): Promise<Array<{
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  songCount: number;
}>> {
  // Get all plays in the period, ordered by time
  const plays = await db
    .select({
      playedAt: listeningHistory.playedAt,
      playDuration: listeningHistory.playDuration,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, start),
        lte(listeningHistory.playedAt, end)
      )
    )
    .orderBy(listeningHistory.playedAt);

  if (plays.length === 0) return [];

  const gapMs = gapMinutes * 60 * 1000;
  const sessions: Array<{
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    songCount: number;
  }> = [];

  let sessionStart = plays[0].playedAt;
  let sessionEnd = new Date(
    plays[0].playedAt.getTime() + (plays[0].playDuration || 0) * 1000
  );
  let songCount = 1;

  for (let i = 1; i < plays.length; i++) {
    const play = plays[i];
    const timeSinceLastEnd = play.playedAt.getTime() - sessionEnd.getTime();

    if (timeSinceLastEnd <= gapMs) {
      // Continue session
      const playEnd = new Date(play.playedAt.getTime() + (play.playDuration || 0) * 1000);
      if (playEnd > sessionEnd) sessionEnd = playEnd;
      songCount++;
    } else {
      // End current session, start new one
      const durationMinutes = Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000);
      if (songCount >= 2) {
        sessions.push({ startTime: sessionStart, endTime: sessionEnd, durationMinutes, songCount });
      }
      sessionStart = play.playedAt;
      sessionEnd = new Date(play.playedAt.getTime() + (play.playDuration || 0) * 1000);
      songCount = 1;
    }
  }

  // Don't forget the last session
  const durationMinutes = Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000);
  if (songCount >= 2) {
    sessions.push({ startTime: sessionStart, endTime: sessionEnd, durationMinutes, songCount });
  }

  // Return top sessions by duration
  return sessions
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, limit);
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  COMPLETION_THRESHOLD,
  MAX_RECENT_PLAYS_FOR_SIMILARITY,
  MAX_SIMILAR_TRACKS_PER_SONG,
  DEFAULT_LOOKBACK_DAYS,
  SKIP_MIN_PLAY_SECONDS,
  SKIP_MAX_PERCENTAGE,
  fetchAndStoreSimilarTracks,
};
