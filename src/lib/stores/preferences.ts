import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types matching database schema
export interface RecommendationSettings {
  aiEnabled: boolean;
  frequency: 'always' | 'daily' | 'weekly';
  styleBasedPlaylists: boolean;
  useFeedbackForPersonalization: boolean;
  enableSeasonalRecommendations?: boolean;
  // Story 3.9: AI DJ Mode
  aiDJEnabled: boolean;
  aiDJQueueThreshold: number;
  aiDJBatchSize: number;
  aiDJUseCurrentContext: boolean;
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

const defaultPreferences: UserPreferences = {
  recommendationSettings: {
    aiEnabled: true,
    frequency: 'always',
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
    defaultQuality: 'high',
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
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      preferences: defaultPreferences,
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

      // Set recommendation settings
      setRecommendationSettings: async (settings: Partial<RecommendationSettings>) => {
        const current = get().preferences;
        await get().updatePreferences({
          recommendationSettings: {
            ...current.recommendationSettings,
            ...settings,
          },
        });
      },

      // Set playback settings
      setPlaybackSettings: async (settings: Partial<PlaybackSettings>) => {
        const current = get().preferences;
        await get().updatePreferences({
          playbackSettings: {
            ...current.playbackSettings,
            ...settings,
          },
        });
      },

      // Set notification settings
      setNotificationSettings: async (settings: Partial<NotificationSettings>) => {
        const current = get().preferences;
        await get().updatePreferences({
          notificationSettings: {
            ...current.notificationSettings,
            ...settings,
          },
        });
      },

      // Set dashboard layout
      setDashboardLayout: async (layout: Partial<DashboardLayout>) => {
        const current = get().preferences;
        await get().updatePreferences({
          dashboardLayout: {
            ...current.dashboardLayout,
            ...layout,
          },
        });
      },

      // Reset to default preferences
      reset: () => {
        set({
          preferences: defaultPreferences,
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
