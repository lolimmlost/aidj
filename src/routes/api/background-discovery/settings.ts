/**
 * Background Discovery Settings API
 *
 * GET /api/background-discovery/settings - Get discovery settings
 * PUT /api/background-discovery/settings - Update discovery settings
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '@/lib/db';
import { discoveryJobState } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { getBackgroundDiscoveryManager, DEFAULT_BACKGROUND_DISCOVERY_CONFIG } from '@/lib/services/background-discovery';

// Settings update schema
const SettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  frequencyHours: z.number().min(6).max(72).optional(),
  maxSuggestionsPerRun: z.number().min(5).max(50).optional(),
  seedCount: z.number().min(3).max(20).optional(),
  excludedGenres: z.array(z.string()).optional(),
});

// GET /api/background-discovery/settings
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Get job state from database
    const jobState = await db
      .select()
      .from(discoveryJobState)
      .where(eq(discoveryJobState.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    // Return settings with defaults - read from database first, then defaults
    return successResponse({
      enabled: jobState?.enabled ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.enabled,
      frequencyHours: jobState?.frequencyHours ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.frequencyHours,
      maxSuggestionsPerRun: jobState?.maxSuggestionsPerRun ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.maxSuggestionsPerRun,
      seedCount: jobState?.seedCount ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.seedCount,
      excludedGenres: DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.excludedGenres,
    });
  },
  {
    service: 'background-discovery',
    operation: 'get-settings',
    defaultCode: 'SETTINGS_ERROR',
    defaultMessage: 'Failed to get discovery settings',
  }
);

// PUT /api/background-discovery/settings
const PUT = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();
    const updates = SettingsUpdateSchema.parse(body);

    // Update database with all settings
    await db
      .insert(discoveryJobState)
      .values({
        userId,
        enabled: updates.enabled ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.enabled,
        frequencyHours: updates.frequencyHours ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.frequencyHours,
        maxSuggestionsPerRun: updates.maxSuggestionsPerRun ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.maxSuggestionsPerRun,
        seedCount: updates.seedCount ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.seedCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: discoveryJobState.userId,
        set: {
          ...(updates.enabled !== undefined && { enabled: updates.enabled }),
          ...(updates.frequencyHours !== undefined && { frequencyHours: updates.frequencyHours }),
          ...(updates.maxSuggestionsPerRun !== undefined && { maxSuggestionsPerRun: updates.maxSuggestionsPerRun }),
          ...(updates.seedCount !== undefined && { seedCount: updates.seedCount }),
          updatedAt: new Date(),
        },
      });

    // Try to update the running manager
    try {
      const manager = getBackgroundDiscoveryManager();

      if (updates.enabled !== undefined || updates.frequencyHours !== undefined) {
        await manager.updateConfig({
          enabled: updates.enabled,
          frequencyHours: updates.frequencyHours,
        });
      }

      if (updates.maxSuggestionsPerRun !== undefined || updates.seedCount !== undefined) {
        const currentConfig = manager['config']?.discoveryConfig || DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig;
        await manager.updateConfig({
          discoveryConfig: {
            ...currentConfig,
            maxSuggestionsPerRun: updates.maxSuggestionsPerRun ?? currentConfig.maxSuggestionsPerRun,
            seedCount: updates.seedCount ?? currentConfig.seedCount,
            excludedGenres: updates.excludedGenres ?? currentConfig.excludedGenres,
          },
        });
      }
    } catch {
      // Manager may not be initialized
    }

    // Return updated settings from database
    const jobState = await db
      .select()
      .from(discoveryJobState)
      .where(eq(discoveryJobState.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    return successResponse({
      enabled: jobState?.enabled ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.enabled,
      frequencyHours: jobState?.frequencyHours ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.frequencyHours,
      maxSuggestionsPerRun: jobState?.maxSuggestionsPerRun ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.maxSuggestionsPerRun,
      seedCount: jobState?.seedCount ?? DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.seedCount,
      excludedGenres: DEFAULT_BACKGROUND_DISCOVERY_CONFIG.discoveryConfig.excludedGenres,
    });
  },
  {
    service: 'background-discovery',
    operation: 'update-settings',
    defaultCode: 'SETTINGS_UPDATE_ERROR',
    defaultMessage: 'Failed to update discovery settings',
  }
);

export const Route = createFileRoute("/api/background-discovery/settings")({
  server: {
    handlers: {
      GET,
      PUT,
    },
  },
});
