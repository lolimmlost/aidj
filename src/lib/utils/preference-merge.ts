/**
 * Preference Merge Utilities
 *
 * Provides type-safe utilities for merging preference objects with proper
 * handling of nested objects, undefined values, and null overrides.
 *
 * Merge precedence: incoming values > existing values > defaults
 *
 * @example
 * ```typescript
 * // Deep merge with defaults
 * const merged = deepMergePreferences(defaults, existing, updates);
 *
 * // Merge specific preference section
 * const settings = mergePreferenceSection(defaults.playback, existing?.playback, updates?.playback);
 * ```
 */

import type {
  RecommendationSettings,
  PlaybackSettings,
  NotificationSettings,
  DashboardLayout,
  UserPreferences,
} from '../stores/preferences';

// ============================================================================
// Default Preference Values
// ============================================================================

/**
 * Default recommendation settings
 * Single source of truth for recommendation preferences
 */
export const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettings = {
  aiEnabled: true,
  frequency: 'always',
  styleBasedPlaylists: true,
  useFeedbackForPersonalization: true,
  enableSeasonalRecommendations: true,
  syncFeedbackToNavidrome: true,
  aiDJEnabled: false,
  aiDJQueueThreshold: 2,
  aiDJBatchSize: 3,
  aiDJUseCurrentContext: true,
  sourceMode: 'library',
  mixRatio: 70,
  harmonicMixingEnabled: true,
  harmonicMixingMode: 'flexible',
  bpmTolerance: 6,
};

/**
 * Default playback settings
 * Single source of truth for playback preferences
 */
export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  volume: 0.5,
  autoplayNext: true,
  crossfadeDuration: 0,
  defaultQuality: 'high',
};

/**
 * Default notification settings
 * Single source of truth for notification preferences
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  browserNotifications: false,
  downloadCompletion: true,
  recommendationUpdates: true,
};

/**
 * Default dashboard layout settings
 * Single source of truth for layout preferences
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  showRecommendations: true,
  showRecentlyPlayed: true,
  widgetOrder: ['recommendations', 'recentlyPlayed'],
};

/**
 * Complete default user preferences
 * Combines all default preference sections
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  recommendationSettings: DEFAULT_RECOMMENDATION_SETTINGS,
  playbackSettings: DEFAULT_PLAYBACK_SETTINGS,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
};

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Type guard to check if a value is a plain object (not array, null, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Type guard to check if a value is defined (not undefined)
 */
function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// ============================================================================
// Core Merge Functions
// ============================================================================

/**
 * Deep merge two objects, where source values override target values.
 *
 * Behavior:
 * - Primitive values from source override target
 * - undefined values in source are ignored (don't override target)
 * - null values in source DO override target (explicit null)
 * - Arrays are replaced entirely (not merged)
 * - Nested objects are recursively merged
 *
 * @param target - Base object (lower precedence)
 * @param source - Override object (higher precedence)
 * @returns Merged object with source values taking precedence
 *
 * @example
 * ```typescript
 * const result = deepMerge(
 *   { a: 1, b: { c: 2, d: 3 } },
 *   { a: 10, b: { c: 20 } }
 * );
 * // Result: { a: 10, b: { c: 20, d: 3 } }
 * ```
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T> | undefined | null
): T {
  // If source is null/undefined, return target as-is
  if (source === null || source === undefined) {
    return { ...target };
  }

  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    // Skip undefined values (don't override with undefined)
    if (sourceValue === undefined) {
      continue;
    }

    // null explicitly overrides
    if (sourceValue === null) {
      (result as Record<string, unknown>)[key as string] = null;
      continue;
    }

    // Arrays are replaced entirely
    if (Array.isArray(sourceValue)) {
      (result as Record<string, unknown>)[key as string] = [...sourceValue];
      continue;
    }

    // Recursively merge nested objects
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
      continue;
    }

    // For all other cases, source value wins
    (result as Record<string, unknown>)[key as string] = sourceValue;
  }

  return result;
}

/**
 * Merge a preference section with type safety.
 * Combines defaults, existing values, and updates with proper precedence.
 *
 * Precedence: updates > existing > defaults
 *
 * @param defaults - Default values (lowest precedence)
 * @param existing - Existing saved values (middle precedence)
 * @param updates - New values to apply (highest precedence)
 * @returns Merged section with all values filled
 *
 * @example
 * ```typescript
 * const settings = mergePreferenceSection(
 *   DEFAULT_PLAYBACK_SETTINGS,
 *   existingPrefs?.playbackSettings,
 *   { volume: 0.8 }
 * );
 * // Returns: { volume: 0.8, autoplayNext: true, ... }
 * ```
 */
export function mergePreferenceSection<T extends Record<string, unknown>>(
  defaults: T,
  existing: T | undefined | null,
  updates: Partial<T> | undefined | null
): T {
  // Start with defaults
  let result = { ...defaults };

  // Apply existing values if present
  if (existing) {
    result = deepMerge(result, existing);
  }

  // Apply updates if present
  if (updates) {
    result = deepMerge(result, updates);
  }

  return result;
}

