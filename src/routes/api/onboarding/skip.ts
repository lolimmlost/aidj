import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // P-1: Atomic JSONB merge to avoid read-modify-write race
    await db
      .update(userPreferences)
      .set({
        onboardingStatus: sql`COALESCE(${userPreferences.onboardingStatus}, '{}'::jsonb) || ${JSON.stringify({ completed: false, skipped: true, skippedAt: new Date().toISOString() })}::jsonb`,
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
