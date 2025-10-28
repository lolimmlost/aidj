import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from 'sonner';
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { search } from '@/lib/services/navidrome';
import { OllamaErrorBoundary } from '@/components/ollama-error-boundary';
import { NavidromeErrorBoundary } from '@/components/navidrome-error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { hasLegacyFeedback, migrateLegacyFeedback, isMigrationCompleted } from '@/lib/utils/feedback-migration';
import { PreferenceInsights } from '@/components/recommendations/PreferenceInsights';

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DashboardIndex,
});

function DashboardIndex() {
  const [type, setType] = useState<'similar' | 'mood'>('similar');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const addToQueue = useAudioStore((state) => state.playSong);
  const addPlaylist = useAudioStore((state) => state.addPlaylist);
  const { preferences, loadPreferences } = usePreferencesStore();
  const [style, setStyle] = useState('');
  const [debouncedStyle, setDebouncedStyle] = useState('');
  const [generationStage, setGenerationStage] = useState<'idle' | 'generating' | 'resolving' | 'retrying' | 'done'>('idle');
  const trimmedStyle = style.trim();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const songCache = useRef<Map<string, unknown[]>>(new Map()); // Cache for song search results

  // Track feedback state per song (for optimistic updates)
  const [songFeedback, setSongFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});

  // Feedback mutation for inline buttons
  const feedbackMutation = useMutation({
    mutationFn: async ({ song, feedbackType }: { song: string; feedbackType: 'thumbs_up' | 'thumbs_down' }) => {
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
    onMutate: async ({ song, feedbackType }) => {
      // Optimistic update
      setSongFeedback(prev => ({ ...prev, [song]: feedbackType }));
    },
    onSuccess: (_, { song, feedbackType }) => {
      // Invalidate caches to refresh UI
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['preference-analytics'] });
      const emoji = feedbackType === 'thumbs_up' ? '👍' : '👎';
      toast.success(`Feedback saved ${emoji}`, {
        description: 'Your preferences help improve recommendations',
        duration: 2000,
      });
    },
    onError: (error, { song }) => {
      console.error('Failed to submit feedback:', error);
      // Revert optimistic update
      setSongFeedback(prev => ({ ...prev, [song]: null }));

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

  // Load user preferences on mount
  useEffect(() => {
    if (session) {
      loadPreferences();
    }
  }, [session, loadPreferences]);

  // Check for legacy feedback and prompt migration
  useEffect(() => {
    if (!session) return;

    if (!isMigrationCompleted() && hasLegacyFeedback()) {
      toast.info('Migrate your feedback?', {
        description: 'Sync your song feedback across devices',
        duration: 10000,
        action: {
          label: 'Migrate',
          onClick: async () => {
            toast.loading('Migrating feedback...', { id: 'feedback-migration' });
            try {
              const result = await migrateLegacyFeedback();
              if (result.success && result.migratedCount > 0) {
                toast.success(`Migrated ${result.migratedCount} feedback items`, {
                  id: 'feedback-migration',
                  description: 'Your feedback is now synced across devices',
                });
              } else if (result.failedCount > 0) {
                toast.warning(`Migrated ${result.migratedCount}, failed ${result.failedCount}`, {
                  id: 'feedback-migration',
                  description: 'Some items could not be migrated',
                });
              } else {
                toast.success('No feedback to migrate', { id: 'feedback-migration' });
              }
            } catch (error) {
              toast.error('Migration failed', {
                id: 'feedback-migration',
                description: error instanceof Error ? error.message : 'Please try again',
              });
            }
          },
        },
      });
    }
  }, [session]);

  // Load cache from localStorage on mount
  useEffect(() => {
    const cachedSongs = localStorage.getItem('songCache');
    if (cachedSongs) {
      try {
        const parsed = JSON.parse(cachedSongs);
        songCache.current = new Map(parsed);
        console.log(`📦 Loaded ${songCache.current.size} songs from cache`);
      } catch (error) {
        console.error('Failed to load song cache:', error);
      }
    }
  }, []);

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
          'recommend popular songs by artists similar to my library favorites',
          'discover new tracks from artists with similar style to my collection',
          'suggest well-known songs by artists in genres matching my library',
          'find popular tracks from artists similar to those I already have',
          'recommend other famous songs by my existing library artists',
          'discover artists with similar musical style to my collection'
        ],
        mood: [
          'upbeat energetic songs matching my library genre preferences',
          'relaxing chill songs from artists similar to my collection',
          'feel-good tracks in genres I already enjoy',
          'focusing songs that match my musical taste profile',
          'mood-boosting songs from artists similar to my favorites',
          'calming tracks in genres I frequently listen to'
        ]
      };

      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`🎯 Recommendation attempt ${attempts}/${maxAttempts}`);

        // Add time-based seed for better randomization
        const timeSeed = Date.now() % 1000;
        const promptArray = prompts[type];
        const randomIndex = (Math.random() * 1000 + timeSeed) % promptArray.length;
        const randomPrompt = promptArray[Math.floor(randomIndex)];

        console.log(`🎯 Using recommendation prompt ${randomIndex}: "${randomPrompt}"`);

        const response = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: randomPrompt }),
        });
        if (!response.ok) throw new Error('Failed to fetch recommendations');
        const data = await response.json();
        data.timestamp = new Date().toISOString(); // AC6

        // Debug: Log what Ollama actually returned
        console.log(`📦 Ollama response:`, data);
        console.log(`📦 data.data structure:`, JSON.stringify(data.data, null, 2));
        console.log(`📦 Recommendations count: ${data.data?.recommendations?.length || 0}`);
        if (data.data?.recommendations?.length > 0) {
          console.log(`📦 First recommendation:`, data.data.recommendations[0]);
        } else {
          console.log(`❌ No recommendations in response - data.data:`, data.data);
        }

        // Validate recommendations by checking if songs exist in library
        const validatedRecommendations = [];
        let foundInLibrary = 0;

        for (const rec of data.data.recommendations) {
          try {
            // Parse "Artist - Title" format and use multi-strategy search
            const parts = rec.song.split(' - ');
            let foundSong = null;

            if (parts.length >= 2) {
              const artistPart = parts[0].trim();
              const titlePart = parts.slice(1).join(' - ').trim();

              // STRATEGY 1: Search by title, filter by artist
              const titleMatches = await search(titlePart, 0, 10);
              foundSong = titleMatches.find(s =>
                s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
                artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
              );

              // STRATEGY 2: Search by artist, filter by title
              if (!foundSong) {
                const artistMatches = await search(artistPart, 0, 10);
                foundSong = artistMatches.find(s =>
                  s.title?.toLowerCase().includes(titlePart.toLowerCase()) ||
                  s.name?.toLowerCase().includes(titlePart.toLowerCase())
                );
              }

              // STRATEGY 3: Full string search as fallback
              if (!foundSong) {
                const fullMatches = await search(rec.song, 0, 5);
                foundSong = fullMatches[0];
              }
            } else {
              // No " - " separator, just search the whole thing
              const matches = await search(rec.song, 0, 5);
              foundSong = matches[0];
            }

            if (foundSong) {
              foundInLibrary++;
              validatedRecommendations.push({
                ...rec,
                foundInLibrary: true,
                actualSong: foundSong
              });
              console.log(`✅ Found in library: ${rec.song}`);
            } else {
              validatedRecommendations.push({
                ...rec,
                foundInLibrary: false
              });
              console.log(`❌ Not in library: ${rec.song}`);
            }
          } catch (searchError) {
            console.log(`⚠️ Search failed for ${rec.song}:`, searchError);
            validatedRecommendations.push({
              ...rec,
              foundInLibrary: false,
              searchError: true
            });
          }
        }

        console.log(`📊 Validation results: ${foundInLibrary}/${data.data.recommendations.length} songs found in library`);

        // If at least 2 songs found in library, accept these recommendations
        if (foundInLibrary >= 2) {
          console.log(`✅ Accepting recommendations with ${foundInLibrary} library matches`);
          data.data.recommendations = validatedRecommendations;
          return data;
        }

        // If too few matches, try again with different prompt
        console.log(`🔄 Only ${foundInLibrary} songs found in library, regenerating...`);

        // Small delay before retry
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // If all attempts failed, return the last result but mark as low quality
      console.log(`⚠️ All attempts completed with low library matches, returning best available`);
      return data;
    },
    enabled: !!session,
  });

  
  const handleQueue = async (song: string) => {
    try {
      console.log('🎯 Queuing recommendation:', song); // Debug log

      // Check cache first - use consistent cache key
      const cacheKey = song.toLowerCase().trim();
      let songs = songCache.current.get(cacheKey);

      // If not in cache, check if it's being pre-cached (wait a moment for background search)
      if (!songs) {
        console.log('🔍 Cache miss - checking if pre-caching:', song);

        // Wait a brief moment for pre-caching to complete
        let attempts = 0;
        while (!songs && attempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 200));
          songs = songCache.current.get(cacheKey);
          if (songs) {
            console.log('⚡ Found in cache after pre-caching:', song);
            break;
          }
          attempts++;
        }

        // Still not found, search manually
        if (!songs) {
          console.log('🔍 Manual search required for:', song);
          try {
            songs = await search(song, 0, 1); // Search for exact match, limit 1
            // Cache the result (even if empty)
            songCache.current.set(cacheKey, songs);
            console.log('💾 Cached search result for:', song);

            // Limit cache size to prevent memory issues
            if (songCache.current.size > 50) {
              const firstKey = songCache.current.keys().next().value;
              songCache.current.delete(firstKey);
            }
          } catch (searchError) {
            console.error('Search error:', searchError);
            if (searchError instanceof Error && searchError.message.includes('rate limit')) {
              toast.error('Please wait a moment before searching for songs');
            } else {
              toast.error('Failed to search for song');
            }
            return;
          }
        }
      } else {
        console.log('⚡ Cache hit for:', song);
      }

      console.log('📋 Search results for queue:', songs.length, 'songs'); // Debug log
      if (songs && songs.length > 0) {
        const realSong = songs[0];
        console.log('✅ Found song:', realSong); // Debug log

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

        console.log('🎵 Song prepared for player:', songForPlayer); // Debug log

        try {
          addToQueue(realSong.id, [songForPlayer]);
          console.log('🚀 Queued song successfully'); // Debug log
          toast.success('Queued');
        } catch (queueError) {
          console.error('Queue error:', queueError);
          toast.error('Failed to add song to queue');
        }
      } else {
        console.log('❌ No songs found for:', song);
        toast.error('Song not found in library');
      }
    } catch (error) {
      console.error('💥 Unexpected error in handleQueue:', error);
      toast.error('An unexpected error occurred');
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
        setGenerationStage('done');
        return JSON.parse(cached);
      }

      let attempts = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;
      let lastData: unknown = null;

      while (attempts < maxAttempts) {
        attempts++;

        if (attempts === 1) {
          setGenerationStage('generating');
        } else {
          setGenerationStage('retrying');
        }

        console.log(`🎯 Playlist generation attempt ${attempts}/${maxAttempts} for style: "${debouncedStyle}"`);

        try {
          const response = await fetch('/api/playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style: debouncedStyle }),
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.statusText}`);
          }

          setGenerationStage('resolving');
          const data = await response.json();
          console.log(`✨ Generated playlist attempt ${attempts}:`, data);

          // Count how many songs were successfully resolved
          const resolvedCount = (data.data.playlist as PlaylistItem[]).filter(item => item.songId && !item.missing).length;
          console.log(`📊 Resolution results: ${resolvedCount}/5 songs found in library`);

          // If at least 3 songs found, accept this playlist
          if (resolvedCount >= 3) {
            console.log(`✅ Accepting playlist with ${resolvedCount} resolved songs`);
            setGenerationStage('done');
            localStorage.setItem(cacheKey, JSON.stringify(data));
            return data;
          }

          // Save this result in case all attempts fail
          lastData = data;
          console.log(`🔄 Only ${resolvedCount} songs resolved, regenerating...`);

          // Small delay before retry
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (error) {
          console.error(`💥 Playlist generation attempt ${attempts} failed:`, error);
          lastError = error instanceof Error ? error : new Error('Unknown error');

          // Small delay before retry
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // If all attempts failed but we have some data, return it
      if (lastData) {
        console.log(`⚠️ All attempts completed with low resolution rate, returning best available`);
        setGenerationStage('done');
        localStorage.setItem(cacheKey, JSON.stringify(lastData));
        return lastData;
      }

      // If all attempts failed with errors
      console.error(`🚨 All ${maxAttempts} attempts failed`);
      setGenerationStage('idle');
      throw lastError || new Error('Failed to generate playlist after multiple attempts');
    },
    enabled: !!debouncedStyle && !!session,
    retry: false, // We handle retries ourselves
  });

  const handlePlaylistQueue = () => {
    if (!playlistData) return;
    const resolvedSongs = (playlistData.data.playlist as PlaylistItem[]).filter((item) => item.songId).map((item) => {
      // Parse "Artist - Title" format
      const parts = item.song.split(' - ');
      const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
      const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;

      return {
        id: item.songId!,
        name: title,
        title: title,
        albumId: '',
        duration: 0,
        track: 1,
        url: item.url!,
        artist: artist,
      };
    });
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

  // Save cache to localStorage when it changes
  useEffect(() => {
    const saveCache = () => {
      try {
        const cacheArray = Array.from(songCache.current.entries());
        localStorage.setItem('songCache', JSON.stringify(cacheArray));
      } catch (error) {
        console.error('Failed to save song cache:', error);
      }
    };

    // Save after a short delay to batch updates
    const timeoutId = setTimeout(saveCache, 1000);
    return () => clearTimeout(timeoutId);
  }, [recommendations]); // Trigger when recommendations change (pre-warming happens)

  // Pre-warm cache with common songs when recommendations load
  useEffect(() => {
    if (recommendations && recommendations.data.recommendations) {
      // Pre-cache all recommended songs for faster queuing using the same 3-strategy search as validation
      recommendations.data.recommendations.forEach((rec: { song: string; foundInLibrary?: boolean; actualSong?: Song }) => {
        const cacheKey = rec.song.toLowerCase().trim();

        // If we already found it during validation, use that result
        if (rec.foundInLibrary && rec.actualSong) {
          songCache.current.set(cacheKey, [rec.actualSong]);
          console.log(`🚀 Pre-cached from validation: ${rec.song}`);
          return;
        }

        if (!songCache.current.has(cacheKey)) {
          // Use the same 3-strategy search as validation
          const parts = rec.song.split(' - ');

          if (parts.length >= 2) {
            const artistPart = parts[0].trim();
            const titlePart = parts.slice(1).join(' - ').trim();

            // STRATEGY 1: Search by title, filter by artist
            search(titlePart, 0, 10)
              .then(titleMatches => {
                const match = titleMatches.find(s =>
                  s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
                  artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
                );

                if (match) {
                  songCache.current.set(cacheKey, [match]);
                  console.log(`🚀 Pre-cached (title+artist): ${rec.song}`);
                  return;
                }

                // STRATEGY 2: Search by artist, filter by title
                return search(artistPart, 0, 10);
              })
              .then(artistMatches => {
                if (!artistMatches) return;

                const match = artistMatches.find(s =>
                  s.title?.toLowerCase().includes(titlePart.toLowerCase()) ||
                  s.name?.toLowerCase().includes(titlePart.toLowerCase())
                );

                if (match) {
                  songCache.current.set(cacheKey, [match]);
                  console.log(`🚀 Pre-cached (artist+title): ${rec.song}`);
                } else {
                  // STRATEGY 3: Full string search as fallback
                  search(rec.song, 0, 5).then(fullMatches => {
                    if (fullMatches.length > 0) {
                      songCache.current.set(cacheKey, [fullMatches[0]]);
                      console.log(`🚀 Pre-cached (full search): ${rec.song}`);
                    } else {
                      songCache.current.set(cacheKey, []);
                      console.log(`⚠️ Pre-cache failed - not found: ${rec.song}`);
                    }
                  });
                }
              })
              .catch(err => {
                console.log(`Failed to pre-cache ${rec.song}:`, err);
                songCache.current.set(cacheKey, []);
              });
          } else {
            // No separator, just search the whole thing
            search(rec.song, 0, 5)
              .then(songs => {
                songCache.current.set(cacheKey, songs.length > 0 ? [songs[0]] : []);
                console.log(`🚀 Pre-cached (simple): ${rec.song}`);
              })
              .catch(err => {
                console.log(`Failed to pre-cache ${rec.song}:`, err);
                songCache.current.set(cacheKey, []);
              });
          }
        }
      });
    }
  }, [recommendations]);

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center px-4 sm:px-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2">Music Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
          Welcome to your music library. Explore artists, search for songs, and enjoy seamless playback.
        </p>
      </div>

      {/* AI Recommendations Section - conditionally rendered based on user preferences */}
      {preferences.dashboardLayout.showRecommendations && (
        <OllamaErrorBoundary>
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-semibold">AI Recommendations</h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRecommendations()}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none min-h-[44px]"
                  aria-label="Refresh recommendations"
                >
                  {isLoading ? 'Loading...' : '🔄 Refresh'}
                </Button>
                <Select value={type} onValueChange={(value) => setType(value as 'similar' | 'mood')}>
                  <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="similar">Similar Artists</SelectItem>
                    <SelectItem value="mood">Mood-Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isLoading && (
              <Card className="bg-card text-card-foreground border-card">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...Array(5)].map((_, index) => (
                      <div key={index} className="p-2 border rounded space-y-2">
                        <div className="flex justify-between items-center">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {error && (
            <p className="text-destructive">
              Error loading recommendations: {error.message}
              {error.message.includes('rate limit') && (
                <span className="block text-sm mt-1">💡 Please wait a moment before refreshing again</span>
              )}
            </p>
          )}
            {recommendations && (
              <Card className="bg-card text-card-foreground border-card">
                <CardHeader>
                  <CardTitle>Based on your history</CardTitle>
                  <CardDescription>
                    Generated at {new Date(recommendations.timestamp).toLocaleString()} -
                    {recommendations.data.recommendations.filter((rec: any) => rec.foundInLibrary).length} of {recommendations.data.recommendations.length} songs available in your library
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {recommendations.data.recommendations.map((rec: any, index: number) => {
                      const songId = encodeURIComponent(rec.song); // For route (URL-safe encoding)
                      const isInLibrary = rec.foundInLibrary;
                      const hasSearchError = rec.searchError;

                      const currentFeedback = songFeedback[rec.song];
                      const hasFeedback = currentFeedback !== undefined && currentFeedback !== null;

                      return (
                        <li key={index} className={`flex flex-col space-y-2 p-2 border rounded ${isInLibrary ? 'border-green-200 bg-green-50/10' : 'border-gray-200'}`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Link to="/dashboard/recommendations/id" search={{ song: rec.song }} className="hover:underline">
                                {rec.song}
                              </Link>
                              {isInLibrary && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                  ✓ In Library
                                </span>
                              )}
                              {hasSearchError && (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                  ⚠️ Search Error
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Like/Dislike Buttons */}
                              <Button
                                variant={currentFeedback === 'thumbs_up' ? "default" : "outline"}
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ song: rec.song, feedbackType: 'thumbs_up' })}
                                disabled={feedbackMutation.isPending || hasFeedback}
                                className={currentFeedback === 'thumbs_up' ? 'bg-green-600 hover:bg-green-700' : ''}
                                title={hasFeedback ? "Already rated" : "Like this song"}
                              >
                                {feedbackMutation.isPending && currentFeedback === 'thumbs_up' ? '⏳' : '👍'}
                              </Button>
                              <Button
                                variant={currentFeedback === 'thumbs_down' ? "default" : "outline"}
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ song: rec.song, feedbackType: 'thumbs_down' })}
                                disabled={feedbackMutation.isPending || hasFeedback}
                                className={currentFeedback === 'thumbs_down' ? 'bg-red-600 hover:bg-red-700' : ''}
                                title={hasFeedback ? "Already rated" : "Dislike this song"}
                              >
                                {feedbackMutation.isPending && currentFeedback === 'thumbs_down' ? '⏳' : '👎'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQueue(rec.song)}
                                disabled={!isInLibrary}
                                className={!isInLibrary ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                {isInLibrary ? "Queue" : "Not Available"}
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{rec.explanation.substring(0, 100)}...</p>
                          {!isInLibrary && !hasSearchError && (
                            <p className="text-xs text-orange-600">
                              💡 This song isn't in your library but shows similar taste
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        </OllamaErrorBoundary>
      )}

      {/* Preference Analytics Widget */}
      {preferences.dashboardLayout.showRecommendations && (
        <PreferenceInsights />
      )}

      {/* DJ Features Section */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">DJ Features</h2>
          <p className="text-muted-foreground">
            Professional DJ tools and features to enhance your mixing experience
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* DJ Mixer */}
          <Link
            to="/dj/mixer"
            className="block"
          >
            <div className="h-full p-6 bg-card text-card-foreground border-2 border-card rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 2a10 10 0 0 0 10 10"/>
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    NEW
                  </span>
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    Pro
                  </span>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">DJ Mixer</h3>
              <p className="text-sm text-muted-foreground">
                Professional DJ mixing interface with dual decks, crossfader, and real-time audio visualization
              </p>
            </div>
          </Link>

          {/* DJ Queue Manager */}
          <Link
            to="/dj/queue"
            className="block"
          >
            <div className="h-full p-6 bg-card text-card-foreground border-2 border-card rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"/>
                    <path d="m9 9 6 6"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    NEW
                  </span>
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                    Auto
                  </span>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">DJ Queue Manager</h3>
              <p className="text-sm text-muted-foreground">
                Advanced queue management with auto-mixing, priority settings, and smart recommendations
              </p>
            </div>
          </Link>

          {/* DJ Controls */}
          <Link
            to="/dj/controls"
            className="block"
          >
            <div className="h-full p-6 bg-card text-card-foreground border-2 border-card rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20"/>
                    <path d="M8 10h8"/>
                    <path d="M8 14h8"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">DJ Controls</h3>
              <p className="text-sm text-muted-foreground">
                Essential DJ controls for playback, crossfading, and session management
              </p>
            </div>
          </Link>

          {/* AI DJ Assistant */}
          <Link
            to="/dj/ai-assistant"
            className="block"
          >
            <div className="h-full p-6 bg-card text-card-foreground border-2 border-card rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.9 19.1C1 15.5 1 10.5 4.9 6.9"/>
                    <path d="M16.6 6.9C20.4 10.5 20 15.5 16.6 19.1"/>
                    <path d="M12 2v6"/>
                    <path d="M12 16v6"/>
                    <path d="M8 12h8"/>
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                    AI
                  </span>
                  <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                    BETA
                  </span>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI DJ Assistant</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered DJ that analyzes your library and creates intelligent mixes
              </p>
            </div>
          </Link>
        </div>
        
        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a2 2 0 0 1-2H9a2 2 0 0 1 2v6a2 2 0 0 1-2h8a2 2 0 0 1 2z"/>
              <path d="M12 12v.01"/>
            </svg>
            <h3 className="font-semibold">Pro Tip</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Start with DJ Mixer for a complete mixing experience, or use individual features to enhance specific aspects of your workflow.
            Features marked with "Pro" offer advanced capabilities for professional DJs.
          </p>
        </div>
      </div>

      <OllamaErrorBoundary>
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold">Style-Based Playlist</h2>
            <Button onClick={clearPlaylistCache} variant="outline" size="sm" className="min-h-[44px] w-full sm:w-auto" aria-label="Clear playlist cache">
              Clear Cache
            </Button>
          </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Enter style (e.g., Halloween, rock, holiday)"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="flex-1 min-h-[44px]"
            aria-label="Playlist style"
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
            className="min-h-[44px] w-full sm:w-auto"
            aria-label="Generate playlist now"
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

        {playlistLoading && (
          <Card className="bg-card text-card-foreground border-card" aria-busy="true" aria-live="polite">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 mt-2" />
                </div>
              </div>
              <p className="text-sm font-medium mt-2">
                {generationStage === 'generating' && '🎵 AI generating playlist... (this may take up to 10s)'}
                {generationStage === 'resolving' && '🔍 Finding songs in your library...'}
                {generationStage === 'retrying' && '🔄 Improving results, trying again...'}
                {generationStage === 'done' && '✅ Playlist ready!'}
                {generationStage === 'idle' && '⏳ Loading playlist...'}
              </p>
              <p className="text-sm text-muted-foreground">
                {generationStage === 'generating' && 'Analyzing your library and generating suggestions'}
                {generationStage === 'resolving' && 'Matching AI suggestions to your actual music collection'}
                {generationStage === 'retrying' && 'Few songs matched - regenerating with better suggestions'}
                {generationStage === 'done' && 'Complete'}
                {generationStage === 'idle' && 'Please wait...'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="p-2 border rounded space-y-2">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {playlistError && (
          <p className="text-destructive">
            Error: {playlistError.message}
            {playlistError.message.includes('rate limit') && (
              <span className="block text-sm mt-1">💡 Please wait a moment before generating another playlist</span>
            )}
          </p>
        )}
        {playlistData && (
          <Card className="bg-card text-card-foreground border-card">
            <CardHeader>
              <h2 className="text-2xl font-semibold">Generated Playlist</h2>
              <CardDescription>for "{debouncedStyle || style}". 5 suggestions from your library. Add to queue or provide feedback.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                <Button onClick={handlePlaylistQueue} className="min-h-[44px] w-full sm:w-auto" aria-label="Add entire playlist to queue">
                  Add Entire Playlist to Queue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Clear cache for this style to force regeneration
                    const cacheKey = `playlist-${debouncedStyle}`;
                    localStorage.removeItem(cacheKey);
                    console.log(`🗑️ Cleared cache for "${debouncedStyle}", regenerating...`);
                    refetchPlaylist();
                  }}
                  className="min-h-[44px] w-full sm:w-auto"
                  aria-label="Regenerate playlist"
                >
                  🔄 Regenerate
                </Button>
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
                              // Parse "Artist - Title" format
                              const parts = item.song.split(' - ');
                              const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
                              const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;

                              addToQueue(item.songId!, [{
                                id: item.songId!,
                                name: title,
                                title: title,
                                albumId: '',
                                duration: 0,
                                track: 1,
                                url: item.url!,
                                artist: artist,
                              }]);
                              toast.success('Queued');
                            }}>
                              Queue
                            </Button>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="text-sm text-destructive">Not in library</span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs"
                                onClick={() => {
                                  const [artistPart] = item.song.split(' - ');
                                  if (artistPart) {
                                    window.location.href = `/library?search=${encodeURIComponent(artistPart.trim())}`;
                                  }
                                }}
                              >
                                Search for similar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.explanation}</p>
                      {item.missing && (
                        <div className="text-xs bg-destructive/10 border border-destructive/20 rounded p-2">
                          <p className="text-destructive font-medium">Song not found in your library</p>
                          <p className="text-muted-foreground mt-1">Try searching for the artist, or use the download feature when available</p>
                        </div>
                      )}
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
      </OllamaErrorBoundary>

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
          to="/settings"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Settings</h3>
          <p className="text-muted-foreground text-sm">Customize your preferences and services</p>
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
          to="/playlists"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">My Playlists</h3>
          <p className="text-muted-foreground text-sm">Organize your music collections</p>
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
