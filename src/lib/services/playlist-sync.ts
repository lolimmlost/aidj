import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userPlaylists, playlistSongs } from '@/lib/db/schema/playlists.schema';
import { getPlaylists, getPlaylist, type NavidromePlaylist, type NavidromePlaylistWithSongs } from './navidrome';
import { ServiceError } from '../utils';

/**
 * Sync result interface
 */
export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Sync user's Navidrome playlists with local database
 * @param userId - User ID to sync playlists for
 * @returns Sync result with counts of added, updated, and deleted playlists
 */
export async function syncNavidromePlaylists(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    added: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  try {
    // 1. Fetch all playlists from Navidrome
    const navidromePlaylists = await getPlaylists();
    console.log(`🔄 Fetched ${navidromePlaylists.length} playlists from Navidrome for user ${userId}`);

    // 2. Fetch all local playlists that have a navidromeId (synced playlists)
    const localPlaylists = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.userId, userId));

    const localPlaylistsByNavidromeId = new Map(
      localPlaylists
        .filter(p => p.navidromeId)
        .map(p => [p.navidromeId!, p])
    );

    // 3. Process each Navidrome playlist
    for (const navidromePlaylist of navidromePlaylists) {
      try {
        const localPlaylist = localPlaylistsByNavidromeId.get(navidromePlaylist.id);

        if (localPlaylist) {
          // Playlist exists locally - check if it needs updating
          if (
            localPlaylist.songCount !== navidromePlaylist.songCount ||
            localPlaylist.totalDuration !== navidromePlaylist.duration
          ) {
            // Update local playlist
            await db
              .update(userPlaylists)
              .set({
                name: navidromePlaylist.name,
                songCount: navidromePlaylist.songCount,
                totalDuration: navidromePlaylist.duration,
                lastSynced: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(userPlaylists.id, localPlaylist.id));

            // Fetch full playlist with songs to update playlistSongs table
            await syncPlaylistSongs(localPlaylist.id, navidromePlaylist.id);

            result.updated++;
            console.log(`✅ Updated playlist "${navidromePlaylist.name}"`);
          } else {
            // Just update lastSynced timestamp
            await db
              .update(userPlaylists)
              .set({
                lastSynced: new Date(),
              })
              .where(eq(userPlaylists.id, localPlaylist.id));
          }
        } else {
          // New playlist - add to local database
          const newPlaylistId = await addNavidromePlaylist(userId, navidromePlaylist);
          if (newPlaylistId) {
            await syncPlaylistSongs(newPlaylistId, navidromePlaylist.id);
            result.added++;
            console.log(`➕ Added new playlist "${navidromePlaylist.name}"`);
          }
        }

        // Remove from map to track deletions
        localPlaylistsByNavidromeId.delete(navidromePlaylist.id);
      } catch (error) {
        const errorMsg = `Failed to sync playlist ${navidromePlaylist.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // 4. Handle deleted playlists (remaining in map)
    for (const [_navidromeId, localPlaylist] of localPlaylistsByNavidromeId) {
      try {
        // Mark as deleted but keep data (soft delete by removing navidromeId)
        await db
          .update(userPlaylists)
          .set({
            navidromeId: null,
            lastSynced: new Date(),
            description: `[Deleted from Navidrome] ${localPlaylist.description || ''}`,
            updatedAt: new Date(),
          })
          .where(eq(userPlaylists.id, localPlaylist.id));

        result.deleted++;
        console.log(`🗑️ Marked playlist "${localPlaylist.name}" as deleted from Navidrome`);
      } catch (error) {
        const errorMsg = `Failed to mark playlist ${localPlaylist.name} as deleted: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    console.log(`🎉 Sync complete: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted, ${result.errors.length} errors`);
    return result;
  } catch (error) {
    const errorMsg = `Playlist sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMsg);
    throw new ServiceError('PLAYLIST_SYNC_ERROR', errorMsg);
  }
}

/**
 * Add a Navidrome playlist to local database
 */
async function addNavidromePlaylist(userId: string, navidromePlaylist: NavidromePlaylist): Promise<string | null> {
  try {
    const newPlaylist = await db
      .insert(userPlaylists)
      .values({
        userId,
        name: navidromePlaylist.name,
        navidromeId: navidromePlaylist.id,
        songCount: navidromePlaylist.songCount,
        totalDuration: navidromePlaylist.duration,
        lastSynced: new Date(),
      })
      .returning();

    return newPlaylist[0]?.id || null;
  } catch (error) {
    console.error(`Failed to add playlist ${navidromePlaylist.name}:`, error);
    return null;
  }
}

/**
 * Sync playlist songs from Navidrome to local database
 */
async function syncPlaylistSongs(localPlaylistId: string, navidromePlaylistId: string): Promise<void> {
  try {
    // Fetch full playlist with songs from Navidrome
    const navidromePlaylist: NavidromePlaylistWithSongs = await getPlaylist(navidromePlaylistId);

    // Delete existing songs for this playlist
    await db.delete(playlistSongs).where(eq(playlistSongs.playlistId, localPlaylistId));

    // Add new songs
    if (navidromePlaylist.entry && navidromePlaylist.entry.length > 0) {
      const songsToInsert = navidromePlaylist.entry.map((song, index) => ({
        playlistId: localPlaylistId,
        songId: song.id,
        songArtistTitle: `${song.artist} - ${song.title}`,
        position: index,
      }));

      await db.insert(playlistSongs).values(songsToInsert);
      console.log(`🎵 Synced ${songsToInsert.length} songs for playlist ${localPlaylistId}`);
    }
  } catch (error) {
    console.error(`Failed to sync songs for playlist ${localPlaylistId}:`, error);
    throw error;
  }
}

/**
 * Check if a playlist needs syncing (song count changed)
 */
export async function needsSync(localPlaylistId: string): Promise<boolean> {
  try {
    const playlist = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.id, localPlaylistId))
      .limit(1);

    if (!playlist[0] || !playlist[0].navidromeId) {
      return false; // Not a synced playlist
    }

    // Fetch current state from Navidrome
    const navidromePlaylists = await getPlaylists();
    const navidromePlaylist = navidromePlaylists.find(p => p.id === playlist[0].navidromeId);

    if (!navidromePlaylist) {
      return true; // Playlist deleted in Navidrome
    }

    // Check if song count changed
    return playlist[0].songCount !== navidromePlaylist.songCount;
  } catch (error) {
    console.error(`Failed to check sync status for playlist ${localPlaylistId}:`, error);
    return false;
  }
}
