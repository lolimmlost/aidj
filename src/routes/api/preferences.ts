import { createFileRoute } from "@tanstack/react-router";
import { db } from '../../lib/db';
import { userPreferences } from '../../lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../lib/utils/api-response';
import {
  createDefaultPreferences,
  preparePreferencesUpdate,
} from '../../lib/utils/preference-merge';

// Zod schema for preference validation
// All fields are optional for partial updates
const PreferencesSchema = z.object({
  recommendationSettings: z.object({
    aiEnabled: z.boolean().optional(),
    frequency: z.enum(['always', 'daily', 'weekly']).optional(),
    styleBasedPlaylists: z.boolean().optional(),
    useFeedbackForPersonalization: z.boolean().optional(),
    enableSeasonalRecommendations: z.boolean().optional(),
    syncFeedbackToNavidrome: z.boolean().optional(),
    // Story 3.9: AI DJ Mode
    aiDJEnabled: z.boolean().optional(),
    aiDJQueueThreshold: z.number().min(1).max(5).optional(),
    aiDJBatchSize: z.number().min(1).max(10).optional(),
    aiDJUseCurrentContext: z.boolean().optional(),
    // Story 7.1: Source Mode Toggle
    sourceMode: z.enum(['library', 'discovery', 'mix']).optional(),
    mixRatio: z.number().min(0).max(100).optional(),
    // Story 7.5: Harmonic Mixing
    harmonicMixingEnabled: z.boolean().optional(),
    harmonicMixingMode: z.enum(['strict', 'flexible', 'off']).optional(),
    bpmTolerance: z.number().min(0).max(20).optional(),
  }).optional(),
  playbackSettings: z.object({
    volume: z.number().min(0).max(1).optional(),
    autoplayNext: z.boolean().optional(),
    crossfadeDuration: z.number().min(0).max(10).optional(),
    defaultQuality: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
  notificationSettings: z.object({
    browserNotifications: z.boolean().optional(),
    downloadCompletion: z.boolean().optional(),
    recommendationUpdates: z.boolean().optional(),
  }).optional(),
  dashboardLayout: z.object({
    showRecommendations: z.boolean().optional(),
    showRecentlyPlayed: z.boolean().optional(),
    widgetOrder: z.array(z.string()).optional(),
  }).optional(),
});

// GET /api/preferences - Fetch user preferences
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    // Fetch user preferences
    let prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .limit(1)
      .then(rows => rows[0]);

    // If no preferences exist, create default ones using utility
    if (!prefs) {
      const defaultPrefs = createDefaultPreferences(session.user.id);
      await db.insert(userPreferences).values(defaultPrefs);
      prefs = defaultPrefs;
    }

    return successResponse(prefs);
  },
  {
    service: 'preferences',
    operation: 'fetch',
    defaultCode: 'PREFERENCES_FETCH_ERROR',
    defaultMessage: 'Failed to fetch preferences',
  }
);

// POST /api/preferences - Update user preferences
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();

    // Input validation using Zod
    const validatedData = PreferencesSchema.parse(body);

    // Check if preferences exist
    const existingPrefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .limit(1)
      .then(rows => rows[0]);

    if (!existingPrefs) {
      // Create new preferences with provided overrides using utility
      const newPrefs = createDefaultPreferences(session.user.id, validatedData);
      await db.insert(userPreferences).values(newPrefs as any);
      return successResponse(newPrefs);
    } else {
      // Update existing preferences using merge utility
      const updatedPrefs = preparePreferencesUpdate(existingPrefs, validatedData);

      await db
        .update(userPreferences)
        .set(updatedPrefs as any)
        .where(eq(userPreferences.userId, session.user.id));

      const result = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, session.user.id))
        .limit(1)
        .then(rows => rows[0]);

      return successResponse(result);
    }
  },
  {
    service: 'preferences',
    operation: 'update',
    defaultCode: 'PREFERENCES_UPDATE_ERROR',
    defaultMessage: 'Failed to update preferences',
  }
);

export const Route = createFileRoute("/api/preferences")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
