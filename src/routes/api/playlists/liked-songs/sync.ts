import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../../lib/auth/auth';
import { getStarredSongs } from '../../../../lib/services/navidrome';
import { ensureNavidromeUser } from '../../../../lib/services/navidrome-users';
import { syncLikedSongsToFeedback, rebuildLikedSongsPlaylist } from '../../../../lib/services/liked-songs-sync';

export const Route = createFileRoute("/api/playlists/liked-songs/sync")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const userId = session.user.id;

      console.log(`🔄 Syncing Liked Songs playlist for user ${userId}`);

      const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
      const starredSongs = await getStarredSongs(creds);
      console.log(`⭐ Found ${starredSongs.length} starred songs in Navidrome`);

      const { songCount } = await rebuildLikedSongsPlaylist(userId, starredSongs);

      try {
        const syncResult = await syncLikedSongsToFeedback(userId);
        console.log(`💜 Feedback sync: ${syncResult.synced} synced, ${syncResult.unchanged} unchanged`);
      } catch (feedbackSyncError) {
        console.error('Failed to sync liked songs to feedback (non-blocking):', feedbackSyncError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { songCount },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error: unknown) {
      console.error('Failed to sync Liked Songs playlist:', error);

      const message = error instanceof Error ? error.message : 'Failed to sync Liked Songs playlist';
      return new Response(
        JSON.stringify({ error: message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
    },
  },
});
