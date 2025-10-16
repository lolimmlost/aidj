import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from 'sonner';
import React, { useState, useEffect, useRef } from 'react';
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

function DashboardIndex() {
  const [type, setType] = useState<'similar' | 'mood'>('similar');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const addToQueue = useAudioStore((state) => state.playSong);
  const addPlaylist = useAudioStore((state) => state.addPlaylist);
  const [style, setStyle] = useState('');
  const [debouncedStyle, setDebouncedStyle] = useState('');
  const trimmedStyle = style.trim();
  const styleHash = btoa(trimmedStyle);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce style input (wait 800ms after user stops typing)
  useEffect(() => {
    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    if (trimmedStyle) {
      debounceTimeoutRef.current = setTimeout(() => {
        console.log(`🎯 Debounced style change: "${trimmedStyle}"`);
        setDebouncedStyle(trimmedStyle);
      }, 800); // 800ms delay
    } else {
      setDebouncedStyle('');
    }

    // Cleanup
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [trimmedStyle]);

  const { data: recommendations, isLoading, error, refetch: refetchRecommendations } = useQuery({
    queryKey: ['recommendations', session?.user.id, type],
    queryFn: async () => {
      // Use more specific and varied prompts for better recommendations
      const prompts = {
        similar: [
          'recommend different popular songs by artists similar to your favorites',
          'discover new tracks in genres matching your library artists',
          'suggest well-known songs by artists with similar musical style',
          'find popular tracks from artists in the same genre as your library'
        ],
        mood: [
          'upbeat energetic songs matching your library genre preferences',
          'relaxing chill songs from artists similar to your collection',
          'feel-good tracks in genres you already enjoy',
          'focusing songs that match your musical taste profile'
        ]
      };

      const promptArray = prompts[type];
      const randomPrompt = promptArray[Math.floor(Math.random() * promptArray.length)];

      console.log(`🎯 Using recommendation prompt: "${randomPrompt}"`);

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: randomPrompt }),
      });
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      data.timestamp = new Date().toISOString(); // AC6
      return data;
    },
    enabled: !!session,
  });

  
  const handleQueue = async (song: string) => {
    try {
      console.log('Queuing recommendation:', song); // Debug log
      const songs = await search(song, 0, 1); // Search for exact match, limit 1
      console.log('Search results for queue:', songs); // Debug log
      if (songs.length > 0) {
        const realSong = songs[0];
        console.log('Found song:', realSong); // Debug log

        // Ensure the song has all required properties for the audio player
        const songForPlayer = {
          id: realSong.id,
          name: realSong.name || realSong.title || song,
          albumId: realSong.albumId || '',
          duration: realSong.duration || 0,
          track: realSong.track || realSong.trackNumber || 1,
          url: realSong.url,
          artist: realSong.artist || 'Unknown Artist'
        };

        console.log('Song prepared for player:', songForPlayer); // Debug log
        addToQueue(realSong.id, [songForPlayer]);
        console.log('Queued song successfully'); // Debug log
        toast.success('Queued');
      } else {
        toast.error('Song not found in library');
      }
    } catch (error) {
      console.error('Search failed for queue:', error);
      toast.error('Failed to search for song');
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
    queryKey: ['playlist', debouncedStyle],
    queryFn: async () => {
      const cacheKey = `playlist-${debouncedStyle}`; // Use debounced style
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log(`📦 Returning cached playlist for "${debouncedStyle}"`);
        return JSON.parse(cached);
      }
      console.log(`🔄 Generating fresh playlist for style: "${debouncedStyle}"`);
      const response = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: debouncedStyle }),
      });
      if (!response.ok) throw new Error('Failed to fetch playlist');
      const data = await response.json();
      console.log(`✨ Generated playlist:`, data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    },
    enabled: !!debouncedStyle && !!session,
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
      toast.success('Playlist queued');
    } else {
      toast.error('No songs available in library for this playlist.');
    }
  };

  
  const clearPlaylistCache = () => {
    Object.keys(localStorage).filter(key => key.startsWith('playlist-')).forEach(key => localStorage.removeItem(key));
    queryClient.invalidateQueries({ queryKey: ['playlist'] });
    setStyle('');
    setDebouncedStyle('');
    console.log('🧹 Cleared all playlist cache');
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchRecommendations()}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : '🔄 Refresh'}
            </Button>
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
        </div>
        {isLoading && <p>Loading recommendations...</p>}
        {error && <p className="text-destructive">Error loading recommendations: {error.message}</p>}
        {recommendations && (
          <Card className="bg-card text-card-foreground border-card">
            <CardHeader>
              <CardTitle>Based on your history</CardTitle>
              <CardDescription>Generated at {new Date(recommendations.timestamp).toLocaleString()} - {recommendations.data.recommendations.filter((rec: any) => rec.song !== recommendations.data.recommendations[0]?.song).length + 1} unique songs</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.data.recommendations.map((rec: { song: string; explanation: string }, index: number) => {
                  const songId = btoa(rec.song); // For route
                  return (
                    <li key={index} className="flex flex-col space-y-2 p-2 border rounded">
                      <div className="flex justify-between items-center">
                        <Link to="/dashboard/recommendations/id" params={{ id: songId }} className="hover:underline">
                          {rec.song}
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleQueue(rec.song)}>
                          Queue
                        </Button>
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
              // Manually trigger refetch for immediate generation
              const cacheKey = `playlist-${trimmedStyle}`;
              localStorage.removeItem(cacheKey); // Clear cache for this style
              queryClient.invalidateQueries({ queryKey: ['playlist', trimmedStyle] });
              refetchPlaylist();
            }}
            disabled={!trimmedStyle}
          >
            Generate Now
          </Button>
        </div>

        {/* Show debouncing indicator */}
        {trimmedStyle && trimmedStyle !== debouncedStyle && (
          <p className="text-sm text-muted-foreground animate-pulse">
            ⏳ Typing detected... playlist will generate when you stop typing
          </p>
        )}

        {playlistLoading && <p>Loading playlist...</p>}
        {playlistError && <p className="text-destructive">Error: {playlistError.message}</p>}
        {playlistData && (
          <Card className="bg-card text-card-foreground border-card">
            <CardHeader>
              <h2 className="text-2xl font-semibold">Generated Playlist</h2>
              <CardDescription>for "{debouncedStyle || style}". 5 suggestions from your library. Add to queue or provide feedback.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-4">
                <Button onClick={handlePlaylistQueue}>Add Entire Playlist to Queue</Button>
              </div>
              <ul className="space-y-2">
                {(playlistData.data.playlist as PlaylistItem[]).map((item, index: number) => {
                  return (
                    <li key={index} className="flex flex-col space-y-2 p-2 border rounded">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{item.song}</span>
                        <div className="space-x-2">
                          {item.songId ? (
                            <Button variant="ghost" size="sm" onClick={() => {
                              addToQueue(item.songId!, [{
                                id: item.songId!,
                                name: item.song,
                                albumId: '',
                                duration: 0,
                                track: 1,
                                url: item.url!,
                              }]);
                              toast.success('Queued');
                            }}>
                              Queue
                            </Button>
                          ) : (
                            <span className="text-sm text-destructive">Not in library</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.explanation}</p>
                      {item.missing && <p className="text-xs text-destructive">Not in library - Lidarr integration deferred</p>}
                    </li>
                  );
                })}
              </ul>
              {playlistData && (playlistData.data.playlist as PlaylistItem[]).length === 0 && (
                <p className="text-destructive">No matching songs</p>
              )}
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

        {/* Download Management Links */}
        <Link
          to="/downloads"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">🎵 Download Music</h3>
          <p className="text-muted-foreground text-sm">Search and add music to download queue</p>
        </Link>

        <Link
          to="/downloads/status"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">📊 Download Status</h3>
          <p className="text-muted-foreground text-sm">Monitor download progress and queue</p>
        </Link>

        <Link
          to="/downloads/history"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">📋 Download History</h3>
          <p className="text-muted-foreground text-sm">View and manage download history</p>
        </Link>
      </div>
    </div>
  );
}
