import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { eq, and, asc } from 'drizzle-orm';
import { getSongsByIds } from '../../../lib/services/navidrome';

export const Route = createFileRoute("/api/playlists/$id")({
  server: {
    handlers: {
  // GET /api/playlists/[id] - Get playlist details
  GET: async ({ request, params }) => {
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
      const { id } = params;

      // Fetch playlist
      const playlist = await db
        .select()
        .from(userPlaylists)
        .where(and(
          eq(userPlaylists.id, id),
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

      // Fetch playlist songs
      const songs = await db
        .select()
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, id))
        .orderBy(asc(playlistSongs.position));

      // Try to enrich songs with Navidrome metadata (duration, album, albumId, starred, etc.)
      let enrichedSongs = songs.map(s => ({
        ...s,
        duration: null as number | null,
        album: null as string | null,
        albumId: null as string | null,
        starred: false,
      }));

      try {
        const songIds = songs.map(s => s.songId);

        if (songIds.length > 0) {
          // Fetch song details from Navidrome
          const songDetails = await getSongsByIds(songIds);
          const songMap = new Map(songDetails.map(s => [s.id, s]));

          enrichedSongs = songs.map(s => {
            const details = songMap.get(s.songId);
            return {
              ...s,
              duration: details?.duration ?? null,
              album: details?.album ?? null,
              albumId: details?.albumId ?? null,
              starred: (details as any)?.starred ?? false,
            };
          });
        }
      } catch (navidromeError) {
        // If Navidrome is unavailable, continue with basic song data
        console.warn('Could not fetch song details from Navidrome:', navidromeError);
      }

      return new Response(JSON.stringify({
        data: {
          ...playlist,
          songs: enrichedSongs,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to fetch playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_FETCH_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // DELETE /api/playlists/[id] - Delete playlist
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
      const { id } = params;

      // Verify ownership
      const playlist = await db
        .select()
        .from(userPlaylists)
        .where(and(
          eq(userPlaylists.id, id),
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

      // Delete playlist (cascade will delete songs)
      await db
        .delete(userPlaylists)
        .where(eq(userPlaylists.id, id));

      return new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to delete playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_DELETE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
