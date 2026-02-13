/**
 * Liked Songs Sync Service
 *
 * Syncs Navidrome starred songs to the recommendation feedback table.
 * This gives liked songs a 25% weight in the profile-based recommendation system.
 *
 * Key behaviors:
 * - Syncs starred songs as thumbs_up feedback with source='library'
 * - Tracks un-starred songs to avoid double-counting
 * - Runs as part of compound score calculation
 *
 * @see docs/architecture/profile-based-recommendations.md
 */

import { db } from '../db';
import {
  recommendationFeedback,
  likedSongsSync,
  type LikedSongsSyncInsert,
} from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getStarredSongs } from './navidrome';

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  synced: number;
  unstarred: number;
  unchanged: number;
  errors: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current temporal metadata for feedback records
 */
function getTemporalMetadata() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1-7 (Monday = 1)
  const hourOfDay = now.getHours(); // 0-23

  // Determine season
  let season: 'spring' | 'summer' | 'fall' | 'winter';
  if (month >= 3 && month <= 5) {
    season = 'spring';
  } else if (month >= 6 && month <= 8) {
    season = 'summer';
  } else if (month >= 9 && month <= 11) {
    season = 'fall';
  } else {
    season = 'winter';
  }

  return { month, dayOfWeek, hourOfDay, season };
}

// ============================================================================
// Main Sync Functions
// ============================================================================

/**
 * Sync Navidrome starred songs to the feedback table as thumbs_up
 *
 * This function:
 * 1. Fetches all starred songs from Navidrome
 * 2. Checks which songs are already synced
 * 3. Adds new starred songs as thumbs_up feedback
 * 4. Marks un-starred songs as inactive (doesn't delete feedback)
 *
 * @param userId - The user's ID
 * @returns Sync result statistics
 */
export async function syncLikedSongsToFeedback(userId: string): Promise<SyncResult> {
  console.log(`💜 [LikedSongsSync] Syncing starred songs for user ${userId}`);

  const result: SyncResult = {
    synced: 0,
    unstarred: 0,
    unchanged: 0,
    errors: 0,
  };

  try {
    // Step 1: Fetch starred songs from Navidrome
    const starredSongs = await getStarredSongs();
    console.log(`💜 [LikedSongsSync] Found ${starredSongs.length} starred songs in Navidrome`);

    if (starredSongs.length === 0) {
      console.log(`💜 [LikedSongsSync] No starred songs to sync`);
      return result;
    }

    // Step 2: Get existing sync records for this user
    const existingSync = await db
      .select()
      .from(likedSongsSync)
      .where(eq(likedSongsSync.userId, userId));

    const existingSyncMap = new Map(
      existingSync.map(s => [s.songId, s])
    );

    // Step 3: Build set of current starred song IDs
    const currentStarredIds = new Set(starredSongs.map(s => s.id));

    // Step 4: Process each starred song
    const temporal = getTemporalMetadata();

    for (const song of starredSongs) {
      const existing = existingSyncMap.get(song.id);

      if (existing && existing.isActive === 1) {
        // Already synced and active, no change needed
        result.unchanged++;
        continue;
      }

      try {
        const songArtistTitle = `${song.artist || 'Unknown'} - ${song.title}`;

        if (existing) {
          // Was previously synced but marked inactive, reactivate
          await db
            .update(likedSongsSync)
            .set({
              isActive: 1,
              syncedAt: new Date(),
            })
            .where(eq(likedSongsSync.id, existing.id));
        } else {
          // New starred song, create sync record
          const syncRecord: LikedSongsSyncInsert = {
            userId,
            songId: song.id,
            artist: song.artist || 'Unknown',
            title: song.title,
            isActive: 1,
          };

          await db
            .insert(likedSongsSync)
            .values(syncRecord)
            .onConflictDoUpdate({
              target: [likedSongsSync.userId, likedSongsSync.songId],
              set: {
                isActive: 1,
                syncedAt: new Date(),
              },
            });
        }

        // Upsert feedback record as thumbs_up with source='library'
        await db
          .insert(recommendationFeedback)
          .values({
            userId,
            songId: song.id,
            songArtistTitle,
            feedbackType: 'thumbs_up',
            source: 'library',
            month: temporal.month,
            season: temporal.season,
            dayOfWeek: temporal.dayOfWeek,
            hourOfDay: temporal.hourOfDay,
          })
          .onConflictDoNothing();

        result.synced++;
      } catch (error) {
        console.error(`💜 [LikedSongsSync] Error syncing song ${song.id}:`, error);
        result.errors++;
      }
    }

    // Step 5: Mark un-starred songs as inactive
    const previouslyActiveSongIds = existingSync
      .filter(s => s.isActive === 1)
      .map(s => s.songId);

    const unstarredIds = previouslyActiveSongIds.filter(id => !currentStarredIds.has(id));

    if (unstarredIds.length > 0) {
      await db
        .update(likedSongsSync)
        .set({ isActive: 0 })
        .where(
          and(
            eq(likedSongsSync.userId, userId),
            inArray(likedSongsSync.songId, unstarredIds)
          )
        );

      result.unstarred = unstarredIds.length;
      console.log(`💜 [LikedSongsSync] Marked ${unstarredIds.length} songs as un-starred`);
    }

    console.log(`💜 [LikedSongsSync] Sync complete: ${result.synced} synced, ${result.unstarred} un-starred, ${result.unchanged} unchanged, ${result.errors} errors`);

    return result;
  } catch (error) {
    console.error(`💜 [LikedSongsSync] Failed to sync liked songs:`, error);
    throw error;
  }
}

/**
 * Get all actively liked song IDs for a user
 * Used for filtering and boosting recommendations
 *
 * @param userId - The user's ID
 * @returns Set of song IDs that are currently liked
 */
export async function getLikedSongIds(userId: string): Promise<Set<string>> {
  const likedSongs = await db
    .select({ songId: likedSongsSync.songId })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    );

  return new Set(likedSongs.map(s => s.songId));
}

/**
 * Get liked songs by a specific artist for a user
 * Used for genre-based recommendations
 *
 * @param userId - The user's ID
 * @param artist - Artist name to filter by
 * @returns Array of liked song IDs by this artist
 */
export async function getLikedSongsByArtist(
  userId: string,
  artist: string
): Promise<string[]> {
  const normalizedArtist = artist.toLowerCase();

  const _likedSongs = await db
    .select({ songId: likedSongsSync.songId })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    );

  // Filter by artist (case-insensitive)
  // Note: For better performance, we could add a normalized_artist column
  const artistSongs = await db
    .select()
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    );

  return artistSongs
    .filter(s => s.artist.toLowerCase() === normalizedArtist)
    .map(s => s.songId);
}

/**
 * Check if a song is liked by the user
 *
 * @param userId - The user's ID
 * @param songId - The song ID to check
 * @returns True if the song is liked
 */
export async function isSongLiked(userId: string, songId: string): Promise<boolean> {
  const result = await db
    .select({ isActive: likedSongsSync.isActive })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.songId, songId)
      )
    )
    .limit(1);

  return result.length > 0 && result[0].isActive === 1;
}

/**
 * Get the count of liked songs for a user
 *
 * @param userId - The user's ID
 * @returns Number of liked songs
 */
export async function getLikedSongsCount(userId: string): Promise<number> {
  const result = await db
    .select({ songId: likedSongsSync.songId })
    .from(likedSongsSync)
    .where(
      and(
        eq(likedSongsSync.userId, userId),
        eq(likedSongsSync.isActive, 1)
      )
    );

  return result.length;
}
