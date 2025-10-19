import { useQuery } from '@tanstack/react-query';

/**
 * Custom hook to fetch existing feedback for a list of songs
 * Story 3.12: Song Feedback & Search UI Enhancement
 */
export function useSongFeedback(songIds: string[]) {
  return useQuery({
    queryKey: ['songFeedback', songIds.sort().join(',')],
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
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
