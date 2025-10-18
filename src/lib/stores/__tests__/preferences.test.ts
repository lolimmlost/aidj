import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePreferencesStore } from '../preferences';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Preferences Store Tests', () => {
  const mockPreferencesData = {
    id: 'pref-123',
    userId: 'user-123',
    recommendationSettings: {
      aiEnabled: true,
      frequency: 'always' as const,
      styleBasedPlaylists: true,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have default preferences on initialization', () => {
      const { result } = renderHook(() => usePreferencesStore());

      expect(result.current.preferences).toBeDefined();
      expect(result.current.preferences.recommendationSettings.aiEnabled).toBe(true);
      expect(result.current.preferences.playbackSettings.volume).toBe(0.5);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('loadPreferences', () => {
    it('should load preferences from API successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockPreferencesData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.loadPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/preferences', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      expect(result.current.preferences).toEqual(mockPreferencesData);
      expect(result.current.error).toBe(null);
    });

    it('should set error state when API call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.loadPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load preferences');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.loadPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences via API successfully', async () => {
      const updatedData = {
        ...mockPreferencesData,
        playbackSettings: {
          ...mockPreferencesData.playbackSettings,
          volume: 0.8,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.updatePreferences({
          playbackSettings: { ...mockPreferencesData.playbackSettings, volume: 0.8 },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          playbackSettings: { ...mockPreferencesData.playbackSettings, volume: 0.8 },
        }),
      });

      expect(result.current.preferences.playbackSettings.volume).toBe(0.8);
      expect(result.current.error).toBe(null);
    });

    it('should set error state when update fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.updatePreferences({
          playbackSettings: { ...mockPreferencesData.playbackSettings, volume: 0.8 },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to update preferences');
    });
  });

  describe('setRecommendationSettings', () => {
    it('should update recommendation settings', async () => {
      const updatedData = {
        ...mockPreferencesData,
        recommendationSettings: {
          aiEnabled: false,
          frequency: 'daily' as const,
          styleBasedPlaylists: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.setRecommendationSettings({
          aiEnabled: false,
          frequency: 'daily',
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('setPlaybackSettings', () => {
    it('should update playback settings', async () => {
      const updatedData = {
        ...mockPreferencesData,
        playbackSettings: {
          ...mockPreferencesData.playbackSettings,
          volume: 0.7,
          autoplayNext: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.setPlaybackSettings({
          volume: 0.7,
          autoplayNext: false,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('setNotificationSettings', () => {
    it('should update notification settings', async () => {
      const updatedData = {
        ...mockPreferencesData,
        notificationSettings: {
          browserNotifications: true,
          downloadCompletion: false,
          recommendationUpdates: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.setNotificationSettings({
          browserNotifications: true,
          downloadCompletion: false,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('setDashboardLayout', () => {
    it('should update dashboard layout', async () => {
      const updatedData = {
        ...mockPreferencesData,
        dashboardLayout: {
          showRecommendations: false,
          showRecentlyPlayed: false,
          widgetOrder: ['recentlyPlayed', 'recommendations'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.setDashboardLayout({
          showRecommendations: false,
          showRecentlyPlayed: false,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset preferences to default state', () => {
      const { result } = renderHook(() => usePreferencesStore());

      act(() => {
        result.current.reset();
      });

      expect(result.current.preferences.recommendationSettings.aiEnabled).toBe(true);
      expect(result.current.preferences.playbackSettings.volume).toBe(0.5);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist preferences to localStorage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockPreferencesData }),
      });

      const { result } = renderHook(() => usePreferencesStore());

      await act(async () => {
        await result.current.loadPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check localStorage
      const stored = localStorage.getItem('user-preferences-storage');
      expect(stored).toBeTruthy();

      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.preferences).toBeDefined();
      }
    });
  });
});
