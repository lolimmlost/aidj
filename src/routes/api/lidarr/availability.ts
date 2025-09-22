import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../../lib/utils';
import { checkArtistAvailability, checkAlbumAvailability, checkSongAvailability } from '../../../lib/services/lidarr-navidrome';

export const ServerRoute = createServerFileRoute('/api/lidarr/availability').methods({
  POST: async ({ request }) => {
    try {
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
});