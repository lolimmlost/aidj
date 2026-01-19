/**
 * GET /api/library/sync/status
 *
 * Get current library sync status and statistics.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { librarySyncState, syncErrorLog } from '@/lib/db/schema/library-sync.schema';

export const Route = createFileRoute('/api/library/sync/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

          // Get sync state from database
          const stateResult = await db
            .select()
            .from(librarySyncState)
            .where(eq(librarySyncState.userId, userId))
            .limit(1);

          const state = stateResult[0];

          // Get recent errors
          const errorsResult = await db
            .select()
            .from(syncErrorLog)
            .where(eq(syncErrorLog.userId, userId))
            .orderBy(desc(syncErrorLog.createdAt))
            .limit(10);

          // Get manager status if available
          const manager = getBackgroundSyncManager();
          const managerStatus = manager.getStatus();

          return new Response(JSON.stringify({
            status: managerStatus.isRunning ? managerStatus.progress?.status ?? 'running' : (state?.status ?? 'idle'),
            progress: managerStatus.progress,
            isRunning: managerStatus.isRunning,
            isEnabled: managerStatus.isEnabled,

            // Timing info
            lastSyncAt: state?.lastSyncCompletedAt,
            lastFullSyncAt: state?.lastFullSyncAt,
            lastIncrementalSyncAt: state?.lastIncrementalSyncAt,
            nextSyncAt: managerStatus.nextSyncAt,

            // Statistics
            stats: {
              totalSongsIndexed: state?.totalSongsIndexed ?? 0,
              totalArtistsIndexed: state?.totalArtistsIndexed ?? 0,
              totalAlbumsIndexed: state?.totalAlbumsIndexed ?? 0,
              lastSyncDurationMs: state?.lastSyncDurationMs,
              errorCount: state?.errorCount ?? 0,
              consecutiveFailures: managerStatus.consecutiveFailures,
            },

            // Configuration
            config: {
              autoSyncEnabled: state?.autoSyncEnabled ?? true,
              syncFrequencyMinutes: state?.syncFrequencyMinutes ?? 30,
              batchSize: state?.batchSize ?? 50,
              maxConcurrentRequests: state?.maxConcurrentRequests ?? 3,
            },

            // Recent errors for debugging
            recentErrors: errorsResult.map(err => ({
              id: err.id,
              type: err.errorType,
              message: err.errorMessage,
              phase: err.phase,
              itemId: err.itemId,
              itemType: err.itemType,
              createdAt: err.createdAt,
              resolved: err.resolved,
            })),
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to get sync status:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to get status'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
