import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../../lib/auth/auth';
import {
  previewSmartPlaylistRules,
  type SmartPlaylistRules,
} from '../../../../lib/services/navidrome-smart-playlists';

export const Route = createFileRoute("/api/playlists/smart/preview")({
  server: {
    handlers: {
  // POST /api/playlists/smart/preview - Preview songs matching smart playlist rules
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
      const { rules } = body;

      if (!rules) {
        return new Response(JSON.stringify({
          error: 'Smart playlist rules are required',
          code: 'MISSING_RULES'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log('🔍 Previewing smart playlist via Navidrome native API');

      // Preview via Navidrome — creates temp playlist, fetches songs, deletes it
      const songs = await previewSmartPlaylistRules(
        rules as SmartPlaylistRules,
        rules.limit || 50,
      );

      console.log(`✅ Preview found ${songs.length} matching songs`);

      return new Response(JSON.stringify({
        data: {
          songs,
          count: songs.length,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to preview smart playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to preview smart playlist';
      return new Response(JSON.stringify({
        code: 'PREVIEW_ERROR',
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
