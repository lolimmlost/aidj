// API endpoint for AI DJ recommendations
// Story 3.9: AI DJ Toggle Mode
// Phase 3: Updated to use unified recommendations service (Last.fm-based)
// Phase 4: Added queue context for smarter fallback recommendations

import { createFileRoute } from "@tanstack/react-router";
import { getRecommendations } from '@/lib/services/recommendations';
import { getSongsByIds } from '@/lib/services/navidrome';
import type { Song } from '@/lib/types/song';

// Types for queue context
export interface QueueContext {
  genres: string[];    // Most common genres in queue (sorted by frequency)
  artists: string[];   // Most common artists in queue
  avgDuration?: number; // Average song duration
}

/**
 * Extract context from the current queue to inform fallback recommendations
 * Looks up song metadata server-side since client songs may not have genre info
 */
async function extractQueueContext(recentQueue?: Song[], fullPlaylist?: Song[]): Promise<QueueContext> {
  // Combine recent queue (prioritized) with full playlist for analysis
  const clientSongs = [
    ...(recentQueue || []),
    ...(fullPlaylist?.slice(0, 20) || []), // Only look at first 20 of playlist
  ];

  if (clientSongs.length === 0) {
    return { genres: [], artists: [] };
  }

  // Get song IDs to look up full metadata server-side
  const songIds = clientSongs.map(s => s.id).filter(Boolean);

  // Try to get full song metadata from Navidrome (includes genre)
  let songsWithMetadata: Song[] = clientSongs;
  if (songIds.length > 0) {
    try {
      const serverSongs = await getSongsByIds(songIds.slice(0, 25)); // Limit to 25 to avoid huge requests
      if (serverSongs.length > 0) {
        songsWithMetadata = serverSongs;
        console.log(`📊 AI DJ: Fetched ${serverSongs.length} songs with full metadata`);
      }
    } catch (error) {
      console.warn('⚠️ AI DJ: Could not fetch song metadata, using client data:', error);
    }
  }

  // Count genre frequency
  const genreCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  let totalDuration = 0;
  let durationCount = 0;

  for (const song of songsWithMetadata) {
    // Genre analysis - check both 'genre' and 'genres' fields
    const genreStr = (song as { genre?: string; genres?: string }).genre ||
                     (song as { genres?: string }).genres || '';
    if (genreStr && genreStr !== 'undefined') {
      // Split on common delimiters (some songs have "Rock, Alternative" etc)
      const genres = genreStr.split(/[,\/;]/).map(g => g.trim().toLowerCase()).filter(Boolean);
      for (const genre of genres) {
        if (genre && genre !== 'unknown') {
          genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
        }
      }
    }

    // Artist analysis
    if (song.artist) {
      const artist = song.artist.toLowerCase();
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }

    // Duration analysis
    if (song.duration && typeof song.duration === 'number') {
      totalDuration += song.duration;
      durationCount++;
    }
  }

  // Sort by frequency
  const genres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  const artists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  return {
    genres,
    artists,
    avgDuration: durationCount > 0 ? totalDuration / durationCount : undefined,
  };
}

// Exported POST handler for testing
export async function POST({ request }: { request: Request }) {
    try {
      const body = await request.json();
      const { currentSong, recentQueue, fullPlaylist, batchSize, excludeSongIds, excludeArtists, skipAutoRefresh } = body as {
        currentSong: Song;
        recentQueue?: Song[];
        fullPlaylist?: Song[];
        currentSongIndex?: number;
        batchSize: number;
        useFeedbackForPersonalization?: boolean;
        excludeSongIds?: string[];
        excludeArtists?: string[];
        skipAutoRefresh?: boolean;
      };

      if (!currentSong) {
        return new Response(
          JSON.stringify({ message: 'Current song is required' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(`🎵 AI DJ: Getting similar songs for "${currentSong.artist} - ${currentSong.title}"`);

      // Extract queue context for smarter fallback
      // Analyze genres and artists from recent queue to inform recommendations
      const queueContext = await extractQueueContext(recentQueue, fullPlaylist);
      if (queueContext.genres.length > 0) {
        console.log(`📊 AI DJ: Queue context - genres: ${queueContext.genres.slice(0, 3).join(', ')}, artists: ${queueContext.artists.slice(0, 3).join(', ')}`);
      } else {
        // Debug: check if songs were provided but had no genres
        const songCount = (recentQueue?.length || 0) + (fullPlaylist?.slice(0, 20)?.length || 0);
        if (songCount > 0) {
          const sampleSong = recentQueue?.[0] || fullPlaylist?.[0];
          console.log(`⚠️ AI DJ: No genres found in ${songCount} queue songs. Sample song: "${sampleSong?.artist}" has genre: "${sampleSong?.genre}"`);
        }
      }

      // Use the unified recommendations service with 'similar' mode
      // This now uses Last.fm for song similarity (much faster and more accurate)
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: {
          artist: currentSong.artist,
          title: currentSong.title || currentSong.name,
          genre: currentSong.genre || queueContext.genres[0], // Pass genre for fallback
        },
        limit: batchSize || 3,
        excludeSongIds: excludeSongIds || [],
        excludeArtists: excludeArtists || [],
        queueContext, // Pass queue context for smarter fallback
      });

      console.log(`✅ AI DJ: Got ${result.songs.length} recommendations from ${result.source}`);

      return new Response(
        JSON.stringify({
          recommendations: result.songs,
          skipAutoRefresh: skipAutoRefresh || false,
          source: result.source,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('AI DJ API error:', error);
      return new Response(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Failed to generate AI DJ recommendations',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
}

export const Route = createFileRoute("/api/ai-dj/recommendations")({
  server: {
    handlers: {
  POST
    },
  },
});
