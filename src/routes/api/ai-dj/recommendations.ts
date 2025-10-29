// API endpoint for AI DJ recommendations
// Story 3.9: AI DJ Toggle Mode

import { createServerFileRoute } from '@tanstack/react-start/server';
import { generateContextualRecommendations, type AIContext } from '@/lib/services/ai-dj';
import type { Song } from '@/components/ui/audio-player';

export const ServerRoute = createServerFileRoute('/api/ai-dj/recommendations').methods({
  POST: async ({ request }: { request: Request }) => {
    try {
      const body = await request.json();
      const { currentSong, recentQueue, fullPlaylist, currentSongIndex, batchSize, useFeedbackForPersonalization, excludeSongIds, excludeArtists, skipAutoRefresh } = body as {
        currentSong: Song;
        recentQueue: Song[];
        fullPlaylist?: Song[];
        currentSongIndex?: number;
        batchSize: number;
        useFeedbackForPersonalization: boolean;
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

      const context: AIContext = {
        currentSong,
        recentQueue: recentQueue || [],
        fullPlaylist,
        currentSongIndex,
      };

      // Get user ID from session/auth (if available)
      // TODO: Extract from session when auth is implemented
      const userId = undefined;

      const recommendations = await generateContextualRecommendations(
        context,
        batchSize || 3,
        userId,
        useFeedbackForPersonalization,
        excludeSongIds || [],
        excludeArtists || []
      );

      return new Response(
        JSON.stringify({
          recommendations,
          skipAutoRefresh: skipAutoRefresh || false
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
});