// ============================================================================
// Preference-Specific Merge Functions
// ============================================================================

/**
 * Merge recommendation settings with type safety
 */
export function mergeRecommendationSettings(
  existing: RecommendationSettings | undefined | null,
  updates: Partial<RecommendationSettings> | undefined | null
): RecommendationSettings {
  return mergePreferenceSection(
    DEFAULT_RECOMMENDATION_SETTINGS,
    existing,
    updates
  );
}

/**
 * Merge playback settings with type safety
 */
export function mergePlaybackSettings(
  existing: PlaybackSettings | undefined | null,
  updates: Partial<PlaybackSettings> | undefined | null
): PlaybackSettings {
  return mergePreferenceSection(
    DEFAULT_PLAYBACK_SETTINGS,
    existing,
    updates
  );
}

/**
 * Merge notification settings with type safety
 */
export function mergeNotificationSettings(
  existing: NotificationSettings | undefined | null,
  updates: Partial<NotificationSettings> | undefined | null
): NotificationSettings {
  return mergePreferenceSection(
    DEFAULT_NOTIFICATION_SETTINGS,
    existing,
    updates
  );
}

/**
 * Merge dashboard layout with type safety
 */
export function mergeDashboardLayout(
  existing: DashboardLayout | undefined | null,
  updates: Partial<DashboardLayout> | undefined | null
): DashboardLayout {
  return mergePreferenceSection(
    DEFAULT_DASHBOARD_LAYOUT,
    existing,
    updates
  );
}

/**
 * Merge complete user preferences with proper handling of all sections.
 *
 * @param existing - Current saved preferences (can be undefined for new users)
 * @param updates - Partial updates to apply
 * @returns Complete merged preferences object
 *
 * @example
 * ```typescript
 * const merged = mergeUserPreferences(existingPrefs, {
 *   recommendationSettings: { aiEnabled: false },
 *   playbackSettings: { volume: 0.9 },
 * });
 * ```
 */
export function mergeUserPreferences(
  existing: UserPreferences | undefined | null,
  updates: Partial<UserPreferences> | undefined | null
): UserPreferences {
  return {
    // Preserve metadata fields if they exist
    id: updates?.id ?? existing?.id,
    userId: updates?.userId ?? existing?.userId,
    createdAt: updates?.createdAt ?? existing?.createdAt,
    updatedAt: updates?.updatedAt ?? existing?.updatedAt ?? new Date(),

    // Merge each settings section
    recommendationSettings: mergeRecommendationSettings(
      existing?.recommendationSettings,
      updates?.recommendationSettings
    ),
    playbackSettings: mergePlaybackSettings(
      existing?.playbackSettings,
      updates?.playbackSettings
    ),
    notificationSettings: mergeNotificationSettings(
      existing?.notificationSettings,
      updates?.notificationSettings
    ),
    dashboardLayout: mergeDashboardLayout(
      existing?.dashboardLayout,
      updates?.dashboardLayout
    ),
  };
}

// ============================================================================
// API-Specific Helpers
// ============================================================================

/**
 * Create a new preferences object for a user with defaults.
 * Used when creating preferences for a new user.
 *
 * @param userId - User ID to associate with preferences
 * @param overrides - Optional overrides to apply on top of defaults
 * @returns Complete preferences object ready for database insertion
 */
export function createDefaultPreferences(
  userId: string,
  overrides?: Partial<UserPreferences>
): UserPreferences & { id: string; userId: string; createdAt: Date; updatedAt: Date } {
  const now = new Date();
  const merged = mergeUserPreferences(null, overrides);

  return {
    id: crypto.randomUUID(),
    userId,
    recommendationSettings: merged.recommendationSettings,
    playbackSettings: merged.playbackSettings,
    notificationSettings: merged.notificationSettings,
    dashboardLayout: merged.dashboardLayout,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Prepare preferences update for database.
 * Merges existing preferences with updates and adds updatedAt timestamp.
 *
 * @param existing - Current preferences from database
 * @param updates - Partial updates to apply
 * @returns Object ready for database update operation
 */
export function preparePreferencesUpdate(
  existing: UserPreferences,
  updates: Partial<UserPreferences>
): Partial<UserPreferences> & { updatedAt: Date } {
  return {
    recommendationSettings: mergeRecommendationSettings(
      existing.recommendationSettings,
      updates.recommendationSettings
    ),
    playbackSettings: mergePlaybackSettings(
      existing.playbackSettings,
      updates.playbackSettings
    ),
    notificationSettings: mergeNotificationSettings(
      existing.notificationSettings,
      updates.notificationSettings
    ),
    dashboardLayout: mergeDashboardLayout(
      existing.dashboardLayout,
      updates.dashboardLayout
    ),
    updatedAt: new Date(),
  };
}
