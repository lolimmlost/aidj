import { createServerFileRoute } from '@tanstack/react-start/server';
import { generatePlaylist } from '../../lib/services/ollama';
import { getLibrarySummary, search, type Song } from '../../lib/services/navidrome';
import { auth } from '../../lib/auth/auth';

export const ServerRoute = createServerFileRoute('/api/playlist').methods({
  POST: async ({ request }) => {
    // Auth check (protected route)
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
      const { style } = await request.json() as { style: string };
      if (!style) {
        return new Response(JSON.stringify({ error: 'Style required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const summary = await getLibrarySummary();
      const { playlist: suggestions } = await generatePlaylist({ style, summary });
      const resolvedPlaylist = await Promise.all(
        suggestions.map(async (suggestion) => {
          try {
            const matches = await search(suggestion.song, 0, 1);
            if (matches.length > 0) {
              const song: Song = matches[0];
              return { ...suggestion, songId: song.id, url: song.url };
            } else {
              return { ...suggestion, songId: null, url: null, missing: true };
            }
          } catch (error) {
            console.error(`Resolution error for ${suggestion.song}:`, error);
            return { ...suggestion, songId: null, url: null, missing: true };
          }
        })
      );
      return new Response(JSON.stringify({ data: { playlist: resolvedPlaylist } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Playlist generation failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: 'Failed to generate playlist', details: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
