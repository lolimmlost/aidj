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

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Hero Section with Personalized Greeting */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-8 sm:p-12">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
          <div className="relative z-10">
            <p className="text-sm font-medium text-primary mb-2 tracking-wide uppercase">Your Music Hub</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {getGreeting()}, {session?.user?.name || 'Music Lover'}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
              Discover new music, create intelligent playlists, and explore your library with AI-powered recommendations
            </p>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-primary">
                  {recommendations?.data?.recommendations?.filter((r: any) => r.foundInLibrary).length || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Available Recommendations</div>
              </div>
              <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-green-600">
                  {playlistData ? (playlistData.data.playlist as PlaylistItem[]).filter(item => item.songId).length : 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Playlist Songs Ready</div>
              </div>
              <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-blue-600">AI</div>
                <div className="text-xs text-muted-foreground mt-1">Powered</div>
              </div>
              <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-purple-600">DJ</div>
                <div className="text-xs text-muted-foreground mt-1">Tools Available</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/library/search" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">Search Library</h3>
              <p className="text-sm text-muted-foreground">Find your favorite songs instantly</p>
            </div>
          </Link>

          <Link to="/library/artists" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">Browse Artists</h3>
              <p className="text-sm text-muted-foreground">Explore your music collection</p>
            </div>
          </Link>

          <Link to="/playlists" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 hover:border-green-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-green-500/10 rounded-xl group-hover:bg-green-500/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">My Playlists</h3>
              <p className="text-sm text-muted-foreground">Manage your collections</p>
            </div>
          </Link>

          <Link to="/settings" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 hover:border-orange-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-orange-500/10 rounded-xl group-hover:bg-orange-500/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">Settings</h3>
              <p className="text-sm text-muted-foreground">Customize your experience</p>
            </div>
          </Link>
        </div>

      {/* AI Recommendations Section - conditionally rendered based on user preferences */}
      {preferences.dashboardLayout.showRecommendations && (
        <OllamaErrorBoundary>
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">AI Recommendations</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    Powered by AI
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">Personalized suggestions based on your music taste</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRecommendations()}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none min-h-[44px] hover:bg-primary/5 hover:border-primary/50 transition-all"
                  aria-label="Refresh recommendations"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-2 ${isLoading ? 'animate-spin' : ''}`}>
                    <path d="M21 2v6h-6"/>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  {isLoading ? 'Loading...' : 'Refresh'}
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
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Based on your listening history</p>
                      <p className="text-xs text-muted-foreground">
                        {recommendations.data.recommendations.filter((rec: any) => rec.foundInLibrary).length} of {recommendations.data.recommendations.length} songs in your library • Updated {new Date(recommendations.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {recommendations.data.recommendations.map((rec: any, index: number) => {
                    const songId = encodeURIComponent(rec.song);
                    const isInLibrary = rec.foundInLibrary;
                    const hasSearchError = rec.searchError;
                    const currentFeedback = songFeedback[rec.song];
                    const hasFeedback = currentFeedback !== undefined && currentFeedback !== null;

                    return (
                      <div
                        key={index}
                        className={`group relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${
                          isInLibrary
                            ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5 hover:border-green-500/50'
                            : 'border-border bg-card/50 hover:border-border/80'
                        }`}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to="/dashboard/recommendations/id"
                                  search={{ song: rec.song }}
                                  className="font-semibold text-base hover:text-primary transition-colors"
                                >
                                  {rec.song}
                                </Link>
                                {isInLibrary && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                    In Library
                                  </span>
                                )}
                                {hasSearchError && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                    ⚠️ Search Error
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">{rec.explanation}</p>
                              {!isInLibrary && !hasSearchError && (
                                <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M12 16v-4"/>
                                    <path d="M12 8h.01"/>
                                  </svg>
                                  Not in your library, but matches your taste
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1">
                                <Button
                                  variant={currentFeedback === 'thumbs_up' ? "default" : "ghost"}
                                  size="sm"
                                  onClick={() => feedbackMutation.mutate({ song: rec.song, feedbackType: 'thumbs_up' })}
                                  disabled={feedbackMutation.isPending || hasFeedback}
                                  className={`h-9 w-9 p-0 ${currentFeedback === 'thumbs_up' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                                  title={hasFeedback ? "Already rated" : "Like this song"}
                                >
                                  {feedbackMutation.isPending && currentFeedback === 'thumbs_up' ? (
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M7 10v12"/>
                                      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                                    </svg>
                                  )}
                                </Button>
                                <Button
                                  variant={currentFeedback === 'thumbs_down' ? "default" : "ghost"}
                                  size="sm"
                                  onClick={() => feedbackMutation.mutate({ song: rec.song, feedbackType: 'thumbs_down' })}
                                  disabled={feedbackMutation.isPending || hasFeedback}
                                  className={`h-9 w-9 p-0 ${currentFeedback === 'thumbs_down' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                                  title={hasFeedback ? "Already rated" : "Dislike this song"}
                                >
                                  {feedbackMutation.isPending && currentFeedback === 'thumbs_down' ? (
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M17 14V2"/>
                                      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>
                                    </svg>
                                  )}
                                </Button>
                              </div>
                              <Button
                                variant={isInLibrary ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleQueue(rec.song)}
                                disabled={!isInLibrary}
                                className={`${!isInLibrary ? "opacity-50 cursor-not-allowed" : "bg-primary hover:bg-primary/90"}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                  <path d="M5 12h14"/>
                                  <path d="M12 5v14"/>
                                </svg>
                                {isInLibrary ? "Queue" : "Unavailable"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </OllamaErrorBoundary>
      )}

      {/* Preference Analytics Widget */}
      {preferences.dashboardLayout.showRecommendations && (
        <PreferenceInsights />
      )}

      {/* DJ Features Section */}
      <section className="space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Professional Tools</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            DJ Features
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Elevate your mixing experience with professional-grade tools powered by AI and advanced audio processing
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {/* DJ Mixer - Featured Card */}
          <Link to="/dj/mixer" className="group md:col-span-2">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-pink-600/10 border-2 border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-1 p-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -z-10" />

              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="flex-shrink-0 p-4 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 2a10 10 0 0 0 10 10"/>
                  </svg>
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-2xl font-bold">DJ Mixer</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      NEW
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                      ⭐ Pro
                    </span>
                  </div>
                  <p className="text-base text-muted-foreground">
                    Professional DJ mixing interface with dual decks, crossfader, real-time audio visualization, and beat-matching technology for seamless transitions
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Dual Decks
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Live Waveforms
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Effects
                    </div>
                  </div>
                </div>

                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
              </div>
            </div>
          </Link>

          {/* DJ Queue Manager */}
          <Link to="/dj/queue" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-600/5 border-2 border-green-500/20 hover:border-green-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"/>
                    <path d="m9 9 6 6"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Auto
                  </span>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">Queue Manager</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Smart queue management with auto-mixing, priority settings, and AI-powered song recommendations
              </p>
              <div className="flex items-center text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
                Explore feature
              </div>
            </div>
          </Link>

          {/* AI DJ Assistant */}
          <Link to="/dj/ai-assistant" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-600/5 border-2 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.9 19.1C1 15.5 1 10.5 4.9 6.9"/>
                    <path d="M16.6 6.9C20.4 10.5 20 15.5 16.6 19.1"/>
                    <path d="M12 2v6"/>
                    <path d="M12 16v6"/>
                    <path d="M8 12h8"/>
                  </svg>
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    AI
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    BETA
                  </span>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">AI DJ Assistant</h3>
              <p className="text-sm text-muted-foreground mb-4">
                AI-powered assistant that analyzes your library and creates intelligent, seamless mixes automatically
              </p>
              <div className="flex items-center text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
                Try AI mixing
              </div>
            </div>
          </Link>

          {/* DJ Controls */}
          <Link to="/dj/controls" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-red-600/5 border-2 border-orange-500/20 hover:border-orange-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-orange-600 to-red-600 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20"/>
                    <path d="M8 10h8"/>
                    <path d="M8 14h8"/>
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">DJ Controls</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Essential DJ controls for playback, crossfading, and comprehensive session management
              </p>
              <div className="flex items-center text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
                Access controls
              </div>
            </div>
          </Link>

          {/* More Tools Link */}
          <Link to="/dj" className="group">
            <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/5 border-2 border-dashed border-gray-500/30 hover:border-gray-500/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-gray-500/10 rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                      <path d="M12 5v14"/>
                      <path d="M5 12h14"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">More DJ Tools</h3>
                    <p className="text-sm text-muted-foreground">Explore additional features</p>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="p-6 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 border border-blue-500/10 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                <path d="M5 3v4"/>
                <path d="M19 17v4"/>
                <path d="M3 5h4"/>
                <path d="M17 19h4"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold mb-1 text-sm">Pro Tip</h3>
              <p className="text-sm text-muted-foreground">
                Start with <span className="font-medium text-foreground">DJ Mixer</span> for the complete mixing experience. Features marked with "Pro" offer advanced capabilities for professional DJs. All tools integrate seamlessly with your music library.
              </p>
            </div>
          </div>
        </div>
      </section>

      <OllamaErrorBoundary>
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
                <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Style-Based Playlists</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  AI Generated
                </span>
              </h2>
              <p className="text-sm text-muted-foreground">Create custom playlists based on mood, genre, or theme</p>
            </div>
            <Button onClick={clearPlaylistCache} variant="outline" size="sm" className="min-h-[44px] w-full sm:w-auto hover:bg-destructive/5 hover:border-destructive/50 transition-all" aria-label="Clear playlist cache">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
              Clear Cache
            </Button>
          </div>

        <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/5 to-cyan-500/5 border border-blue-500/20">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              <Input
                placeholder="Enter a mood, genre, or theme (e.g., 'Chill Sunday', 'Workout Energy', 'Halloween Party')"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="pl-12 min-h-[52px] bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                aria-label="Playlist style"
              />
            </div>
            <Button
              onClick={() => {
                const cacheKey = `playlist-${trimmedStyle}`;
                localStorage.removeItem(cacheKey);
                queryClient.invalidateQueries({ queryKey: ['playlist', trimmedStyle] });
                refetchPlaylist();
              }}
              disabled={!trimmedStyle}
              className="min-h-[52px] w-full sm:w-auto px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg shadow-blue-500/20"
              aria-label="Generate playlist now"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                <path d="M5 3v4"/>
                <path d="M19 17v4"/>
                <path d="M3 5h4"/>
                <path d="M17 19h4"/>
              </svg>
              Generate Playlist
            </Button>
          </div>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border border-blue-500/10 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">Generated Playlist: "{debouncedStyle || style}"</p>
                  <p className="text-xs text-muted-foreground">
                    {(playlistData.data.playlist as PlaylistItem[]).filter(item => item.songId).length} of 5 songs found in your library
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePlaylistQueue} size="sm" className="bg-primary hover:bg-primary/90" aria-label="Add entire playlist to queue">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M5 12h14"/>
                    <path d="M12 5v14"/>
                  </svg>
                  Queue All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const cacheKey = `playlist-${debouncedStyle}`;
                    localStorage.removeItem(cacheKey);
                    console.log(`🗑️ Cleared cache for "${debouncedStyle}", regenerating...`);
                    refetchPlaylist();
                  }}
                  aria-label="Regenerate playlist"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M21 2v6h-6"/>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  Regenerate
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(playlistData.data.playlist as PlaylistItem[]).map((item, index: number) => {
                const hasSong = !!item.songId;
                return (
                  <div
                    key={index}
                    className={`group rounded-xl border transition-all duration-300 hover:shadow-md ${
                      hasSong
                        ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5 hover:border-green-500/50'
                        : 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5 hover:border-orange-500/50'
                    }`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-background/80 text-xs font-medium">
                              {index + 1}
                            </span>
                            <span className="font-semibold text-base">{item.song}</span>
                            {hasSong ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Available
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                Not in Library
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.explanation}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {hasSong ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
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
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <path d="M5 12h14"/>
                                <path d="M12 5v14"/>
                              </svg>
                              Queue
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const [artistPart] = item.song.split(' - ');
                                if (artistPart) {
                                  window.location.href = `/library?search=${encodeURIComponent(artistPart.trim())}`;
                                }
                              }}
                              className="border-orange-500/30 hover:bg-orange-500/10"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="m21 21-4.35-4.35"/>
                              </svg>
                              Search Similar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(playlistData.data.playlist as PlaylistItem[]).length === 0 && (
              <div className="text-center p-8 border border-dashed rounded-xl">
                <p className="text-muted-foreground">No matching songs found. Try a different style or theme.</p>
              </div>
            )}
          </div>
        )}
        </section>
      </OllamaErrorBoundary>

      {/* Additional Features - Compact Grid */}
      <section className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">More Features</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Link to="/downloads" className="group p-4 rounded-xl border border-border/50 hover:border-primary/50 bg-card/50 hover:bg-card transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" x2="12" y1="15" y2="3"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Downloads</p>
                <p className="text-xs text-muted-foreground">Manage music</p>
              </div>
            </div>
          </Link>

          <Link to="/dashboard/analytics" className="group p-4 rounded-xl border border-border/50 hover:border-primary/50 bg-card/50 hover:bg-card transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <line x1="12" x2="12" y1="20" y2="10"/>
                  <line x1="18" x2="18" y1="20" y2="4"/>
                  <line x1="6" x2="6" y1="20" y2="16"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Analytics</p>
                <p className="text-xs text-muted-foreground">View insights</p>
              </div>
            </div>
          </Link>
        </div>
      </section>

      </div>
    </div>
  );
}
