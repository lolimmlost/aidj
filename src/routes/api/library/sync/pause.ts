/**
 * POST /api/library/sync/pause
 *
 * Pause a running library sync operation.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';

export const Route = createFileRoute('/api/library/sync/pause')({
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
          const status = manager.getStatus();

          if (!status.isRunning) {
            return new Response(JSON.stringify({ error: 'No sync is currently running' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          await manager.pause();

          return new Response(JSON.stringify({
            success: true,
            message: 'Sync paused',
            progress: manager.getStatus().progress,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to pause sync:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to pause sync'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
