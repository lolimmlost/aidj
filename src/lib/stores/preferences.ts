import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_USER_PREFERENCES,
  mergeRecommendationSettings,
  mergePlaybackSettings,
  mergeNotificationSettings,
  mergeDashboardLayout,
} from '../utils/preference-merge';

// Types matching database schema
// Story 7.1: Source mode for recommendations
export type SourceMode = 'library' | 'discovery' | 'mix';

export interface RecommendationSettings {
  aiEnabled: boolean;
  frequency: 'always' | 'daily' | 'weekly';
  styleBasedPlaylists: boolean;
  useFeedbackForPersonalization: boolean;
  enableSeasonalRecommendations?: boolean;
  syncFeedbackToNavidrome?: boolean; // Story 3.9: Sync thumbs up/down to Navidrome star
  // Story 3.9: AI DJ Mode
  aiDJEnabled: boolean;
  aiDJQueueThreshold: number;
  aiDJBatchSize: number;
  aiDJUseCurrentContext: boolean;
  // Story 7.1: Source Mode Toggle
  sourceMode: SourceMode;
  mixRatio: number; // Percentage of library songs in mix mode (0-100)
  // Story 7.5: Harmonic Mixing Settings
  harmonicMixingEnabled?: boolean; // Show BPM/key compatibility in recommendations
  harmonicMixingMode?: 'strict' | 'flexible' | 'off'; // Strictness of harmonic matching
  bpmTolerance?: number; // Max BPM difference percentage (default: 6%)
}

export interface PlaybackSettings {
  volume: number;
  autoplayNext: boolean;
  crossfadeDuration: number;
  defaultQuality: 'low' | 'medium' | 'high';
}

export interface NotificationSettings {
  browserNotifications: boolean;
  downloadCompletion: boolean;
  recommendationUpdates: boolean;
}

export interface DashboardLayout {
  showRecommendations: boolean;
  showRecentlyPlayed: boolean;
  widgetOrder: string[];
}

export interface UserPreferences {
  id?: string;
  userId?: string;
  recommendationSettings: RecommendationSettings;
  playbackSettings: PlaybackSettings;
  notificationSettings: NotificationSettings;
  dashboardLayout: DashboardLayout;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PreferencesState {
  preferences: UserPreferences;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPreferences: () => Promise<void>;
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  setRecommendationSettings: (settings: Partial<RecommendationSettings>) => Promise<void>;
  setPlaybackSettings: (settings: Partial<PlaybackSettings>) => Promise<void>;
  setNotificationSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
  setDashboardLayout: (layout: Partial<DashboardLayout>) => Promise<void>;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      preferences: DEFAULT_USER_PREFERENCES,
      isLoading: false,
      error: null,

      // Load preferences from backend
      loadPreferences: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/preferences', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to load preferences');
          }

          const { data } = await response.json();
          set({
            preferences: data,
            isLoading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load preferences';
          set({
            error: message,
            isLoading: false,
          });
          console.error('Error loading preferences:', error);
        }
      },

      // Update preferences on backend
      updatePreferences: async (updates: Partial<UserPreferences>) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/preferences', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(updates),
          });

          if (!response.ok) {
            throw new Error('Failed to update preferences');
          }

          const { data } = await response.json();
          set({
            preferences: data,
            isLoading: false,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update preferences';
          set({
            error: message,
            isLoading: false,
          });
          console.error('Error updating preferences:', error);
        }
      },

      // Set recommendation settings using merge utility
      setRecommendationSettings: async (settings: Partial<RecommendationSettings>) => {
        const current = get().preferences;
        const mergedSettings = mergeRecommendationSettings(
          current.recommendationSettings,
          settings
        );
        await get().updatePreferences({
          recommendationSettings: mergedSettings,
        });
      },

      // Set playback settings using merge utility
      setPlaybackSettings: async (settings: Partial<PlaybackSettings>) => {
        const current = get().preferences;
        const mergedSettings = mergePlaybackSettings(
          current.playbackSettings,
          settings
        );
        await get().updatePreferences({
          playbackSettings: mergedSettings,
        });
      },

      // Set notification settings using merge utility
      setNotificationSettings: async (settings: Partial<NotificationSettings>) => {
        const current = get().preferences;
        const mergedSettings = mergeNotificationSettings(
          current.notificationSettings,
          settings
        );
        await get().updatePreferences({
          notificationSettings: mergedSettings,
        });
      },

      // Set dashboard layout using merge utility
      setDashboardLayout: async (layout: Partial<DashboardLayout>) => {
        const current = get().preferences;
        const mergedLayout = mergeDashboardLayout(
          current.dashboardLayout,
          layout
        );
        await get().updatePreferences({
          dashboardLayout: mergedLayout,
        });
      },

      // Reset to default preferences using centralized defaults
      reset: () => {
        set({
          preferences: DEFAULT_USER_PREFERENCES,
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: 'user-preferences-storage', // localStorage key
      partialize: (state) => ({ preferences: state.preferences }), // Only persist preferences, not loading/error state
    }
  )
);
