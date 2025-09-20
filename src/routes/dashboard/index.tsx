import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { search } from '@/lib/services/navidrome';

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function xorEncrypt(str: string, key: string): string {
  return str.split('').map((c: string, i: number) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
}

function xorDecrypt(encryptedStr: string, key: string): string {
  return encryptedStr.split('').map((c: string, i: number) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
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
  const addPlaylist = useAudioStore((state) => state.addPlaylist);
  const [style, setStyle] = useState('');
  const trimmedStyle = style.trim();
  const styleHash = btoa(trimmedStyle);

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

  const handleQueue = async (song: string) => {
    try {
      console.log('Queuing recommendation:', song); // Debug log
      const songs = await search(song, 0, 1); // Search for exact match, limit 1
      console.log('Search results for queue:', songs); // Debug log
      if (songs.length > 0) {
        const realSong = songs[0];
        addToQueue(realSong.id, [realSong]);
        console.log('Queued song:', realSong); // Debug log
      } else {
        // Fallback: not in library, suggest Lidarr
        handleAddToLidarr(song);
      }
    } catch (error) {
      console.error('Search failed for queue:', error);
      handleAddToLidarr(song);
    }
  };

  interface PlaylistItem {
    song: string;
    explanation: string;
    songId?: string;
    url?: string;
    missing?: boolean;
  }

  const { data: playlistData, isLoading: playlistLoading, error: playlistError, refetch: refetchPlaylist } = useQuery({
    queryKey: ['playlist', styleHash, trimmedStyle],
    queryFn: async () => {
      const cached = localStorage.getItem(`playlist-${styleHash}`);
      if (cached) {
        return JSON.parse(cached);
      }
      const response = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: trimmedStyle }),
      });
      if (!response.ok) throw new Error('Failed to fetch playlist');
      const data = await response.json();
      localStorage.setItem(`playlist-${styleHash}`, JSON.stringify(data));
      return data;
    },
    enabled: !!trimmedStyle && !!session,
  });

  const handlePlaylistQueue = () => {
    if (!playlistData) return;
    const resolvedSongs = (playlistData.data.playlist as PlaylistItem[]).filter((item) => item.songId).map((item) => ({
      id: item.songId!,
      name: item.song,
      albumId: '',
      duration: 0,
      track: 1,
      url: item.url!,
    }));
    if (resolvedSongs.length > 0) {
      addPlaylist(resolvedSongs);
    } else {
      alert('No songs available in library for this playlist.');
    }
  };

  const handleAddToLidarr = async (song: string) => {
    try {
      const response = await fetch('/api/lidarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to add to Lidarr. Please check configuration.');
    }
  };

  const clearPlaylistCache = () => {
    Object.keys(localStorage).filter(key => key.startsWith('playlist-')).forEach(key => localStorage.removeItem(key));
    queryClient.invalidateQueries({ queryKey: ['playlist'] });
    setStyle('');
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
                        <Link to="/dashboard/recommendations/id" params={{ id: songId }} className="hover:underline">
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

      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Style-Based Playlist</h2>
          <Button onClick={clearPlaylistCache} variant="outline" size="sm">Clear Cache</Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Enter style (e.g., Halloween, rock, holiday)"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={() => {
              localStorage.removeItem(`playlist-${styleHash}`); // Clear specific cache for fresh generation
              queryClient.invalidateQueries({ queryKey: ['playlist', styleHash, trimmedStyle] });
              refetchPlaylist();
            }}
            disabled={!trimmedStyle}
          >
            Generate
          </Button>
        </div>
        {playlistLoading && <p>Loading playlist...</p>}
        {playlistError && <p className="text-destructive">Error: {playlistError.message}</p>}
        {playlistData && (
          <Card className="bg-card text-card-foreground border-card">
            <CardHeader>
              <CardTitle>Generated Playlist for "{style}"</CardTitle>
              <CardDescription>10 suggestions from your library. Add to queue or provide feedback.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-4">
                <Button onClick={handlePlaylistQueue}>Add Entire Playlist to Queue</Button>
              </div>
              <ul className="space-y-2">
                {(playlistData.data.playlist as PlaylistItem[]).map((item, index: number) => {
                  const feedback = getFeedback(item.song);
                  return (
                    <li key={index} className="flex flex-col space-y-2 p-2 border rounded">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{item.song}</span>
                        <div className="space-x-2">
                          {item.songId ? (
                            <Button variant="ghost" size="sm" onClick={() => addToQueue(item.songId!, [{
                              id: item.songId!,
                              name: item.song,
                              albumId: '',
                              duration: 0,
                              track: 1,
                              url: item.url!,
                            }])}>
                              Queue
                            </Button>
                          ) : (
                            <Button variant="destructive" size="sm" onClick={() => handleAddToLidarr(item.song)}>
                              Add to Lidarr
                            </Button>
                          )}
                          <Button variant={feedback.up ? "default" : "ghost"} size="sm" onClick={() => handleFeedback(item.song, 'up')}>
                            👍
                          </Button>
                          <Button variant={feedback.down ? "default" : "ghost"} size="sm" onClick={() => handleFeedback(item.song, 'down')}>
                            👎
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.explanation}</p>
                      {item.missing && <p className="text-xs text-destructive">Not in library - consider adding via Lidarr</p>}
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
