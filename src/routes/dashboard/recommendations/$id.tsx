import { createFileRoute, useSearch, redirect } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { useState } from 'react';
import { toast } from 'sonner';
import { Play, Plus, ListPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSongFeedback } from '@/hooks/useSongFeedback';
import { queryKeys } from '@/lib/query';

export const Route = createFileRoute('/dashboard/recommendations/$id')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: RecommendationDetail,
});

function RecommendationDetail() {
  const search = useSearch({ from: '/dashboard/recommendations/$id' });
  const { data: session } = authClient.useSession();
  const addToQueue = useAudioStore((state) => state.playSong);
  const setAIUserActionInProgress = useAudioStore((state) => state.setAIUserActionInProgress);
  const queryClient = useQueryClient();

  // Local state for optimistic updates (must be before any early returns)
  const [optimisticFeedback, setOptimisticFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);

  // Get song name from search params (?song=Artist%20-%20Title)
  const song = (search as { song?: string }).song;
  
  // Fetch existing feedback for this song
  const { data: feedbackData } = useSongFeedback(song ? [song] : []);
  
  // Use derived state instead of separate state
  const existingFeedback = feedbackData?.feedback && song && feedbackData.feedback[song] ? feedbackData.feedback[song] : null;
  const currentFeedbackState = optimisticFeedback || existingFeedback;

  // Try to get cached recommendations from dashboard query
  const cachedRecs = queryClient.getQueryData(['recommendations', session?.user.id, 'similar']) ||
                     queryClient.getQueryData(['recommendations', session?.user.id, 'mood']);

  // Find this song's explanation in cached recommendations
  let explanation = 'This song was recommended based on your listening history and preferences.';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (cachedRecs && typeof cachedRecs === 'object' && cachedRecs && 'data' in cachedRecs && (cachedRecs as any).data?.recommendations) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = (cachedRecs as any).data.recommendations.find((r: any) => r.song === song);
    if (found && found.explanation) {
      explanation = found.explanation;
    }
  }

  // Feedback mutation (must be before any early returns)
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
        // Handle 409 Conflict (duplicate feedback) gracefully
        if (response.status === 409) {
          await response.json(); // Consume response body
          console.log('✓ Feedback already exists, continuing with recommendations');
          return; // Return undefined to prevent error
        }
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
      // Only invalidate preference analytics, not recommendations to prevent auto-refresh
      // This prevents the recommendations from refreshing when giving feedback
      queryClient.invalidateQueries({ queryKey: ['preference-analytics'] });
      // Also invalidate the feedback query to refresh feedback state
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      const emoji = feedbackType === 'thumbs_up' ? '👍' : '👎';
      toast.success(`Feedback saved ${emoji}`, {
        description: 'Your preferences help improve recommendations',
        duration: 2000,
      });
    },
    onError: (error) => {
      console.error('Failed to submit feedback:', error);
      setOptimisticFeedback(null); // Revert optimistic update

      // Check if it's a duplicate feedback error
      const isDuplicate = error instanceof Error && error.message.includes('already rated');

      if (isDuplicate) {
        toast.info('Already rated', {
          description: 'You have already provided feedback for this song',
          duration: 2000,
        });
      } else {
        toast.error('Failed to save feedback', {
          description: error instanceof Error ? error.message : 'Please try again',
          duration: 3000,
        });
      }
    },
  });

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

  const handleFeedback = (type: 'up' | 'down') => {
    const feedbackType = type === 'up' ? 'thumbs_up' : 'thumbs_down';
    feedbackMutation.mutate(feedbackType);
  };

  // Display feedback state (optimistic or persisted)
  const feedback = {
    up: currentFeedbackState === 'thumbs_up',
    down: currentFeedbackState === 'thumbs_down',
  };

  const handleQueueAction = (s: string, position: 'now' | 'next' | 'end') => {
    // Parse "Artist - Title" format
    const parts = s.split(' - ');
    const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : s;

    const audioSong = {
      id: s,
      name: title,
      title: title,
      albumId: '',
      duration: 0,
      track: 1,
      url: '',
      artist: artist
    };

    // Set user action flag to prevent AI DJ auto-refresh
    setAIUserActionInProgress(true);

    if (position === 'now') {
      addToQueue(s, [audioSong]);
      toast.success(`Now playing: ${title}`);
    } else if (position === 'next') {
      const { addToQueueNext } = useAudioStore.getState();
      addToQueueNext([audioSong]);
      toast.success(`Added "${title}" to play next`);
    } else {
      const { addToQueueEnd } = useAudioStore.getState();
      addToQueueEnd([audioSong]);
      toast.success(`Added "${title}" to end of queue`);
    }
    
    // Clear the flag after a short delay
    setTimeout(() => setAIUserActionInProgress(false), 2000);
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" className="min-h-[44px] bg-green-600 hover:bg-green-700 text-white shadow-sm" aria-label="Add to queue">
                <ListPlus className="mr-2 h-4 w-4" />
                Add to Queue
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => handleQueueAction(song, 'now')}
                className="min-h-[44px]"
              >
                <Play className="mr-2 h-4 w-4" />
                Play Now
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQueueAction(song, 'next')}
                className="min-h-[44px]"
              >
                <Play className="mr-2 h-4 w-4" />
                Play Next
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQueueAction(song, 'end')}
                className="min-h-[44px]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add to End
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </div>
  );
}

// Note: Legacy localStorage feedback functions removed in Story 3.9
// Feedback is now stored in database via /api/recommendations/feedback