import { useQuery } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';

interface FeedbackResponse {
  feedback: Record<string, 'thumbs_up' | 'thumbs_down'>;
}

export function useSongFeedback(songIds: string[]) {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: ['songFeedback', session?.user?.id, songIds.length, songIds.join(',')],
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}