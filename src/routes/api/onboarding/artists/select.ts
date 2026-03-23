import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { recommendationFeedback } from '@/lib/db/schema/recommendations.schema';
import { eq, sql } from 'drizzle-orm';

import {
  getArtistDetail,
  getTopSongs,
} from '@/lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

const MAX_ARTISTS = 50;

function getTemporalMetadata() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  const hourOfDay = now.getHours();

  let season: 'spring' | 'summer' | 'fall' | 'winter';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';

  return { month, dayOfWeek, hourOfDay, season };
}

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();

    // P-6: Runtime type validation for artistIds
    const artistIds = body?.artistIds;
    if (!Array.isArray(artistIds) || artistIds.length < 3) {
      return errorResponse('VALIDATION_ERROR', 'At least 3 artists must be selected', { status: 400 });
    }
    // P-3: Upper bound on array length
    if (artistIds.length > MAX_ARTISTS) {
      return errorResponse('VALIDATION_ERROR', `Maximum ${MAX_ARTISTS} artists allowed`, { status: 400 });
    }
    // P-6: Ensure all elements are non-empty strings
    if (!artistIds.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
      return errorResponse('VALIDATION_ERROR', 'All artist IDs must be non-empty strings', { status: 400 });
    }
    const validatedIds = artistIds as string[];

    const temporal = getTemporalMetadata();

    // P-2: Fetch all artist details BEFORE the transaction to avoid holding DB connection open during network calls
    const artistDetails = new Map<string, { name: string; topSongs: Array<{ id: string; artist?: string; title?: string; name?: string }> }>();
    for (const artistId of validatedIds) {
      try {
        const detail = await getArtistDetail(artistId);
        let topSongs: Array<{ id: string; artist?: string; title?: string; name?: string }> = [];
        try {
          topSongs = await getTopSongs(artistId, 5);
        } catch (err) {
          console.warn(`[onboarding/artists/select] Could not fetch top songs for artist ${artistId}:`, err);
        }
        artistDetails.set(artistId, { name: detail.name.toLowerCase(), topSongs });
      } catch {
        console.warn(`[onboarding/artists/select] Could not fetch artist ${artistId}, skipping`);
      }
    }

    // P-4: Fail if zero artists were successfully fetched
    if (artistDetails.size === 0) {
      return errorResponse('NAVIDROME_ERROR', 'Could not fetch any artist details from music server', { status: 502 });
    }

    let feedbackCount = 0;
    let artistCount = 0;

    await db.transaction(async (tx) => {
      for (const [_artistId, { name: artistName, topSongs }] of artistDetails) {
        await tx
          .insert(artistAffinities)
          .values({
            userId,
            artist: artistName,
            affinityScore: 0.7,
            likedCount: 1,
            playCount: 0,
            skipCount: 0,
            totalPlayTime: 0,
            calculatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [artistAffinities.userId, artistAffinities.artist],
            set: {
              affinityScore: 0.7,
              likedCount: 1,
              calculatedAt: new Date(),
            },
          });
        artistCount++;

        for (const song of topSongs) {
          const songArtistTitle = `${song.artist || artistName} - ${song.title || song.name}`;
          await tx
            .insert(recommendationFeedback)
            .values({
              userId,
              songId: song.id,
              songArtistTitle,
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
          feedbackCount++;
        }
      }

      // P-1: Atomic JSONB merge using SQL to avoid read-modify-write race
      await tx
        .update(userPreferences)
        .set({
          onboardingStatus: sql`COALESCE(${userPreferences.onboardingStatus}, '{"completed": false}'::jsonb) || ${JSON.stringify({ selectedArtistIds: validatedIds, currentStep: 2 })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    });

    return successResponse({
      success: true,
      artistCount,
      feedbackCount,
    });
  },
  {
    service: 'onboarding',
    operation: 'artists-select',
    defaultCode: 'ONBOARDING_ARTIST_SELECT_ERROR',
    defaultMessage: 'Failed to save artist selections',
  }
);

export const Route = createFileRoute('/api/onboarding/artists/select')({
  server: { handlers: { POST } },
});
