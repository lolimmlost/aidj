import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Read existing onboarding status to merge (avoid overwriting wizard step data)
    const existing = await db
      .select({ onboardingStatus: userPreferences.onboardingStatus })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!existing) {
      return errorResponse('NO_PREFERENCES', 'User preferences not found', { status: 404 });
    }

    // Merge with existing status to preserve selectedArtistIds, etc.
    const merged = {
      ...(existing.onboardingStatus ?? {}),
      completed: false,
      skipped: true,
      skippedAt: new Date().toISOString(),
    };

    await db
      .update(userPreferences)
      .set({
        onboardingStatus: merged,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId));

    return successResponse({ success: true });
  },
  {
    service: 'onboarding',
    operation: 'skip',
    defaultCode: 'ONBOARDING_SKIP_ERROR',
    defaultMessage: 'Failed to skip onboarding',
  }
);

export const Route = createFileRoute('/api/onboarding/skip')({
  server: { handlers: { POST } },
});
