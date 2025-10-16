import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../../lib/utils';
import { cancelDownload } from '../../../lib/services/lidarr';

export const ServerRoute = createServerFileRoute('/api/lidarr/cancel').methods({
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

      const { downloadId } = await request.json() as { downloadId: string };

      if (!downloadId) {
        return new Response(JSON.stringify({ error: 'Download ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const success = await cancelDownload(downloadId);

      if (success) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Download ${downloadId} cancelled successfully` 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Failed to cancel download' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error: unknown) {
      console.error('Lidarr cancel failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr cancel error';
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