// API endpoint for playlist generation
// Phase 3: Updated to use unified recommendations service

import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { getRecommendations } from '../../lib/services/recommendations';
import { search } from '../../lib/services/navidrome';

// Story 7.1: Request body interface with source mode
export type SourceMode = 'library' | 'discovery' | 'mix';

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

      console.log(`🎯 Generating playlist for style: "${style}", sourceMode: ${sourceMode}, mixRatio: ${mixRatio}%`);

      // Track discovery source for UI visualization
      type DiscoverySource = 'lastfm' | 'smart-playlist' | 'library';

      // Use the unified recommendations service
      // - 'library' mode: Use 'mood' mode which returns songs from your library
      // - 'discovery' mode: Use Last.fm to find songs NOT in your library
      // - 'mix' mode: Combine both

      const limit = 5;
      let suggestions: { song: string; explanation: string; isDiscovery: boolean; discoverySource: DiscoverySource; songId?: string | null; url?: string | null; inLibrary?: boolean }[] = [];

      if (sourceMode === 'discovery') {
        // Discovery mode: Find songs NOT in library using Last.fm
        // First, we need a seed song - use mood to get one from library
        console.log('🔮 Discovery mode: Finding similar songs not in library');

        // Get a library song matching the mood to use as seed
        const moodResult = await getRecommendations({
          mode: 'mood',
          moodDescription: style,
          limit: 1,
        });

        if (moodResult.songs.length > 0) {
          const seedSong = moodResult.songs[0];

          // Use that song to find discoveries
          const discoveryResult = await getRecommendations({
            mode: 'discovery',
            currentSong: { artist: seedSong.artist, title: seedSong.title },
            limit,
          });

          suggestions = discoveryResult.songs.map(song => ({
            song: `${song.artist} - ${song.title}`,
            explanation: `Discovered via Last.fm - similar to "${seedSong.artist}"`,
            isDiscovery: true,
            discoverySource: 'lastfm' as DiscoverySource,
            songId: null, // Discovery songs aren't in library
            url: song.url || null,
            inLibrary: false,
          }));
        }

        // Fall back to mood-based if no discoveries found
        if (suggestions.length === 0) {
          console.log('⚠️ No discoveries found, falling back to library songs');
          const fallbackResult = await getRecommendations({
            mode: 'mood',
            moodDescription: style,
            limit,
          });

          suggestions = fallbackResult.songs.map(song => ({
            song: `${song.artist} - ${song.title}`,
            explanation: `Matched your mood: "${style}"`,
            isDiscovery: false,
            discoverySource: 'smart-playlist' as DiscoverySource,
            songId: song.id,
            url: song.url,
            inLibrary: true,
          }));
        }
      } else if (sourceMode === 'mix') {
        // Mix mode: Blend library songs with discoveries
        const libraryCount = Math.round(limit * (mixRatio / 100));
        const discoveryCount = limit - libraryCount;

        console.log(`🔮 Mix mode: ${libraryCount} library + ${discoveryCount} discoveries`);

        // Get library songs using mood
        const libraryResult = await getRecommendations({
          mode: 'mood',
          moodDescription: style,
          limit: libraryCount,
        });

        const librarySongs = libraryResult.songs.map(song => ({
          song: `${song.artist} - ${song.title}`,
          explanation: `Matched your mood: "${style}"`,
          isDiscovery: false,
          discoverySource: 'smart-playlist' as DiscoverySource,
          songId: song.id,
          url: song.url,
          inLibrary: true,
        }));

        // Get discoveries using the first library song as seed
        let discoverySongs: typeof librarySongs = [];
        if (libraryResult.songs.length > 0 && discoveryCount > 0) {
          const seedSong = libraryResult.songs[0];
          const discoveryResult = await getRecommendations({
            mode: 'discovery',
            currentSong: { artist: seedSong.artist, title: seedSong.title },
            limit: discoveryCount,
          });

          discoverySongs = discoveryResult.songs.map(song => ({
            song: `${song.artist} - ${song.title}`,
            explanation: `Discovered via Last.fm - similar to "${seedSong.artist}"`,
            isDiscovery: true,
            discoverySource: 'lastfm' as DiscoverySource,
            songId: null,
            url: song.url || null,
            inLibrary: false,
          }));
        }

        // Interleave library and discovery songs for variety
        let libIdx = 0, discIdx = 0;
        for (let i = 0; i < limit; i++) {
          if (i % 2 === 0 && libIdx < librarySongs.length) {
            suggestions.push(librarySongs[libIdx++]);
          } else if (discIdx < discoverySongs.length) {
            suggestions.push(discoverySongs[discIdx++]);
          } else if (libIdx < librarySongs.length) {
            suggestions.push(librarySongs[libIdx++]);
          } else if (discIdx < discoverySongs.length) {
            suggestions.push(discoverySongs[discIdx++]);
          }
        }
      } else {
        // Library mode: Use mood-based recommendations (smart playlist)
        console.log('📚 Library mode: Using smart playlist evaluation');
        const result = await getRecommendations({
          mode: 'mood',
          moodDescription: style,
          limit,
        });

        suggestions = result.songs.map(song => ({
          song: `${song.artist} - ${song.title}`,
          explanation: `Matched your mood: "${style}"`,
          isDiscovery: false,
          discoverySource: 'smart-playlist' as DiscoverySource,
          songId: song.id,
          url: song.url,
          inLibrary: true,
        }));
      }

      console.log('🎶 Generated playlist suggestions:', suggestions.map(s => s.song));

      // For library songs, verify they exist (in case of caching issues)
      const resolvedPlaylist = await Promise.all(
        suggestions.map(async (suggestion) => {
          // If already resolved (has songId), return as-is
          if (suggestion.songId) {
            return {
              ...suggestion,
              missing: false,
            };
          }

          // For discovery songs, don't try to resolve
          if (suggestion.isDiscovery) {
            return {
              ...suggestion,
              missing: false,
            };
          }

          // Try to resolve library songs that don't have IDs
          const parts = suggestion.song.split(' - ');
          if (parts.length >= 2) {
            const artistPart = parts[0].trim();
            const titlePart = parts.slice(1).join(' - ').trim();

            const matches = await search(titlePart, 0, 5);
            const match = matches.find(s =>
              s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
              artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
            );

            if (match) {
              return {
                ...suggestion,
                songId: match.id,
                url: match.url,
                inLibrary: true,
                missing: false,
              };
            }
          }

          return {
            ...suggestion,
            missing: true,
          };
        })
      );

      console.log('🎵 Final resolved playlist:', resolvedPlaylist.map(p => ({ song: p.song, inLibrary: p.inLibrary })));

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
