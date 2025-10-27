import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../lib/auth/auth';
import { db } from '../../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStarredSongs } from '../../../../lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/playlists/liked-songs/sync').methods({
  /**
   * POST /api/playlists/liked-songs/sync
   * Syncs the special "Liked Songs" playlist with Navidrome starred songs
   */
  POST: async ({ request }) => {
    // Authentication
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const userId = session.user.id;
      const LIKED_SONGS_NAME = '❤️ Liked Songs';

      console.log(`🔄 Syncing Liked Songs playlist for user ${userId}`);

      // Fetch starred songs from Navidrome
      const starredSongs = await getStarredSongs();
      console.log(`⭐ Found ${starredSongs.length} starred songs in Navidrome`);

      // Find or create the Liked Songs playlist
      let likedPlaylist = await db
        .select()
        .from(userPlaylists)
        .where(
          and(
            eq(userPlaylists.userId, userId),
            eq(userPlaylists.name, LIKED_SONGS_NAME)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      if (!likedPlaylist) {
        // Create the special Liked Songs playlist
        console.log(`✨ Creating new Liked Songs playlist`);
        const [newPlaylist] = await db
          .insert(userPlaylists)
          .values({
            id: crypto.randomUUID(),
            userId,
            name: LIKED_SONGS_NAME,
            description: 'Auto-synced from your starred songs in Navidrome',
            navidromeId: null, // Not synced from Navidrome, but TO Navidrome
            lastSynced: new Date(),
            songCount: starredSongs.length,
            totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        likedPlaylist = newPlaylist;
      } else {
        // Update existing playlist
        console.log(`📝 Updating existing Liked Songs playlist`);
        await db
          .update(userPlaylists)
          .set({
            lastSynced: new Date(),
            songCount: starredSongs.length,
            totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
            updatedAt: new Date(),
          })
          .where(eq(userPlaylists.id, likedPlaylist.id));
      }

      // Clear existing songs from playlist
      await db
        .delete(playlistSongs)
        .where(eq(playlistSongs.playlistId, likedPlaylist.id));

      // Insert starred songs
      if (starredSongs.length > 0) {
        const songsToInsert = starredSongs.map((song, index) => ({
          id: crypto.randomUUID(),
          playlistId: likedPlaylist.id,
          songId: song.id,
          songArtistTitle: `${song.artist} - ${song.title}`,
          position: index + 1,
          addedAt: new Date(),
        }));

        await db.insert(playlistSongs).values(songsToInsert);
        console.log(`✅ Inserted ${songsToInsert.length} songs into Liked Songs playlist`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            playlist: likedPlaylist,
            songCount: starredSongs.length,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error: unknown) {
      console.error('Failed to sync Liked Songs playlist:', error);

      const message = error instanceof Error ? error.message : 'Failed to sync Liked Songs playlist';
      return new Response(
        JSON.stringify({
          error: message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
});
