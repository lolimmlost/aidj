// Story 7.3: Discovery Queue Store
// Tracks discovery recommendations that have been sent to Lidarr for download
// Enhanced for Feature: Review and Refactor Discover-to-Playlist Media Flow

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';

export interface DiscoveryItem {
  id: string;
  song: string; // "Artist - Title" format
  artist: string;
  title: string;
  requestedAt: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'ready';
  lidarrArtistId?: string;
  navidromeSongId?: string; // Set when song appears in Navidrome
  source: 'lastfm' | 'ollama';
  notified: boolean; // Whether user has been notified of completion
  // New fields for enhanced flow management
  retryCount?: number;
  lastError?: string;
  progress?: number; // 0-100
  targetPlaylistId?: string; // If user wants to add to specific playlist when ready
}

// Error codes for discovery operations
export const DiscoveryErrorCodes = {
  DUPLICATE: 'DUPLICATE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  LIDARR_ERROR: 'LIDARR_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
} as const;

export type DiscoveryErrorCode = typeof DiscoveryErrorCodes[keyof typeof DiscoveryErrorCodes];

interface DiscoveryQueueState {
  items: DiscoveryItem[];
  // Transaction state for atomic operations
  _pendingTransaction: boolean;

  // Actions
  addDiscovery: (item: Omit<DiscoveryItem, 'id' | 'requestedAt' | 'status' | 'notified'>) => string;
  addDiscoveryIfNotExists: (item: Omit<DiscoveryItem, 'id' | 'requestedAt' | 'status' | 'notified'>) => { id: string | null; isDuplicate: boolean };
  updateStatus: (id: string, status: DiscoveryItem['status'], navidromeSongId?: string) => void;
  markNotified: (id: string) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;

  // New enhanced actions
  setError: (id: string, error: string) => void;
  incrementRetry: (id: string) => number;
  setProgress: (id: string, progress: number) => void;
  setTargetPlaylist: (id: string, playlistId: string) => void;
  batchUpdateStatus: (updates: Array<{ id: string; status: DiscoveryItem['status']; navidromeSongId?: string }>) => void;

  // Queries
  getPendingItems: () => DiscoveryItem[];
  getReadyItems: () => DiscoveryItem[];
  getUnnotifiedReadyItems: () => DiscoveryItem[];
  getFailedItems: () => DiscoveryItem[];
  findByArtistTitle: (artist: string, title: string) => DiscoveryItem | undefined;
  getStats: () => { total: number; pending: number; downloading: number; ready: number; failed: number };
}

export const useDiscoveryQueueStore = create<DiscoveryQueueState>()(
  persist(
    (set, get) => ({
      items: [],
      _pendingTransaction: false,

      addDiscovery: (item) => {
        const id = `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newItem: DiscoveryItem = {
          ...item,
          id,
          requestedAt: Date.now(),
          status: 'pending',
          notified: false,
          retryCount: 0,
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));

        return id;
      },

      // New: Add only if not already exists (atomic duplicate check)
      addDiscoveryIfNotExists: (item) => {
        const existing = get().findByArtistTitle(item.artist, item.title);
        if (existing) {
          return { id: null, isDuplicate: true };
        }

        const id = get().addDiscovery(item);
        return { id, isDuplicate: false };
      },

      updateStatus: (id, status, navidromeSongId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status,
                  navidromeSongId: navidromeSongId || item.navidromeSongId,
                  // Clear error on non-failed status
                  lastError: status !== 'failed' ? undefined : item.lastError,
                }
              : item
          ),
        }));

        // Auto-notify for ready items
        const item = get().items.find(i => i.id === id);
        if (item && status === 'ready' && !item.notified) {
          toast.success(`"${item.title}" is now available!`, {
            description: `by ${item.artist} - Click to play`,
            duration: 10000,
            action: {
              label: 'Play Now',
              onClick: () => {
                // This will be handled by a separate hook that listens for this
                window.dispatchEvent(new CustomEvent('discovery-ready-play', {
                  detail: { songId: navidromeSongId, item }
                }));
              },
            },
          });
          get().markNotified(id);

          // If there's a target playlist, emit event for auto-add
          if (item.targetPlaylistId) {
            window.dispatchEvent(new CustomEvent('discovery-ready-add-to-playlist', {
              detail: {
                songId: navidromeSongId,
                item,
                playlistId: item.targetPlaylistId,
              }
            }));
          }
        }
      },

      markNotified: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, notified: true } : item
          ),
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      clearCompleted: () => {
        set((state) => ({
          items: state.items.filter((item) =>
            item.status !== 'completed' && item.status !== 'ready'
          ),
        }));
      },

      // New enhanced actions
      setError: (id, error) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, lastError: error, status: 'failed' as const }
              : item
          ),
        }));
      },

      incrementRetry: (id) => {
        const item = get().items.find(i => i.id === id);
        const newCount = (item?.retryCount || 0) + 1;
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, retryCount: newCount, status: 'pending' as const, lastError: undefined }
              : item
          ),
        }));
        return newCount;
      },

      setProgress: (id, progress) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, progress: Math.min(100, Math.max(0, progress)) } : item
          ),
        }));
      },

      setTargetPlaylist: (id, playlistId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, targetPlaylistId: playlistId } : item
          ),
        }));
      },

      batchUpdateStatus: (updates) => {
        set((state) => {
          const updateMap = new Map(updates.map(u => [u.id, u]));
          return {
            items: state.items.map((item) => {
              const update = updateMap.get(item.id);
              if (update) {
                return {
                  ...item,
                  status: update.status,
                  navidromeSongId: update.navidromeSongId || item.navidromeSongId,
                };
              }
              return item;
            }),
          };
        });
      },

      getPendingItems: () => {
        return get().items.filter((item) =>
          item.status === 'pending' || item.status === 'downloading'
        );
      },

      getReadyItems: () => {
        return get().items.filter((item) => item.status === 'ready');
      },

      getUnnotifiedReadyItems: () => {
        return get().items.filter((item) =>
          item.status === 'ready' && !item.notified
        );
      },

      getFailedItems: () => {
        return get().items.filter((item) => item.status === 'failed');
      },

      findByArtistTitle: (artist, title) => {
        const normalizedArtist = artist.toLowerCase().trim();
        const normalizedTitle = title.toLowerCase().trim();
        return get().items.find((item) =>
          item.artist.toLowerCase().trim() === normalizedArtist &&
          item.title.toLowerCase().trim() === normalizedTitle
        );
      },

      getStats: () => {
        const items = get().items;
        return {
          total: items.length,
          pending: items.filter(i => i.status === 'pending').length,
          downloading: items.filter(i => i.status === 'downloading').length,
          ready: items.filter(i => i.status === 'ready').length,
          failed: items.filter(i => i.status === 'failed').length,
        };
      },
    }),
    {
      name: 'discovery-queue-storage',
      storage: createJSONStorage(() => localStorage),
      // Clean up old items on rehydration (older than 7 days)
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          state.items = state.items.filter(
            (item) => item.requestedAt > sevenDaysAgo
          );
        }
      },
    }
  )
);
