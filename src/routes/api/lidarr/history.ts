import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { getDownloadHistory, exportDownloadHistory, clearDownloadHistory } from '../../../lib/services/lidarr';

export const Route = createFileRoute("/api/lidarr/history")({
  server: {
    handlers: {
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

      const history = await getDownloadHistory();

      return new Response(JSON.stringify({
        history,
        total: history.length,
        lastUpdated: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr history fetch failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr history error';
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

  POST: async ({ request }: { request: Request }) => {
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

      const { action } = await request.json() as { action: 'export' | 'clear' };

      if (action === 'export') {
        const csvContent = await exportDownloadHistory();
        return new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="lidarr-history.csv"',
          }
        });
      }

      if (action === 'clear') {
        const success = await clearDownloadHistory();
        if (success) {
          return new Response(JSON.stringify({ success: true, message: 'Download history cleared' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Failed to clear history' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr history operation failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr history operation error';
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
