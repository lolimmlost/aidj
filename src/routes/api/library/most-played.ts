import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { getMostPlayedSongs } from '../../../lib/services/navidrome';

export const Route = createFileRoute("/api/library/most-played")({
  server: {
    handlers: {
  /**
   * GET /api/library/most-played
   * Returns most played songs from Navidrome
   */
  GET: async ({ request }) => {
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
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '5');

      const songs = await getMostPlayedSongs(limit);

      // Map to a simpler format for the UI
      const formattedSongs = songs.map(song => ({
        id: song.id,
        name: song.title,
        artist: song.artist,
        album: song.album,
        albumId: song.albumId,
        url: `/api/navidrome/stream/${song.id}`,
      }));

      return new Response(JSON.stringify({ songs: formattedSongs }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Failed to fetch most played songs:', error);
      return new Response(JSON.stringify({
        error: 'Failed to fetch most played songs',
        songs: []
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
    },
  },
});
