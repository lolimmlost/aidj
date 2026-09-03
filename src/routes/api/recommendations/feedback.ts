import { createFileRoute } from "@tanstack/react-router";
import { db } from '../../../lib/db';
import { recommendationFeedback, recommendationsCache, userPreferences, likedSongsSync } from '../../../lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { setSongLiked } from '../../../lib/services/liked-songs-sync';
import { ensureNavidromeUser } from '../../../lib/services/navidrome-users';
import { clearPreferenceCache } from '../../../lib/services/preferences';
import { clearAnalyticsCache } from '../../../lib/services/recommendation-analytics';
import { extractTemporalMetadata } from '../../../lib/utils/temporal';
import {
  withAuthAndErrorHandling,
  errorResponse,
  jsonResponse,
} from '../../../lib/utils/api-response';
import { parseArtistTitle } from '@/lib/utils/song-artist-title';

// Zod schema for feedback validation
const FeedbackSchema = z.object({
  songArtistTitle: z.string().min(1, 'Song artist and title are required'),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down'], {
    errorMap: () => ({ message: 'Feedback type must be thumbs_up or thumbs_down' }),
  }),
  source: z.enum([
    'recommendation', 'playlist', 'playlist_generator', 'search',
    'library', 'nudge', 'ai_dj', 'autoplay',
    'ai_dj_skip', 'ai_dj_listen_through',
  ]).optional().default('recommendation'),
  recommendationCacheId: z.number().int().positive().optional(),
  songId: z.string().optional(), // Navidrome song ID for starring and storage
});

// Exported GET handler for testing
export const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    // Parse query parameters
    const url = new URL(request.url);
    const songIdsParam = url.searchParams.get('songIds');

    if (!songIdsParam) {
      return errorResponse('MISSING_SONG_IDS', 'songIds query parameter is required', { status: 400 });
    }

    // Parse comma-separated song IDs
    const songIds = songIdsParam.split(',').map(id => id.trim()).filter(Boolean);

    if (songIds.length === 0) {
      return errorResponse('INVALID_SONG_IDS', 'At least one songId is required', { status: 400 });
    }

    // Fetch feedback for the requested songs
    const feedbackRecords = await db
      .select({
        songId: recommendationFeedback.songId,
        feedbackType: recommendationFeedback.feedbackType,
      })
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, session.user.id),
          inArray(recommendationFeedback.songId, songIds)
        )
      );

    // Convert to map: songId -> feedbackType
    const feedbackMap: Record<string, 'thumbs_up' | 'thumbs_down'> = {};
    for (const record of feedbackRecords) {
      if (record.songId) {
        feedbackMap[record.songId] = record.feedbackType;
      }
    }

    // Library "liked" state (Navidrome stars, mirrored into liked_songs_sync) is
    // a SEPARATE signal from thumbs feedback: the heart reads `liked`, the thumbs
    // UI reads `feedback`. We deliberately do NOT fold stars into the thumbs map —
    // being starred no longer implies you thumbs-up'd a recommendation, and a
    // thumbs-down no longer clears the heart (Plan PR C: decouple thumbs/stars).
    const likedRecords = await db
      .select({ songId: likedSongsSync.songId })
      .from(likedSongsSync)
      .where(
        and(
          eq(likedSongsSync.userId, session.user.id),
          eq(likedSongsSync.isActive, 1),
          inArray(likedSongsSync.songId, songIds)
        )
      );
    const liked = likedRecords.map(r => r.songId);

    return jsonResponse({ feedback: feedbackMap, liked });
  },
  {
    service: 'feedback',
    operation: 'fetch',
    defaultCode: 'FEEDBACK_FETCH_ERROR',
    defaultMessage: 'Failed to fetch feedback',
  }
);

