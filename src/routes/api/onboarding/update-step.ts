import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

// P-5: Type-safe field validators
const fieldValidators: Record<string, (v: unknown) => boolean> = {
  currentStep: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3,
  likedSongsSynced: (v) => typeof v === 'boolean',
  lastfmImported: (v) => typeof v === 'boolean',
  lastfmUsername: (v) => typeof v === 'string' && v.length > 0 && v.length <= 100,
};

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const [field, validate] of Object.entries(fieldValidators)) {
      if (body[field] !== undefined) {
        if (validate(body[field])) {
          updates[field] = body[field];
        } else {
          errors.push(`Invalid value for ${field}`);
        }
      }
    }

    if (errors.length > 0) {
      return errorResponse('VALIDATION_ERROR', errors.join(', '), { status: 400 });
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('VALIDATION_ERROR', 'No valid fields to update', { status: 400 });
    }

    // P-1: Atomic JSONB merge to avoid read-modify-write race
    const result = await db
      .update(userPreferences)
      .set({
        onboardingStatus: sql`COALESCE(${userPreferences.onboardingStatus}, '{"completed": false}'::jsonb) || ${JSON.stringify(updates)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId))
      .returning({ userId: userPreferences.userId });

    if (result.length === 0) {
      return errorResponse('NO_PREFERENCES', 'User preferences not found', { status: 404 });
    }

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
