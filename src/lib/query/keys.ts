/**
 * Query Key Factory
 *
 * Centralized query key management for consistent cache invalidation
 * and better cache management across the application.
 *
 * Uses a hierarchical structure for granular invalidation:
 * - queryKeys.playlists.all() - invalidates all playlist queries
 * - queryKeys.playlists.list() - invalidates playlist list only
 * - queryKeys.playlists.detail(id) - invalidates specific playlist
 */

export const queryKeys = {
  // Authentication & User
  auth: {
    all: () => ['auth'] as const,
    session: () => [...queryKeys.auth.all(), 'session'] as const,
    user: (userId: string) => [...queryKeys.auth.all(), 'user', userId] as const,
  },

  // Playlists
  playlists: {
    all: () => ['playlists'] as const,
    lists: () => [...queryKeys.playlists.all(), 'list'] as const,
    list: (filters?: { page?: number; limit?: number }) =>
      [...queryKeys.playlists.lists(), filters] as const,
    details: () => [...queryKeys.playlists.all(), 'detail'] as const,
    detail: (id: string) => [...queryKeys.playlists.details(), id] as const,
    generated: () => [...queryKeys.playlists.all(), 'generated'] as const,
    generatedByStyle: (style: string, sourceMode: string, mixRatio: number) =>
      [...queryKeys.playlists.generated(), style, sourceMode, mixRatio] as const,
    smart: () => [...queryKeys.playlists.all(), 'smart'] as const,
    smartPreview: (rules: unknown, sortField: string, sortOrder: string, limit: number) =>
      [...queryKeys.playlists.smart(), 'preview', rules, sortField, sortOrder, limit] as const,
  },

  // Library (Songs, Artists, Albums)
  library: {
    all: () => ['library'] as const,

    // Songs
    songs: {
      all: () => [...queryKeys.library.all(), 'songs'] as const,
      list: (filters?: { page?: number; limit?: number; sort?: string }) =>
        [...queryKeys.library.songs.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.library.songs.all(), 'detail', id] as const,
      mostPlayed: () => [...queryKeys.library.songs.all(), 'most-played'] as const,
      search: (query: string) => [...queryKeys.library.songs.all(), 'search', query] as const,
    },

    // Artists
    artists: {
      all: () => [...queryKeys.library.all(), 'artists'] as const,
      list: (filters?: { page?: number; limit?: number }) =>
        [...queryKeys.library.artists.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.library.artists.all(), 'detail', id] as const,
      top: () => [...queryKeys.library.artists.all(), 'top'] as const,
      songs: (artistId: string) => [...queryKeys.library.artists.all(), 'songs', artistId] as const,
    },

    // Albums
    albums: {
      all: () => [...queryKeys.library.all(), 'albums'] as const,
      list: (filters?: { page?: number; limit?: number }) =>
        [...queryKeys.library.albums.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.library.albums.all(), 'detail', id] as const,
      byArtist: (artistId: string) => [...queryKeys.library.albums.all(), 'artist', artistId] as const,
    },

    // General search
    search: (query: string) => [...queryKeys.library.all(), 'search', query] as const,
  },

  // Recommendations
  recommendations: {
    all: () => ['recommendations'] as const,
    list: (userId: string, type: 'similar' | 'mood') =>
      [...queryKeys.recommendations.all(), 'list', userId, type] as const,
    sidebar: () => [...queryKeys.recommendations.all(), 'sidebar'] as const,
  },

  // Feedback
  feedback: {
    all: () => ['feedback'] as const,
    song: (songId: string) => [...queryKeys.feedback.all(), 'song', songId] as const,
    songs: (songIds: string[]) => {
      // Sort for consistent cache key regardless of order
      const sortedIds = [...songIds].sort().join(',');
      return [...queryKeys.feedback.all(), 'songs', sortedIds] as const;
    },
  },

  // Analytics
  analytics: {
    all: () => ['analytics'] as const,
    preferences: () => [...queryKeys.analytics.all(), 'preferences'] as const,
    dashboard: (period: string) => [...queryKeys.analytics.all(), 'dashboard', period] as const,
  },

  // Downloads (YouTube, Lidarr)
  downloads: {
    all: () => ['downloads'] as const,
    youtube: {
      all: () => [...queryKeys.downloads.all(), 'youtube'] as const,
      status: () => [...queryKeys.downloads.youtube.all(), 'status'] as const,
    },
    lidarr: {
      all: () => [...queryKeys.downloads.all(), 'lidarr'] as const,
      queue: () => [...queryKeys.downloads.lidarr.all(), 'queue'] as const,
    },
  },

  // Sidebar specific queries
  sidebar: {
    all: () => ['sidebar'] as const,
    playlists: () => [...queryKeys.sidebar.all(), 'playlists'] as const,
    topArtists: () => [...queryKeys.sidebar.all(), 'top-artists'] as const,
    mostPlayed: () => [...queryKeys.sidebar.all(), 'most-played'] as const,
    recommendations: () => [...queryKeys.sidebar.all(), 'recommendations'] as const,
  },

  // Discovery Feed
  discoveryFeed: {
    all: () => ['discoveryFeed'] as const,
    feed: (timeSlot?: string, context?: string) =>
      [...queryKeys.discoveryFeed.all(), 'feed', timeSlot, context] as const,
    analytics: (period?: string) =>
      [...queryKeys.discoveryFeed.all(), 'analytics', period] as const,
    notifications: () => [...queryKeys.discoveryFeed.all(), 'notifications'] as const,
    preferences: () => [...queryKeys.discoveryFeed.all(), 'preferences'] as const,
  },

  // Music Identity (Spotify Wrapped-style summaries)
  musicIdentity: {
    all: () => ['musicIdentity'] as const,
    lists: () => [...queryKeys.musicIdentity.all(), 'list'] as const,
    list: (periodType?: 'month' | 'year') =>
      [...queryKeys.musicIdentity.lists(), periodType] as const,
    details: () => [...queryKeys.musicIdentity.all(), 'detail'] as const,
    detail: (id: string) => [...queryKeys.musicIdentity.details(), id] as const,
    yearly: (year: number) =>
      [...queryKeys.musicIdentity.all(), 'yearly', year] as const,
    monthly: (year: number, month: number) =>
      [...queryKeys.musicIdentity.all(), 'monthly', year, month] as const,
    availablePeriods: () =>
      [...queryKeys.musicIdentity.all(), 'available-periods'] as const,
    shared: (token: string) =>
      [...queryKeys.musicIdentity.all(), 'shared', token] as const,
  },
} as const;

/**
 * Helper type for extracting query key types
 */
export type QueryKeys = typeof queryKeys;

/**
 * Utility to create a prefixed query key for custom queries
 */
export const createQueryKey = <T extends readonly unknown[]>(
  prefix: string,
  ...parts: T
) => [prefix, ...parts] as const;
