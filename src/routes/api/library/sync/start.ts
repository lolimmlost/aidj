/**
 * POST /api/library/sync/start
 *
 * Start or trigger a library sync operation.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { librarySyncState } from '@/lib/db/schema/library-sync.schema';

export const Route = createFileRoute('/api/library/sync/start')({
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

          const userId = session.user.id;

          // Parse request body
          const body = await request.json().catch(() => ({}));
          const force = body.force === true;

          // Get or initialize background sync manager
          const manager = getBackgroundSyncManager();

          // Check if already initialized for this user
          const status = manager.getStatus();
          if (!status.isRunning) {
            // Initialize if not running
            await manager.initialize(userId);
          }

          // Trigger sync
          const result = await manager.triggerSync(force);

          // Get current state from database
          const stateResult = await db
            .select()
            .from(librarySyncState)
            .where(eq(librarySyncState.userId, userId))
            .limit(1);

          const state = stateResult[0];

          return new Response(JSON.stringify({
            success: true,
            message: result ? 'Sync completed' : 'Sync started',
            progress: manager.getStatus().progress,
            status: manager.getStatus(),
            nextSyncAt: manager.getStatus().nextSyncAt,
            stats: state ? {
              totalSongsIndexed: state.totalSongsIndexed,
              totalArtistsIndexed: state.totalArtistsIndexed,
              totalAlbumsIndexed: state.totalAlbumsIndexed,
              lastSyncDurationMs: state.lastSyncDurationMs,
              lastSyncCompletedAt: state.lastSyncCompletedAt,
            } : null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to start sync:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to start sync'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