// Exported POST handler for testing
export const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();

    // Input validation using Zod
    const validatedData = FeedbackSchema.parse(body);

    // Check if feedback already exists for this song (prefer songId, fallback to songArtistTitle)
    const existingFeedback = await db
      .select()
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, session.user.id),
          validatedData.songId
            ? eq(recommendationFeedback.songId, validatedData.songId)
            : eq(recommendationFeedback.songArtistTitle, validatedData.songArtistTitle)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    // Extract temporal metadata for seasonal pattern detection (Story 3.11)
    const timestamp = new Date();
    const temporal = extractTemporalMetadata(timestamp);

    let feedbackRecord;

    if (existingFeedback) {
      // If feedback exists and is the same, return conflict status (409) to indicate duplicate
      if (existingFeedback.feedbackType === validatedData.feedbackType) {
        console.log(`✓ Feedback already exists with same type, returning 409`);
        return errorResponse('DUPLICATE_FEEDBACK', 'Feedback already exists for this song', { status: 409 });
      } else {
        // Update existing feedback with new type
        console.log(`🔄 Updating feedback from ${existingFeedback.feedbackType} to ${validatedData.feedbackType}`);
        await db
          .update(recommendationFeedback)
          .set({
            feedbackType: validatedData.feedbackType,
            timestamp,
            source: validatedData.source,
            // Update temporal metadata
            month: temporal.month,
            season: temporal.season,
            dayOfWeek: temporal.dayOfWeek,
            hourOfDay: temporal.hourOfDay,
          })
          .where(eq(recommendationFeedback.id, existingFeedback.id));

        feedbackRecord = { ...existingFeedback, feedbackType: validatedData.feedbackType };
      }
    } else {
      // Insert new feedback record
      console.log(`✨ Creating new feedback: ${validatedData.feedbackType}`);
      feedbackRecord = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        songArtistTitle: validatedData.songArtistTitle,
        songId: validatedData.songId || null,
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
    }

    // Clear preference and analytics caches to ensure fresh data on next fetch
    clearPreferenceCache(session.user.id);
    clearAnalyticsCache(session.user.id);

    // Mirror to the library "like" (Navidrome star) ONLY for explicit library
    // like actions — i.e. the heart button (source='library'), where thumbs_up
    // means "add to Liked Songs" and thumbs_down means "unlike/remove".
    //
    // Recommendation / AI-DJ / autoplay / search thumbs are a pure
    // recommendation-quality signal: they update recommendationFeedback (above)
    // but must NOT star/unstar or touch the ❤️ Liked Songs playlist. Coupling
    // them was silently repopulating Liked Songs and inflating thumbs_up vs the
    // real star count (Plan PR C: decouple thumbs from stars).
    if (validatedData.songId && validatedData.source === 'library') {
      try {
        // Check user preferences for Navidrome sync setting
        const prefs = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, session.user.id))
          .limit(1)
          .then(rows => rows[0]);

        // Default to enabled if no preference set
        const syncEnabled = prefs?.recommendationSettings?.syncFeedbackToNavidrome !== false;

        if (syncEnabled) {
          const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);

          // Single write-through keeps Navidrome + feedback + liked_songs_sync +
          // the ❤️ Liked Songs playlist in lockstep (surgical single-row update,
          // no full rebuild).
          const { artist, title } = parseArtistTitle(validatedData.songArtistTitle);
          await setSongLiked(
            session.user.id,
            validatedData.songId,
            validatedData.feedbackType === 'thumbs_up',
            creds,
            { artist, title }
          );
        } else {
          console.log(`🔒 Navidrome sync disabled by user preference`);
        }
      } catch (navidromeError) {
        // Log error but don't fail the feedback submission
        console.error('Failed to sync feedback to Navidrome (non-blocking):', navidromeError);
      }
    }

    // Update recommendation cache quality score if cache ID provided
    // Uses incremental update for better performance (avoids fetching all feedback)
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
          // Incremental update: use current feedback count and calculate delta
          // This is O(1) instead of O(n) where n = total feedback count
          const currentFeedbackCount = cacheRecord.feedbackCount || 0;
          const currentQualityScore = cacheRecord.qualityScore || 0;

          // Calculate new values incrementally
          const currentThumbsUp = Math.round(currentQualityScore * currentFeedbackCount);
          const isNewFeedback = !existingFeedback;
          const isChangingType = existingFeedback && existingFeedback.feedbackType !== validatedData.feedbackType;

          let newThumbsUp = currentThumbsUp;
          let newFeedbackCount = currentFeedbackCount;

          if (isNewFeedback) {
            // New feedback entry
            newFeedbackCount = currentFeedbackCount + 1;
            if (validatedData.feedbackType === 'thumbs_up') {
              newThumbsUp = currentThumbsUp + 1;
            }
          } else if (isChangingType) {
            // Changing feedback type (thumbs_up <-> thumbs_down)
            if (validatedData.feedbackType === 'thumbs_up') {
              newThumbsUp = currentThumbsUp + 1;
            } else {
              newThumbsUp = Math.max(0, currentThumbsUp - 1);
            }
          }
          // If same type (duplicate), we already returned 409 above

          const qualityScore = newFeedbackCount > 0 ? newThumbsUp / newFeedbackCount : null;

          // Update cache with new quality metrics
          await db
            .update(recommendationsCache)
            .set({
              qualityScore,
              feedbackCount: newFeedbackCount,
            })
            .where(eq(recommendationsCache.id, validatedData.recommendationCacheId));
        }
      } catch (cacheError) {
        // Log error but don't fail the feedback submission
        console.error('Failed to update cache quality score:', cacheError);
      }
    }

    return jsonResponse({
      success: true,
      feedbackId: feedbackRecord.id
    });
  },
  {
    service: 'feedback',
    operation: 'submit',
    defaultCode: 'FEEDBACK_SUBMISSION_ERROR',
    defaultMessage: 'Failed to submit feedback',
  }
);

// Route definition using exported handlers
export const Route = createFileRoute("/api/recommendations/feedback")({
  server: {
    handlers: {
  GET,
  POST,
    },
  },
});
