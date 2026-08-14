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
  userPlaylists,
  playlistSongs,
  type LikedSongsSyncInsert,
} from '../db/schema';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { getStarredSongs, starSong, unstarSong, getSongsByIds } from './navidrome';
import type { SubsonicSong } from './navidrome';
import { getNavidromeUserCreds } from './navidrome-users';
import type { SubsonicCreds } from './navidrome-users';

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
    // Step 1: Fetch starred songs from Navidrome using per-user creds if available
    const userCreds = await getNavidromeUserCreds(userId);
    const starredSongs = await getStarredSongs(userCreds ?? undefined);
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
          .onConflictDoUpdate({
            target: [recommendationFeedback.userId, recommendationFeedback.songId],
            set: { feedbackType: 'thumbs_up', timestamp: new Date() },
          });

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

      // Remove stale thumbs_up from recommendation_feedback so the heart icon
      // reflects the un-star. The GET endpoint reads this table first, so a
      // leftover thumbs_up would mask the isActive=0 we just set above.
      const BATCH_SIZE = 100;
      for (let i = 0; i < unstarredIds.length; i += BATCH_SIZE) {
        const batch = unstarredIds.slice(i, i + BATCH_SIZE);
        await db
          .delete(recommendationFeedback)
          .where(
            and(
              eq(recommendationFeedback.userId, userId),
              inArray(recommendationFeedback.songId, batch),
              eq(recommendationFeedback.source, 'library')
            )
          );
      }

      result.unstarred = unstarredIds.length;
      console.log(`💜 [LikedSongsSync] Marked ${unstarredIds.length} songs as un-starred and removed stale feedback`);
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

// ============================================================================
// Liked Songs Playlist Rebuild
// ============================================================================

const LIKED_SONGS_NAME = '❤️ Liked Songs';

type LikedPlaylistRow = typeof userPlaylists.$inferSelect;

/**
 * Resolve the canonical app-managed "Liked Songs" playlist for a user.
 *
 * NOTE: selection is still by `name ILIKE '%liked%'` (most-recently-updated),
 * which is fragile — a follow-up (plan PR B) replaces this with a stable marker
 * column. It is centralised here so there is exactly one place to change.
 * Navidrome-backed playlists (e.g. "Loved Songs", which has a navidromeId) are
 * intentionally excluded so we never treat a real Navidrome playlist as the
 * auto-synced star mirror.
 */
export async function findLikedPlaylist(userId: string): Promise<LikedPlaylistRow | undefined> {
  return db
    .select()
    .from(userPlaylists)
    .where(
      and(
        eq(userPlaylists.userId, userId),
        sql`${userPlaylists.navidromeId} IS NULL`,
        sql`${userPlaylists.name} ILIKE '%liked%'`
      )
    )
    .orderBy(desc(userPlaylists.updatedAt))
    .limit(1)
    .then(rows => rows[0]);
}

/** True if a playlist row is the canonical app-managed Liked Songs mirror. */
export function isCanonicalLikedPlaylist(p: Pick<LikedPlaylistRow, 'name' | 'navidromeId'>): boolean {
  return p.navidromeId == null && /liked/i.test(p.name);
}

/**
 * Single source of truth for toggling a song's "liked" (starred) state.
 *
 * Keeps every derived store in lockstep in ONE place:
 *   Navidrome star  ↔  recommendation_feedback (source='library')
 *                   ↔  liked_songs_sync.is_active
 *                   ↔  playlist_songs (the ❤️ Liked Songs mirror)
 *
 * Use this everywhere a like is set/cleared (heart button, feedback endpoint,
 * "remove from Liked Songs") so the playlist can never drift from the stars.
 */
