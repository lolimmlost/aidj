import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { search } from '@/lib/services/lidarr';

export const Route = createFileRoute("/api/lidarr/search")({
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

      const { query } = await request.json() as { query: string };

      if (!query?.trim()) {
        return new Response(JSON.stringify({ artists: [], albums: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const results = await search(query);

      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr search failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr search error';
      if (error instanceof ServiceError) {
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
