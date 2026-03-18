import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { recommendationFeedback } from '@/lib/db/schema/recommendations.schema';
import { eq } from 'drizzle-orm';
import type { OnboardingStatusData } from '@/lib/db/schema/preferences.schema';
import {
  getArtistDetail,
  getTopSongs,
} from '@/lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

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

    const artistIds: string[] = body?.artistIds;
    if (!Array.isArray(artistIds) || artistIds.length < 3) {
      return errorResponse('VALIDATION_ERROR', 'At least 3 artists must be selected', { status: 400 });
    }

    const temporal = getTemporalMetadata();
    let feedbackCount = 0;

    await db.transaction(async (tx) => {
      // For each selected artist, create affinity + feedback rows
      for (const artistId of artistIds) {
        // Fetch artist details to get name
        let artistName: string;
        try {
          const detail = await getArtistDetail(artistId);
          artistName = detail.name.toLowerCase();
        } catch {
          console.warn(`[onboarding/artists/select] Could not fetch artist ${artistId}, skipping`);
          continue;
        }

        // Insert artist affinity with onConflictDoUpdate for re-selections
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

        // Fetch top tracks for this artist and create feedback
        try {
          const topSongs = await getTopSongs(artistId, 5);
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
        } catch (err) {
          console.warn(`[onboarding/artists/select] Could not fetch top songs for artist ${artistId}:`, err);
        }
      }

      // Update onboarding status with selected artists and advance step
      const prefs = await tx
        .select({ onboardingStatus: userPreferences.onboardingStatus })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1)
        .then((rows) => rows[0]);

      const currentStatus = prefs?.onboardingStatus ?? { completed: false };
      const merged: OnboardingStatusData = {
        ...currentStatus,
        selectedArtistIds: artistIds,
        currentStep: 2,
      };
      await tx
        .update(userPreferences)
        .set({
          onboardingStatus: merged,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    });

    return successResponse({
      success: true,
      artistCount: artistIds.length,
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
