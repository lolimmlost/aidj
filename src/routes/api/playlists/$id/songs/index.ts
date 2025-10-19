import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../../lib/auth/auth';
import { db } from '../../../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../../../lib/db/schema/playlists.schema';
import { eq, and, max } from 'drizzle-orm';
import { z } from 'zod';

// Zod schema for adding song
const AddSongSchema = z.object({
  songId: z.string().min(1),
  artistName: z.string().min(1),
  songTitle: z.string().min(1),
});

export const ServerRoute = createServerFileRoute('/api/playlists/$id/songs/').methods({
  // POST /api/playlists/[id]/songs - Add song to playlist
  POST: async ({ request, params }) => {
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
      const validatedData = AddSongSchema.parse(body);

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

      // Check for duplicate song
      const existingSong = await db
        .select()
        .from(playlistSongs)
        .where(and(
          eq(playlistSongs.playlistId, playlistId),
          eq(playlistSongs.songId, validatedData.songId)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (existingSong) {
        return new Response(JSON.stringify({
          error: 'Song already in playlist',
          code: 'DUPLICATE_SONG'
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get max position
      const maxPositionResult = await db
        .select({ maxPosition: max(playlistSongs.position) })
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, playlistId))
        .then(rows => rows[0]);

      const nextPosition = (maxPositionResult?.maxPosition ?? -1) + 1;

      // Add song to playlist
      const newSong = {
        id: crypto.randomUUID(),
        playlistId,
        songId: validatedData.songId,
        songArtistTitle: `${validatedData.artistName} - ${validatedData.songTitle}`,
        position: nextPosition,
        addedAt: new Date(),
      };

      await db.insert(playlistSongs).values(newSong);

      // Update playlist updatedAt
      await db
        .update(userPlaylists)
        .set({ updatedAt: new Date() })
        .where(eq(userPlaylists.id, playlistId));

      return new Response(JSON.stringify({
        data: {
          success: true,
          position: nextPosition,
          song: newSong,
        }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to add song to playlist:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid song data',
          errors: error.issues,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to add song to playlist';
      return new Response(JSON.stringify({
        code: 'SONG_ADD_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
