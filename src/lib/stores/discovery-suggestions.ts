/**
 * Discovery Suggestions Store
 *
 * Manages the state of background discovery suggestions in the UI.
 * Handles fetching, approving, rejecting, and dismissing suggestions.
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import { useDiscoveryQueueStore } from './discovery-queue';

// ============================================================================
// Types
// ============================================================================

export interface DiscoverySuggestion {
  id: string;
  userId: string;
  artistName: string;
  trackName: string;
  albumName: string | null;
  source: 'similar_track' | 'artist_top_track' | 'genre_based';
  seedArtist: string;
  seedTrack: string | null;
  matchScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'dismissed';
  lastFmUrl: string | null;
  imageUrl: string | null;
  genres: string[];
  explanation: string | null;
  suggestedAt: string;
  reviewedAt: string | null;
}

export interface DiscoveryStats {
  pending: number;
  approved: number;
  rejected: number;
  dismissed: number;
}

export interface DiscoveryStatus {
  enabled: boolean;
  frequencyHours: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  consecutiveFailures: number;
  lastError: string | null;
  totalSuggestionsGenerated: number;
  totalApproved: number;
  totalRejected: number;
  pendingCount: number;
  stats: DiscoveryStats;
  approvalRate: number;
}

export interface DiscoverySettings {
  enabled: boolean;
  frequencyHours: number;
  maxSuggestionsPerRun: number;
  seedCount: number;
  excludedGenres: string[];
}

interface DiscoverySuggestionsState {
  // State
  suggestions: DiscoverySuggestion[];
  status: DiscoveryStatus | null;
  settings: DiscoverySettings | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  isTriggering: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  loadedCount: number; // Track actual items loaded from server (not affected by local removes)

  // Actions
  fetchSuggestions: () => Promise<void>;
  loadMore: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  approve: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  revert: (id: string) => Promise<void>;
  approveMultiple: (ids: string[]) => Promise<void>;
  triggerDiscovery: () => Promise<void>;
  updateSettings: (settings: Partial<DiscoverySettings>) => Promise<void>;

  // Queries
  getPending: () => DiscoverySuggestion[];
  getBySource: (source: string) => DiscoverySuggestion[];
}

// ============================================================================
// Store Implementation
// ============================================================================

const SUGGESTIONS_PAGE_SIZE = 20;

export const useDiscoverySuggestionsStore = create<DiscoverySuggestionsState>()(
  (set, get) => ({
    suggestions: [],
    status: null,
    settings: null,
    isLoading: false,
    isLoadingMore: false,
    isTriggering: false,
    error: null,
    hasMore: false,
    total: 0,
    loadedCount: 0,

    fetchSuggestions: async () => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch(`/api/background-discovery/suggestions?limit=${SUGGESTIONS_PAGE_SIZE}&offset=0`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }

        const { data } = await response.json();
        set({
          suggestions: data.suggestions,
          hasMore: data.pagination.hasMore,
          total: data.pagination.total,
          loadedCount: data.suggestions.length,
          isLoading: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch suggestions';
        set({ error: message, isLoading: false });
        console.error('Error fetching suggestions:', error);
      }
    },

    loadMore: async () => {
      const { suggestions, hasMore, isLoadingMore, loadedCount } = get();
      if (!hasMore || isLoadingMore) return;

      set({ isLoadingMore: true });

      try {
        // Use loadedCount as offset (not suggestions.length which changes when items are removed)
        const offset = loadedCount;
        const response = await fetch(`/api/background-discovery/suggestions?limit=${SUGGESTIONS_PAGE_SIZE}&offset=${offset}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to load more suggestions');
        }

        const { data } = await response.json();
        set({
          suggestions: [...suggestions, ...data.suggestions],
          hasMore: data.pagination.hasMore,
          total: data.pagination.total,
          loadedCount: loadedCount + data.suggestions.length,
          isLoadingMore: false,
        });
      } catch (error) {
        console.error('Error loading more suggestions:', error);
        set({ isLoadingMore: false });
      }
    },

    fetchStatus: async () => {
      try {
        const response = await fetch('/api/background-discovery/status', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }

        const { data } = await response.json();
        set({ status: data });
      } catch (error) {
        console.error('Error fetching status:', error);
      }
    },

    fetchSettings: async () => {
      try {
        const response = await fetch('/api/background-discovery/settings', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch settings');
        }

        const { data } = await response.json();
        set({ settings: data });
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    },

    approve: async (id: string) => {
      const suggestion = get().suggestions.find(s => s.id === id);
      if (!suggestion) return;

      try {
        const response = await fetch(`/api/background-discovery/suggestions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'approve' }),
        });

        if (!response.ok) {
          throw new Error('Failed to approve suggestion');
        }

        // Remove from local state
        set(state => ({
          suggestions: state.suggestions.filter(s => s.id !== id),
        }));

        // Add to discovery queue for tracking
        const discoveryQueue = useDiscoveryQueueStore.getState();
        const result = discoveryQueue.addDiscoveryIfNotExists({
          artist: suggestion.artistName,
          title: suggestion.trackName,
          song: `${suggestion.artistName} - ${suggestion.trackName}`,
          source: 'lastfm',
        });

        if (result.isDuplicate) {
          toast.info(`"${suggestion.trackName}" is already in the download queue`);
        } else {
          // Trigger Lidarr download
          const songQuery = `${suggestion.artistName} - ${suggestion.trackName}`;
          try {
            const lidarrResponse = await fetch('/api/lidarr/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ song: songQuery }),
            });

            const lidarrData = await lidarrResponse.json();
            if (lidarrResponse.ok) {
              toast.success(lidarrData.message || `Queued "${suggestion.trackName}" for download`);
            } else {
              toast.error(lidarrData.message || lidarrData.error || 'Failed to add to Lidarr');
              // Revert suggestion back to pending so user can retry
              await get().revert(id);
              // Update discovery queue status to failed
              if (result.id) {
                discoveryQueue.updateStatus(result.id, 'failed');
                discoveryQueue.setError(result.id, lidarrData.message || 'Lidarr add failed');
              }
            }
          } catch (lidarrError) {
            console.error('Error calling Lidarr:', lidarrError);
            toast.error('Failed to send to Lidarr');
            // Revert suggestion back to pending so user can retry
            await get().revert(id);
            if (result.id) {
              discoveryQueue.updateStatus(result.id, 'failed');
            }
          }
        }

        // Refresh status
        get().fetchStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve';
        toast.error(message);
        console.error('Error approving suggestion:', error);
      }
    },

    revert: async (id: string) => {
      try {
        const response = await fetch(`/api/background-discovery/suggestions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'revert' }),
        });

        if (!response.ok) {
          console.error('Failed to revert suggestion');
          return;
        }

        // Re-fetch suggestions to show the reverted item
        await get().fetchSuggestions();
      } catch (error) {
        console.error('Error reverting suggestion:', error);
      }
    },

    reject: async (id: string) => {
      const suggestion = get().suggestions.find(s => s.id === id);
      if (!suggestion) return;

      try {
        const response = await fetch(`/api/background-discovery/suggestions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'reject' }),
        });

        if (!response.ok) {
          throw new Error('Failed to reject suggestion');
        }

        // Remove from local state
        set(state => ({
          suggestions: state.suggestions.filter(s => s.id !== id),
        }));

        toast.success(`Rejected "${suggestion.trackName}" - won't suggest again for 30 days`);

        // Refresh status
        get().fetchStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reject';
        toast.error(message);
        console.error('Error rejecting suggestion:', error);
      }
    },

    dismiss: async (id: string) => {
      const suggestion = get().suggestions.find(s => s.id === id);
      if (!suggestion) return;

      try {
        const response = await fetch(`/api/background-discovery/suggestions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'dismiss' }),
        });

        if (!response.ok) {
          throw new Error('Failed to dismiss suggestion');
        }

        // Remove from local state
        set(state => ({
          suggestions: state.suggestions.filter(s => s.id !== id),
        }));

        // Refresh status
        get().fetchStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to dismiss';
        toast.error(message);
        console.error('Error dismissing suggestion:', error);
      }
    },

    approveMultiple: async (ids: string[]) => {
      let approvedCount = 0;
      let lidarrSuccessCount = 0;
      let lidarrFailCount = 0;
      const discoveryQueue = useDiscoveryQueueStore.getState();

      for (const id of ids) {
        const suggestion = get().suggestions.find(s => s.id === id);
        if (!suggestion) continue;

        try {
          const response = await fetch(`/api/background-discovery/suggestions/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'approve' }),
          });

          if (response.ok) {
            // Remove from local state
            set(state => ({
              suggestions: state.suggestions.filter(s => s.id !== id),
            }));

            // Add to discovery queue
            const result = discoveryQueue.addDiscoveryIfNotExists({
              artist: suggestion.artistName,
              title: suggestion.trackName,
              song: `${suggestion.artistName} - ${suggestion.trackName}`,
              source: 'lastfm',
            });

            if (!result.isDuplicate) {
              approvedCount++;

              // Trigger Lidarr download
              try {
                const songQuery = `${suggestion.artistName} - ${suggestion.trackName}`;
                const lidarrResponse = await fetch('/api/lidarr/add', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ song: songQuery }),
                });

                if (lidarrResponse.ok) {
                  lidarrSuccessCount++;
                } else {
                  lidarrFailCount++;
                  // Revert suggestion back to pending so user can retry
                  await get().revert(id);
                  if (result.id) {
                    discoveryQueue.updateStatus(result.id, 'failed');
                  }
                }
              } catch (lidarrError) {
                console.error('Error calling Lidarr:', lidarrError);
                lidarrFailCount++;
                // Revert suggestion back to pending so user can retry
                await get().revert(id);
                if (result.id) {
                  discoveryQueue.updateStatus(result.id, 'failed');
                }
              }
            }
          }
        } catch (error) {
          console.error('Error approving suggestion:', error);
        }
      }

      if (lidarrSuccessCount > 0 && lidarrFailCount === 0) {
        toast.success(`Sent ${lidarrSuccessCount} tracks to Lidarr for download`);
      } else if (lidarrSuccessCount > 0 && lidarrFailCount > 0) {
        toast.info(`Sent ${lidarrSuccessCount} tracks to Lidarr, ${lidarrFailCount} failed (reverted)`);
      } else if (lidarrFailCount > 0) {
        toast.error(`All ${lidarrFailCount} Lidarr requests failed (reverted to pending)`);
      }

      // Refresh status
      get().fetchStatus();
    },

    triggerDiscovery: async () => {
      set({ isTriggering: true });

      try {
        const response = await fetch('/api/background-discovery/trigger', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to trigger discovery');
        }

        const { data } = await response.json();
        toast.success(data.message || 'Discovery completed');

        // Refresh suggestions and status
        await get().fetchSuggestions();
        await get().fetchStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to trigger discovery';
        toast.error(message);
        console.error('Error triggering discovery:', error);
      } finally {
        set({ isTriggering: false });
      }
    },

    updateSettings: async (settings: Partial<DiscoverySettings>) => {
      try {
        const response = await fetch('/api/background-discovery/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(settings),
        });

        if (!response.ok) {
          throw new Error('Failed to update settings');
        }

        const { data } = await response.json();
        set({ settings: data });

        toast.success('Settings updated');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update settings';
        toast.error(message);
        console.error('Error updating settings:', error);
      }
    },

    getPending: () => {
      return get().suggestions.filter(s => s.status === 'pending');
    },

    getBySource: (source: string) => {
      return get().suggestions.filter(s => s.source === source);
    },
  })
);
