import { createFileRoute, useSearch, redirect } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/dashboard/recommendations/id')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: RecommendationDetail,
});

function RecommendationDetail() {
  const search = useSearch({ from: '/dashboard/recommendations/id' });
  const { data: session } = authClient.useSession();
  const addToQueue = useAudioStore((state) => state.playSong);
  const queryClient = useQueryClient();

  // Local state for optimistic updates (must be before any early returns)
  const [optimisticFeedback, setOptimisticFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);

  // Get song name from search params (?song=Artist%20-%20Title)
  const song = (search as { song?: string }).song;

  console.log('Search params:', search);
  console.log('Song from search:', song);

  if (!song) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">No song specified in URL</p>
            <p className="text-sm text-muted-foreground mt-2">
              URL: {window.location.href}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Try to get cached recommendations from dashboard query
  const cachedRecs = queryClient.getQueryData(['recommendations', session?.user.id, 'similar']) ||
                     queryClient.getQueryData(['recommendations', session?.user.id, 'mood']);

  // Find this song's explanation in cached recommendations
  let explanation = 'This song was recommended based on your listening history and preferences.';

  if (cachedRecs && (cachedRecs as any).data?.recommendations) {
    const found = (cachedRecs as any).data.recommendations.find((r: any) => r.song === song);
    if (found && found.explanation) {
      explanation = found.explanation;
    }
  }

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songArtistTitle: song,
          feedbackType,
          source: 'recommendation',
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit feedback');
      }
      return response.json();
    },
    onMutate: async (feedbackType) => {
      // Optimistic update
      setOptimisticFeedback(feedbackType);
    },
    onSuccess: (_, feedbackType) => {
      // Invalidate recommendations cache to refresh quality scores
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      const emoji = feedbackType === 'thumbs_up' ? '👍' : '👎';
      toast.success(`Feedback saved ${emoji}`, {
        description: 'Your preferences help improve recommendations',
        duration: 2000,
      });
    },
    onError: (error) => {
      console.error('Failed to submit feedback:', error);
      setOptimisticFeedback(null); // Revert optimistic update
      toast.error('Failed to save feedback', {
        description: error instanceof Error ? error.message : 'Please try again',
        duration: 3000,
      });
    },
  });

  const handleFeedback = (type: 'up' | 'down') => {
    const feedbackType = type === 'up' ? 'thumbs_up' : 'thumbs_down';
    feedbackMutation.mutate(feedbackType);
  };

  // Display feedback state (optimistic or persisted)
  const feedback = {
    up: optimisticFeedback === 'thumbs_up',
    down: optimisticFeedback === 'thumbs_down',
  };

  const handleQueue = (s: string) => {
    addToQueue(s, [{ id: s, name: s, albumId: '', duration: 0, track: 1, url: '', artist: '' }]);
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="bg-card text-card-foreground border-card">
        <CardHeader>
          <CardTitle>{song}</CardTitle>
          <CardDescription>AI-powered recommendation from your music library</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground whitespace-pre-wrap">{explanation}</p>

          {/* Feedback Buttons */}
          <div className="flex items-center gap-2 py-2">
            <span className="text-sm font-medium text-muted-foreground">Rate this song:</span>
            <Button
              variant={feedback.up ? "default" : "outline"}
              size="sm"
              onClick={() => handleFeedback('up')}
              disabled={feedbackMutation.isPending}
              className={feedback.up ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {feedbackMutation.isPending && optimisticFeedback === 'thumbs_up' ? '⏳' : '👍'} Like
            </Button>
            <Button
              variant={feedback.down ? "default" : "outline"}
              size="sm"
              onClick={() => handleFeedback('down')}
              disabled={feedbackMutation.isPending}
              className={feedback.down ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {feedbackMutation.isPending && optimisticFeedback === 'thumbs_down' ? '⏳' : '👎'} Dislike
            </Button>
          </div>

          <Button variant="outline" onClick={() => handleQueue(song)}>
            Add to Queue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Note: Legacy localStorage feedback functions removed in Story 3.9
// Feedback is now stored in database via /api/recommendations/feedback