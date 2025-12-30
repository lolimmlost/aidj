import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { monitorAlbum } from '@/lib/services/lidarr';

export const Route = createFileRoute("/api/lidarr/unmonitor")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
      // Auth check (protected route)
      const { auth } = await import('../../../lib/auth/server');
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

      const { albumId } = await request.json() as { albumId: string };

      if (!albumId) {
        return new Response(JSON.stringify({ error: 'Album ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Unmonitor the album (set monitored to false)
      const success = await monitorAlbum(parseInt(albumId, 10), false);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Failed to unmonitor album' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Album unmonitored successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr unmonitor failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Failed to unmonitor album';
      if (error instanceof ServiceError) {
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ error: message, code }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
