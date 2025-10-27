import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../lib/auth/auth';
import { db } from '../../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../../lib/db/schema/playlists.schema';
import { eq } from 'drizzle-orm';
import { evaluateSmartPlaylistRules } from '../../../../lib/services/smart-playlist-evaluator';
import { z } from 'zod';

// Recursive type for rule conditions (any is required for recursive Zod schema)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RuleConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.tuple([z.number(), z.number()])]))),
    z.object({ all: z.array(RuleConditionSchema) }),
    z.object({ any: z.array(RuleConditionSchema) }),
  ])
);

// Zod schema for smart playlist validation
const SmartPlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  rules: z.object({
    name: z.string().optional(),
    comment: z.string().optional(),
    all: z.array(RuleConditionSchema).optional(),
    any: z.array(RuleConditionSchema).optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }),
});

export const ServerRoute = createServerFileRoute('/api/playlists/smart/').methods({
  // POST /api/playlists/smart - Create smart playlist using Navidrome rules
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
      const validatedData = SmartPlaylistSchema.parse(body);

      console.log('🎵 Creating smart playlist:', validatedData.name);
      console.log('📋 Rules:', JSON.stringify(validatedData.rules, null, 2));

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

      // Evaluate rules to get matching songs
      const matchingSongs = await evaluateSmartPlaylistRules(validatedData.rules);
      console.log(`✅ Found ${matchingSongs.length} songs matching smart playlist rules`);

      // Create playlist in database
      const newPlaylist = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: validatedData.name,
        description: validatedData.rules.comment || `Smart playlist: ${validatedData.rules.sort || 'custom rules'}`,
        smartPlaylistCriteria: validatedData.rules, // Store full rules for future re-evaluation
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(userPlaylists).values(newPlaylist);

      // Add songs to playlist
      if (matchingSongs.length > 0) {
        const songsToAdd = matchingSongs.map((song, index) => ({
          id: crypto.randomUUID(),
          playlistId: newPlaylist.id,
          songId: song.id,
          songArtistTitle: `${song.artist} - ${song.title}`,
          position: index,
          addedAt: new Date(),
        }));

        await db.insert(playlistSongs).values(songsToAdd);

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
      }

      return new Response(JSON.stringify({
        data: {
          ...newPlaylist,
          songCount: matchingSongs.length,
        }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to create smart playlist:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid smart playlist data',
          errors: error.errors,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create smart playlist';
      return new Response(JSON.stringify({
        code: 'SMART_PLAYLIST_CREATE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
