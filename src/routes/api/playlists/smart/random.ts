import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../../lib/auth/auth';
import {
  getRandomSongsFromRules,
  getRandomSongsFiltered,
  type SmartPlaylistRules,
} from '../../../../lib/services/navidrome-smart-playlists';

export const Route = createFileRoute("/api/playlists/smart/random")({
  server: {
    handlers: {
  // POST /api/playlists/smart/random - Get random songs matching rules (for queue generation)
  POST: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();
      const { rules, filters, count = 50 } = body;

      let songs;
      if (rules) {
        // Full rule set — use smart playlist rules
        console.log(`🎲 Getting ${count} random songs from smart playlist rules`);
        songs = await getRandomSongsFromRules(rules as SmartPlaylistRules, count);
      } else if (filters) {
        // Simple filters — convenience for queue generation
        console.log(`🎲 Getting ${count} random songs with filters:`, filters);
        songs = await getRandomSongsFiltered({ ...filters, count });
      } else {
        // No rules or filters — just get random songs
        console.log(`🎲 Getting ${count} truly random songs`);
        songs = await getRandomSongsFiltered({ count });
      }

      console.log(`✅ Got ${songs.length} random songs`);

      return new Response(JSON.stringify({
        data: { songs, count: songs.length }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to get random songs:', error);
      const message = error instanceof Error ? error.message : 'Failed to get random songs';
      return new Response(JSON.stringify({
        code: 'RANDOM_SONGS_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
