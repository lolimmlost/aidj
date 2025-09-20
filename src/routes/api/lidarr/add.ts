import { createServerFileRoute } from '@tanstack/react-start/server';
import { searchArtist, addArtistToQueue } from '../../../lib/services/lidarr';

export const ServerRoute = createServerFileRoute('/api/lidarr/add').methods({
  POST: async ({ request }) => {
    // Auth check (protected route)
    const { auth } = await import('../../../lib/auth/server');
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
      const { song } = await request.json() as { song: string };
      console.log('Lidarr add request for song:', song); // Debug
      if (!song) {
        return new Response(JSON.stringify({ error: 'Song suggestion required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Parse "Artist - Title"
      const match = song.match(/^(.+?)\s*-\s*(.+)$/);
      console.log('Parsed artist/title:', match); // Debug
      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid song format. Expected "Artist - Title"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const artistName = match[1].trim();
      const results = await searchArtist(artistName);
      if (results.length === 0) {
        return new Response(JSON.stringify({ error: 'Artist not found in Lidarr search' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const artist = results[0];
      await addArtistToQueue(artist.foreignArtistId, artist.artistName);

      return new Response(JSON.stringify({ success: true, message: `Added "${artist.artistName}" to Lidarr queue.` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr add failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: 'Failed to add to Lidarr', details: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});