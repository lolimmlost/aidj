import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { generatePlaylist } from '../../lib/services/ollama';
import { getLibrarySummary, search, type Song } from '../../lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/playlist').methods({
  POST: async ({ request }) => {
    // Auth check (protected route)
    const { auth } = await import('../../lib/auth/server');
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
      console.log('Library summary for playlist:', summary); // Debug: Log summary
      const { playlist: suggestions } = await generatePlaylist({ style, summary });
      console.log('Generated playlist suggestions:', suggestions); // Debug: Log raw suggestions from Ollama
      
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
      console.log('Resolved playlist:', resolvedPlaylist); // Debug: Log after Navidrome search resolution
      
      return new Response(JSON.stringify({ data: { playlist: resolvedPlaylist } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Playlist generation failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to generate playlist';
      if (error instanceof ServiceError) {
        code = error.code;
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
