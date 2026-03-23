import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../../lib/auth/auth';
import {
  createSmartPlaylist,
  listSmartPlaylists,
  getSmartPlaylistSongs,
  type SmartPlaylistRules,
} from '../../../../lib/services/navidrome-smart-playlists';
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

export const Route = createFileRoute("/api/playlists/smart/")({
  server: {
    handlers: {
  // POST /api/playlists/smart - Create smart playlist via Navidrome native API
  POST: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
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

      console.log('🎵 Creating smart playlist via Navidrome:', validatedData.name);

      // Create directly in Navidrome — server-side rule evaluation
      const playlist = await createSmartPlaylist(
        validatedData.name,
        validatedData.rules as SmartPlaylistRules,
      );

      console.log(`✅ Smart playlist "${validatedData.name}" created in Navidrome (id: ${playlist.id}, ${playlist.songCount} songs)`);

      // Fetch the actual songs so the client can see what matched
      const songs = await getSmartPlaylistSongs(playlist.id, 0, validatedData.rules.limit || 500);

      return new Response(JSON.stringify({
        data: {
          id: playlist.id,
          name: playlist.name,
          songCount: playlist.songCount,
          duration: playlist.duration,
          songs,
          isSmartPlaylist: true,
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

  // GET /api/playlists/smart - List all smart playlists
  GET: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const playlists = await listSmartPlaylists();
      return new Response(JSON.stringify({ data: playlists }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list smart playlists';
      return new Response(JSON.stringify({ code: 'LIST_ERROR', message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
