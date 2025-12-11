// Story 7.3: Discovery Queue Store
// Tracks discovery recommendations that have been sent to Lidarr for download

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
}

interface DiscoveryQueueState {
  items: DiscoveryItem[];

  // Actions
  addDiscovery: (item: Omit<DiscoveryItem, 'id' | 'requestedAt' | 'status' | 'notified'>) => string;
  updateStatus: (id: string, status: DiscoveryItem['status'], navidromeSongId?: string) => void;
  markNotified: (id: string) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;

  // Queries
  getPendingItems: () => DiscoveryItem[];
  getReadyItems: () => DiscoveryItem[];
  getUnnotifiedReadyItems: () => DiscoveryItem[];
}

export const useDiscoveryQueueStore = create<DiscoveryQueueState>()(
  persist(
    (set, get) => ({
      items: [],

      addDiscovery: (item) => {
        const id = `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newItem: DiscoveryItem = {
          ...item,
          id,
          requestedAt: Date.now(),
          status: 'pending',
          notified: false,
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));

        return id;
      },

      updateStatus: (id, status, navidromeSongId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, status, navidromeSongId: navidromeSongId || item.navidromeSongId }
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
