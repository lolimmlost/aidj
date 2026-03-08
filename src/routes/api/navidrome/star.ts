/**
 * Star/Unstar API proxy for Navidrome
 * POST /api/navidrome/star?id={songId} — star a song
 * DELETE /api/navidrome/star?id={songId} — unstar a song
 *
 * Uses per-user Navidrome credentials so stars are scoped to the user.
 * Also syncs to recommendation_feedback and liked_songs_sync tables
 * so the PlayerBar heart icon stays consistent with Navidrome stars.
 */

import { createFileRoute } from '@tanstack/react-router';
import { starSong, unstarSong, getSongsByIds } from '../../../lib/services/navidrome';
import { ensureNavidromeUser } from '../../../lib/services/navidrome-users';
import { db } from '../../../lib/db';
import { recommendationFeedback, likedSongsSync } from '../../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { extractTemporalMetadata } from '../../../lib/utils/temporal';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const songId = url.searchParams.get('id');

    if (!songId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Song ID required', { status: 400 });
    }

    const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
    await starSong(songId, creds);

    // Sync star to feedback + liked_songs_sync tables (non-blocking)
    try {
      const songs = await getSongsByIds([songId]);
      const song = songs[0];
      const artistTitle = song
        ? `${song.artist || 'Unknown'} - ${song.title || song.name}`
        : `Unknown - ${songId}`;
      const temporal = extractTemporalMetadata(new Date());

      // Check for existing feedback before inserting (no unique constraint on userId+songId)
      const existing = await db
        .select({ id: recommendationFeedback.id })
        .from(recommendationFeedback)
        .where(
          and(
            eq(recommendationFeedback.userId, session.user.id),
            eq(recommendationFeedback.songId, songId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db
          .insert(recommendationFeedback)
          .values({
            id: crypto.randomUUID(),
            userId: session.user.id,
            songId,
            songArtistTitle: artistTitle,
            feedbackType: 'thumbs_up',
            source: 'library',
            timestamp: new Date(),
            month: temporal.month,
            season: temporal.season,
            dayOfWeek: temporal.dayOfWeek,
            hourOfDay: temporal.hourOfDay,
          });
      } else if (existing.length > 0) {
        // Update existing to thumbs_up if it was thumbs_down
        await db
          .update(recommendationFeedback)
          .set({ feedbackType: 'thumbs_up', timestamp: new Date() })
          .where(eq(recommendationFeedback.id, existing[0].id));
      }

      await db
        .insert(likedSongsSync)
        .values({
          userId: session.user.id,
          songId,
          artist: song?.artist || 'Unknown',
          title: song?.title || song?.name || songId,
          isActive: 1,
        })
        .onConflictDoUpdate({
          target: [likedSongsSync.userId, likedSongsSync.songId],
          set: { isActive: 1, syncedAt: new Date() },
        });
    } catch (syncError) {
      console.error('Failed to sync star to feedback tables (non-blocking):', syncError);
    }

    return successResponse({ starred: true, songId });
  },
  {
    service: 'navidrome',
    operation: 'star',
    defaultCode: 'STAR_ERROR',
    defaultMessage: 'Failed to star song',
  }
);

const DELETE = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const songId = url.searchParams.get('id');

    if (!songId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Song ID required', { status: 400 });
    }

    const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
    await unstarSong(songId, creds);

    // Sync unstar to feedback + liked_songs_sync tables (non-blocking)
    try {
      // Remove thumbs_up feedback for this song
      await db
        .delete(recommendationFeedback)
        .where(
          and(
            eq(recommendationFeedback.userId, session.user.id),
            eq(recommendationFeedback.songId, songId),
            eq(recommendationFeedback.feedbackType, 'thumbs_up'),
            eq(recommendationFeedback.source, 'library')
          )
        );

      // Mark as inactive in liked_songs_sync
      await db
        .update(likedSongsSync)
        .set({ isActive: 0 })
        .where(
          and(
            eq(likedSongsSync.userId, session.user.id),
            eq(likedSongsSync.songId, songId)
          )
        );
    } catch (syncError) {
      console.error('Failed to sync unstar to feedback tables (non-blocking):', syncError);
    }

    return successResponse({ starred: false, songId });
  },
  {
    service: 'navidrome',
    operation: 'unstar',
    defaultCode: 'UNSTAR_ERROR',
    defaultMessage: 'Failed to unstar song',
  }
);

export const Route = createFileRoute('/api/navidrome/star')({
  server: {
    handlers: {
      POST,
      DELETE,
    },
  },
});
