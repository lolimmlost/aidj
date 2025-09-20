import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function xorEncrypt(str, key) {
  return str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
}

function xorDecrypt(encryptedStr, key) {
  return encryptedStr.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
}

const ENCRYPT_KEY = 'mySecretKey12345';

function getFeedback(song: string) {
  const songKey = btoa(song);
  const stored = localStorage.getItem(songKey);
  if (!stored) return { up: false, down: false };
  try {
    const decryptedStr = xorDecrypt(atob(stored), ENCRYPT_KEY);
    return JSON.parse(decryptedStr) as { up: boolean; down: boolean };
  } catch {
    return { up: false, down: false };
  }
}

function setFeedback(song: string, type: 'up' | 'down') {
  const songKey = btoa(song);
  const feedback = { up: type === 'up', down: type === 'down' };
  const jsonStr = JSON.stringify(feedback);
  const encryptedStr = xorEncrypt(jsonStr, ENCRYPT_KEY);
  localStorage.setItem(songKey, btoa(encryptedStr));
}

function DashboardIndex() {
  const [type, setType] = useState<'similar' | 'mood'>('similar');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const addToQueue = useAudioStore((state) => state.playSong);

  const { data: recommendations, isLoading, error } = useQuery({
    queryKey: ['recommendations', session?.user.id, type],
    queryFn: async () => {
      const prompt = type === 'similar' ? 'similar artists to your favorites' : 'mood-based recommendations for relaxation';
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      data.timestamp = new Date().toISOString(); // AC6
      return data;
    },
    enabled: !!session,
  });

  const handleFeedback = (song: string, type: 'up' | 'down') => {
    setFeedback(song, type);
    queryClient.invalidateQueries({ queryKey: ['recommendations', session?.user.id, type] });
  };

  const handleQueue = (song: string) => {
    // Assume song as id/name, minimal Song obj
    addToQueue(song, [{ id: song, name: song, albumId: '', duration: 0, track: 1, url: '', artist: '' }]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Music Dashboard</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Welcome to your music library. Explore artists, search for songs, and enjoy seamless playback.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">AI Recommendations</h2>
          <Select value={type} onValueChange={(value) => setType(value as 'similar' | 'mood')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="similar">Similar Artists</SelectItem>
              <SelectItem value="mood">Mood-Based</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading && <p>Loading recommendations...</p>}
        {error && <p className="text-destructive">Error loading recommendations: {error.message}</p>}
        {recommendations && (
          <Card className="bg-card text-card-foreground border-card">
            <CardHeader>
              <CardTitle>Based on your history</CardTitle>
              <CardDescription>Generated at {new Date(recommendations.timestamp).toLocaleString()} (timeout: 5s)</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.data.recommendations.map((rec: { song: string; explanation: string }, index: number) => {
                  const feedback = getFeedback(rec.song);
                  const songId = btoa(rec.song); // For route
                  return (
                    <li key={index} className="flex flex-col space-y-2 p-2 border rounded">
                      <div className="flex justify-between items-center">
                        <Link to={`/dashboard/recommendations/${songId}`} className="hover:underline">
                          {rec.song}
                        </Link>
                        <div className="space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleQueue(rec.song)}>
                            Queue
                          </Button>
                          <Button variant={feedback.up ? "default" : "ghost"} size="sm" onClick={() => handleFeedback(rec.song, 'up')}>
                            👍
                          </Button>
                          <Button variant={feedback.down ? "default" : "ghost"} size="sm" onClick={() => handleFeedback(rec.song, 'down')}>
                            👎
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.explanation.substring(0, 100)}...</p>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Home</h3>
          <p className="text-muted-foreground text-sm">Return to the main page</p>
        </Link>

        <Link
          to="/login"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Login</h3>
          <p className="text-muted-foreground text-sm">Sign in to your account</p>
        </Link>

        <Link
          to="/signup"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Signup</h3>
          <p className="text-muted-foreground text-sm">Create a new account</p>
        </Link>

        <Link
          to="/config"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Service Configuration</h3>
          <p className="text-muted-foreground text-sm">Configure your music service</p>
        </Link>

        <Link
          to="/library/search"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Search Library</h3>
          <p className="text-muted-foreground text-sm">Find your favorite songs</p>
        </Link>

        <Link
          to="/library/artists"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Browse Artists</h3>
          <p className="text-muted-foreground text-sm">Explore artists and albums</p>
        </Link>

        <Link
          to="/library/artists/id"
          params={{id: '08jJDtStA34urKpsWC7xHt'}}
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Artist Detail</h3>
          <p className="text-muted-foreground text-sm">View artist information (Example)</p>
        </Link>

        <Link
          to="/library/artists/id/albums/albumId"
          params={{id: '08jJDtStA34urKpsWC7xHt', albumId: '1'}}
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Album Detail</h3>
          <p className="text-muted-foreground text-sm">View album tracks (Example)</p>
        </Link>
      </div>
    </div>
  );
}
