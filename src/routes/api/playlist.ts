import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { generatePlaylist, type SourceMode } from '../../lib/services/ollama';
import { getLibrarySummary, search } from '../../lib/services/navidrome';
import { searchIndexedSong, getIndexedArtists } from '../../lib/services/library-index';
import { getConfigAsync } from '../../lib/config/config';
import { LastFmClient, type EnrichedTrack } from '../../lib/services/lastfm';

// Story 7.1: Request body interface with source mode
interface PlaylistRequestBody {
  style: string;
  sourceMode?: SourceMode;
  mixRatio?: number;
}

// Map common style terms to Last.fm tags
function getLastFmTags(style: string): string[] {
  const styleLower = style.toLowerCase();

  // Direct tag mappings for common styles
  const tagMappings: Record<string, string[]> = {
    'chill': ['chill', 'chillout', 'ambient', 'downtempo'],
    'electronic': ['electronic', 'electronica', 'edm'],
    'rock': ['rock', 'alternative rock', 'indie rock'],
    'jazz': ['jazz', 'smooth jazz', 'jazz fusion'],
    'classical': ['classical', 'orchestral', 'piano'],
    'hip hop': ['hip-hop', 'hip hop', 'rap'],
    'metal': ['metal', 'heavy metal', 'hard rock'],
    'pop': ['pop', 'indie pop', 'synth pop'],
    'country': ['country', 'americana', 'folk'],
    'folk': ['folk', 'acoustic', 'singer-songwriter'],
    'r&b': ['rnb', 'r&b', 'soul'],
    'soul': ['soul', 'neo-soul', 'motown'],
    'blues': ['blues', 'blues rock'],
    'funk': ['funk', 'disco', 'boogie'],
    'reggae': ['reggae', 'dub', 'ska'],
    'punk': ['punk', 'punk rock', 'post-punk'],
    'indie': ['indie', 'indie rock', 'indie pop'],
    'ambient': ['ambient', 'atmospheric', 'drone'],
    'dance': ['dance', 'house', 'techno'],
    'workout': ['workout', 'gym', 'energy'],
    'party': ['party', 'dance', 'club'],
    'focus': ['focus', 'study', 'instrumental'],
    'sleep': ['sleep', 'relaxing', 'ambient'],
    'sad': ['sad', 'melancholy', 'emotional'],
    'happy': ['happy', 'upbeat', 'feel good'],
    'romantic': ['romantic', 'love', 'love songs'],
  };

  // Check for direct matches
  for (const [key, tags] of Object.entries(tagMappings)) {
    if (styleLower.includes(key)) {
      return tags;
    }
  }

  // If no mapping, use the style itself as a tag
  return [style];
}

