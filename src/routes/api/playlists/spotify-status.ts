import { createFileRoute } from '@tanstack/react-router';
import { isSpotifyConfigured } from '../../../lib/services/spotify';

const GET = async () => {
  return new Response(
    JSON.stringify({ configured: isSpotifyConfigured() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const Route = createFileRoute('/api/playlists/spotify-status')({
  server: { handlers: { GET } },
});
