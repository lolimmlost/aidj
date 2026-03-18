import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Mark onboarding as skipped
    await db
      .update(userPreferences)
      .set({
        onboardingStatus: {
          completed: false,
          skipped: true,
          skippedAt: new Date().toISOString(),
        },
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
