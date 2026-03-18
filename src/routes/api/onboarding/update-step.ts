import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences, type OnboardingStatusData } from '@/lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();

    // Validate: only allow known onboarding fields to be updated
    const allowedFields = [
      'currentStep',
      'likedSongsSynced',
      'lastfmImported',
      'lastfmUsername',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('VALIDATION_ERROR', 'No valid fields to update', { status: 400 });
    }

    const prefs = await db
      .select({ onboardingStatus: userPreferences.onboardingStatus })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!prefs) {
      return errorResponse('NO_PREFERENCES', 'User preferences not found', { status: 404 });
    }

    const merged: OnboardingStatusData = {
      ...(prefs.onboardingStatus ?? { completed: false }),
      ...updates,
    } as OnboardingStatusData;

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
    operation: 'update-step',
    defaultCode: 'ONBOARDING_UPDATE_ERROR',
    defaultMessage: 'Failed to update onboarding step',
  }
);

export const Route = createFileRoute('/api/onboarding/update-step')({
  server: { handlers: { POST } },
});
