import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { syncNavidromePlaylists } from '../../../lib/services/playlist-sync';

export const ServerRoute = createServerFileRoute('/api/playlists/sync').methods({
  // POST /api/playlists/sync - Trigger Navidrome playlist sync
  POST: async ({ request }) => {
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

    try {
      console.log(`🔄 Starting Navidrome playlist sync for user ${session.user.id}`);

      const result = await syncNavidromePlaylists(session.user.id);

      return new Response(JSON.stringify({
        data: {
          success: true,
          summary: {
            added: result.added,
            updated: result.updated,
            deleted: result.deleted,
            errors: result.errors,
          },
          message: `Sync complete: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Playlist sync failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to sync playlists';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_SYNC_ERROR',
        message,
        error: true,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
