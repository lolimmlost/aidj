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
import { eq, and, gte, desc, sql, lte } from 'drizzle-orm';
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
  };

  await db.insert(listeningHistory).values(record);

  console.log(`📊 [ListeningHistory] Recorded play: ${song.artist} - ${song.title} (completed: ${completed === 1})`);

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
// Exports for Testing
// ============================================================================

export {
  COMPLETION_THRESHOLD,
  MAX_RECENT_PLAYS_FOR_SIMILARITY,
  MAX_SIMILAR_TRACKS_PER_SONG,
  DEFAULT_LOOKBACK_DAYS,
  fetchAndStoreSimilarTracks,
};
