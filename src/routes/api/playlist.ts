import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { generatePlaylist } from '../../lib/services/ollama';
import { getLibrarySummary, search } from '../../lib/services/navidrome';
import { searchIndexedSong } from '../../lib/services/library-index';

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
      console.log('🔍 Library summary for playlist:', summary); // Debug: Log summary
      console.log(`🎯 Generating playlist for style: "${style}"`);
      const { playlist: suggestions } = await generatePlaylist({ style, summary });
      console.log('🎶 Generated playlist suggestions:', suggestions); // Debug: Log raw suggestions from Ollama
      
      const resolvedPlaylist = await Promise.all(
        suggestions.map(async (suggestion, index) => {
          try {
            console.log(`🔍 Resolving song ${index + 1}/5: "${suggestion.song}"`);

            // Parse "Artist - Title" format
            const parts = suggestion.song.split(' - ');

            if (parts.length >= 2) {
              const artistPart = parts[0].trim();
              const titlePart = parts.slice(1).join(' - ').trim(); // Handle titles with " - " in them

              // STRATEGY 1: Search by title first (like the working search page)
              console.log(`🔍 Searching by title: "${titlePart}"`);
              const titleMatches = await search(titlePart, 0, 10);

              // Filter by artist match
              let match = titleMatches.find(s =>
                s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
                artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
              );

              if (match) {
                console.log(`✅ Found by title+artist: "${match.name}" by ${match.artist}`);
                return { ...suggestion, songId: match.id, url: match.url };
              }

              // STRATEGY 2: Search by artist name
              console.log(`🔍 Searching by artist: "${artistPart}"`);
              const artistMatches = await search(artistPart, 0, 10);

              match = artistMatches.find(s =>
                s.title?.toLowerCase().includes(titlePart.toLowerCase()) ||
                s.name?.toLowerCase().includes(titlePart.toLowerCase())
              );

              if (match) {
                console.log(`✅ Found by artist+title: "${match.name}" by ${match.artist}`);
                return { ...suggestion, songId: match.id, url: match.url };
              }

              // STRATEGY 3: Try full string search as last resort
              console.log(`🔍 Searching full string: "${suggestion.song}"`);
              const fullMatches = await search(suggestion.song, 0, 5);

              if (fullMatches.length > 0) {
                match = fullMatches[0];
                console.log(`✅ Found by full search: "${match.name}" by ${match.artist}`);
                return { ...suggestion, songId: match.id, url: match.url };
              }
            } else {
              // No " - " separator, just search the whole thing
              console.log(`🔍 Searching without parse: "${suggestion.song}"`);
              const matches = await search(suggestion.song, 0, 5);

              if (matches.length > 0) {
                const match = matches[0];
                console.log(`✅ Found: "${match.name}" by ${match.artist}`);
                return { ...suggestion, songId: match.id, url: match.url };
              }
            }

            console.log(`❌ No match found for: "${suggestion.song}"`);
            return { ...suggestion, songId: null, url: null, missing: true };
          } catch (error) {
            console.error(`💥 Resolution error for ${suggestion.song}:`, error);
            return { ...suggestion, songId: null, url: null, missing: true };
          }
        })
      );
      console.log('🎵 Final resolved playlist:', resolvedPlaylist); // Debug: Log after Navidrome search resolution
      
      return new Response(JSON.stringify({ data: { playlist: resolvedPlaylist } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('💥 Playlist generation failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to generate playlist';
      if (error instanceof ServiceError) {
        code = error.code;
        message = error.message;
        console.error(`🚨 ServiceError ${code}: ${message}`);
      } else if (error instanceof Error) {
        message = error.message;
        console.error(`🚨 Error: ${message}`);
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
