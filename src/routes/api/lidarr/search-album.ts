import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { searchForAlbum } from '@/lib/services/lidarr';

export const Route = createFileRoute("/api/lidarr/search-album")({
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

      // Trigger a search for the album
      const success = await searchForAlbum(parseInt(albumId, 10));

      if (!success) {
        return new Response(JSON.stringify({ error: 'Failed to trigger album search' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Album search initiated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr album search failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Failed to search for album';
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
