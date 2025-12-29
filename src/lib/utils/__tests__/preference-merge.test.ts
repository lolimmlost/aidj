import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  deepMerge,
  mergePreferenceSection,
  mergeRecommendationSettings,
  mergePlaybackSettings,
  mergeNotificationSettings,
  mergeDashboardLayout,
  mergeUserPreferences,
  createDefaultPreferences,
  preparePreferencesUpdate,
  DEFAULT_RECOMMENDATION_SETTINGS,
  DEFAULT_PLAYBACK_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_DASHBOARD_LAYOUT,
  DEFAULT_USER_PREFERENCES,
} from '../preference-merge';
import type {
  RecommendationSettings,
  PlaybackSettings,
  NotificationSettings,
  DashboardLayout,
  UserPreferences,
} from '../../stores/preferences';

describe('Preference Merge Utilities', () => {
  describe('deepMerge', () => {
    it('should return a copy of target when source is undefined', () => {
      const target = { a: 1, b: 2 };
      const result = deepMerge(target, undefined);
      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(target); // Should be a new object
    });

    it('should return a copy of target when source is null', () => {
      const target = { a: 1, b: 2 };
      const result = deepMerge(target, null);
      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(target);
    });

    it('should override primitive values from source', () => {
      const target = { a: 1, b: 2 };
      const source = { a: 10 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 10, b: 2 });
    });

    it('should NOT override with undefined values', () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, b: 20 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 20 });
    });

    it('should override with null values (explicit null)', () => {
      const target = { a: 1, b: 2 };
      const source = { a: null } as Partial<{ a: number | null; b: number }>;
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: null, b: 2 });
    });

    it('should replace arrays entirely (not merge)', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ arr: [4, 5] });
    });

    it('should deep merge nested objects', () => {
      const target = { nested: { a: 1, b: 2, c: 3 } };
      const source = { nested: { a: 10, b: 20 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ nested: { a: 10, b: 20, c: 3 } });
    });

    it('should handle deeply nested objects', () => {
      const target = {
        level1: {
          level2: {
            level3: { a: 1, b: 2 },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: { a: 100 },
          },
        },
      };
      const result = deepMerge(target, source);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: { a: 100, b: 2 },
          },
        },
      });
    });

    it('should preserve other primitive types', () => {
      const target = { str: 'hello', num: 42, bool: false };
      const source = { str: 'world', bool: true };
      const result = deepMerge(target, source);
      expect(result).toEqual({ str: 'world', num: 42, bool: true });
    });
  });

  describe('mergePreferenceSection', () => {
    it('should return defaults when both existing and updates are undefined', () => {
      const defaults = { a: 1, b: 2 };
      const result = mergePreferenceSection(defaults, undefined, undefined);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should merge existing over defaults', () => {
      const defaults = { a: 1, b: 2 };
      const existing = { a: 10 } as typeof defaults;
      const result = mergePreferenceSection(defaults, existing, undefined);
      expect(result).toEqual({ a: 10, b: 2 });
    });

    it('should merge updates over existing over defaults', () => {
      const defaults = { a: 1, b: 2, c: 3 };
      const existing = { a: 10, b: 20 } as typeof defaults;
      const updates = { a: 100 };
      const result = mergePreferenceSection(defaults, existing, updates);
      expect(result).toEqual({ a: 100, b: 20, c: 3 });
    });

    it('should handle null existing values', () => {
      const defaults = { a: 1, b: 2 };
      const result = mergePreferenceSection(defaults, null, { b: 20 });
      expect(result).toEqual({ a: 1, b: 20 });
    });
  });

  describe('mergeRecommendationSettings', () => {
    it('should return defaults when both params are null/undefined', () => {
      const result = mergeRecommendationSettings(null, null);
      expect(result).toEqual(DEFAULT_RECOMMENDATION_SETTINGS);
    });

    it('should preserve existing values', () => {
      const existing: RecommendationSettings = {
        ...DEFAULT_RECOMMENDATION_SETTINGS,
        aiEnabled: false,
        frequency: 'weekly',
      };
      const result = mergeRecommendationSettings(existing, null);
      expect(result.aiEnabled).toBe(false);
      expect(result.frequency).toBe('weekly');
      expect(result.styleBasedPlaylists).toBe(DEFAULT_RECOMMENDATION_SETTINGS.styleBasedPlaylists);
    });

    it('should apply updates over existing', () => {
      const existing: RecommendationSettings = {
        ...DEFAULT_RECOMMENDATION_SETTINGS,
        aiEnabled: false,
      };
      const updates = { aiEnabled: true, aiDJEnabled: true };
      const result = mergeRecommendationSettings(existing, updates);
      expect(result.aiEnabled).toBe(true);
      expect(result.aiDJEnabled).toBe(true);
    });

    it('should handle AI DJ settings correctly', () => {
      const updates = {
        aiDJEnabled: true,
        aiDJQueueThreshold: 3,
        aiDJBatchSize: 5,
      };
      const result = mergeRecommendationSettings(null, updates);
      expect(result.aiDJEnabled).toBe(true);
      expect(result.aiDJQueueThreshold).toBe(3);
      expect(result.aiDJBatchSize).toBe(5);
      expect(result.aiDJUseCurrentContext).toBe(DEFAULT_RECOMMENDATION_SETTINGS.aiDJUseCurrentContext);
    });

    it('should handle harmonic mixing settings', () => {
      const updates = {
        harmonicMixingEnabled: false,
        harmonicMixingMode: 'strict' as const,
        bpmTolerance: 10,
      };
      const result = mergeRecommendationSettings(null, updates);
      expect(result.harmonicMixingEnabled).toBe(false);
      expect(result.harmonicMixingMode).toBe('strict');
      expect(result.bpmTolerance).toBe(10);
    });
  });

  describe('mergePlaybackSettings', () => {
    it('should return defaults when both params are null/undefined', () => {
      const result = mergePlaybackSettings(null, null);
      expect(result).toEqual(DEFAULT_PLAYBACK_SETTINGS);
    });

    it('should preserve existing values', () => {
      const existing: PlaybackSettings = {
        volume: 0.8,
        autoplayNext: false,
        crossfadeDuration: 5,
        defaultQuality: 'medium',
      };
      const result = mergePlaybackSettings(existing, null);
      expect(result).toEqual(existing);
    });

    it('should apply partial updates', () => {
      const existing: PlaybackSettings = {
        volume: 0.5,
        autoplayNext: true,
        crossfadeDuration: 0,
        defaultQuality: 'high',
      };
      const updates = { volume: 0.9 };
      const result = mergePlaybackSettings(existing, updates);
      expect(result.volume).toBe(0.9);
      expect(result.autoplayNext).toBe(true);
      expect(result.crossfadeDuration).toBe(0);
      expect(result.defaultQuality).toBe('high');
    });
  });

  describe('mergeNotificationSettings', () => {
    it('should return defaults when both params are null/undefined', () => {
      const result = mergeNotificationSettings(null, null);
      expect(result).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    });

    it('should apply updates over existing', () => {
      const existing: NotificationSettings = {
        browserNotifications: false,
        downloadCompletion: true,
        recommendationUpdates: true,
      };
      const updates = { browserNotifications: true };
      const result = mergeNotificationSettings(existing, updates);
      expect(result.browserNotifications).toBe(true);
      expect(result.downloadCompletion).toBe(true);
    });
  });

  describe('mergeDashboardLayout', () => {
    it('should return defaults when both params are null/undefined', () => {
      const result = mergeDashboardLayout(null, null);
      expect(result).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    });

    it('should replace widgetOrder array entirely', () => {
      const existing: DashboardLayout = {
        showRecommendations: true,
        showRecentlyPlayed: true,
        widgetOrder: ['recommendations', 'recentlyPlayed'],
      };
      const updates = { widgetOrder: ['recentlyPlayed', 'recommendations', 'newWidget'] };
      const result = mergeDashboardLayout(existing, updates);
      expect(result.widgetOrder).toEqual(['recentlyPlayed', 'recommendations', 'newWidget']);
    });

    it('should preserve boolean flags when updating array', () => {
      const existing: DashboardLayout = {
        showRecommendations: false,
        showRecentlyPlayed: false,
        widgetOrder: ['a', 'b'],
      };
      const updates = { widgetOrder: ['c', 'd'] };
      const result = mergeDashboardLayout(existing, updates);
      expect(result.showRecommendations).toBe(false);
      expect(result.showRecentlyPlayed).toBe(false);
    });
  });

  describe('mergeUserPreferences', () => {
    it('should return full defaults when both params are null', () => {
      const result = mergeUserPreferences(null, null);
      expect(result.recommendationSettings).toEqual(DEFAULT_RECOMMENDATION_SETTINGS);
      expect(result.playbackSettings).toEqual(DEFAULT_PLAYBACK_SETTINGS);
      expect(result.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
      expect(result.dashboardLayout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    });

    it('should preserve metadata fields from existing', () => {
      const existing: UserPreferences = {
        id: 'pref-123',
        userId: 'user-456',
        ...DEFAULT_USER_PREFERENCES,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };
      const result = mergeUserPreferences(existing, null);
      expect(result.id).toBe('pref-123');
      expect(result.userId).toBe('user-456');
      expect(result.createdAt).toEqual(new Date('2024-01-01'));
    });

    it('should update specific sections while preserving others', () => {
      const existing: UserPreferences = {
        ...DEFAULT_USER_PREFERENCES,
        recommendationSettings: {
          ...DEFAULT_RECOMMENDATION_SETTINGS,
          aiEnabled: false,
        },
      };
      const updates = {
        playbackSettings: { volume: 0.9 } as Partial<PlaybackSettings>,
      };
      const result = mergeUserPreferences(existing, updates as Partial<UserPreferences>);
      expect(result.recommendationSettings.aiEnabled).toBe(false); // Preserved
      expect(result.playbackSettings.volume).toBe(0.9); // Updated
      expect(result.playbackSettings.autoplayNext).toBe(true); // Default preserved
    });

    it('should handle complex partial updates', () => {
      const existing: UserPreferences = {
        id: 'pref-1',
        userId: 'user-1',
        recommendationSettings: {
          ...DEFAULT_RECOMMENDATION_SETTINGS,
          aiEnabled: true,
          frequency: 'daily',
        },
        playbackSettings: DEFAULT_PLAYBACK_SETTINGS,
        notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
        dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
      };
      const updates: Partial<UserPreferences> = {
        recommendationSettings: {
          aiDJEnabled: true,
          aiDJQueueThreshold: 4,
        } as Partial<RecommendationSettings>,
        notificationSettings: {
          browserNotifications: true,
        } as Partial<NotificationSettings>,
      };
      const result = mergeUserPreferences(existing, updates);

      // Recommendation settings: existing + updates
      expect(result.recommendationSettings.aiEnabled).toBe(true);
      expect(result.recommendationSettings.frequency).toBe('daily');
      expect(result.recommendationSettings.aiDJEnabled).toBe(true);
      expect(result.recommendationSettings.aiDJQueueThreshold).toBe(4);

      // Notification settings: existing + updates
      expect(result.notificationSettings.browserNotifications).toBe(true);
      expect(result.notificationSettings.downloadCompletion).toBe(true);

      // Others unchanged
      expect(result.playbackSettings).toEqual(DEFAULT_PLAYBACK_SETTINGS);
      expect(result.dashboardLayout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    });
  });

  describe('createDefaultPreferences', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create preferences with user ID and timestamps', () => {
      const result = createDefaultPreferences('user-123');
      expect(result.userId).toBe('user-123');
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.createdAt).toEqual(new Date('2024-06-15T10:00:00Z'));
      expect(result.updatedAt).toEqual(new Date('2024-06-15T10:00:00Z'));
    });

    it('should use default values for all settings', () => {
      const result = createDefaultPreferences('user-123');
      expect(result.recommendationSettings).toEqual(DEFAULT_RECOMMENDATION_SETTINGS);
      expect(result.playbackSettings).toEqual(DEFAULT_PLAYBACK_SETTINGS);
      expect(result.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
      expect(result.dashboardLayout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    });

    it('should apply overrides on top of defaults', () => {
      const overrides: Partial<UserPreferences> = {
        recommendationSettings: {
          aiEnabled: false,
        } as Partial<RecommendationSettings>,
        playbackSettings: {
          volume: 0.3,
        } as Partial<PlaybackSettings>,
      };
      const result = createDefaultPreferences('user-123', overrides);
      expect(result.recommendationSettings.aiEnabled).toBe(false);
      expect(result.recommendationSettings.frequency).toBe('always'); // Default
      expect(result.playbackSettings.volume).toBe(0.3);
      expect(result.playbackSettings.autoplayNext).toBe(true); // Default
    });

    it('should generate unique IDs', () => {
      const result1 = createDefaultPreferences('user-1');
      const result2 = createDefaultPreferences('user-2');
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('preparePreferencesUpdate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-20T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add updatedAt timestamp', () => {
      const existing: UserPreferences = {
        ...DEFAULT_USER_PREFERENCES,
      };
      const updates = {};
      const result = preparePreferencesUpdate(existing, updates);
      expect(result.updatedAt).toEqual(new Date('2024-06-20T12:00:00Z'));
    });

    it('should merge updates with existing preferences', () => {
      const existing: UserPreferences = {
        ...DEFAULT_USER_PREFERENCES,
        playbackSettings: {
          volume: 0.5,
          autoplayNext: true,
          crossfadeDuration: 2,
          defaultQuality: 'high',
        },
      };
      const updates: Partial<UserPreferences> = {
        playbackSettings: {
          volume: 0.8,
          crossfadeDuration: 5,
        } as Partial<PlaybackSettings>,
      };
      const result = preparePreferencesUpdate(existing, updates);
      expect(result.playbackSettings?.volume).toBe(0.8);
      expect(result.playbackSettings?.crossfadeDuration).toBe(5);
      expect(result.playbackSettings?.autoplayNext).toBe(true); // Preserved
      expect(result.playbackSettings?.defaultQuality).toBe('high'); // Preserved
    });

    it('should include all sections in the update', () => {
      const existing: UserPreferences = DEFAULT_USER_PREFERENCES;
      const updates: Partial<UserPreferences> = {
        recommendationSettings: { aiEnabled: false } as Partial<RecommendationSettings>,
      };
      const result = preparePreferencesUpdate(existing, updates);
      expect(result.recommendationSettings).toBeDefined();
      expect(result.playbackSettings).toBeDefined();
      expect(result.notificationSettings).toBeDefined();
      expect(result.dashboardLayout).toBeDefined();
    });
  });

  describe('DEFAULT_USER_PREFERENCES', () => {
    it('should have all required sections', () => {
      expect(DEFAULT_USER_PREFERENCES.recommendationSettings).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.playbackSettings).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.notificationSettings).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.dashboardLayout).toBeDefined();
    });

    it('should match individual default exports', () => {
      expect(DEFAULT_USER_PREFERENCES.recommendationSettings).toEqual(DEFAULT_RECOMMENDATION_SETTINGS);
      expect(DEFAULT_USER_PREFERENCES.playbackSettings).toEqual(DEFAULT_PLAYBACK_SETTINGS);
      expect(DEFAULT_USER_PREFERENCES.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
      expect(DEFAULT_USER_PREFERENCES.dashboardLayout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const target = { a: 1, b: 2 };
      const result = deepMerge(target, {});
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should handle boolean false values correctly', () => {
      const existing: PlaybackSettings = {
        ...DEFAULT_PLAYBACK_SETTINGS,
        autoplayNext: true,
      };
      const updates = { autoplayNext: false };
      const result = mergePlaybackSettings(existing, updates);
      expect(result.autoplayNext).toBe(false);
    });

    it('should handle zero values correctly', () => {
      const existing: PlaybackSettings = {
        ...DEFAULT_PLAYBACK_SETTINGS,
        volume: 0.5,
        crossfadeDuration: 5,
      };
      const updates = { volume: 0, crossfadeDuration: 0 };
      const result = mergePlaybackSettings(existing, updates);
      expect(result.volume).toBe(0);
      expect(result.crossfadeDuration).toBe(0);
    });

    it('should handle empty arrays', () => {
      const existing: DashboardLayout = {
        ...DEFAULT_DASHBOARD_LAYOUT,
        widgetOrder: ['a', 'b', 'c'],
      };
      const updates = { widgetOrder: [] as string[] };
      const result = mergeDashboardLayout(existing, updates);
      expect(result.widgetOrder).toEqual([]);
    });

    it('should not mutate input objects', () => {
      const existing: PlaybackSettings = {
        volume: 0.5,
        autoplayNext: true,
        crossfadeDuration: 0,
        defaultQuality: 'high',
      };
      const updates = { volume: 0.9 };
      const originalExisting = { ...existing };

      mergePlaybackSettings(existing, updates);

      expect(existing).toEqual(originalExisting);
    });
  });
});
