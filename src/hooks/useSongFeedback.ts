import { useQuery } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { queryKeys, queryPresets } from '@/lib/query';

interface FeedbackResponse {
  // Thumbs signal (recommendation quality).
  feedback: Record<string, 'thumbs_up' | 'thumbs_down'>;
  // Library star state (the heart) — decoupled from thumbs. See the feedback route.
  liked: string[];
}

/**
 * Hook to fetch feedback for a list of songs
 * Uses centralized query keys for consistent cache invalidation
 */
export function useSongFeedback(songIds: string[]) {
  const { data: session } = authClient.useSession();

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- key factory omits session id; feedback is per-user by cookie
  return useQuery({
    // Use query key factory for consistent cache management
    queryKey: queryKeys.feedback.songs(songIds),
    queryFn: async (): Promise<FeedbackResponse> => {
      if (!session?.user?.id || songIds.length === 0) {
        return { feedback: {}, liked: [] };
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