import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../lib/utils';
import { search } from '../../lib/services/navidrome';

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    // Auth check (protected route)
    const { auth } = await import('../../lib/auth/server');
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
      const { query, start = 0, limit = 50 } = await request.json() as { query: string; start?: number; limit?: number };
      if (!query) {
        return new Response(JSON.stringify({ error: 'Query required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const results = await search(query, start, limit);
      return new Response(JSON.stringify({ data: results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Search failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to search';
      if (error instanceof ServiceError) {
        code = error.code;
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