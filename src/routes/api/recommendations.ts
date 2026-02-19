// API endpoint for mood-based recommendations
// Phase 3: Updated to use unified recommendations service (AI mood translation)

import { createFileRoute } from "@tanstack/react-router";
import { getRecommendations } from '../../lib/services/recommendations';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../lib/utils/api-response';
import { db } from '../../lib/db';
import { userPreferences } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const { prompt, limit = 20, currentSongId } = await request.json() as {
      prompt: string;
      limit?: number;
      currentSongId?: string;
      // Deprecated: These are no longer used
      model?: string;
      useGenreFiltering?: boolean;
    };

    if (!prompt) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Prompt required', { status: 400 });
    }

    console.log(`🎭 Generating mood-based recommendations for: "${prompt}"${currentSongId ? ` (current song: ${currentSongId})` : ''}`);

    // Use the unified recommendations service with 'mood' mode
    // AI translates the mood to a smart playlist query, then Navidrome evaluates it
    // Phase 3.1B: currentSongId enables getSimilarSongs fallback when AI fails
    const result = await getRecommendations({
      mode: 'mood',
      moodDescription: prompt,
      currentSongId,
      limit,
    });

    console.log(`✅ Got ${result.songs.length} recommendations from ${result.source}`);

    // Safe Mode: filter explicit songs if user has safeMode enabled
    if (session?.user?.id && result.songs.length > 0) {
      try {
        const prefs = await db.select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, session.user.id))
          .limit(1);

        const safeMode = prefs[0]?.playbackSettings?.safeMode ?? false;

        if (safeMode) {
          const { filterExplicitSongs } = await import('../../lib/services/explicit-content');
          const filtered = await filterExplicitSongs(result.songs);
          const removedCount = result.songs.length - filtered.length;
          if (removedCount > 0) {
            console.log(`🔒 Safe Mode: Filtered ${removedCount} explicit song(s) from mood recommendations`);
          }
          result.songs = filtered;
        }
      } catch (error) {
        console.warn('Safe Mode filtering failed:', error);
      }
    }

    // Transform to legacy format for backward compatibility
    const recommendations = result.songs.map(song => ({
      song: `${song.artist} - ${song.title}`,
      explanation: `Matched your mood: "${prompt}"`,
      songId: song.id,
      url: song.url,
      inLibrary: true,
    }));

    return successResponse({
      recommendations,
      source: result.source,
      mode: result.mode,
    });
  },
  {
    service: 'recommendations',
    operation: 'generate',
    defaultCode: 'RECOMMENDATION_ERROR',
    defaultMessage: 'Failed to generate recommendations',
  }
);

export const Route = createFileRoute("/api/recommendations")({
  server: {
    handlers: {
      POST,
    },
  },
});
