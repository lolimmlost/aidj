import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { calculateFullUserProfile } from '@/lib/services/compound-scoring';
import { getBackgroundDiscoveryManager } from '@/lib/services/background-discovery';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Mark onboarding as completed
    await db
      .update(userPreferences)
      .set({
        onboardingStatus: {
          completed: true,
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId));

    // Fire-and-forget: calculate full user profile
    calculateFullUserProfile(userId).catch((err) =>
      console.error('[onboarding/complete] Failed to calculate user profile:', err)
    );

    // Fire-and-forget: trigger background discovery
    const manager = getBackgroundDiscoveryManager();
    manager
      .initialize(userId)
      .then(() => manager.triggerNow())
      .catch((err) =>
        console.error('[onboarding/complete] Failed to trigger background discovery:', err)
      );

    return successResponse({ success: true });
  },
  {
    service: 'onboarding',
    operation: 'complete',
    defaultCode: 'ONBOARDING_COMPLETE_ERROR',
    defaultMessage: 'Failed to complete onboarding',
  }
);

export const Route = createFileRoute('/api/onboarding/complete')({
  server: { handlers: { POST } },
});
