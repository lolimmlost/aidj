/**
 * GET/POST /api/library/sync/settings
 *
 * Get or update library sync settings.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getBackgroundSyncManager } from '@/lib/services/library-sync/background-sync';
import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { librarySyncState } from '@/lib/db/schema/library-sync.schema';
import { DEFAULT_SYNC_CONFIG } from '@/lib/services/library-sync/types';
import { DEFAULT_BACKGROUND_SYNC_CONFIG } from '@/lib/services/library-sync/background-sync';

export const Route = createFileRoute('/api/library/sync/settings')({
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

          // Get settings from database
          const stateResult = await db
            .select()
            .from(librarySyncState)
            .where(eq(librarySyncState.userId, userId))
            .limit(1);

          const state = stateResult[0];

          return new Response(JSON.stringify({
            syncConfig: {
              ...DEFAULT_SYNC_CONFIG,
              batchSize: state?.batchSize ?? DEFAULT_SYNC_CONFIG.batchSize,
              maxConcurrentRequests: state?.maxConcurrentRequests ?? DEFAULT_SYNC_CONFIG.maxConcurrentRequests,
            },
            backgroundConfig: {
              ...DEFAULT_BACKGROUND_SYNC_CONFIG,
              enabled: state?.autoSyncEnabled ?? DEFAULT_BACKGROUND_SYNC_CONFIG.enabled,
              intervalMinutes: state?.syncFrequencyMinutes ?? DEFAULT_BACKGROUND_SYNC_CONFIG.intervalMinutes,
            },
            status: state ? {
              status: state.status,
              lastSyncAt: state.lastSyncCompletedAt,
              lastSyncDurationMs: state.lastSyncDurationMs,
              totalSongsIndexed: state.totalSongsIndexed,
              totalArtistsIndexed: state.totalArtistsIndexed,
              totalAlbumsIndexed: state.totalAlbumsIndexed,
              errorCount: state.errorCount,
            } : null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to get sync settings:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to get settings'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },

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
          const body = await request.json();

          // Extract settings from body
          const {
            enabled,
            intervalMinutes,
            batchSize,
            maxConcurrentRequests,
            maxSongsPerArtist,
            maxArtists,
          } = body;

          // Build update object
          const updates: Record<string, unknown> = {
            updatedAt: new Date(),
          };

          if (enabled !== undefined) {
            updates.autoSyncEnabled = enabled;
          }
          if (intervalMinutes !== undefined) {
            updates.syncFrequencyMinutes = intervalMinutes;
          }
          if (batchSize !== undefined) {
            updates.batchSize = batchSize;
          }
          if (maxConcurrentRequests !== undefined) {
            updates.maxConcurrentRequests = maxConcurrentRequests;
          }

          // Upsert settings
          await db
            .insert(librarySyncState)
            .values({
              userId,
              ...updates,
            })
            .onConflictDoUpdate({
              target: librarySyncState.userId,
              set: updates,
            });

          // Update background sync manager if running
          const manager = getBackgroundSyncManager();
          if (manager.getStatus().isEnabled) {
            await manager.updateConfig({
              enabled,
              intervalMinutes,
            });
          }

          // Get updated settings
          const stateResult = await db
            .select()
            .from(librarySyncState)
            .where(eq(librarySyncState.userId, userId))
            .limit(1);

          const state = stateResult[0];

          return new Response(JSON.stringify({
            success: true,
            message: 'Settings updated',
            syncConfig: {
              batchSize: state?.batchSize ?? DEFAULT_SYNC_CONFIG.batchSize,
              maxConcurrentRequests: state?.maxConcurrentRequests ?? DEFAULT_SYNC_CONFIG.maxConcurrentRequests,
              maxSongsPerArtist: maxSongsPerArtist ?? DEFAULT_SYNC_CONFIG.maxSongsPerArtist,
              maxArtists: maxArtists ?? DEFAULT_SYNC_CONFIG.maxArtists,
            },
            backgroundConfig: {
              enabled: state?.autoSyncEnabled ?? DEFAULT_BACKGROUND_SYNC_CONFIG.enabled,
              intervalMinutes: state?.syncFrequencyMinutes ?? DEFAULT_BACKGROUND_SYNC_CONFIG.intervalMinutes,
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('[API] Failed to update sync settings:', error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to update settings'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
