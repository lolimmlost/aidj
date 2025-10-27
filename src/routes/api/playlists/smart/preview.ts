import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../../lib/auth/auth';
import { evaluateSmartPlaylistRules } from '../../../../lib/services/smart-playlist-evaluator';

export const ServerRoute = createServerFileRoute('/api/playlists/smart/preview').methods({
  // POST /api/playlists/smart/preview - Preview songs matching smart playlist rules
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

      console.log('📋 Previewing smart playlist with rules:', JSON.stringify(rules, null, 2));

      // Evaluate rules and get matching songs
      const songs = await evaluateSmartPlaylistRules(rules);

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
});
