import { useQuery } from '@tanstack/react-query';
import { queryKeys, queryPresets } from '@/lib/query';

/**
 * Custom hook to fetch existing feedback for a list of songs
 * Story 3.12: Song Feedback & Search UI Enhancement
 *
 * Uses centralized query keys for consistent cache invalidation
 */
export function useSongFeedback(songIds: string[]) {
  return useQuery({
    // Use query key factory for consistent cache management
    queryKey: queryKeys.feedback.songs(songIds),
    queryFn: async () => {
      if (songIds.length === 0) {
        return { feedback: {} };
      }

      const response = await fetch(`/api/recommendations/feedback?songIds=${songIds.join(',')}`);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch feedback');
      }

      const data = await response.json();
      return data as { feedback: Record<string, 'thumbs_up' | 'thumbs_down'> };
    },
    enabled: songIds.length > 0,
    ...queryPresets.feedback,
  });
}