// Story 7.2: Generate discovery suggestions using Last.fm
async function generateLastFmDiscoveries(
  style: string,
  count: number,
  existingSongIds: Set<string>
): Promise<EnrichedTrack[]> {
  const config = await getConfigAsync();
  if (!config.lastfmApiKey) {
    console.log('🔮 Last.fm not configured, skipping discovery');
    return [];
  }

  const client = new LastFmClient({ apiKey: config.lastfmApiKey });
  const discoveries: EnrichedTrack[] = [];
  const usedArtists = new Set<string>();

  try {
    // Strategy 1: Use tag-based discovery for style-specific searches
    const tags = getLastFmTags(style);
    console.log(`🔮 Trying tag-based discovery with tags: ${tags.join(', ')}`);

    for (const tag of tags) {
      if (discoveries.length >= count) break;

      try {
        const tagTracks = await client.getTopTracksByTag(tag, 30);

        for (const track of tagTracks) {
          if (discoveries.length >= count) break;
          if (track.inLibrary) continue; // Skip tracks already in library
          if (usedArtists.has(track.artist.toLowerCase())) continue;
          if (existingSongIds.has(`${track.artist}-${track.name}`.toLowerCase())) continue;

          usedArtists.add(track.artist.toLowerCase());
          discoveries.push(track);
          existingSongIds.add(`${track.artist}-${track.name}`.toLowerCase());
          console.log(`🔮 Tag discovery: ${track.artist} - ${track.name} (tag: ${tag})`);
        }
      } catch (error) {
        console.warn(`[Last.fm] Error getting tracks for tag "${tag}":`, error);
      }
    }

    // Strategy 2: If we didn't get enough from tags, supplement with similar artists
    if (discoveries.length < count) {
      console.log(`🔮 Tag discovery found ${discoveries.length}/${count}, supplementing with similar artists`);

      const libraryArtists = await getIndexedArtists();
      const randomArtists = libraryArtists
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);

      for (const artist of randomArtists) {
        if (discoveries.length >= count) break;

        try {
          const similarArtists = await client.getSimilarArtists(artist, 5);

          for (const simArtist of similarArtists) {
            if (discoveries.length >= count) break;
            if (simArtist.inLibrary) continue;
            if (usedArtists.has(simArtist.name.toLowerCase())) continue;

            const topTracks = await client.getTopTracks(simArtist.name, 3);

            for (const track of topTracks) {
              if (discoveries.length >= count) break;
              if (track.inLibrary) continue;
              if (existingSongIds.has(`${track.artist}-${track.name}`.toLowerCase())) continue;

              usedArtists.add(track.artist.toLowerCase());
              discoveries.push(track);
              existingSongIds.add(`${track.artist}-${track.name}`.toLowerCase());
              console.log(`🔮 Similar artist discovery: ${track.artist} - ${track.name} (similar to ${artist})`);
              break;
            }
          }
        } catch (error) {
          console.warn(`[Last.fm] Error getting discoveries for artist "${artist}":`, error);
        }
      }
    }

    console.log(`🔮 Found ${discoveries.length} Last.fm discoveries total`);
  } catch (error) {
    console.error('[Last.fm] Discovery generation failed:', error);
  }

  return discoveries;
}

