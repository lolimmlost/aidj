// API endpoint for AI DJ recommendations
// Story 3.9: AI DJ Toggle Mode
// Phase 3: Updated to use unified recommendations service (Last.fm-based)
// Phase 4: Added queue context for smarter fallback recommendations
// Phase 3.3: Added skip-based scoring integration

import { createFileRoute } from "@tanstack/react-router";
import { getRecommendations } from '@/lib/services/recommendations';
import { getSongsByIds } from '@/lib/services/navidrome';
import type { Song } from '@/lib/types/song';
import { auth } from '@/lib/auth/auth';

// Types for queue context
export interface QueueContext {
  genres: string[];    // Most common genres in queue (sorted by frequency)
  artists: string[];   // Most common artists in queue
  avgDuration?: number; // Average song duration
}

/**
 * Extract context from the current queue to inform fallback recommendations
 * Looks up song metadata server-side since client songs may not have genre info
 *
 * Phase 1.3 Improvements:
 * - Increased sample size from 25 to 50 songs
 * - Added recency weighting (recent songs count more)
 * - Better genre extraction with normalization
 */
async function extractQueueContext(recentQueue?: Song[], fullPlaylist?: Song[]): Promise<QueueContext> {
  // Combine recent queue (prioritized) with full playlist for analysis
  // Phase 1.3: Increased from 20 to 50 for better genre distribution
  const clientSongs = [
    ...(recentQueue || []),
    ...(fullPlaylist?.slice(0, 50) || []), // Increased sample size
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
      // Phase 1.3: Increased from 25 to 50 songs
      const serverSongs = await getSongsByIds(songIds.slice(0, 50));
      if (serverSongs.length > 0) {
        songsWithMetadata = serverSongs;
        console.log(`📊 AI DJ: Fetched ${serverSongs.length} songs with full metadata`);
      }
    } catch (error) {
      console.warn('⚠️ AI DJ: Could not fetch song metadata, using client data:', error);
    }
  }

  // Count genre frequency with recency weighting
  // Phase 1.3: Recent songs (first in array) get higher weight
  const genreCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  let totalDuration = 0;
  let durationCount = 0;

  for (let i = 0; i < songsWithMetadata.length; i++) {
    const song = songsWithMetadata[i];

    // Phase 1.3: Recency weight - exponential decay from 1.0 (most recent) to 0.3 (oldest)
    // Recent queue songs get full weight, older playlist songs get progressively less
    const recencyWeight = Math.max(0.3, 1.0 - (i / songsWithMetadata.length) * 0.7);

    // Genre analysis - check both 'genre' and 'genres' fields
    const genreStr = (song as { genre?: string; genres?: string }).genre ||
                     (song as { genres?: string }).genres || '';
    if (genreStr && genreStr !== 'undefined') {
      // Split on common delimiters (some songs have "Rock, Alternative" etc)
      const genres = genreStr.split(/[,\/;]/).map(g => g.trim().toLowerCase()).filter(Boolean);
      for (const genre of genres) {
        if (genre && genre !== 'unknown') {
          // Phase 1.3: Apply recency weight to genre counts
          const currentCount = genreCounts.get(genre) || 0;
          genreCounts.set(genre, currentCount + recencyWeight);
        }
      }
    }

    // Artist analysis (also with recency weight)
    if (song.artist) {
      const artist = song.artist.toLowerCase();
      const currentCount = artistCounts.get(artist) || 0;
      artistCounts.set(artist, currentCount + recencyWeight);
    }

    // Duration analysis
    if (song.duration && typeof song.duration === 'number') {
      totalDuration += song.duration;
      durationCount++;
    }
  }

  // Sort by weighted frequency
  const genres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  const artists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  console.log(`📊 [QueueContext] Extracted ${genres.length} unique genres, ${artists.length} unique artists from ${songsWithMetadata.length} songs`);

  return {
    genres,
    artists,
    avgDuration: durationCount > 0 ? totalDuration / durationCount : undefined,
  };
}

// Exported POST handler for testing
export async function POST({ request }: { request: Request }) {
    try {
      // Phase 3.3: Get user session for skip-based scoring
      const session = await auth.api.getSession({ headers: request.headers });
      const userId = session?.user?.id;

      const body = await request.json();
      const { currentSong, recentQueue, fullPlaylist, batchSize, excludeSongIds, excludeArtists, artistBatchCounts, genreExploration, skipAutoRefresh } = body as {
        currentSong: Song;
        recentQueue?: Song[];
        fullPlaylist?: Song[];
        currentSongIndex?: number;
        batchSize: number;
        useFeedbackForPersonalization?: boolean;
        excludeSongIds?: string[];
        excludeArtists?: string[];
        artistBatchCounts?: Record<string, number>; // Phase 1.2: Artist counts for cross-batch diversity
        genreExploration?: number; // Phase 4.2: Genre exploration level 0-100
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

      console.log(`🎵 AI DJ: Getting similar songs for "${currentSong.artist} - ${currentSong.title}" (userId: ${userId || 'anonymous'})`);

      // Extract queue context for smarter fallback
      // Analyze genres and artists from recent queue to inform recommendations
      const queueContext = await extractQueueContext(recentQueue, fullPlaylist);

      // Phase 1.2: Add artist batch counts to queue context
      if (artistBatchCounts) {
        queueContext.artistBatchCounts = artistBatchCounts;
      }

      // Phase 4.2: Add genre exploration level to queue context
      if (genreExploration !== undefined) {
        queueContext.genreExploration = genreExploration;
      }

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
        queueContext, // Pass queue context for smarter fallback (includes artistBatchCounts)
        userId, // Phase 3.3: Pass userId for skip-based scoring
      });

      console.log(`✅ AI DJ: Got ${result.songs.length} recommendations from ${result.source}`);

      // Phase 4.1: Calculate artist fatigue for the recommended artists
      const artistFatigueCooldowns: Record<string, number> = {};

      if (userId) {
        try {
          const { calculateArtistFatigue } = await import('@/lib/services/artist-fatigue');

          // Get unique artists from recommendations
          const recommendedArtists = [...new Set(result.songs.map(s => s.artist).filter(Boolean))];

          if (recommendedArtists.length > 0) {
            const fatigueMap = await calculateArtistFatigue(userId, recommendedArtists);

            // Build cooldown map for artists that hit fatigue threshold
            for (const [artist, fatigue] of fatigueMap.entries()) {
              if (fatigue.onCooldown && fatigue.cooldownUntil) {
                artistFatigueCooldowns[artist.toLowerCase()] = fatigue.cooldownUntil;

                console.log(`⚠️ Artist fatigue: ${artist} on cooldown until ${new Date(fatigue.cooldownUntil).toLocaleString()} (${fatigue.playedSongs}/${fatigue.totalSongs} songs played)`);
              }
            }
          }
        } catch (error) {
          console.warn('Artist fatigue calculation failed:', error);
          // Non-blocking - continue without fatigue data
        }
      }

      return new Response(
        JSON.stringify({
          recommendations: result.songs,
          skipAutoRefresh: skipAutoRefresh || false,
          source: result.source,
          artistFatigueCooldowns, // Phase 4.1: Send artist fatigue info to client
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
