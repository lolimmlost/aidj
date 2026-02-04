import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from 'sonner';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore, type SourceMode } from '@/lib/stores/preferences';
import { search } from '@/lib/services/navidrome';
import { Button } from '@/components/ui/button';
import type { Song } from '@/lib/types/song';
import { useSongFeedback } from '@/hooks/useSongFeedback';
import { useDiscoveryQueueStore } from '@/lib/stores/discovery-queue';
import { queryKeys, queryPresets } from '@/lib/query';
import { AIRecommendationsSection } from '@/components/dashboard/AIRecommendationsSection';
import { CustomPlaylistSection, type PlaylistItem } from '@/components/dashboard/CustomPlaylistSection';
import { STYLE_PRESETS } from '@/components/dashboard/quick-actions';
import { ArrowLeft, Sparkles, Music } from 'lucide-react';

export const Route = createFileRoute("/dashboard/generate")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    preset: (search.preset as string) || undefined,
  }),
  component: GeneratePage,
});

type CachedSong = Song & {
  trackNumber?: number;
};

function GeneratePage() {
  const { preset: presetParam } = Route.useSearch();
  const [type, setType] = useState<'similar' | 'mood'>('similar');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const playNow = useAudioStore((state) => state.playNow);
  const addToQueueNext = useAudioStore((state) => state.addToQueueNext);
  const addToQueueEnd = useAudioStore((state) => state.addToQueueEnd);
  const setAIUserActionInProgress = useAudioStore((state) => state.setAIUserActionInProgress);
  const { preferences } = usePreferencesStore();
  const addDiscovery = useDiscoveryQueueStore((state) => state.addDiscovery);
  const [style, setStyle] = useState('');
  const [debouncedStyle, setDebouncedStyle] = useState('');
  const [generationStage, setGenerationStage] = useState<'idle' | 'generating' | 'resolving' | 'retrying' | 'done'>('idle');
  const trimmedStyle = style.trim();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>(preferences.recommendationSettings.sourceMode || 'library');
  const [mixRatio, setMixRatio] = useState(preferences.recommendationSettings.mixRatio || 70);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [recommendationsCollapsed, setRecommendationsCollapsed] = useState(false);
  const [playlistCollapsed, setPlaylistCollapsed] = useState(false);

  const songCache = useRef<Map<string, CachedSong[]>>(new Map());

  const [songFeedback, setSongFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});

  // Handle preset from URL search params (e.g. from QuickActions navigation)
  const presetInitialized = useRef(false);
  useEffect(() => {
    if (presetParam && !presetInitialized.current) {
      presetInitialized.current = true;
      const preset = STYLE_PRESETS.find(p => p.id === presetParam);
      if (preset) {
        setActivePreset(preset.id);
        setStyle(preset.prompt);
        setGenerationStage('generating');
        queryClient.invalidateQueries({
          queryKey: queryKeys.playlists.generatedByStyle(preset.prompt, sourceMode, mixRatio),
        });
      }
    }
  }, [presetParam, sourceMode, mixRatio, queryClient]);

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({ song, feedbackType, songId }: { song: string; feedbackType: 'thumbs_up' | 'thumbs_down'; songId?: string }) => {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songArtistTitle: song,
          songId: songId || null,
          feedbackType,
          source: 'recommendation',
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          await response.json();
          return;
        }
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit feedback');
      }
      return response.json();
    },
    onMutate: async ({ song, feedbackType }) => {
      setSongFeedback(prev => ({ ...prev, [song]: feedbackType }));
    },
    onSuccess: (_, { feedbackType }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.preferences() });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      const emoji = feedbackType === 'thumbs_up' ? '👍' : '👎';
      toast.success(`Feedback saved ${emoji}`, {
        description: 'Your preferences help improve recommendations',
        duration: 2000,
      });
    },
    onError: (error, { song }) => {
      setSongFeedback(prev => ({ ...prev, [song]: null }));
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

  // Load cache from localStorage on mount
  useEffect(() => {
    const cachedSongs = localStorage.getItem('songCache');
    if (cachedSongs) {
      try {
        const parsed = JSON.parse(cachedSongs);
        songCache.current = new Map(parsed);
      } catch (error) {
        console.error('Failed to load song cache:', error);
      }
    }
  }, []);

  // Debounce style input
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (trimmedStyle) {
      debounceTimeoutRef.current = setTimeout(() => {
        setDebouncedStyle(trimmedStyle);
      }, 800);
    } else {
      setDebouncedStyle('');
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [trimmedStyle]);

  // === AI Recommendations Query ===
  const { data: recommendations, isLoading, error, refetch: refetchRecommendations } = useQuery({
    queryKey: queryKeys.recommendations.list(session?.user.id || '', type),
    queryFn: async () => {
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
      const lastData: unknown = null;

      while (attempts < maxAttempts) {
        attempts++;

        const timeSeed = Date.now() % 1000;
        const promptArray = prompts[type];
        const randomIndex = (Math.random() * 1000 + timeSeed) % promptArray.length;
        const randomPrompt = promptArray[Math.floor(randomIndex)];

        const response = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: randomPrompt, currentSongId: currentSong?.id }),
        });
        if (!response.ok) throw new Error('Failed to fetch recommendations');
        const data = await response.json();
        data.timestamp = new Date().toISOString();

        const validatedRecommendations = [];
        let foundInLibrary = 0;

        for (const rec of data.data.recommendations) {
          try {
            if (rec.songId && rec.url) {
              foundInLibrary++;
              validatedRecommendations.push({
                ...rec,
                foundInLibrary: true,
                actualSong: {
                  id: rec.songId,
                  url: rec.url,
                  name: rec.song.split(' - ').slice(1).join(' - ') || rec.song,
                  artist: rec.song.split(' - ')[0] || 'Unknown',
                }
              });
              continue;
            }

            const parts = rec.song.split(' - ');
            let foundSong = null;

            if (parts.length >= 2) {
              const artistPart = parts[0].trim();
              const titlePart = parts.slice(1).join(' - ').trim();

              const titleMatches = await search(titlePart, 0, 10);
              foundSong = titleMatches.find(s =>
                s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
                artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
              );

              if (!foundSong) {
                const artistMatches = await search(artistPart, 0, 10);
                foundSong = artistMatches.find(s =>
                  s.title?.toLowerCase().includes(titlePart.toLowerCase()) ||
                  s.name?.toLowerCase().includes(titlePart.toLowerCase())
                );
              }

              if (!foundSong) {
                const fullMatches = await search(rec.song, 0, 5);
                foundSong = fullMatches[0];
              }
            } else {
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
            } else {
              validatedRecommendations.push({
                ...rec,
                foundInLibrary: false
              });
            }
          } catch (searchError) {
            validatedRecommendations.push({
              ...rec,
              foundInLibrary: false,
              searchError: true
            });
          }
        }

        if (foundInLibrary >= 2) {
          data.data.recommendations = validatedRecommendations;
          return data;
        }

        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return lastData as any;
    },
    enabled: false,
    ...queryPresets.recommendations,
  });

  // Feedback data for recommendations
  const recommendedSongIds = useMemo(() =>
    recommendations?.data?.recommendations?.map((rec: { song: string; actualSong?: { id?: string } }) => rec.actualSong?.id || rec.song).filter(Boolean) || [],
    [recommendations?.data?.recommendations]
  );
  const { data: feedbackData } = useSongFeedback(recommendedSongIds);

  useEffect(() => {
    if (feedbackData?.feedback) {
      setSongFeedback(prev => {
        const updated = { ...prev };
        recommendations?.data?.recommendations?.forEach((rec: { song: string; actualSong?: { id?: string } }) => {
          const songId = rec.actualSong?.id || rec.song;
          if (songId && feedbackData.feedback[songId]) {
            updated[rec.song] = feedbackData.feedback[songId];
          }
        });
        return updated;
      });
    }
  }, [feedbackData, recommendations]);

  // === Queue Action Handlers ===
  const handleQueueAction = async (song: string, position: 'now' | 'next' | 'end') => {
    try {
      const cacheKey = song.toLowerCase().trim();
      let songs = songCache.current.get(cacheKey);

      if (!songs) {
        let attempts = 0;
        while (!songs && attempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 200));
          songs = songCache.current.get(cacheKey);
          if (songs) break;
          attempts++;
        }

        if (!songs) {
          try {
            songs = await search(song, 0, 1);
            songCache.current.set(cacheKey, songs);
            if (songCache.current.size > 50) {
              const firstKey = songCache.current.keys().next().value;
              if (firstKey) songCache.current.delete(firstKey);
            }
          } catch (searchError) {
            if (searchError instanceof Error && searchError.message.includes('rate limit')) {
              toast.error('Please wait a moment before searching for songs');
            } else {
              toast.error('Failed to search for song');
            }
            return;
          }
        }
      }

      if (songs && songs.length > 0) {
        const realSong = songs[0] as CachedSong;
        const songForPlayer: Song = {
          id: realSong.id,
          name: realSong.name || realSong.title || song,
          albumId: realSong.albumId || '',
          duration: realSong.duration || 0,
          track: realSong.track || realSong.trackNumber || 1,
          url: realSong.url || '',
          artist: realSong.artist || 'Unknown Artist'
        };

        try {
          setAIUserActionInProgress(true);
          if (position === 'now') {
            playNow(realSong.id, songForPlayer);
            toast.success(`Now playing: ${songForPlayer.name}`);
          } else if (position === 'next') {
            addToQueueNext([songForPlayer]);
            toast.success(`Added "${songForPlayer.name}" to play next`);
          } else {
            addToQueueEnd([songForPlayer]);
            toast.success(`Added "${songForPlayer.name}" to end of queue`);
          }
          setTimeout(() => setAIUserActionInProgress(false), 2000);
        } catch (queueError) {
          toast.error('Failed to add song to queue');
          setAIUserActionInProgress(false);
        }
      } else {
        toast.error('Song not found in library');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    }
  };

  const currentSong = useAudioStore((state) =>
    state.playlist[state.currentSongIndex] || null
  );

  // Cancel playlist generation
  const cancelPlaylistGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerationStage('idle');
    queryClient.cancelQueries({ queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio) });
    toast.info('Playlist generation cancelled');
  };

  // === Custom Playlist Query ===
  const { data: playlistData, isLoading: playlistLoading, error: playlistError, refetch: refetchPlaylist } = useQuery({
    queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio),
    queryFn: async () => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      let attempts = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;
      let lastData: unknown = null;

      while (attempts < maxAttempts) {
        if (signal.aborted) throw new Error('cancelled');
        attempts++;

        if (attempts === 1) {
          setGenerationStage('generating');
        } else {
          setGenerationStage('retrying');
        }

        try {
          const response = await fetch('/api/playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style: debouncedStyle, sourceMode, mixRatio, currentSongId: currentSong?.id }),
            signal,
          });

          if (!response.ok) throw new Error(`Failed to fetch playlist: ${response.statusText}`);

          setGenerationStage('resolving');
          const data = await response.json();

          const playlistItems = data.data.playlist as PlaylistItem[];
          const librarySongsCount = playlistItems.filter(item => item.songId && !item.missing && item.inLibrary).length;
          const discoverySongsCount = playlistItems.filter(item => item.isDiscovery).length;
          const validCount = sourceMode === 'discovery'
            ? playlistItems.length
            : sourceMode === 'mix'
              ? librarySongsCount + discoverySongsCount
              : librarySongsCount;

          const minRequired = sourceMode === 'library' ? 3 : sourceMode === 'discovery' ? 5 : 2;
          if (validCount >= minRequired) {
            setGenerationStage('done');
            return data;
          }

          lastData = data;

          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (lastData) {
        setGenerationStage('done');
        return lastData;
      }

      setGenerationStage('idle');
      throw lastError || new Error('Failed to generate playlist after multiple attempts');
    },
    enabled: !!debouncedStyle && !!session,
    retry: false,
  });

  // === Playlist Queue Handlers ===
  const handlePlaylistQueueAction = (position: 'now' | 'next' | 'end') => {
    if (!playlistData) return;
    const resolvedSongs = ((playlistData as any).data.playlist as PlaylistItem[]).filter((item) => item.songId).map((item) => {
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

    if (resolvedSongs.length === 0) {
      toast.error('No songs available in library for this playlist.');
      return;
    }

    setAIUserActionInProgress(true);

    if (position === 'now') {
      if (resolvedSongs.length > 0) {
        playNow(resolvedSongs[0].id, resolvedSongs[0]);
      }
      toast.success(`Now playing playlist with ${resolvedSongs.length} songs`);
    } else if (position === 'next') {
      addToQueueNext(resolvedSongs);
      toast.success(`Added ${resolvedSongs.length} songs to play next`);
    } else {
      addToQueueEnd(resolvedSongs);
      toast.success(`Added ${resolvedSongs.length} songs to end of queue`);
    }

    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };

  const clearPlaylistCache = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generated() });
    setStyle('');
    setDebouncedStyle('');
  };

  // Save cache to localStorage when recommendations change
  useEffect(() => {
    const saveCache = () => {
      try {
        const cacheArray = Array.from(songCache.current.entries());
        localStorage.setItem('songCache', JSON.stringify(cacheArray));
      } catch (error) {
        console.error('Failed to save song cache:', error);
      }
    };
    const timeoutId = setTimeout(saveCache, 1000);
    return () => clearTimeout(timeoutId);
  }, [recommendations]);

  // Pre-warm cache with recommended songs
  useEffect(() => {
    if (recommendations && recommendations.data.recommendations) {
      recommendations.data.recommendations.forEach((rec: { song: string; foundInLibrary?: boolean; actualSong?: CachedSong }) => {
        const cacheKey = rec.song.toLowerCase().trim();

        if (rec.foundInLibrary && rec.actualSong) {
          songCache.current.set(cacheKey, [rec.actualSong]);
          return;
        }

        if (!songCache.current.has(cacheKey)) {
          const parts = rec.song.split(' - ');
          if (parts.length >= 2) {
            const artistPart = parts[0].trim();
            const titlePart = parts.slice(1).join(' - ').trim();

            search(titlePart, 0, 10)
              .then(titleMatches => {
                const match = titleMatches.find(s =>
                  s.artist?.toLowerCase().includes(artistPart.toLowerCase()) ||
                  artistPart.toLowerCase().includes(s.artist?.toLowerCase() || '')
                );
                if (match) {
                  songCache.current.set(cacheKey, [match]);
                  return;
                }
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
                } else {
                  search(rec.song, 0, 5).then(fullMatches => {
                    songCache.current.set(cacheKey, fullMatches.length > 0 ? [fullMatches[0]] : []);
                  });
                }
              })
              .catch(() => {
                songCache.current.set(cacheKey, []);
              });
          } else {
            search(rec.song, 0, 5)
              .then(songs => {
                songCache.current.set(cacheKey, songs.length > 0 ? [songs[0]] : []);
              })
              .catch(() => {
                songCache.current.set(cacheKey, []);
              });
          }
        }
      });
    }
  }, [recommendations]);

  // === Memoized Callbacks ===
  const handleGenerate = useCallback(() => {
    setGenerationStage('generating');
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generatedByStyle(trimmedStyle, sourceMode, mixRatio) });
    refetchPlaylist();
  }, [queryClient, trimmedStyle, sourceMode, mixRatio, refetchPlaylist]);

  const handleRegenerate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio) });
    setGenerationStage('generating');
    refetchPlaylist();
  }, [queryClient, debouncedStyle, sourceMode, mixRatio, refetchPlaylist]);

  const handleSongQueue = useCallback((item: PlaylistItem, position: 'now' | 'next' | 'end') => {
    if (!item.songId || !item.url) return;
    const parts = item.song.split(' - ');
    const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;
    const songForPlayer: Song = {
      id: item.songId,
      name: title,
      title,
      albumId: '',
      duration: 0,
      track: 1,
      url: item.url,
      artist,
    };
    setAIUserActionInProgress(true);
    if (position === 'now') {
      playNow(item.songId, songForPlayer);
      toast.success(`Now playing: ${title}`);
    } else if (position === 'next') {
      addToQueueNext([songForPlayer]);
      toast.success(`Added "${title}" to play next`);
    } else {
      addToQueueEnd([songForPlayer]);
      toast.success(`Added "${title}" to end of queue`);
    }
    setTimeout(() => setAIUserActionInProgress(false), 2000);
  }, [playNow, addToQueueNext, addToQueueEnd, setAIUserActionInProgress]);

  const handleDiscoveryAdd = useCallback(async (item: PlaylistItem, index: number) => {
    const parts = item.song.split(' - ');
    const artist = parts.length >= 2 ? parts[0].trim() : '';
    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;
    const toastId = `lidarr-add-${index}`;
    try {
      toast.loading(`Searching for "${title}" by ${artist}...`, { id: toastId, duration: Infinity });
      const response = await fetch('/api/lidarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song: item.song }),
      });
      const data = await response.json();
      if (response.ok) {
        addDiscovery({
          song: item.song,
          artist,
          title,
          source: item.discoverySource === 'lastfm' ? 'lastfm' : 'ollama',
          lidarrArtistId: data.artistId,
        });
        toast.success(data.message || `Found and added "${title}" to download queue`, {
          id: toastId,
          description: 'Tracking in Discovery Queue',
          duration: 5000,
        });
      } else {
        toast.error(data.message || data.error || 'Could not find automatically', {
          id: toastId,
          description: 'Opening downloads page for manual search...',
          duration: 3000,
        });
        setTimeout(() => navigate({ to: '/downloads', search: { search: artist } }), 1500);
      }
    } catch (error) {
      toast.error('Failed to search', {
        id: toastId,
        description: 'Opening downloads page...',
        duration: 3000,
      });
      setTimeout(() => {
        window.location.href = `/downloads?search=${encodeURIComponent(artist)}`;
      }, 1500);
    }
  }, [addDiscovery, navigate]);

  const handleSearchSimilar = useCallback((artist: string) => {
    navigate({ to: '/library', search: { search: artist } });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20 overflow-x-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="shrink-0">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              AI Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI-powered recommendations and playlist generation
            </p>
          </div>
        </div>

        {/* AI Recommendations */}
        <AIRecommendationsSection
          show={true}
          collapsed={recommendationsCollapsed}
          onToggleCollapse={() => setRecommendationsCollapsed(!recommendationsCollapsed)}
          type={type}
          onTypeChange={(value) => setType(value as 'similar' | 'mood')}
          isLoading={isLoading}
          error={error}
          recommendations={recommendations}
          onRefresh={() => refetchRecommendations()}
          songFeedback={songFeedback}
          onFeedback={(params) => feedbackMutation.mutate(params)}
          isFeedbackPending={feedbackMutation.isPending}
          onQueueAction={handleQueueAction}
        />

        {/* Custom Playlist Generation */}
        <CustomPlaylistSection
          collapsed={playlistCollapsed}
          onToggleCollapse={() => setPlaylistCollapsed(!playlistCollapsed)}
          style={style}
          onStyleChange={setStyle}
          trimmedStyle={trimmedStyle}
          debouncedStyle={debouncedStyle}
          sourceMode={sourceMode}
          onSourceModeChange={setSourceMode}
          mixRatio={mixRatio}
          onMixRatioChange={setMixRatio}
          data={playlistData}
          isLoading={playlistLoading}
          error={playlistError}
          generationStage={generationStage}
          activePreset={activePreset}
          currentSong={currentSong}
          onGenerate={handleGenerate}
          onCancel={cancelPlaylistGeneration}
          onClearCache={clearPlaylistCache}
          onRegenerate={handleRegenerate}
          onQueuePlaylist={handlePlaylistQueueAction}
          onSongQueue={handleSongQueue}
          onDiscoveryAdd={handleDiscoveryAdd}
          onSearchSimilar={handleSearchSimilar}
        />
      </div>
    </div>
  );
}
