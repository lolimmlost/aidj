import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { recommendationFeedback } from '@/lib/db/schema/recommendations.schema';
import { likedSongsSync } from '@/lib/db/schema/profile.schema';
import { eq, count } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import type { OnboardingStatusResponse } from '@/lib/constants/onboarding';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Fetch user preferences for onboarding state
    const prefs = await db
      .select({ onboardingStatus: userPreferences.onboardingStatus })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    const onboardingStatus = prefs?.onboardingStatus;

    // Query data maturity counts in parallel
    const [historyResult, affinityResult, feedbackResult, likedResult] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(listeningHistory)
          .where(eq(listeningHistory.userId, userId)),
        db
          .select({ count: count() })
          .from(artistAffinities)
          .where(eq(artistAffinities.userId, userId)),
        db
          .select({ count: count() })
          .from(recommendationFeedback)
          .where(eq(recommendationFeedback.userId, userId)),
        db
          .select({ count: count() })
          .from(likedSongsSync)
          .where(eq(likedSongsSync.userId, userId)),
      ]);

    const response: OnboardingStatusResponse = {
      onboardingCompleted: onboardingStatus?.completed ?? false,
      onboardingSkipped: onboardingStatus?.skipped ?? false,
      currentStep: onboardingStatus?.currentStep ?? 1,
      dataMaturity: {
        listeningHistoryCount: historyResult[0].count,
        artistAffinityCount: affinityResult[0].count,
        feedbackCount: feedbackResult[0].count,
        hasLikedSongs: likedResult[0].count > 0,
        hasLastfmImport: onboardingStatus?.lastfmImported ?? false,
      },
    };

    return successResponse(response);
  },
  {
    service: 'onboarding',
    operation: 'status',
    defaultCode: 'ONBOARDING_STATUS_ERROR',
    defaultMessage: 'Failed to fetch onboarding status',
  }
);

export const Route = createFileRoute('/api/onboarding/status')({
  server: { handlers: { GET } },
});
