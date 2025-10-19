import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';

// Zod schema for playlist validation
const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const ServerRoute = createServerFileRoute('/api/playlists/').methods({
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

      // Create new playlist
      const newPlaylist = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: validatedData.name,
        description: validatedData.description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(userPlaylists).values(newPlaylist);

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
      // Fetch playlists with song count
      const playlists = await db
        .select({
          id: userPlaylists.id,
          name: userPlaylists.name,
          description: userPlaylists.description,
          createdAt: userPlaylists.createdAt,
          updatedAt: userPlaylists.updatedAt,
          songCount: sql<number>`cast(count(${playlistSongs.id}) as int)`,
        })
        .from(userPlaylists)
        .leftJoin(playlistSongs, eq(userPlaylists.id, playlistSongs.playlistId))
        .where(eq(userPlaylists.userId, session.user.id))
        .groupBy(userPlaylists.id)
        .orderBy(desc(userPlaylists.createdAt));

      return new Response(JSON.stringify({ data: { playlists } }), {
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
});
