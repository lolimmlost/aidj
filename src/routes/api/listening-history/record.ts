/**
 * API endpoint to record song plays in listening history
 * Called when a song finishes or is scrobbled
 *
 * POST /api/listening-history/record
 */
import { createFileRoute } from "@tanstack/react-router";
import { recordSongPlay } from '../../../lib/services/listening-history';
import { auth } from '../../../lib/auth/auth';

export const Route = createFileRoute("/api/listening-history/record")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
      // Get session from auth
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });

      if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const body = await request.json();

      // Validate required fields
      if (!body.songId || !body.artist || !body.title) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: songId, artist, title' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Record the song play (convert durations to integers for database)
      await recordSongPlay(session.user.id, {
        songId: body.songId,
        artist: body.artist,
        title: body.title,
        album: body.album || null,
        genre: body.genre || null,
        duration: body.duration ? Math.floor(body.duration) : undefined,
      }, body.playDuration ? Math.floor(body.playDuration) : undefined);

      return new Response(
        JSON.stringify({ success: true, message: 'Song play recorded' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error recording song play:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
    },
  },
});
