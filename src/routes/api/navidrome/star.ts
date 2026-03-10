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
import { recommendationFeedback, likedSongsSync, userPlaylists, playlistSongs } from '../../../lib/db/schema';
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
        })
        .onConflictDoUpdate({
          target: [recommendationFeedback.userId, recommendationFeedback.songId],
          set: { feedbackType: 'thumbs_up', timestamp: new Date() },
        });

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

    // Sync unstar to feedback + liked_songs_sync + playlist_songs (non-blocking)
    try {
      // Remove thumbs_up feedback for this song (regardless of source)
      await db
        .delete(recommendationFeedback)
        .where(
          and(
            eq(recommendationFeedback.userId, session.user.id),
            eq(recommendationFeedback.songId, songId),
            eq(recommendationFeedback.feedbackType, 'thumbs_up')
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

      // Remove from the Liked Songs playlist so it disappears on refresh
      const LIKED_SONGS_NAME = '❤️ Liked Songs';
      const likedPlaylist = await db
        .select({ id: userPlaylists.id })
        .from(userPlaylists)
        .where(
          and(
            eq(userPlaylists.userId, session.user.id),
            eq(userPlaylists.name, LIKED_SONGS_NAME)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      if (likedPlaylist) {
        await db
          .delete(playlistSongs)
          .where(
            and(
              eq(playlistSongs.playlistId, likedPlaylist.id),
              eq(playlistSongs.songId, songId)
            )
          );

        // Update the playlist song count
        const remaining = await db
          .select({ songId: playlistSongs.songId })
          .from(playlistSongs)
          .where(eq(playlistSongs.playlistId, likedPlaylist.id));

        await db
          .update(userPlaylists)
          .set({ songCount: remaining.length, updatedAt: new Date() })
          .where(eq(userPlaylists.id, likedPlaylist.id));
      }
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
