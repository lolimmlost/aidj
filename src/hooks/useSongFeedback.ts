import { useQuery } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { queryKeys, queryPresets } from '@/lib/query';

interface FeedbackResponse {
  feedback: Record<string, 'thumbs_up' | 'thumbs_down'>;
}

/**
 * Hook to fetch feedback for a list of songs
 * Uses centralized query keys for consistent cache invalidation
 */
export function useSongFeedback(songIds: string[]) {
  const { data: session } = authClient.useSession();

  return useQuery({
    // Use query key factory for consistent cache management
    queryKey: queryKeys.feedback.songs(songIds),
    queryFn: async (): Promise<FeedbackResponse> => {
      if (!session?.user?.id || songIds.length === 0) {
        return { feedback: {} };
      }

      const response = await fetch(`/api/recommendations/feedback?songIds=${encodeURIComponent(songIds.join(','))}`);

      if (!response.ok) {
        throw new Error('Failed to fetch song feedback');
      }

      return response.json();
    },
    enabled: !!session?.user?.id && songIds.length > 0,
    ...queryPresets.feedback,
  });
}