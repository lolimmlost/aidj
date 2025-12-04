// API endpoint for AI DJ recommendations
// Story 3.9: AI DJ Toggle Mode
// Phase 3: Updated to use unified recommendations service (Last.fm-based)

import { createServerFileRoute } from '@tanstack/react-start/server';
import { getRecommendations } from '@/lib/services/recommendations';
import type { Song } from '@/components/ui/audio-player';

// Exported POST handler for testing
export async function POST({ request }: { request: Request }) {
    try {
      const body = await request.json();
      const { currentSong, batchSize, excludeSongIds, excludeArtists, skipAutoRefresh } = body as {
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

      // Use the unified recommendations service with 'similar' mode
      // This now uses Last.fm for song similarity (much faster and more accurate)
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: {
          artist: currentSong.artist,
          title: currentSong.title || currentSong.name
        },
        limit: batchSize || 3,
        excludeSongIds: excludeSongIds || [],
        excludeArtists: excludeArtists || [],
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

export const ServerRoute = createServerFileRoute('/api/ai-dj/recommendations').methods({
  POST
});
