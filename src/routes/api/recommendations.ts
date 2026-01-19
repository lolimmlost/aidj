// API endpoint for mood-based recommendations
// Phase 3: Updated to use unified recommendations service (AI mood translation)

import { createFileRoute } from "@tanstack/react-router";
import { getRecommendations } from '../../lib/services/recommendations';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const { prompt, limit = 20 } = await request.json() as {
      prompt: string;
      limit?: number;
      // Deprecated: These are no longer used
      model?: string;
      useGenreFiltering?: boolean;
    };

    if (!prompt) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Prompt required', { status: 400 });
    }

    console.log(`🎭 Generating mood-based recommendations for: "${prompt}"`);

    // Use the unified recommendations service with 'mood' mode
    // AI translates the mood to a smart playlist query, then Navidrome evaluates it
    const result = await getRecommendations({
      mode: 'mood',
      moodDescription: prompt,
      limit,
    });

    console.log(`✅ Got ${result.songs.length} recommendations from ${result.source}`);

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
