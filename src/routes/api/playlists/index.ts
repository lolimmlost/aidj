import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { searchSongsByCriteria, checkNavidromeConnectivity } from '../../../lib/services/navidrome';

// Zod schema for playlist validation
const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  smartPlaylistCriteria: z.object({
    genre: z.array(z.string()).optional(),
    yearFrom: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
    yearTo: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
    artists: z.array(z.string()).optional(),
    rating: z.number().min(1).max(5).optional(),
    recentlyAdded: z.enum(['7d', '30d', '90d']).optional(),
  }).refine((data) => {
    // Validate year range: yearFrom <= yearTo
    if (data.yearFrom && data.yearTo && data.yearFrom > data.yearTo) {
      return false;
    }
    return true;
  }, {
    message: 'yearFrom must be less than or equal to yearTo',
  }).optional(),
});

export const Route = createFileRoute("/api/playlists/")({
  server: {
    handlers: {
  // POST /api/playlists - Create new playlist
  POST: async ({ request }) => {
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
      const body = await request.json();
      const validatedData = CreatePlaylistSchema.parse(body);

      // Check for duplicate playlist name
      const existingPlaylist = await db
        .select()
        .from(userPlaylists)
        .where(eq(userPlaylists.userId, session.user.id))
        .where(eq(userPlaylists.name, validatedData.name))
        .limit(1)
        .then(rows => rows[0]);

      if (existingPlaylist) {
        return new Response(JSON.stringify({
          error: 'Playlist name already exists',
          code: 'DUPLICATE_PLAYLIST_NAME'
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create new playlist (with optional smart playlist criteria)
      const newPlaylist = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: validatedData.name,
        description: validatedData.description || null,
        smartPlaylistCriteria: validatedData.smartPlaylistCriteria || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(userPlaylists).values(newPlaylist);

      // If smart playlist criteria provided, populate with matching songs
      if (validatedData.smartPlaylistCriteria) {
        try {
          console.log('🔍 Searching for songs matching smart playlist criteria:', validatedData.smartPlaylistCriteria);
          const matchingSongs = await searchSongsByCriteria(validatedData.smartPlaylistCriteria, 100);

          console.log(`📋 Found ${matchingSongs.length} songs matching criteria`);

          // Add songs to playlist
          const songsToAdd = matchingSongs.map((song, index) => ({
            id: crypto.randomUUID(),
            playlistId: newPlaylist.id,
            songId: song.id,
            songArtistTitle: `${song.artist} - ${song.title}`,
            position: index,
            addedAt: new Date(),
          }));

          if (songsToAdd.length > 0) {
            await db.insert(playlistSongs).values(songsToAdd);
          }

          // Update playlist with song count and duration
          const totalDuration = matchingSongs.reduce((sum, song) => sum + parseInt(song.duration || '0'), 0);
          await db
            .update(userPlaylists)
            .set({
              songCount: matchingSongs.length,
              totalDuration,
              updatedAt: new Date(),
            })
            .where(eq(userPlaylists.id, newPlaylist.id));

          console.log(`✅ Smart playlist "${newPlaylist.name}" created with ${matchingSongs.length} songs`);
        } catch (error) {
          console.error('Failed to populate smart playlist:', error);
          // Don't fail the whole request, playlist is created but empty
        }
      }

      return new Response(JSON.stringify({ data: newPlaylist }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to create playlist:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid playlist data',
          errors: error.errors,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_CREATE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // GET /api/playlists - List all user playlists
  GET: async ({ request }) => {
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
      // Check Navidrome connectivity (non-blocking)
      const navidromeAvailable = await checkNavidromeConnectivity();

      // Fetch playlists with all Navidrome sync fields (always show cached data)
      const playlists = await db
        .select({
          id: userPlaylists.id,
          name: userPlaylists.name,
          description: userPlaylists.description,
          navidromeId: userPlaylists.navidromeId,
          lastSynced: userPlaylists.lastSynced,
          songCount: userPlaylists.songCount,
          totalDuration: userPlaylists.totalDuration,
          smartPlaylistCriteria: userPlaylists.smartPlaylistCriteria,
          createdAt: userPlaylists.createdAt,
          updatedAt: userPlaylists.updatedAt,
          actualSongCount: sql<number>`cast(count(${playlistSongs.id}) as int)`,
        })
        .from(userPlaylists)
        .leftJoin(playlistSongs, eq(userPlaylists.id, playlistSongs.playlistId))
        .where(eq(userPlaylists.userId, session.user.id))
        .groupBy(userPlaylists.id, userPlaylists.name, userPlaylists.description,
                 userPlaylists.navidromeId, userPlaylists.lastSynced, userPlaylists.songCount,
                 userPlaylists.totalDuration, userPlaylists.smartPlaylistCriteria,
                 userPlaylists.createdAt, userPlaylists.updatedAt)
        .orderBy(desc(userPlaylists.createdAt));

      return new Response(JSON.stringify({
        data: {
          playlists,
          navidromeAvailable, // Include connectivity status
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to fetch playlists:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch playlists';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_FETCH_ERROR',
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
