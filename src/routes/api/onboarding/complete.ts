import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';
import { calculateFullUserProfile } from '@/lib/services/compound-scoring';
import { getBackgroundDiscoveryManager } from '@/lib/services/background-discovery';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // P-10: Check if already completed to avoid re-triggering expensive operations
    const existing = await db
      .select({ onboardingStatus: userPreferences.onboardingStatus })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!existing) {
      return errorResponse('NO_PREFERENCES', 'User preferences not found', { status: 404 });
    }

    if (existing.onboardingStatus?.completed) {
      return successResponse({ success: true, alreadyCompleted: true });
    }

    // P-1: Atomic JSONB merge to avoid read-modify-write race
    await db
      .update(userPreferences)
      .set({
        onboardingStatus: sql`COALESCE(${userPreferences.onboardingStatus}, '{}'::jsonb) || ${JSON.stringify({ completed: true, completedAt: new Date().toISOString() })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId));

    // Fire-and-forget: calculate full user profile
    calculateFullUserProfile(userId).catch((err) =>
      console.error('[onboarding/complete] Failed to calculate user profile:', err)
    );

    // Fire-and-forget: trigger background discovery
    // P-9: Note — discovery manager is a singleton; concurrent completions for different users
    // could race on initialize(). This is acceptable for a single-user-at-a-time app.
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
