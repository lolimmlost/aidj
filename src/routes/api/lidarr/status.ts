import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../../lib/utils';
import { monitorDownloads } from '../../../lib/services/lidarr';

export const ServerRoute = createServerFileRoute('/api/lidarr/status').methods({
  GET: async ({ request }: { request: Request }) => {
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

      const { queue, history, stats } = await monitorDownloads();

      return new Response(JSON.stringify({
        queue,
        history,
        stats,
        lastUpdated: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr status fetch failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr status error';
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
