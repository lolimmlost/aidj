import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../../lib/auth/auth';
import { db } from '../../../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../../../lib/db/schema/playlists.schema';
import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const ServerRoute = createServerFileRoute('/api/playlists/$id/songs/$songId').methods({
  // DELETE /api/playlists/[id]/songs/[songId] - Remove song from playlist
  DELETE: async ({ request, params }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { id: playlistId, songId } = params;

      // Verify playlist ownership
      const playlist = await db
        .select()
        .from(userPlaylists)
        .where(and(
          eq(userPlaylists.id, playlistId),
          eq(userPlaylists.userId, session.user.id)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (!playlist) {
        return new Response(JSON.stringify({
          error: 'Playlist not found',
          code: 'PLAYLIST_NOT_FOUND'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the song to delete
      const songToDelete = await db
        .select()
        .from(playlistSongs)
        .where(and(
          eq(playlistSongs.playlistId, playlistId),
          eq(playlistSongs.songId, songId)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (!songToDelete) {
        return new Response(JSON.stringify({
          error: 'Song not found in playlist',
          code: 'SONG_NOT_FOUND'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Delete the song
      await db
        .delete(playlistSongs)
        .where(and(
          eq(playlistSongs.playlistId, playlistId),
          eq(playlistSongs.songId, songId)
        ));

      // Recalculate positions for remaining songs (decrement positions > deleted position)
      await db
        .update(playlistSongs)
        .set({ position: sql`${playlistSongs.position} - 1` })
        .where(and(
          eq(playlistSongs.playlistId, playlistId),
          gt(playlistSongs.position, songToDelete.position)
        ));

      // Update playlist updatedAt
      await db
        .update(userPlaylists)
        .set({ updatedAt: new Date() })
        .where(eq(userPlaylists.id, playlistId));

      return new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to remove song from playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to remove song from playlist';
      return new Response(JSON.stringify({
        code: 'SONG_REMOVE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
