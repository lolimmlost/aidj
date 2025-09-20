import { createFileRoute, useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';

export const Route = createFileRoute('/dashboard/recommendations/id')({
  component: RecommendationDetail,
});

function RecommendationDetail() {
  const { id } = useParams({ from: '/dashboard/recommendations/[id]' });
  const { data: session } = authClient.useSession();
  const addToQueue = useAudioStore((state) => state.playSong);

  const song = atob(id);

  const { data: recommendation, isLoading, error } = useQuery({
    queryKey: ['recommendation-detail', id, session?.user.id],
    queryFn: async () => {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Provide a detailed explanation why "${song}" is recommended based on user listening history and preferences. Return as JSON: {"explanation": "detailed reason"}` }),
      });
      if (!response.ok) throw new Error('Failed to fetch recommendation detail');
      const data = await response.json();
      data.timestamp = new Date().toISOString();
      return data;
    },
    enabled: !!session,
  });

  if (isLoading) return <p className="container mx-auto p-6">Loading detail...</p>;
  if (error) return <p className="container mx-auto p-6 text-destructive">Error: {error.message}</p>;

  const parsed = recommendation.data.recommendations?.find((r: { song: string }) => r.song === song) || { explanation: recommendation.data.explanation || 'No explanation available.' };
  const explanation = parsed.explanation;

  const songKey = btoa(song);
  const feedback = getFeedback(song);
  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(song, type);
  };

  const handleQueue = (s: string) => {
    addToQueue(s, [{ id: s, name: s, albumId: '', duration: 0, track: 1, url: '', artist: '' }]);
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="bg-card text-card-foreground border-card">
        <CardHeader>
          <CardTitle>{song}</CardTitle>
          <CardDescription>Generated at {new Date(recommendation.timestamp).toLocaleString()} (timeout: 5s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground whitespace-pre-wrap">{explanation}</p>
          <div className="space-x-2">
            <Button variant={feedback.up ? "default" : "ghost"} onClick={() => handleFeedback('up')}>
              👍
            </Button>
            <Button variant={feedback.down ? "default" : "ghost"} onClick={() => handleFeedback('down')}>
              👎
            </Button>
          </div>
          <Button variant="ghost" onClick={() => handleQueue(song)}>
            Add to Queue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function getFeedback(song: string) {
  const songKey = btoa(song);
  const stored = localStorage.getItem(songKey);
  if (!stored) return { up: false, down: false };
  try {
    return JSON.parse(atob(stored)) as { up: boolean; down: boolean };
  } catch {
    return { up: false, down: false };
  }
}

function setFeedback(song: string, type: 'up' | 'down') {
  const songKey = btoa(song);
  const feedback = { up: type === 'up', down: type === 'down' };
  localStorage.setItem(songKey, btoa(JSON.stringify(feedback)));
}