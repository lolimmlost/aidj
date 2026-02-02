/**
 * React Query Configuration
 *
 * Centralized caching strategy to reduce unnecessary API calls
 * and provide consistent cache management across the application.
 */

// Time constants for cache configuration (in milliseconds)
export const CACHE_TIMES = {
  /** Short-lived data that changes frequently (1 minute) */
  SHORT: 1000 * 60 * 1,
  /** Standard cache time for most data (5 minutes) */
  STANDARD: 1000 * 60 * 5,
  /** Long-lived data that rarely changes (15 minutes) */
  LONG: 1000 * 60 * 15,
  /** Very stable data like user settings (30 minutes) */
  EXTENDED: 1000 * 60 * 30,
  /** Data that should persist until explicitly invalidated */
  INFINITE: Infinity,
} as const;

// Garbage collection times (when to remove unused data from cache)
export const GC_TIMES = {
  /** Remove quickly after component unmounts (5 minutes) */
  SHORT: 1000 * 60 * 5,
  /** Standard GC time (10 minutes) */
  STANDARD: 1000 * 60 * 10,
  /** Keep in cache longer for frequently accessed data (30 minutes) */
  LONG: 1000 * 60 * 30,
} as const;

/**
 * Default query options for the application
 * These can be overridden per-query as needed
 */
export const defaultQueryOptions = {
  staleTime: CACHE_TIMES.STANDARD,
  gcTime: GC_TIMES.STANDARD,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
  retry: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

/**
 * Query configuration presets for different data types
 */
export const queryPresets = {
  /** For user session and auth data - rarely changes */
  auth: {
    staleTime: CACHE_TIMES.EXTENDED,
    gcTime: GC_TIMES.LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For library data (songs, artists, albums) - moderate caching */
  library: {
    staleTime: CACHE_TIMES.LONG,
    gcTime: GC_TIMES.LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For playlists - can be modified by user */
  playlists: {
    staleTime: CACHE_TIMES.STANDARD,
    gcTime: GC_TIMES.STANDARD,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For AI recommendations - keep until refreshed */
  recommendations: {
    staleTime: CACHE_TIMES.INFINITE,
    gcTime: GC_TIMES.LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For analytics data - moderate caching */
  analytics: {
    staleTime: CACHE_TIMES.STANDARD,
    gcTime: GC_TIMES.STANDARD,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For feedback data - should reflect recent changes */
  feedback: {
    staleTime: CACHE_TIMES.STANDARD,
    gcTime: GC_TIMES.STANDARD,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For search results - short lived */
  search: {
    staleTime: CACHE_TIMES.SHORT,
    gcTime: GC_TIMES.SHORT,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },

  /** For real-time status (downloads, etc.) - polling enabled */
  realtime: {
    staleTime: 0,
    gcTime: GC_TIMES.SHORT,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  },

  /** For sidebar data - moderate caching, used across pages */
  sidebar: {
    staleTime: CACHE_TIMES.STANDARD,
    gcTime: GC_TIMES.LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
} as const;

/**
 * Smart polling configuration
 * Adjusts polling interval based on visibility and connection
 */
export const createSmartPollingInterval = (
  baseInterval: number,
  options?: {
    /** Multiplier when tab is in background */
    backgroundMultiplier?: number;
    /** Maximum interval to prevent excessive delays */
    maxInterval?: number;
    /** Whether to stop polling when offline */
    stopWhenOffline?: boolean;
  }
) => {
  const {
    backgroundMultiplier = 3,
    maxInterval = 60000,
    stopWhenOffline = true,
  } = options || {};

  return () => {
    // Stop polling when offline
    if (stopWhenOffline && typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    // Use longer interval when tab is in background
    if (typeof document !== 'undefined' && document.hidden) {
      return Math.min(baseInterval * backgroundMultiplier, maxInterval);
    }

    return baseInterval;
  };
};

/**
 * Deduplication window for preventing rapid consecutive requests
 */
export const DEDUP_WINDOW = 2000; // 2 seconds
