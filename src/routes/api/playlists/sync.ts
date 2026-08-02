import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { syncNavidromePlaylists } from '../../../lib/services/playlist-sync';
import { syncLikedSongsToFeedback, rebuildLikedSongsPlaylist } from '../../../lib/services/liked-songs-sync';
import { getStarredSongs } from '../../../lib/services/navidrome';
import { ensureNavidromeUser } from '../../../lib/services/navidrome-users';

export const Route = createFileRoute("/api/playlists/sync")({
  server: {
    handlers: {
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

      // Also rebuild the Liked Songs playlist and sync feedback — the Liked
      // Songs playlist has navidromeId: null so syncNavidromePlaylists skips it.
      try {
        const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
        const starredSongs = await getStarredSongs(creds);
        await rebuildLikedSongsPlaylist(session.user.id, starredSongs);
        await syncLikedSongsToFeedback(session.user.id);
      } catch (e) {
        console.error('Liked songs sync failed (non-blocking):', e);
      }

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

      // Check if error is due to Navidrome unavailability
      const isUnavailable = message.includes('NAVIDROME_TIMEOUT_ERROR') ||
                           message.includes('NAVIDROME_API_ERROR') ||
                           message.includes('Failed to fetch');

      if (isUnavailable) {
        return new Response(JSON.stringify({
          code: 'NAVIDROME_UNAVAILABLE',
          message: 'Navidrome is currently unavailable. Showing cached playlists.',
          error: true,
        }), {
          status: 503, // Service Unavailable
          headers: { 'Content-Type': 'application/json' }
        });
      }

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
    },
  },
});
