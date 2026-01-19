/**
 * Offline-First Library Hook
 *
 * Provides offline caching for the music library:
 * - Songs, artists, albums, playlists
 * - Recommendations
 *
 * @see docs/architecture/offline-first.md
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  cacheLibraryItems,
  getCachedLibraryItemsByType,
  cacheRecommendations,
  getCachedRecommendations,
  isOnline,
  clearExpiredLibraryCache,
  clearExpiredRecommendations,
} from '@/lib/services/offline';
import authClient from '@/lib/auth/auth-client';
import type { Song } from '@/lib/types/song';

// Generic library item type
interface LibraryItem {
  id: string;
  [key: string]: unknown;
}

/**
 * Hook to cache library items when fetched
 */
export function useCacheLibraryItems() {
  const queryClient = useQueryClient();

  const cacheItems = async (
    type: 'song' | 'artist' | 'album' | 'playlist',
    items: LibraryItem[]
  ) => {
    if (items.length > 0) {
      await cacheLibraryItems(type, items);
    }
  };

  return { cacheItems };
}

/**
 * Hook to fetch songs with offline cache fallback
 */
export function useSongsOffline(
  fetchFn: () => Promise<Song[]>,
  queryKey: string[],
  options?: { enabled?: boolean }
) {
  const { data: session } = authClient.useSession();
  const { cacheItems } = useCacheLibraryItems();

  return useQuery({
    queryKey: [...queryKey, 'offline'],
    queryFn: async (): Promise<Song[]> => {
      // Try to fetch from server when online
      if (isOnline()) {
        try {
          const songs = await fetchFn();

          // Cache the results for offline use
          if (songs.length > 0) {
            await cacheItems('song', songs);
          }

          return songs;
        } catch (error) {
          console.warn('[useSongsOffline] Server fetch failed, trying cache:', error);
        }
      }

      // Fall back to cached data
      const cached = await getCachedLibraryItemsByType<Song>('song');
      console.log(`[useSongsOffline] Returning ${cached.length} cached songs`);
      return cached;
    },
    enabled: options?.enabled !== false && !!session?.user?.id,
    staleTime: isOnline() ? 5 * 60 * 1000 : Infinity, // 5 min when online, infinite when offline
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

/**
 * Hook to fetch recommendations with offline cache fallback
 */
export function useRecommendationsOffline(
  fetchFn: () => Promise<Song[]>,
  seedSongId?: string,
  options?: { enabled?: boolean }
) {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: ['recommendations', 'offline', seedSongId],
    queryFn: async (): Promise<Song[]> => {
      // Try to fetch from server when online
      if (isOnline()) {
        try {
          const recommendations = await fetchFn();

          // Cache the results for offline use
          if (recommendations.length > 0) {
            await cacheRecommendations(seedSongId, recommendations);
          }

          return recommendations;
        } catch (error) {
          console.warn('[useRecommendationsOffline] Server fetch failed, trying cache:', error);
        }
      }

      // Fall back to cached recommendations
      const cached = await getCachedRecommendations<Song>(seedSongId);
      if (cached) {
        console.log(`[useRecommendationsOffline] Returning ${cached.length} cached recommendations`);
        return cached;
      }

      return [];
    },
    enabled: options?.enabled !== false && !!session?.user?.id,
    staleTime: isOnline() ? 15 * 60 * 1000 : Infinity, // 15 min when online, infinite when offline
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  });
}

/**
 * Hook to prefetch library data for offline use
 * Call this when the app loads to populate the offline cache
 */
export function usePrefetchLibrary() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.user?.id || !isOnline()) return;

    const prefetch = async () => {
      try {
        // Prefetch recently played songs
        const recentResponse = await fetch('/api/listening-history/recent?limit=50');
        if (recentResponse.ok) {
          const { data: recentSongs } = await recentResponse.json();
          if (recentSongs?.length > 0) {
            await cacheLibraryItems('song', recentSongs);
            console.log(`[usePrefetchLibrary] Cached ${recentSongs.length} recent songs`);
          }
        }

        // Prefetch playlists
        const playlistsResponse = await fetch('/api/playlists');
        if (playlistsResponse.ok) {
          const { data: playlists } = await playlistsResponse.json();
          if (playlists?.length > 0) {
            await cacheLibraryItems('playlist', playlists);
            console.log(`[usePrefetchLibrary] Cached ${playlists.length} playlists`);
          }
        }

        // Prefetch recommendations
        const recsResponse = await fetch('/api/recommendations');
        if (recsResponse.ok) {
          const { data: recommendations } = await recsResponse.json();
          if (recommendations?.length > 0) {
            await cacheRecommendations(undefined, recommendations);
            console.log(`[usePrefetchLibrary] Cached ${recommendations.length} recommendations`);
          }
        }
      } catch (error) {
        console.error('[usePrefetchLibrary] Prefetch failed:', error);
      }
    };

    // Prefetch after a short delay to not block initial render
    const timeout = setTimeout(prefetch, 5000);

    return () => clearTimeout(timeout);
  }, [session?.user?.id]);
}

/**
 * Hook to clean up expired cache entries
 */
export function useCacheCleanup() {
  useEffect(() => {
    const cleanup = async () => {
      try {
        const deletedLibrary = await clearExpiredLibraryCache();
        const deletedRecs = await clearExpiredRecommendations();

        if (deletedLibrary > 0 || deletedRecs > 0) {
          console.log(
            `[useCacheCleanup] Cleaned up ${deletedLibrary} library items, ${deletedRecs} recommendations`
          );
        }
      } catch (error) {
        console.error('[useCacheCleanup] Cleanup failed:', error);
      }
    };

    // Run cleanup on mount
    cleanup();

    // Run cleanup every hour
    const interval = setInterval(cleanup, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
}

/**
 * Hook to get offline library statistics
 */
export function useOfflineLibraryStats() {
  return useQuery({
    queryKey: ['offline-library-stats'],
    queryFn: async () => {
      const songs = await getCachedLibraryItemsByType('song');
      const artists = await getCachedLibraryItemsByType('artist');
      const albums = await getCachedLibraryItemsByType('album');
      const playlists = await getCachedLibraryItemsByType('playlist');
      const recommendations = await getCachedRecommendations();

      return {
        songCount: songs.length,
        artistCount: artists.length,
        albumCount: albums.length,
        playlistCount: playlists.length,
        recommendationCount: recommendations?.length || 0,
      };
    },
    staleTime: 60000, // 1 minute
  });
}
