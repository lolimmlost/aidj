import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../lib/auth/auth';
import { db } from '../../lib/db';
import { userPreferences } from '../../lib/db/schema/preferences.schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Zod schema for preference validation
const PreferencesSchema = z.object({
  recommendationSettings: z.object({
    aiEnabled: z.boolean(),
    frequency: z.enum(['always', 'daily', 'weekly']),
    styleBasedPlaylists: z.boolean(),
    useFeedbackForPersonalization: z.boolean().optional(),
    enableSeasonalRecommendations: z.boolean().optional(),
    // Story 3.9: AI DJ Mode
    aiDJEnabled: z.boolean().optional(),
    aiDJQueueThreshold: z.number().min(1).max(5).optional(),
    aiDJBatchSize: z.number().min(1).max(10).optional(),
    aiDJUseCurrentContext: z.boolean().optional(),
  }).optional(),
  playbackSettings: z.object({
    volume: z.number().min(0).max(1),
    autoplayNext: z.boolean(),
    crossfadeDuration: z.number().min(0).max(10),
    defaultQuality: z.enum(['low', 'medium', 'high']),
  }).optional(),
  notificationSettings: z.object({
    browserNotifications: z.boolean(),
    downloadCompletion: z.boolean(),
    recommendationUpdates: z.boolean(),
  }).optional(),
  dashboardLayout: z.object({
    showRecommendations: z.boolean(),
    showRecentlyPlayed: z.boolean(),
    widgetOrder: z.array(z.string()),
  }).optional(),
});

export const ServerRoute = createServerFileRoute('/api/preferences').methods({
  // GET /api/preferences - Fetch user preferences
  GET: async ({ request }) => {
    // Authentication middleware validation
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Fetch user preferences
      let prefs = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, session.user.id))
        .limit(1)
        .then(rows => rows[0]);

      // If no preferences exist, create default ones
      if (!prefs) {
        const defaultPrefs = {
          id: crypto.randomUUID(),
          userId: session.user.id,
          recommendationSettings: {
            aiEnabled: true,
            frequency: 'always' as const,
            styleBasedPlaylists: true,
            useFeedbackForPersonalization: true,
            enableSeasonalRecommendations: true,
            aiDJEnabled: false,
            aiDJQueueThreshold: 2,
            aiDJBatchSize: 3,
            aiDJUseCurrentContext: true,
          },
          playbackSettings: {
            volume: 0.5,
            autoplayNext: true,
            crossfadeDuration: 0,
            defaultQuality: 'high' as const,
          },
          notificationSettings: {
            browserNotifications: false,
            downloadCompletion: true,
            recommendationUpdates: true,
          },
          dashboardLayout: {
            showRecommendations: true,
            showRecentlyPlayed: true,
            widgetOrder: ['recommendations', 'recentlyPlayed'],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(userPreferences).values(defaultPrefs);
        prefs = defaultPrefs;
      }

      return new Response(JSON.stringify({ data: prefs }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to fetch preferences:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch preferences';
      return new Response(JSON.stringify({
        code: 'PREFERENCES_FETCH_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // POST /api/preferences - Update user preferences
  POST: async ({ request }) => {
    // Authentication middleware validation
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
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
        // Create new preferences
        const newPrefs = {
          id: crypto.randomUUID(),
          userId: session.user.id,
          recommendationSettings: validatedData.recommendationSettings || {
            aiEnabled: true,
            frequency: 'always' as const,
            styleBasedPlaylists: true,
            useFeedbackForPersonalization: true,
            enableSeasonalRecommendations: true,
            aiDJEnabled: false,
            aiDJQueueThreshold: 2,
            aiDJBatchSize: 3,
            aiDJUseCurrentContext: true,
          },
          playbackSettings: validatedData.playbackSettings || {
            volume: 0.5,
            autoplayNext: true,
            crossfadeDuration: 0,
            defaultQuality: 'high' as const,
          },
          notificationSettings: validatedData.notificationSettings || {
            browserNotifications: false,
            downloadCompletion: true,
            recommendationUpdates: true,
          },
          dashboardLayout: validatedData.dashboardLayout || {
            showRecommendations: true,
            showRecentlyPlayed: true,
            widgetOrder: ['recommendations', 'recentlyPlayed'],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(userPreferences).values(newPrefs as any);
        return new Response(JSON.stringify({ data: newPrefs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Update existing preferences (merge with existing values)
        const updatedPrefs = {
          recommendationSettings: {
            aiEnabled: existingPrefs.recommendationSettings.aiEnabled,
            frequency: existingPrefs.recommendationSettings.frequency,
            styleBasedPlaylists: existingPrefs.recommendationSettings.styleBasedPlaylists,
            useFeedbackForPersonalization: existingPrefs.recommendationSettings.useFeedbackForPersonalization,
            enableSeasonalRecommendations: existingPrefs.recommendationSettings.enableSeasonalRecommendations,
            aiDJEnabled: existingPrefs.recommendationSettings.aiDJEnabled,
            aiDJQueueThreshold: existingPrefs.recommendationSettings.aiDJQueueThreshold,
            aiDJBatchSize: existingPrefs.recommendationSettings.aiDJBatchSize,
            aiDJUseCurrentContext: existingPrefs.recommendationSettings.aiDJUseCurrentContext,
            ...validatedData.recommendationSettings,
          },
          playbackSettings: {
            volume: existingPrefs.playbackSettings.volume,
            autoplayNext: existingPrefs.playbackSettings.autoplayNext,
            crossfadeDuration: existingPrefs.playbackSettings.crossfadeDuration,
            defaultQuality: existingPrefs.playbackSettings.defaultQuality,
            ...validatedData.playbackSettings,
          },
          notificationSettings: {
            browserNotifications: existingPrefs.notificationSettings.browserNotifications,
            downloadCompletion: existingPrefs.notificationSettings.downloadCompletion,
            recommendationUpdates: existingPrefs.notificationSettings.recommendationUpdates,
            ...validatedData.notificationSettings,
          },
          dashboardLayout: {
            showRecommendations: existingPrefs.dashboardLayout.showRecommendations,
            showRecentlyPlayed: existingPrefs.dashboardLayout.showRecentlyPlayed,
            widgetOrder: existingPrefs.dashboardLayout.widgetOrder,
            ...validatedData.dashboardLayout,
          },
          updatedAt: new Date(),
        };

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

        return new Response(JSON.stringify({ data: result }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error: unknown) {
      // Error handling with standardized patterns
      console.error('Failed to update preferences:', error);

      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid preference data',
          errors: error.issues,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update preferences';
      return new Response(JSON.stringify({
        code: 'PREFERENCES_UPDATE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
