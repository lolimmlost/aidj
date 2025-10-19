/**
 * Seasonal Playlist Generation API
 * Story 3.11: Task 5 - Generate playlists from seasonal patterns
 */

import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { recommendationFeedback } from '../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { Season } from '../../../lib/utils/temporal';

const SeasonalPlaylistSchema = z.object({
  season: z.enum(['spring', 'summer', 'fall', 'winter']),
  month: z.number().int().min(1).max(12).optional(),
});

export const ServerRoute = createServerFileRoute('/api/recommendations/seasonal-playlist').methods({
  // POST /api/recommendations/seasonal-playlist - Generate seasonal playlist
  POST: async ({ request }) => {
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
      const body = await request.json();
      const validatedData = SeasonalPlaylistSchema.parse(body);

      // Fetch liked songs from the specified season/month
      const conditions = [
        eq(recommendationFeedback.userId, session.user.id),
        eq(recommendationFeedback.feedbackType, 'thumbs_up'),
      ];

      if (validatedData.month) {
        conditions.push(eq(recommendationFeedback.month, validatedData.month));
      } else {
        conditions.push(eq(recommendationFeedback.season, validatedData.season));
      }

      const seasonalSongs = await db
        .select()
        .from(recommendationFeedback)
        .where(and(...conditions))
        .orderBy(recommendationFeedback.timestamp);

      if (seasonalSongs.length === 0) {
        return new Response(JSON.stringify({
          code: 'NO_SONGS',
          message: 'No liked songs found for this period'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Extract unique songs
      const uniqueSongs = Array.from(
        new Set(seasonalSongs.map(s => s.songArtistTitle))
      );

      // Generate playlist name
      const year = new Date().getFullYear();
      const playlistName = validatedData.month
        ? `${getMonthName(validatedData.month)} Mix ${year}`
        : `${capitalizeFirst(validatedData.season)} Mix ${year}`;

      return new Response(JSON.stringify({
        success: true,
        playlistName,
        songs: uniqueSongs,
        songCount: uniqueSongs.length,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to generate seasonal playlist:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors: error.errors,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to generate seasonal playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_GENERATION_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});

function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || 'Unknown';
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