// Helper to loosely match tracks to requested style
function matchTrackToStyle(track: EnrichedTrack, style: string): boolean {
  const styleLower = style.toLowerCase();
  const trackInfo = `${track.artist} ${track.name}`.toLowerCase();

  // Simple keyword matching for common styles
  const styleKeywords: Record<string, string[]> = {
    'rock': ['rock', 'guitar', 'metal', 'punk', 'alternative'],
    'electronic': ['electronic', 'edm', 'house', 'techno', 'synth', 'dance'],
    'jazz': ['jazz', 'blues', 'swing', 'soul'],
    'classical': ['classical', 'orchestra', 'symphony', 'piano'],
    'hip hop': ['hip hop', 'rap', 'hiphop', 'urban'],
    'country': ['country', 'western', 'folk', 'bluegrass'],
    'pop': ['pop', 'top 40', 'chart'],
    'chill': ['chill', 'ambient', 'relax', 'lounge', 'calm'],
    'party': ['party', 'dance', 'club', 'upbeat', 'fun'],
    'workout': ['workout', 'energy', 'power', 'pump', 'motivation'],
    'focus': ['focus', 'study', 'concentration', 'ambient'],
    'halloween': ['halloween', 'spooky', 'horror', 'dark', 'scary', 'monster'],
  };

  // Check if style matches any keywords
  for (const [category, keywords] of Object.entries(styleKeywords)) {
    if (styleLower.includes(category)) {
      // Already broad match on category name
      return true;
    }
    if (keywords.some(kw => styleLower.includes(kw))) {
      // Style contains a keyword
      return true;
    }
  }

  // For generic/unknown styles, accept all tracks
  return true;
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

      // Story 7.2: Different generation strategies based on source mode
      const config = await getConfigAsync();
      const hasLastFm = !!config.lastfmApiKey;
      console.log(`🔑 Last.fm config check: hasLastFm=${hasLastFm}, keyLength=${config.lastfmApiKey?.length || 0}`);
      const existingSongIds = new Set<string>();

      // Story 7.2: Track discovery source for UI visualization
      type DiscoverySource = 'lastfm' | 'ollama' | 'library';
      let suggestions: { song: string; explanation: string; isDiscovery?: boolean; discoverySource?: DiscoverySource }[] = [];

      if (sourceMode === 'discovery' && hasLastFm) {
        // Pure discovery mode: Use Last.fm to find songs not in library
        console.log('🔮 Discovery mode: Using Last.fm for recommendations');
        const discoveries = await generateLastFmDiscoveries(style, 5, existingSongIds);

        if (discoveries.length > 0) {
          suggestions = discoveries.map(track => ({
            song: `${track.artist} - ${track.name}`,
            explanation: `Discovered via Last.fm - similar to artists in your library`,
            isDiscovery: true,
            discoverySource: 'lastfm' as DiscoverySource,
          }));
        }

        // If Last.fm didn't return enough, fall back to Ollama
        if (suggestions.length < 5) {
          console.log(`🔮 Last.fm returned ${suggestions.length} tracks, supplementing with Ollama`);
          const ollamaResult = await generatePlaylist({
            style,
            sourceMode: 'discovery',
            mixRatio,
            userId: session.user?.id,
          });
          const ollamaSuggestions = ollamaResult.playlist.slice(0, 5 - suggestions.length).map(s => ({
            ...s,
            isDiscovery: true,
            discoverySource: 'ollama' as DiscoverySource,
          }));
          suggestions = [...suggestions, ...ollamaSuggestions];
        }
      } else if (sourceMode === 'mix' && hasLastFm) {
        // Mix mode: Blend library songs with Last.fm discoveries
        const libraryCount = Math.round(5 * (mixRatio / 100));
        const discoveryCount = 5 - libraryCount;

        console.log(`🔮 Mix mode: ${libraryCount} library + ${discoveryCount} discoveries`);

        // Get library songs from Ollama
        const libraryResult = await generatePlaylist({
          style,
          sourceMode: 'library',
          mixRatio: 100,
          userId: session.user?.id,
        });

        const librarySongs = libraryResult.playlist.slice(0, libraryCount).map(s => ({
          ...s,
          isDiscovery: false,
          discoverySource: 'library' as DiscoverySource,
        }));

        // Get discovery songs from Last.fm
        const discoveries = await generateLastFmDiscoveries(style, discoveryCount, existingSongIds);
        const discoverySongs: { song: string; explanation: string; isDiscovery: boolean; discoverySource: DiscoverySource }[] = discoveries.map(track => ({
          song: `${track.artist} - ${track.name}`,
          explanation: `Discovered via Last.fm - similar to artists in your library`,
          isDiscovery: true,
          discoverySource: 'lastfm' as DiscoverySource,
        }));

        // If Last.fm didn't return enough discoveries, try Ollama
        if (discoverySongs.length < discoveryCount) {
          console.log(`🔮 Last.fm returned ${discoverySongs.length} discoveries, supplementing with Ollama`);
          const ollamaDiscoveries = await generatePlaylist({
            style,
            sourceMode: 'discovery',
            mixRatio: 0,
            userId: session.user?.id,
          });
          const additionalDiscoveries = ollamaDiscoveries.playlist
            .filter(s => s.isDiscovery)
            .slice(0, discoveryCount - discoverySongs.length)
            .map(s => ({ ...s, isDiscovery: true, discoverySource: 'ollama' as DiscoverySource }));
          discoverySongs.push(...additionalDiscoveries);
        }

        // Interleave library and discovery songs for variety
        suggestions = [];
        let libIdx = 0, discIdx = 0;
        for (let i = 0; i < 5; i++) {
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
        // Library mode or no Last.fm: Use Ollama as before
        const ollamaResult = await generatePlaylist({
          style,
          sourceMode,
          mixRatio,
          userId: session.user?.id,
        });
        suggestions = ollamaResult.playlist.map(s => ({
          ...s,
          discoverySource: (s.isDiscovery ? 'ollama' : 'library') as DiscoverySource,
        }));
      }

      console.log('🎶 Generated playlist suggestions:', suggestions); // Debug: Log raw suggestions

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
                  discoverySource: 'library' as DiscoverySource,
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
                  discoverySource: 'library' as DiscoverySource,
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
                  discoverySource: 'library' as DiscoverySource,
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
                  discoverySource: 'library' as DiscoverySource,
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
