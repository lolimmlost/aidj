import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../../lib/utils';
import { search } from '@/lib/services/lidarr';

export const ServerRoute = createServerFileRoute('/api/lidarr/search').methods({
  POST: async ({ request }) => {
    try {
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
});
