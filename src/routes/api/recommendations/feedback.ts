import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { recommendationFeedback, recommendationsCache, userPreferences } from '../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { starSong, unstarSong } from '../../../lib/services/navidrome';
import { clearPreferenceCache } from '../../../lib/services/preferences';
import { extractTemporalMetadata } from '../../../lib/utils/temporal';

// Zod schema for feedback validation
const FeedbackSchema = z.object({
  songArtistTitle: z.string().min(1, 'Song artist and title are required'),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down'], {
    errorMap: () => ({ message: 'Feedback type must be thumbs_up or thumbs_down' }),
  }),
  source: z.enum(['recommendation', 'playlist']).optional().default('recommendation'),
  recommendationCacheId: z.number().int().positive().optional(),
  songId: z.string().optional(), // Navidrome song ID for starring
});

export const ServerRoute = createServerFileRoute('/api/recommendations/feedback').methods({
  // POST /api/recommendations/feedback - Submit user feedback
  POST: async ({ request }) => {
    // Authentication middleware validation
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

      // Input validation using Zod
      const validatedData = FeedbackSchema.parse(body);

      // Check if feedback already exists for this song
      const existingFeedback = await db
        .select()
        .from(recommendationFeedback)
        .where(
          and(
            eq(recommendationFeedback.userId, session.user.id),
            eq(recommendationFeedback.songArtistTitle, validatedData.songArtistTitle)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      if (existingFeedback) {
        return new Response(JSON.stringify({
          code: 'DUPLICATE_FEEDBACK',
          message: 'You have already rated this song',
          existingFeedback: {
            feedbackType: existingFeedback.feedbackType,
            timestamp: existingFeedback.timestamp,
          }
        }), {
          status: 409, // Conflict
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Extract temporal metadata for seasonal pattern detection (Story 3.11)
      const timestamp = new Date();
      const temporal = extractTemporalMetadata(timestamp);

      // Insert feedback record
      const feedbackRecord = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        songArtistTitle: validatedData.songArtistTitle,
        feedbackType: validatedData.feedbackType,
        source: validatedData.source,
        recommendationCacheId: validatedData.recommendationCacheId || null,
        timestamp,
        // Temporal metadata (Story 3.11)
        month: temporal.month,
        season: temporal.season,
        dayOfWeek: temporal.dayOfWeek,
        hourOfDay: temporal.hourOfDay,
      };

      await db.insert(recommendationFeedback).values(feedbackRecord);

      // Clear preference cache to ensure fresh data on next fetch
      clearPreferenceCache(session.user.id);

      // Sync to Navidrome (star/unstar) if enabled and songId provided
      if (validatedData.songId) {
        try {
          // Check user preferences for Navidrome sync setting
          const prefs = await db
            .select()
            .from(userPreferences)
            .where(eq(userPreferences.userId, session.user.id))
            .limit(1)
            .then(rows => rows[0]);

          // Default to enabled if no preference set
          const syncEnabled = prefs?.recommendationSettings?.useFeedbackForPersonalization !== false;

          if (syncEnabled) {
            if (validatedData.feedbackType === 'thumbs_up') {
              await starSong(validatedData.songId);
              console.log(`✅ Starred song ${validatedData.songId} in Navidrome`);
            } else if (validatedData.feedbackType === 'thumbs_down') {
              await unstarSong(validatedData.songId);
              console.log(`❌ Unstarred song ${validatedData.songId} in Navidrome`);
            }
          } else {
            console.log(`🔒 Navidrome sync disabled by user preference`);
          }
        } catch (navidromeError) {
          // Log error but don't fail the feedback submission
          console.error('Failed to sync feedback to Navidrome (non-blocking):', navidromeError);
        }
      }

      // Update recommendation cache quality score if cache ID provided
      if (validatedData.recommendationCacheId) {
        try {
          // Fetch current cache record
          const cacheRecord = await db
            .select()
            .from(recommendationsCache)
            .where(
              and(
                eq(recommendationsCache.id, validatedData.recommendationCacheId),
                eq(recommendationsCache.userId, session.user.id)
              )
            )
            .limit(1)
            .then(rows => rows[0]);

          if (cacheRecord) {
            // Fetch all feedback for this recommendation cache
            const allFeedback = await db
              .select()
              .from(recommendationFeedback)
              .where(eq(recommendationFeedback.recommendationCacheId, validatedData.recommendationCacheId));

            // Calculate quality score (ratio of thumbs_up to total feedback)
            const thumbsUpCount = allFeedback.filter(f => f.feedbackType === 'thumbs_up').length;
            const totalCount = allFeedback.length;
            const qualityScore = totalCount > 0 ? thumbsUpCount / totalCount : null;

            // Update cache with new quality metrics
            await db
              .update(recommendationsCache)
              .set({
                qualityScore,
                feedbackCount: totalCount,
              })
              .where(eq(recommendationsCache.id, validatedData.recommendationCacheId));
          }
        } catch (cacheError) {
          // Log error but don't fail the feedback submission
          console.error('Failed to update cache quality score:', cacheError);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        feedbackId: feedbackRecord.id
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      // Error handling with standardized patterns
      console.error('Failed to submit feedback:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid feedback data',
          errors: error.errors,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to submit feedback';
      return new Response(JSON.stringify({
        code: 'FEEDBACK_SUBMISSION_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
