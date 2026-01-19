/**
 * POST /api/library/sync/resume
 *
 * Resume a paused library sync operation.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';

export const Route = createFileRoute('/api/library/sync/resume')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Check authentication
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

          const manager = getBackgroundSyncManager();

          await manager.resume();

          return new Response(JSON.stringify({
            success: true,
            message: 'Sync resumed',
            progress: manager.getStatus().progress,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to resume sync:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to resume sync'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
