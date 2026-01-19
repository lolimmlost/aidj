/**
 * Offline-First Song Feedback Hook
 *
 * An enhanced version of useSongFeedback that supports offline mode.
 * When offline:
 * - Reads feedback from IndexedDB
 * - Stores new feedback locally
 * - Queues feedback for background sync
 *
 * @see docs/architecture/offline-first.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import authClient from '@/lib/auth/auth-client';
import { queryKeys, queryPresets } from '@/lib/query';
import {
  submitFeedbackOffline,
  getLocalFeedback,
  isOnline,
} from '@/lib/services/offline';

interface FeedbackResponse {
  feedback: Record<string, 'thumbs_up' | 'thumbs_down'>;
}

interface SubmitFeedbackParams {
  songId: string;
  songArtistTitle: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  source?: string;
  recommendationCacheId?: number;
}

/**
 * Hook to fetch feedback for a list of songs with offline support
 * Tries server first when online, falls back to IndexedDB
 */
export function useSongFeedbackOffline(songIds: string[]) {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: [...queryKeys.feedback.songs(songIds), 'offline'],
    queryFn: async (): Promise<FeedbackResponse> => {
      if (!session?.user?.id || songIds.length === 0) {
        return { feedback: {} };
      }

      // Try server first when online
      if (isOnline()) {
        try {
          const response = await fetch(
            `/api/recommendations/feedback?songIds=${encodeURIComponent(songIds.join(','))}`
          );

          if (response.ok) {
            return response.json();
          }
        } catch (error) {
          console.warn('[useSongFeedbackOffline] Server fetch failed, falling back to local:', error);
        }
      }

      // Fall back to local IndexedDB
      const localFeedback = await getLocalFeedback(songIds);
      const feedback: Record<string, 'thumbs_up' | 'thumbs_down'> = {};

      for (const [songId, type] of localFeedback) {
        feedback[songId] = type;
      }

      return { feedback };
    },
    enabled: !!session?.user?.id && songIds.length > 0,
    ...queryPresets.feedback,
    // Allow stale data when offline
    staleTime: isOnline() ? queryPresets.feedback.staleTime : Infinity,
  });
}

/**
 * Hook to submit feedback with offline support
 */
export function useSubmitFeedbackOffline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitFeedbackParams) => {
      // Use offline adapter which handles both online and offline cases
      await submitFeedbackOffline({
        songId: params.songId,
        songArtistTitle: params.songArtistTitle,
        feedbackType: params.feedbackType,
        source: params.source,
        recommendationCacheId: params.recommendationCacheId,
      });

      return { success: true, feedbackType: params.feedbackType };
    },
    onMutate: async (params) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.feedback.all() });

      // Snapshot previous value
      const previousFeedback = queryClient.getQueryData<FeedbackResponse>(
        queryKeys.feedback.songs([params.songId])
      );

      // Optimistically update the cache
      queryClient.setQueryData<FeedbackResponse>(
        queryKeys.feedback.songs([params.songId]),
        (old) => ({
          feedback: {
            ...(old?.feedback || {}),
            [params.songId]: params.feedbackType,
          },
        })
      );

      return { previousFeedback };
    },
    onSuccess: (data, params) => {
      // Invalidate feedback queries
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      queryClient.invalidateQueries({ queryKey: ['preference-analytics'] });

      // Show appropriate toast
      const action = params.feedbackType === 'thumbs_up' ? 'Liked' : 'Disliked';
      const isOfflineMode = !isOnline();

      toast.success(`${action} "${params.songArtistTitle.split(' - ')[1] || params.songArtistTitle}"`, {
        description: isOfflineMode
          ? 'Will sync when you reconnect'
          : params.songArtistTitle.split(' - ')[0],
        duration: 2000,
      });
    },
    onError: (error, params, context) => {
      // Rollback optimistic update
      if (context?.previousFeedback) {
        queryClient.setQueryData(
          queryKeys.feedback.songs([params.songId]),
          context.previousFeedback
        );
      }

      // Handle duplicate feedback gracefully
      if (error instanceof Error && error.message === 'DUPLICATE') {
        return;
      }

      toast.error('Failed to save feedback', {
        description: 'Please try again',
        duration: 3000,
      });
    },
  });
}

/**
 * Combined hook for both fetching and submitting feedback
 */
export function useFeedbackOffline(songId: string | undefined) {
  const fetchQuery = useSongFeedbackOffline(songId ? [songId] : []);
  const submitMutation = useSubmitFeedbackOffline();

  const feedbackData = fetchQuery.data as FeedbackResponse | undefined;
  const currentFeedback = songId
    ? (feedbackData?.feedback?.[songId] || null)
    : null;

  const submitFeedback = async (
    feedbackType: 'thumbs_up' | 'thumbs_down',
    songArtistTitle: string,
    source?: string
  ) => {
    if (!songId) return;

    await submitMutation.mutateAsync({
      songId,
      songArtistTitle,
      feedbackType,
      source,
    });
  };

  return {
    feedback: currentFeedback,
    isLoading: fetchQuery.isLoading || submitMutation.isPending,
    isError: fetchQuery.isError || submitMutation.isError,
    submitFeedback,
    submitMutation,
  };
}
