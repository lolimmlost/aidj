/**
 * Single-button heart toggle for songs.
 *
 * Hits /api/navidrome/star which proxies Navidrome's star/unstar and
 * also syncs the AIDJ feedback table (so the PlayerBar heart reflects
 * the same state).
 */
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSongFeedback } from '@/hooks/useSongFeedback';
import { queryKeys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface HeartButtonProps {
  songId: string;
  artist?: string;
  title?: string;
  className?: string;
  size?: 'sm' | 'default';
}

export function HeartButton({ songId, artist, title, className, size = 'sm' }: HeartButtonProps) {
  const queryClient = useQueryClient();
  const { data: feedbackData } = useSongFeedback([songId]);
  // The PlayerBar treats thumbs_up as "liked" — use the same source of truth.
  const serverLiked = feedbackData?.feedback?.[songId] === 'thumbs_up';
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const liked = optimisticLiked ?? serverLiked;

  // Reset optimistic state once the server confirms.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (feedbackData?.feedback) setOptimisticLiked(null);
  }, [feedbackData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mutation = useMutation({
    mutationFn: async (newLiked: boolean) => {
      const res = await fetch(`/api/navidrome/star?id=${encodeURIComponent(songId)}`, {
        method: newLiked ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error(newLiked ? 'Failed to like song' : 'Failed to unlike song');
      return res.json();
    },
    onMutate: (newLiked) => setOptimisticLiked(newLiked),
    onSuccess: (_data, newLiked) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      if (artist && title) {
        toast.success(`${newLiked ? 'Liked' : 'Unliked'} "${title}"`, {
          description: artist,
          duration: 1800,
        });
      }
    },
    onError: () => {
      setOptimisticLiked(null);
      toast.error('Could not update like');
    },
  });

  return (
    <Button
      variant="ghost"
      size={size === 'sm' ? 'sm' : 'default'}
      className={cn(
        'h-8 w-8 p-0 shrink-0 transition-colors',
        liked ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (mutation.isPending) return;
        mutation.mutate(!liked);
      }}
      disabled={mutation.isPending}
      aria-label={liked ? 'Unlike song' : 'Like song'}
      aria-pressed={liked}
      title={liked ? 'Unlike' : 'Like'}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn('h-4 w-4 transition-transform', liked && 'fill-current scale-110')} />
      )}
    </Button>
  );
}
