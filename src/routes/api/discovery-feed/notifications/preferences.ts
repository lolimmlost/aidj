/**
 * Discovery Feed Notification Preferences API
 *
 * GET /api/discovery-feed/notifications/preferences - Get notification preferences
 * POST /api/discovery-feed/notifications/preferences - Update notification preferences
 *
 * Manages user notification settings for discovery feed alerts.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../../lib/db';
import { discoveryNotificationPreferences } from '../../../../lib/db/schema/discovery-feed.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../../lib/utils/api-response';

// Default notification preferences
const DEFAULT_PREFERENCES = {
  enabled: true,
  frequency: 'daily' as const,
  preferredTimes: ['09:00', '17:00'],
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  includeNewReleases: true,
  includePersonalized: true,
  includeTimeBasedSuggestions: true,
  includeTrending: false,
  maxNotificationsPerDay: 3,
};

// Request validation schema
const NotificationPreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
  preferredTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeDays: z.array(z.number().min(0).max(6)).optional(),
  includeNewReleases: z.boolean().optional(),
  includePersonalized: z.boolean().optional(),
  includeTimeBasedSuggestions: z.boolean().optional(),
  includeTrending: z.boolean().optional(),
  maxNotificationsPerDay: z.number().min(1).max(10).optional(),
});

// GET /api/discovery-feed/notifications/preferences
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Fetch existing preferences
    let prefs = await db
      .select()
      .from(discoveryNotificationPreferences)
      .where(eq(discoveryNotificationPreferences.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    // Create default preferences if none exist
    if (!prefs) {
      const newPrefsId = crypto.randomUUID();
      await db.insert(discoveryNotificationPreferences).values({
        id: newPrefsId,
        userId,
        ...DEFAULT_PREFERENCES,
      });

      prefs = await db
        .select()
        .from(discoveryNotificationPreferences)
        .where(eq(discoveryNotificationPreferences.id, newPrefsId))
        .then(rows => rows[0]);
    }

    return successResponse(prefs);
  },
  {
    service: 'discovery-feed',
    operation: 'get-notification-preferences',
    defaultCode: 'NOTIFICATION_PREFERENCES_ERROR',
    defaultMessage: 'Failed to get notification preferences',
  }
);

// POST /api/discovery-feed/notifications/preferences
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validated = NotificationPreferencesSchema.parse(body);

    const userId = session.user.id;

    // Check if preferences exist
    const existingPrefs = await db
      .select()
      .from(discoveryNotificationPreferences)
      .where(eq(discoveryNotificationPreferences.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    if (!existingPrefs) {
      // Create new preferences
      const newPrefsId = crypto.randomUUID();
      await db.insert(discoveryNotificationPreferences).values({
        id: newPrefsId,
        userId,
        ...DEFAULT_PREFERENCES,
        ...validated,
      });

      const prefs = await db
        .select()
        .from(discoveryNotificationPreferences)
        .where(eq(discoveryNotificationPreferences.id, newPrefsId))
        .then(rows => rows[0]);

      return successResponse(prefs);
    }

    // Update existing preferences
    await db
      .update(discoveryNotificationPreferences)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(discoveryNotificationPreferences.userId, userId));

    const prefs = await db
      .select()
      .from(discoveryNotificationPreferences)
      .where(eq(discoveryNotificationPreferences.userId, userId))
      .then(rows => rows[0]);

    return successResponse(prefs);
  },
  {
    service: 'discovery-feed',
    operation: 'update-notification-preferences',
    defaultCode: 'NOTIFICATION_PREFERENCES_ERROR',
    defaultMessage: 'Failed to update notification preferences',
  }
);

export const Route = createFileRoute("/api/discovery-feed/notifications/preferences")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
