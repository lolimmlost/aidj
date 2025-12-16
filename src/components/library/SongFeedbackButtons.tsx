import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSongFeedback } from '@/hooks/useSongFeedback';

interface SongFeedbackButtonsProps {
  songId?: string;
  artistName: string;
  songTitle: string;
  currentFeedback?: 'thumbs_up' | 'thumbs_down' | null;
  source?: 'search' | 'library' | 'recommendation' | 'playlist' | 'playlist_generator';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Custom success message for thumbs up (default: "Liked") */
  likeMessage?: string;
  /** Custom success message for thumbs down (default: "Disliked") */
  dislikeMessage?: string;
}

export function SongFeedbackButtons({
  songId,
  artistName,
  songTitle,
  currentFeedback = null,
  source = 'search',
  size = 'sm',
  likeMessage = 'Liked',
  dislikeMessage = 'Disliked',
}: SongFeedbackButtonsProps) {
  const queryClient = useQueryClient();

  // Fetch existing feedback for this song (only if songId exists)
  const { data: feedbackData } = useSongFeedback(songId ? [songId] : []);

  // Get server-side feedback state
  const serverFeedback = songId ? (feedbackData?.feedback?.[songId] || null) : null;

  // Track optimistic feedback separately - null means "use server state"
  const [optimisticFeedback, setOptimisticFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);

  // Effective feedback: optimistic takes priority, then prop, then server
  const effectiveFeedback = optimisticFeedback ?? currentFeedback ?? serverFeedback;

  // Reset optimistic state when server state updates (e.g., after mutation completes)
  useEffect(() => {
    if (serverFeedback !== null) {
      setOptimisticFeedback(null); // Clear optimistic, use server state
    }
  }, [serverFeedback]);

  const feedbackMutation = useMutation({
    mutationFn: async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songArtistTitle: `${artistName} - ${songTitle}`,
          feedbackType,
          source,
          songId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();

        // Handle duplicate feedback (409)
        if (response.status === 409) {
          throw new Error('DUPLICATE');
        }

        throw new Error(error.message || error.error || 'Failed to save feedback');
      }

      return response.json();
    },
    onMutate: async (feedbackType) => {
      // Optimistic update
      setOptimisticFeedback(feedbackType);
    },
    onSuccess: (_, feedbackType) => {
      // Invalidate feedback queries to refetch updated state
      queryClient.invalidateQueries({ queryKey: ['songFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['preference-analytics'] });

      // Show success toast with custom messages
      const action = feedbackType === 'thumbs_up' ? likeMessage : dislikeMessage;
      toast.success(`${action} "${songTitle}"`, {
        description: artistName,
        duration: 2000,
      });
    },
    onError: (error: Error) => {
      // Revert optimistic update - clear to use server state
      setOptimisticFeedback(null);

      // Handle duplicate feedback gracefully - no toast needed, button is already lit
      if (error.message === 'DUPLICATE') {
        return;
      }

      // Show error toast for other failures
      toast.error('Failed to save feedback', {
        description: 'Please try again',
        duration: 3000,
      });
    },
  });

  const handleFeedback = (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    // Prevent clicking the same feedback twice or if already loading
    if (effectiveFeedback === feedbackType || feedbackMutation.isPending) {
      return;
    }

    feedbackMutation.mutate(feedbackType);
  };

  const isLoading = feedbackMutation.isPending;
  const isLiked = effectiveFeedback === 'thumbs_up';
  const isDisliked = effectiveFeedback === 'thumbs_down';

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Song feedback">
      <Button
        variant="ghost"
        size={size}
        className={`min-h-[44px] min-w-[44px] ${isLiked ? 'text-blue-600 hover:text-blue-700' : 'text-muted-foreground'}`}
        onClick={(e) => {
          e.stopPropagation();
          handleFeedback('thumbs_up');
        }}
        disabled={isLoading}
        aria-label={isLiked ? 'Unlike song' : 'Like song'}
        aria-pressed={isLiked}
      >
        {isLoading && optimisticFeedback === 'thumbs_up' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsUp className={`h-4 w-4 transition-all ${isLiked ? 'fill-current scale-110' : ''}`} />
        )}
      </Button>

      <Button
        variant="ghost"
        size={size}
        className={`min-h-[44px] min-w-[44px] ${isDisliked ? 'text-red-600 hover:text-red-700' : 'text-muted-foreground'}`}
        onClick={(e) => {
          e.stopPropagation();
          handleFeedback('thumbs_down');
        }}
        disabled={isLoading}
        aria-label={isDisliked ? 'Remove dislike' : 'Dislike song'}
        aria-pressed={isDisliked}
      >
        {isLoading && optimisticFeedback === 'thumbs_down' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsDown className={`h-4 w-4 transition-all ${isDisliked ? 'fill-current scale-110' : ''}`} />
        )}
      </Button>
    </div>
  );
}
