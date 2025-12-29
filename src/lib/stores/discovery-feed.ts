/**
 * Discovery Feed Store
 *
 * Manages the state of the personalized music discovery feed,
 * including time-based recommendations, user interactions, and preferences.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import type { TimeSlot, ListeningContext } from '@/lib/db/schema/discovery-feed.schema';

// ============================================================================
// Types
// ============================================================================

export interface FeedItem {
  id: string;
  itemType: 'song' | 'playlist' | 'artist' | 'album' | 'mood_playlist';
  contentId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  explanation?: string;
  recommendationSource: 'time_pattern' | 'compound_score' | 'mood_match' | 'genre_match' | 'discovery' | 'trending' | 'personalized';
  score: number;
  targetTimeSlot: TimeSlot | 'any';
  targetContext: ListeningContext;

  // Interaction state (local until synced)
  shown: boolean;
  shownAt?: Date;
  clicked: boolean;
  clickedAt?: Date;
  played: boolean;
  playedAt?: Date;
  playDuration?: number;
  saved: boolean;
  savedAt?: Date;
  skipped: boolean;
  dismissed: boolean;
  feedback?: 'liked' | 'disliked' | 'not_interested';
  feedbackAt?: Date;
}

export interface TimeContext {
  timeSlot: TimeSlot;
  dayOfWeek: number;
  hour: number;
  isWeekend: boolean;
}

export interface ListeningPattern {
  timeSlot: TimeSlot;
  dayOfWeek: number;
  topGenres: { genre: string; count: number; avgRating: number }[];
  topMoods: { mood: string; count: number }[];
  avgEnergy: number;
  avgBpm?: number;
  primaryContext: ListeningContext;
  sampleCount: number;
}

export interface NotificationPreferences {
  enabled: boolean;
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  preferredTimes: string[];
  quietHoursStart: string;
  quietHoursEnd: string;
  activeDays: number[];
  includeNewReleases: boolean;
  includePersonalized: boolean;
  includeTimeBasedSuggestions: boolean;
  includeTrending: boolean;
  maxNotificationsPerDay: number;
}

interface DiscoveryFeedState {
  // Feed items
  items: FeedItem[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  lastFetchedAt: number | null;

  // Time context
  currentTimeContext: TimeContext | null;
  currentPattern: ListeningPattern | null;

  // User preferences
  notificationPreferences: NotificationPreferences;

  // Filter state
  activeFilter: TimeSlot | 'any';
  activeContext: ListeningContext | 'all';

  // Pending sync queue
  pendingInteractions: Array<{
    itemId: string;
    action: 'shown' | 'clicked' | 'played' | 'saved' | 'skipped' | 'dismissed' | 'feedback';
    data?: unknown;
    timestamp: number;
  }>;

  // Actions
  fetchFeed: (options?: { refresh?: boolean }) => Promise<void>;
  refreshFeed: () => Promise<void>;
  loadMore: () => Promise<void>;

  // Interaction actions
  markShown: (itemId: string) => void;
  markClicked: (itemId: string) => void;
  markPlayed: (itemId: string, duration?: number) => void;
  markSaved: (itemId: string) => void;
  markSkipped: (itemId: string) => void;
  dismissItem: (itemId: string) => void;
  provideFeedback: (itemId: string, feedback: 'liked' | 'disliked' | 'not_interested') => void;

  // Filter actions
  setActiveFilter: (filter: TimeSlot | 'any') => void;
  setActiveContext: (context: ListeningContext | 'all') => void;

  // Notification preferences
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;

  // Sync actions
  syncInteractions: () => Promise<void>;

  // Getters
  getFilteredItems: () => FeedItem[];
  getItemsBySource: (source: FeedItem['recommendationSource']) => FeedItem[];

  // Reset
  reset: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  frequency: 'daily',
  preferredTimes: ['09:00', '17:00'],
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  includeNewReleases: true,
  includePersonalized: true,
  includeTimeBasedSuggestions: true,
  includeTrending: false,
  maxNotificationsPerDay: 3,
};

// ============================================================================
// Time Context Helper
// ============================================================================

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getCurrentTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  return {
    timeSlot: getTimeSlot(hour),
    dayOfWeek,
    hour,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}

// ============================================================================
// Store
// ============================================================================

export const useDiscoveryFeedStore = create<DiscoveryFeedState>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],
      isLoading: false,
      error: null,
      hasMore: true,
      lastFetchedAt: null,

      currentTimeContext: null,
      currentPattern: null,

      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,

      activeFilter: 'any',
      activeContext: 'all',

      pendingInteractions: [],

      // ====================================================================
      // Fetch Actions
      // ====================================================================

      fetchFeed: async (options = {}) => {
        const { refresh = false } = options;
        const state = get();

        // Don't fetch if already loading
        if (state.isLoading) return;

        // Check if we should use cached data
        const now = Date.now();
        const cacheAge = state.lastFetchedAt ? now - state.lastFetchedAt : Infinity;
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        if (!refresh && cacheAge < CACHE_TTL && state.items.length > 0) {
          console.log('📦 Using cached feed items');
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const timeContext = getCurrentTimeContext();

          // Use activeFilter if set to a specific time slot, otherwise use current time
          const requestTimeSlot = state.activeFilter !== 'any'
            ? state.activeFilter
            : timeContext.timeSlot;

          const response = await fetch('/api/discovery-feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              limit: 20,
              includeExisting: !refresh,
              timeSlot: requestTimeSlot,
              dayOfWeek: timeContext.dayOfWeek,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to fetch discovery feed');
          }

          const { data } = await response.json();

          const newItems = refresh ? data.items : [...state.items, ...data.items];

          set({
            items: newItems,
            currentTimeContext: data.timeContext,
            currentPattern: data.pattern,
            hasMore: data.hasMore,
            isLoading: false,
            lastFetchedAt: now,
          });

          // Sync any pending interactions
          get().syncInteractions();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch feed';
          set({ error: message, isLoading: false });
          console.error('❌ [DiscoveryFeed] Fetch error:', error);
        }
      },

      refreshFeed: async () => {
        await get().fetchFeed({ refresh: true });
      },

      loadMore: async () => {
        const state = get();
        if (!state.hasMore || state.isLoading) return;

        set({ isLoading: true });

        try {
          const response = await fetch('/api/discovery-feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              limit: 20,
              offset: state.items.length,
              includeExisting: true,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to load more items');
          }

          const { data } = await response.json();

          // Deduplicate items
          const existingIds = new Set(state.items.map(i => i.id));
          const newItems = data.items.filter((item: FeedItem) => !existingIds.has(item.id));

          // If we didn't get any new items, stop trying to load more
          const hasMoreItems = newItems.length > 0 && data.hasMore;

          set({
            items: [...state.items, ...newItems],
            hasMore: hasMoreItems,
            isLoading: false,
          });
        } catch (error) {
          // Stop trying to load more on error to prevent infinite retry loops
          set({
            isLoading: false,
            hasMore: false,
            error: error instanceof Error ? error.message : 'Failed to load more items'
          });
          console.error('❌ [DiscoveryFeed] Load more error:', error);
        }
      },

      // ====================================================================
      // Interaction Actions
      // ====================================================================

      markShown: (itemId: string) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, shown: true, shownAt: new Date() }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'shown', timestamp: Date.now() },
          ],
        }));
      },

      markClicked: (itemId: string) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, clicked: true, clickedAt: new Date() }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'clicked', timestamp: Date.now() },
          ],
        }));
      },

      markPlayed: (itemId: string, duration?: number) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, played: true, playedAt: new Date(), playDuration: duration }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'played', data: { duration }, timestamp: Date.now() },
          ],
        }));
      },

      markSaved: (itemId: string) => {
        const item = get().items.find(i => i.id === itemId);
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, saved: true, savedAt: new Date() }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'saved', timestamp: Date.now() },
          ],
        }));

        if (item) {
          toast.success(`"${item.title}" saved to your library`);
        }
      },

      markSkipped: (itemId: string) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, skipped: true }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'skipped', timestamp: Date.now() },
          ],
        }));
      },

      dismissItem: (itemId: string) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, dismissed: true }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'dismissed', timestamp: Date.now() },
          ],
        }));
      },

      provideFeedback: (itemId: string, feedback: 'liked' | 'disliked' | 'not_interested') => {
        const item = get().items.find(i => i.id === itemId);

        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  feedback,
                  feedbackAt: new Date(),
                  dismissed: feedback === 'not_interested',
                }
              : item
          ),
          pendingInteractions: [
            ...state.pendingInteractions,
            { itemId, action: 'feedback', data: { feedback }, timestamp: Date.now() },
          ],
        }));

        if (item) {
          const messages = {
            liked: `You liked "${item.title}"`,
            disliked: `We'll show you fewer recommendations like "${item.title}"`,
            not_interested: `"${item.title}" removed from your feed`,
          };
          toast.success(messages[feedback]);
        }
      },

      // ====================================================================
      // Filter Actions
      // ====================================================================

      setActiveFilter: (filter: TimeSlot | 'any') => {
        set({ activeFilter: filter });
      },

      setActiveContext: (context: ListeningContext | 'all') => {
        set({ activeContext: context });
      },

      // ====================================================================
      // Notification Preferences
      // ====================================================================

      updateNotificationPreferences: async (prefs: Partial<NotificationPreferences>) => {
        const state = get();
        const updatedPrefs = { ...state.notificationPreferences, ...prefs };

        set({ notificationPreferences: updatedPrefs });

        try {
          await fetch('/api/discovery-feed/notifications/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updatedPrefs),
          });

          toast.success('Notification preferences updated');
        } catch (error) {
          console.error('❌ [DiscoveryFeed] Failed to save notification preferences:', error);
          toast.error('Failed to save notification preferences');
        }
      },

      // ====================================================================
      // Sync Actions
      // ====================================================================

      syncInteractions: async () => {
        const state = get();
        const interactions = state.pendingInteractions;

        if (interactions.length === 0) return;

        try {
          await fetch('/api/discovery-feed/interactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ interactions }),
          });

          // Clear synced interactions
          set({ pendingInteractions: [] });
        } catch (error) {
          console.error('❌ [DiscoveryFeed] Failed to sync interactions:', error);
          // Keep interactions in queue for retry
        }
      },

      // ====================================================================
      // Getters
      // ====================================================================

      getFilteredItems: () => {
        const state = get();
        let filtered = state.items.filter(item => !item.dismissed);

        if (state.activeFilter !== 'any') {
          filtered = filtered.filter(
            item => item.targetTimeSlot === state.activeFilter || item.targetTimeSlot === 'any'
          );
        }

        if (state.activeContext !== 'all') {
          filtered = filtered.filter(item => item.targetContext === state.activeContext);
        }

        return filtered;
      },

      getItemsBySource: (source: FeedItem['recommendationSource']) => {
        return get().items.filter(item => item.recommendationSource === source);
      },

      // ====================================================================
      // Reset
      // ====================================================================

      reset: () => {
        set({
          items: [],
          isLoading: false,
          error: null,
          hasMore: true,
          lastFetchedAt: null,
          currentTimeContext: null,
          currentPattern: null,
          pendingInteractions: [],
          activeFilter: 'any',
          activeContext: 'all',
        });
      },
    }),
    {
      name: 'discovery-feed-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        notificationPreferences: state.notificationPreferences,
        activeFilter: state.activeFilter,
        activeContext: state.activeContext,
        // Don't persist items or pending interactions (too large and should be fresh)
      }),
    }
  )
);
