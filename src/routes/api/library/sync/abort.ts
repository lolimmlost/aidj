/**
 * POST /api/library/sync/abort
 *
 * Abort a running library sync operation.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';

export const Route = createFileRoute('/api/library/sync/abort')({
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

          await manager.abort();

          return new Response(JSON.stringify({
            success: true,
            message: 'Sync aborted',
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to abort sync:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to abort sync'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
