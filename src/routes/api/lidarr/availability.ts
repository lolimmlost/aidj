import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { checkArtistAvailability, checkAlbumAvailability, checkSongAvailability } from '../../../lib/services/lidarr-navidrome';

export const Route = createFileRoute("/api/lidarr/availability")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
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

      const { type, artist, album, song } = await request.json() as {
        type: 'artist' | 'album' | 'song';
        artist?: string;
        album?: string;
        song?: string; // For "Artist - Title" format
      };

      let availability;
      if (type === 'artist' && artist) {
        availability = await checkArtistAvailability(artist);
      } else if (type === 'album' && artist && album) {
        availability = await checkAlbumAvailability(artist, album);
      } else if (type === 'song' && song) {
        const inNavidrome = await checkSongAvailability(song);
        availability = {
          inLidarr: false, // Songs aren't tracked in Lidarr directly
          inNavidrome,
        };
      } else {
        return new Response(JSON.stringify({ error: 'Invalid parameters for availability check' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(availability), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr availability check failed:', error);
      const code = 'GENERAL_API_ERROR';
      let message = 'Lidarr availability check error';
      if (error instanceof ServiceError) {
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});