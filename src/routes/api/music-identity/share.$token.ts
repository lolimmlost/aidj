/**
 * Music Identity API - Public Share Endpoint
 *
 * GET /api/music-identity/share/:token - Get a publicly shared summary
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  successResponse,
  notFoundResponse,
  jsonResponse,
} from '../../../lib/utils/api-response';
import { getMusicIdentityByShareToken } from '../../../lib/services/music-identity';

// GET /api/music-identity/share/:token - Get a publicly shared summary
// This endpoint does NOT require authentication
const GET = async ({ params }: { params: { token: string } }) => {
  try {
    const { token } = params;

    const summary = await getMusicIdentityByShareToken(token);

    if (!summary) {
      return notFoundResponse('Shared music identity not found or is not public');
    }

    // Return a sanitized version without sensitive user data
    return successResponse({
      id: summary.id,
      periodType: summary.periodType,
      year: summary.year,
      month: summary.month,
      title: summary.title,
      aiInsights: summary.aiInsights,
      moodProfile: summary.moodProfile,
      artistAffinities: summary.artistAffinities,
      trendAnalysis: summary.trendAnalysis,
      topArtists: summary.topArtists,
      topTracks: summary.topTracks,
      topGenres: summary.topGenres,
      stats: summary.stats,
      cardTheme: summary.cardTheme,
      cardData: summary.cardData,
      generatedAt: summary.generatedAt,
    });
  } catch (error) {
    console.error('Error fetching shared music identity:', error);
    return jsonResponse(
      {
        code: 'SHARE_FETCH_ERROR',
        message: 'Failed to fetch shared music identity',
      },
      500
    );
  }
};

export const Route = createFileRoute("/api/music-identity/share/$token")({
  server: {
    handlers: {
      GET,
    },
  },
});
