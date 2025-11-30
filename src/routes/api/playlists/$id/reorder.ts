import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../lib/auth/auth';
import { db } from '../../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../../lib/db/schema/playlists.schema';
import { eq, and } from 'drizzle-orm';

export const ServerRoute = createServerFileRoute('/api/playlists/$id/reorder').methods({
  // PUT /api/playlists/[id]/reorder - Reorder songs in a playlist
  PUT: async ({ request, params }) => {
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
      const { id: playlistId } = params;
      const body = await request.json();
      const { songIds } = body as { songIds: string[] };

      if (!songIds || !Array.isArray(songIds)) {
        return new Response(JSON.stringify({
          error: 'songIds array is required',
          code: 'INVALID_REQUEST'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify ownership
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

      // Update positions for each song
      await db.transaction(async (tx) => {
        for (let i = 0; i < songIds.length; i++) {
          await tx
            .update(playlistSongs)
            .set({ position: i })
            .where(and(
              eq(playlistSongs.playlistId, playlistId),
              eq(playlistSongs.songId, songIds[i])
            ));
        }

        // Update playlist's updatedAt timestamp
        await tx
          .update(userPlaylists)
          .set({ updatedAt: new Date() })
          .where(eq(userPlaylists.id, playlistId));
      });

      return new Response(JSON.stringify({
        data: { success: true }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to reorder playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to reorder playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_REORDER_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