export async function setSongLiked(
  userId: string,
  songId: string,
  liked: boolean,
  creds?: SubsonicCreds,
  meta?: { artist?: string; title?: string }
): Promise<void> {
  // 1. Navidrome is the source of truth — (un)star first.
  if (liked) {
    await starSong(songId, creds);
  } else {
    await unstarSong(songId, creds);
  }

  // 2. Resolve metadata (needed for inserts). Best-effort; never fatal.
  let artist = meta?.artist;
  let title = meta?.title;
  if (liked && (!artist || !title)) {
    try {
      const [song] = await getSongsByIds([songId]);
      if (song) {
        artist = artist || song.artist || 'Unknown';
        title = title || song.title || song.name || songId;
      }
    } catch {
      // metadata lookup failed — fall through to placeholders
    }
  }
  artist = artist || 'Unknown';
  title = title || songId;
  const songArtistTitle = `${artist} - ${title}`;

  // 3. recommendation_feedback (source='library' — mirrors the star)
  if (liked) {
    const temporal = getTemporalMetadata();
    await db
      .insert(recommendationFeedback)
      .values({
        userId,
        songId,
        songArtistTitle,
        feedbackType: 'thumbs_up',
        source: 'library',
        month: temporal.month,
        season: temporal.season,
        dayOfWeek: temporal.dayOfWeek,
        hourOfDay: temporal.hourOfDay,
      })
      .onConflictDoUpdate({
        target: [recommendationFeedback.userId, recommendationFeedback.songId],
        set: { feedbackType: 'thumbs_up', timestamp: new Date() },
      });
  } else {
    await db
      .delete(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          eq(recommendationFeedback.songId, songId),
          eq(recommendationFeedback.source, 'library')
        )
      );
  }

  // 4. liked_songs_sync ledger
  if (liked) {
    await db
      .insert(likedSongsSync)
      .values({ userId, songId, artist, title, isActive: 1 })
      .onConflictDoUpdate({
        target: [likedSongsSync.userId, likedSongsSync.songId],
        set: { isActive: 1, syncedAt: new Date() },
      });
  } else {
    await db
      .update(likedSongsSync)
      .set({ isActive: 0 })
      .where(and(eq(likedSongsSync.userId, userId), eq(likedSongsSync.songId, songId)));
  }

  // 5. playlist_songs — surgical single-row add/remove in the ❤️ mirror.
  if (liked) {
    // Create the mirror playlist on first like if it doesn't exist yet.
    let likedPlaylist = await findLikedPlaylist(userId);
    if (!likedPlaylist) {
      const [created] = await db
        .insert(userPlaylists)
        .values({
          id: crypto.randomUUID(),
          userId,
          name: LIKED_SONGS_NAME,
          description: 'Auto-synced from your starred songs in Navidrome',
          navidromeId: null,
          lastSynced: new Date(),
          songCount: 0,
          totalDuration: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      likedPlaylist = created;
    }

    const existing = await db
      .select({ id: playlistSongs.id })
      .from(playlistSongs)
      .where(and(eq(playlistSongs.playlistId, likedPlaylist.id), eq(playlistSongs.songId, songId)))
      .limit(1);

    if (existing.length === 0) {
      const rows = await db
        .select({ songId: playlistSongs.songId })
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, likedPlaylist.id));
      await db.insert(playlistSongs).values({
        id: crypto.randomUUID(),
        playlistId: likedPlaylist.id,
        songId,
        songArtistTitle,
        position: rows.length + 1,
        addedAt: new Date(),
      });
      await db
        .update(userPlaylists)
        .set({ songCount: rows.length + 1, updatedAt: new Date() })
        .where(eq(userPlaylists.id, likedPlaylist.id));
    }
  } else {
    const likedPlaylist = await findLikedPlaylist(userId);
    if (likedPlaylist) {
      await db
        .delete(playlistSongs)
        .where(and(eq(playlistSongs.playlistId, likedPlaylist.id), eq(playlistSongs.songId, songId)));
      const remaining = await db
        .select({ songId: playlistSongs.songId })
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, likedPlaylist.id));
      await db
        .update(userPlaylists)
        .set({ songCount: remaining.length, updatedAt: new Date() })
        .where(eq(userPlaylists.id, likedPlaylist.id));
    }
  }
}

export async function rebuildLikedSongsPlaylist(
  userId: string,
  starredSongs: SubsonicSong[]
): Promise<{ playlistId: string; songCount: number }> {
  let likedPlaylist = await findLikedPlaylist(userId);

  if (!likedPlaylist) {
    const [newPlaylist] = await db
      .insert(userPlaylists)
      .values({
        id: crypto.randomUUID(),
        userId,
        name: LIKED_SONGS_NAME,
        description: 'Auto-synced from your starred songs in Navidrome',
        navidromeId: null,
        lastSynced: new Date(),
        songCount: starredSongs.length,
        totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    likedPlaylist = newPlaylist;
  } else {
    await db
      .update(userPlaylists)
      .set({
        name: LIKED_SONGS_NAME,
        lastSynced: new Date(),
        songCount: starredSongs.length,
        totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
        updatedAt: new Date(),
      })
      .where(eq(userPlaylists.id, likedPlaylist.id));
  }

  await db
    .delete(playlistSongs)
    .where(eq(playlistSongs.playlistId, likedPlaylist.id));

  if (starredSongs.length > 0) {
    await db.insert(playlistSongs).values(
      starredSongs.map((song, index) => ({
        id: crypto.randomUUID(),
        playlistId: likedPlaylist.id,
        songId: song.id,
        songArtistTitle: `${song.artist} - ${song.title}`,
        position: index + 1,
        addedAt: new Date(),
      }))
    );
  }

  console.log(`✅ Rebuilt Liked Songs playlist: ${starredSongs.length} songs`);
  return { playlistId: likedPlaylist.id, songCount: starredSongs.length };
}
