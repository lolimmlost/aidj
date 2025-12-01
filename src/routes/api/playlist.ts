import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { generatePlaylist, type SourceMode } from '../../lib/services/ollama';
import { getLibrarySummary, search } from '../../lib/services/navidrome';
import { searchIndexedSong } from '../../lib/services/library-index';

// Story 7.1: Request body interface with source mode
interface PlaylistRequestBody {
  style: string;
  sourceMode?: SourceMode;
  mixRatio?: number;
}

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
      const { style, sourceMode = 'library', mixRatio = 70 } = await request.json() as PlaylistRequestBody;
      if (!style) {
        return new Response(JSON.stringify({ error: 'Style required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const summary = await getLibrarySummary();
      console.log('🔍 Library summary for playlist:', summary); // Debug: Log summary
      console.log(`🎯 Generating playlist for style: "${style}", sourceMode: ${sourceMode}, mixRatio: ${mixRatio}%`);
      const { playlist: suggestions } = await generatePlaylist({
        style,
        sourceMode,
        mixRatio,
        userId: session.user?.id,
      });
      console.log('🎶 Generated playlist suggestions:', suggestions); // Debug: Log raw suggestions from Ollama

      const resolvedPlaylist = await Promise.all(
        suggestions.map(async (suggestion, index) => {
          try {
            // Story 7.1: Clean up song name (remove source markers like "(library)" or "(discovery)")
            let cleanSongName = suggestion.song.replace(/\s*\((library|discovery)\)\s*$/i, '').trim();
            const isDiscovery = suggestion.isDiscovery || suggestion.song.toLowerCase().includes('(discovery)');

            console.log(`🔍 Resolving song ${index + 1}/5: "${cleanSongName}" (discovery: ${isDiscovery})`);

            // Parse "Artist - Title" format
            const parts = cleanSongName.split(' - ');

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
                return {
                  ...suggestion,
                  song: cleanSongName,
                  songId: match.id,
                  url: match.url,
                  isDiscovery: false, // Found in library, so not a discovery
                  inLibrary: true,
                };
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
                return {
                  ...suggestion,
                  song: cleanSongName,
                  songId: match.id,
                  url: match.url,
                  isDiscovery: false,
                  inLibrary: true,
                };
              }

              // STRATEGY 3: Try full string search as last resort
              console.log(`🔍 Searching full string: "${cleanSongName}"`);
              const fullMatches = await search(cleanSongName, 0, 5);

              if (fullMatches.length > 0) {
                match = fullMatches[0];
                console.log(`✅ Found by full search: "${match.name}" by ${match.artist}`);
                return {
                  ...suggestion,
                  song: cleanSongName,
                  songId: match.id,
                  url: match.url,
                  isDiscovery: false,
                  inLibrary: true,
                };
              }
            } else {
              // No " - " separator, just search the whole thing
              console.log(`🔍 Searching without parse: "${cleanSongName}"`);
              const matches = await search(cleanSongName, 0, 5);

              if (matches.length > 0) {
                const match = matches[0];
                console.log(`✅ Found: "${match.name}" by ${match.artist}`);
                return {
                  ...suggestion,
                  song: cleanSongName,
                  songId: match.id,
                  url: match.url,
                  isDiscovery: false,
                  inLibrary: true,
                };
              }
            }

            // Story 7.1: Handle discovery songs differently - they're not expected to be in library
            console.log(`${isDiscovery ? '🔮' : '❌'} ${isDiscovery ? 'Discovery song (not in library)' : 'No match found for'}: "${cleanSongName}"`);
            return {
              ...suggestion,
              song: cleanSongName,
              songId: null,
              url: null,
              missing: !isDiscovery, // Only mark as missing if it was supposed to be in library
              isDiscovery: isDiscovery,
              inLibrary: false,
            };
          } catch (error) {
            console.error(`💥 Resolution error for ${suggestion.song}:`, error);
            return {
              ...suggestion,
              songId: null,
              url: null,
              missing: true,
              isDiscovery: suggestion.isDiscovery || false,
              inLibrary: false,
            };
          }
        })
      );
      console.log('🎵 Final resolved playlist:', resolvedPlaylist); // Debug: Log after Navidrome search resolution

      // Story 7.1: Include sourceMode in response for UI to use
      return new Response(JSON.stringify({
        data: {
          playlist: resolvedPlaylist,
          sourceMode,
          mixRatio,
        }
      }), {
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
