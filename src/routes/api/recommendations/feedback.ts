import { createFileRoute } from "@tanstack/react-router";
import { db } from '../../../lib/db';
import { recommendationFeedback, recommendationsCache, userPreferences } from '../../../lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { starSong, unstarSong, getStarredSongs } from '../../../lib/services/navidrome';
import { clearPreferenceCache } from '../../../lib/services/preferences';
import { clearAnalyticsCache } from '../../../lib/services/recommendation-analytics';
import { extractTemporalMetadata } from '../../../lib/utils/temporal';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema';
import {
  withAuthAndErrorHandling,
  errorResponse,
  jsonResponse,
} from '../../../lib/utils/api-response';

// Zod schema for feedback validation
const FeedbackSchema = z.object({
  songArtistTitle: z.string().min(1, 'Song artist and title are required'),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down'], {
    errorMap: () => ({ message: 'Feedback type must be thumbs_up or thumbs_down' }),
  }),
  source: z.enum(['recommendation', 'playlist', 'playlist_generator', 'search', 'library', 'nudge', 'ai_dj']).optional().default('recommendation'),
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

    return jsonResponse({ feedback: feedbackMap });
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
        const syncEnabled = prefs?.recommendationSettings?.syncFeedbackToNavidrome !== false;

        if (syncEnabled) {
          if (validatedData.feedbackType === 'thumbs_up') {
            await starSong(validatedData.songId);
            console.log(`✅ Starred song ${validatedData.songId} in Navidrome`);
          } else if (validatedData.feedbackType === 'thumbs_down') {
            await unstarSong(validatedData.songId);
            console.log(`❌ Unstarred song ${validatedData.songId} in Navidrome`);
          }

          // Auto-sync Liked Songs playlist after starring/unstarring
          try {
            const LIKED_SONGS_NAME = '❤️ Liked Songs';
            const starredSongs = await getStarredSongs();

            // Find or create Liked Songs playlist
            let likedPlaylist = await db
              .select()
              .from(userPlaylists)
              .where(
                and(
                  eq(userPlaylists.userId, session.user.id),
                  eq(userPlaylists.name, LIKED_SONGS_NAME)
                )
              )
              .limit(1)
              .then(rows => rows[0]);

            if (!likedPlaylist) {
              const [newPlaylist] = await db
                .insert(userPlaylists)
                .values({
                  id: crypto.randomUUID(),
                  userId: session.user.id,
                  name: LIKED_SONGS_NAME,
                  description: 'Auto-synced from your starred songs in Navidrome',
                  navidromeId: null,
                  lastSynced: new Date(),
                  songCount: starredSongs.length,
                  totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
                .returning();
              likedPlaylist = newPlaylist;
            }

            // Update playlist metadata
            await db
              .update(userPlaylists)
              .set({
                lastSynced: new Date(),
                songCount: starredSongs.length,
                totalDuration: starredSongs.reduce((sum, s) => sum + parseInt(s.duration || '0'), 0),
                updatedAt: new Date(),
              })
              .where(eq(userPlaylists.id, likedPlaylist.id));

            // Clear and re-insert songs
            await db.delete(playlistSongs).where(eq(playlistSongs.playlistId, likedPlaylist.id));

            if (starredSongs.length > 0) {
              await db.insert(playlistSongs).values(
                starredSongs.map((song, index) => ({
                  id: crypto.randomUUID(),
                  playlistId: likedPlaylist.id,
                  songId: song.id,
                  songArtistTitle: `${song.artist} - ${song.title}`,
                  position: index + 1,
                  addedAt: new Date(),
                }))
              );
            }

            console.log(`💖 Auto-synced Liked Songs playlist: ${starredSongs.length} songs`);
          } catch (syncError) {
            console.error('Failed to auto-sync Liked Songs playlist (non-blocking):', syncError);
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
