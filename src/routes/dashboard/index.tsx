import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from 'sonner';
import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Suspense, lazy } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { VirtualizedList } from '@/components/ui/virtualized-list';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore, type SourceMode } from '@/lib/stores/preferences';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { search } from '@/lib/services/navidrome';
import { OllamaErrorBoundary } from '@/components/ollama-error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { hasLegacyFeedback, migrateLegacyFeedback, isMigrationCompleted } from '@/lib/utils/feedback-migration';
import { Play, Plus, ListPlus, Download, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Song } from '@/lib/types/song';
import { useSongFeedback } from '@/hooks/useSongFeedback';
// Critical components - loaded immediately
import { DashboardHero, QuickActions, STYLE_PRESETS, type StylePreset } from '@/components/dashboard';
import { SourceModeSelector, SourceBadge } from '@/components/playlist/source-mode-selector';
import { GenerationProgress } from '@/components/ui/generation-progress';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useDiscoveryQueueStore } from '@/lib/stores/discovery-queue';
// Virtualization for large lists
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
// Centralized query management for optimized caching
import { queryKeys, queryPresets } from '@/lib/query';
// Lazy loading utilities for deferred content
import { useDeferredRender, SectionSkeleton, FeatureCardSkeleton } from '@/lib/utils/lazy-components';

// ===== CODE SPLITTING: Lazy-loaded components for non-critical sections =====
// These components are not needed for initial page render and can be loaded later

// DJFeatures - loaded after 1.5s delay (desktop only, non-critical)
const DJFeatures = lazy(() => import('@/components/dashboard/DJFeatures').then(m => ({ default: m.DJFeatures })));

// MoreFeatures - loaded after initial render (bottom of page)
const MoreFeatures = lazy(() => import('@/components/dashboard/MoreFeatures').then(m => ({ default: m.MoreFeatures })));

// PreferenceInsights - moved to Analytics page (accessible via sidebar)
// const PreferenceInsights = lazy(() => import('@/components/recommendations/PreferenceInsights').then(m => ({ default: m.PreferenceInsights })));

// DiscoveryQueuePanel - loaded after initial render
const DiscoveryQueuePanel = lazy(() => import('@/components/discovery/DiscoveryQueuePanel').then(m => ({ default: m.DiscoveryQueuePanel })));

// MixCompatibilityBadges - only loaded when needed (harmonic mixing)
const MixCompatibilityBadges = lazy(() => import('@/components/dj/mix-compatibility-badges').then(m => ({ default: m.MixCompatibilityBadges })));

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
  const navigate = useNavigate();
  const addToQueue = useAudioStore((state) => state.playSong);
  const playNow = useAudioStore((state) => state.playNow);
  const addToQueueNext = useAudioStore((state) => state.addToQueueNext);
  const addToQueueEnd = useAudioStore((state) => state.addToQueueEnd);
  const setAIUserActionInProgress = useAudioStore((state) => state.setAIUserActionInProgress);
  const { preferences, loadPreferences } = usePreferencesStore();
  const addDiscovery = useDiscoveryQueueStore((state) => state.addDiscovery);
  const [style, setStyle] = useState('');
  const [debouncedStyle, setDebouncedStyle] = useState('');
  const [generationStage, setGenerationStage] = useState<'idle' | 'generating' | 'resolving' | 'retrying' | 'done'>('idle');
  const trimmedStyle = style.trim();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Story 7.4: Abort controller for canceling long operations
  const abortControllerRef = useRef<AbortController | null>(null);
  // Story 7.1: Source mode state
  const [sourceMode, setSourceMode] = useState<SourceMode>(preferences.recommendationSettings.sourceMode || 'library');
  const [mixRatio, setMixRatio] = useState(preferences.recommendationSettings.mixRatio || 70);
  // Story 7.4: Quick Actions state
  const [activePreset, setActivePreset] = useState<string | null>(null);
  // Story 7.4: Collapsible sections
  // Recommendations collapsed by default - Quick Actions now provides similar functionality
  const [recommendationsCollapsed, setRecommendationsCollapsed] = useState(true);
  const [playlistCollapsed, setPlaylistCollapsed] = useState(false);
  // AI DJ state from audio store (read-only for banner display)
  const aiDJEnabled = useAudioStore((state) => state.aiDJEnabled);
  const aiQueuedSongIds = useAudioStore((state) => state.aiQueuedSongIds);
  const playlist = useAudioStore((state) => state.playlist);
  const currentSongIndex = useAudioStore((state) => state.currentSongIndex);
  // Define a proper type for the song cache
  type CachedSong = Song & {
    trackNumber?: number;
  };
  
  const songCache = useRef<Map<string, CachedSong[]>>(new Map()); // Cache for song search results

  // Track feedback state per song (for optimistic updates)
  const [songFeedback, setSongFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});

  // Feedback mutation for inline buttons
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
    onMutate: async ({ song, feedbackType }) => {
      // Optimistic update
      setSongFeedback(prev => ({ ...prev, [song]: feedbackType }));
    },
    onSuccess: (_, { feedbackType }) => {
      // Use granular invalidation with query key factory
      // Only invalidate preference analytics and feedback, not recommendations
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.preferences() });
      // Invalidate all feedback queries to refresh the feedback state
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
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
    // Use query key factory for consistent cache management
    queryKey: queryKeys.recommendations.list(session?.user.id || '', type),
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
      let lastData: unknown = null;

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
            // Phase 3: Check if recommendation already has songId (pre-resolved from smart playlist)
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
              console.log(`✅ Pre-resolved: ${rec.song}`);
              continue;
            }

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
      return lastData as any;
    },
    // Story 7.4: Manual trigger only - don't auto-load on page visit
    enabled: false,
    // Use recommendations preset for consistent caching
    ...queryPresets.recommendations,
  });

  // Memoize recommended song IDs to prevent unnecessary re-fetches
  const recommendedSongIds = useMemo(() =>
    recommendations?.data?.recommendations?.map((rec: { song: string; actualSong?: { id?: string } }) => rec.actualSong?.id || rec.song).filter(Boolean) || [],
    [recommendations?.data?.recommendations]
  );
  const { data: feedbackData } = useSongFeedback(recommendedSongIds);

  // Update local songFeedback state when feedback data is fetched
  useEffect(() => {
    if (feedbackData?.feedback) {
      setSongFeedback(prev => {
        const updated = { ...prev };
        
        // Map song IDs to feedback and update state
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

  const handleQueueAction = async (song: string, position: 'now' | 'next' | 'end') => {
    try {
      console.log('🎯 Queuing recommendation:', song, 'position:', position); // Debug log

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
              if (firstKey) {
                songCache.current.delete(firstKey);
              }
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
        const realSong = songs[0] as CachedSong;
        console.log('✅ Found song:', realSong); // Debug log

        // Ensure the song has all required properties for the audio player
        const songForPlayer: Song = {
          id: realSong.id,
          name: realSong.name || realSong.title || song,
          albumId: realSong.albumId || '',
          duration: realSong.duration || 0,
          track: realSong.track || realSong.trackNumber || 1,
          url: realSong.url || '',
          artist: realSong.artist || 'Unknown Artist'
        };

        console.log('🎵 Song prepared for player:', songForPlayer); // Debug log

        try {
          // Set user action flag to prevent AI DJ auto-refresh
          setAIUserActionInProgress(true);
          
          if (position === 'now') {
            playNow(realSong.id, songForPlayer);
            toast.success(`Now playing: ${songForPlayer.name}`);
          } else if (position === 'next') {
            const { addToQueueNext } = useAudioStore.getState();
            addToQueueNext([songForPlayer]);
            toast.success(`Added "${songForPlayer.name}" to play next`);
          } else {
            const { addToQueueEnd } = useAudioStore.getState();
            addToQueueEnd([songForPlayer]);
            toast.success(`Added "${songForPlayer.name}" to end of queue`);
          }
          
          console.log('🚀 Queued song successfully'); // Debug log
          
          // Clear the flag after a short delay
          setTimeout(() => setAIUserActionInProgress(false), 2000);
        } catch (queueError) {
          console.error('Queue error:', queueError);
          toast.error('Failed to add song to queue');
          setAIUserActionInProgress(false);
        }
      } else {
        console.log('❌ No songs found for:', song);
        toast.error('Song not found in library');
      }
    } catch (error) {
      console.error('💥 Unexpected error in handleQueueAction:', error);
      toast.error('An unexpected error occurred');
    }
  };

  interface PlaylistItem {
    song: string;
    explanation: string;
    songId?: string;
    url?: string;
    missing?: boolean;
    // Story 7.1: Source mode fields
    isDiscovery?: boolean;
    inLibrary?: boolean;
    // Story 7.2: Discovery source tracking
    discoverySource?: 'lastfm' | 'ollama' | 'library';
    // Story 7.5: Harmonic mixing metadata
    bpm?: number;
    key?: string;
  }

  // Story 7.5: Get current song for harmonic mixing comparison
  const currentSong = useAudioStore((state) =>
    state.playlist[state.currentSongIndex] || null
  );

  // Story 7.4: Cancel function for long operations
  const cancelPlaylistGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerationStage('idle');
    // Use query key factory for consistent cache management
    queryClient.cancelQueries({ queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio) });
    toast.info('Playlist generation cancelled');
  };

  const { data: playlistData, isLoading: playlistLoading, error: playlistError, refetch: refetchPlaylist } = useQuery({
    // Use query key factory for consistent cache management
    queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio),
    queryFn: async () => {
      // Story 7.4: Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // React Query handles caching - no need for localStorage dual caching
      // This reduces complexity and prevents cache inconsistencies

      let attempts = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;
      let lastData: unknown = null;

      while (attempts < maxAttempts) {
        // Story 7.4: Check if cancelled
        if (signal.aborted) {
          throw new Error('cancelled');
        }

        attempts++;

        if (attempts === 1) {
          setGenerationStage('generating');
        } else {
          setGenerationStage('retrying');
        }

        console.log(`🎯 Playlist generation attempt ${attempts}/${maxAttempts} for style: "${debouncedStyle}" (${sourceMode})`);

        try {
          const response = await fetch('/api/playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Story 7.1: Pass sourceMode and mixRatio to API
            body: JSON.stringify({ style: debouncedStyle, sourceMode, mixRatio }),
            // Story 7.4: Pass abort signal
            signal,
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.statusText}`);
          }

          setGenerationStage('resolving');
          const data = await response.json();
          console.log(`✨ Generated playlist attempt ${attempts}:`, data);

          // Story 7.1: Count songs based on source mode
          // For library mode: count songs found in library
          // For discovery mode: all songs are valid (not expected in library)
          // For mix mode: count both library songs and discovery songs
          const playlistItems = data.data.playlist as PlaylistItem[];
          const librarySongsCount = playlistItems.filter(item => item.songId && !item.missing && item.inLibrary).length;
          const discoverySongsCount = playlistItems.filter(item => item.isDiscovery).length;
          const validCount = sourceMode === 'discovery'
            ? playlistItems.length // All discovery songs are valid
            : sourceMode === 'mix'
              ? librarySongsCount + discoverySongsCount // Both types are valid in mix
              : librarySongsCount; // Only library songs for library mode

          console.log(`📊 Resolution results: ${librarySongsCount} library, ${discoverySongsCount} discovery (${validCount} valid for ${sourceMode} mode)`);

          // Story 7.1: Adjust threshold based on source mode
          const minRequired = sourceMode === 'library' ? 3 : sourceMode === 'discovery' ? 5 : 2;
          if (validCount >= minRequired) {
            console.log(`✅ Accepting playlist with ${validCount} valid songs for ${sourceMode} mode`);
            setGenerationStage('done');
            // React Query caches this automatically - no localStorage needed
            return data;
          }

          // Save this result in case all attempts fail
          lastData = data;
          console.log(`🔄 Only ${validCount} valid songs for ${sourceMode} mode, regenerating...`);

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
        // React Query caches this automatically - no localStorage needed
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

  const handlePlaylistQueueAction = (position: 'now' | 'next' | 'end') => {
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
    
    if (resolvedSongs.length === 0) {
      toast.error('No songs available in library for this playlist.');
      return;
    }

    // Set user action flag to prevent AI DJ auto-refresh
    setAIUserActionInProgress(true);

    if (position === 'now') {
      // Use playNow to preserve shuffle state
      if (resolvedSongs.length > 0) {
        playNow(resolvedSongs[0].id, resolvedSongs[0]);
      }
      toast.success(`Now playing playlist with ${resolvedSongs.length} songs`);
    } else if (position === 'next') {
      // Add to play next
      const { addToQueueNext } = useAudioStore.getState();
      addToQueueNext(resolvedSongs);
      toast.success(`Added ${resolvedSongs.length} songs to play next`);
    } else {
      // Add to end
      const { addToQueueEnd } = useAudioStore.getState();
      addToQueueEnd(resolvedSongs);
      toast.success(`Added ${resolvedSongs.length} songs to end of queue`);
    }
    
    // Clear the flag after a short delay
    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };

  
  const clearPlaylistCache = () => {
    // Use query key factory for granular invalidation
    // Invalidate only generated playlists, not saved playlists
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generated() });
    setStyle('');
    setDebouncedStyle('');
    console.log('🧹 Cleared all generated playlist cache');
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
      recommendations.data.recommendations.forEach((rec: { song: string; foundInLibrary?: boolean; actualSong?: CachedSong }) => {
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

  // Memoize calculated stats for hero to prevent recalculation on every render
  const availableRecommendations = useMemo(() =>
    recommendations?.data?.recommendations?.filter((r: { foundInLibrary?: boolean }) => r.foundInLibrary).length || 0,
    [recommendations?.data?.recommendations]
  );

  const playlistSongsReady = useMemo(() =>
    playlistData ? (playlistData.data.playlist as PlaylistItem[]).filter(item => item.songId).length : 0,
    [playlistData]
  );

  // Memoize last played song to prevent object recreation on every render
  const lastPlayedSong = useMemo(() =>
    playlist[currentSongIndex]
      ? {
          title: playlist[currentSongIndex].title || playlist[currentSongIndex].name || 'Unknown',
          artist: playlist[currentSongIndex].artist || 'Unknown Artist',
        }
      : null,
    [playlist, currentSongIndex]
  );

  // Memoize callback handlers to prevent unnecessary child re-renders
  const handlePresetClick = useCallback((preset: StylePreset) => {
    setActivePreset(preset.id);
    setStyle(preset.prompt);
    // Clear cache for this preset to force fresh generation using query key factory
    setGenerationStage('generating');
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generatedByStyle(preset.prompt, sourceMode, mixRatio) });
  }, [sourceMode, mixRatio, queryClient]);

  const handleContinueListening = useCallback(() => {
    // Resume playback if paused
    const { isPlaying, setIsPlaying } = useAudioStore.getState();
    if (!isPlaying) {
      setIsPlaying(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Hero Section */}
        <DashboardHero
          userName={session?.user?.name}
          availableRecommendations={availableRecommendations}
          playlistSongsReady={playlistSongsReady}
        />

        {/* Quick Actions - Simplified layout without duplicate AI DJ control */}
        <QuickActions
          onPresetClick={handlePresetClick}
          lastPlayedSong={lastPlayedSong}
          onContinueListening={handleContinueListening}
          isLoading={playlistLoading}
          activePreset={activePreset}
        />

        {/* AI DJ Status Banner - Only show when enabled, points to player */}
        {aiDJEnabled && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium">AI DJ is active</span>
              <span className="text-xs text-muted-foreground">
                {aiQueuedSongIds.size > 0 ? `• ${aiQueuedSongIds.size} songs queued` : '• Watching your queue'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Toggle in player ↓</span>
          </div>
        )}

      {/* AI Recommendations Section - conditionally rendered based on user preferences */}
      {preferences.dashboardLayout.showRecommendations && (
        <OllamaErrorBoundary>
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <button
                onClick={() => setRecommendationsCollapsed(!recommendationsCollapsed)}
                className="flex items-center gap-2 text-left group"
              >
                <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">AI Recommendations</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    Powered by AI
                  </span>
                </h2>
                {recommendationsCollapsed ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>
              {!recommendationsCollapsed && (
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
              )}
            </div>
            {recommendationsCollapsed && (
              <p className="text-sm text-muted-foreground">Click to expand recommendations</p>
            )}
            {!recommendationsCollapsed && (
              <>
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
                        {recommendations.data.recommendations.filter((rec: { foundInLibrary?: boolean }) => rec.foundInLibrary).length} of {recommendations.data.recommendations.length} songs in your library • Updated {new Date(recommendations.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Virtualized recommendations list for performance with large result sets */}
                <VirtualizedList
                  items={recommendations.data.recommendations}
                  itemHeight={140}
                  containerHeight={Math.min(500, Math.max(280, recommendations.data.recommendations.length * 140))}
                  getItemKey={(rec: { song: string }) => rec.song}
                  gap={12}
                  overscan={3}
                  className="rounded-lg"
                  renderItem={(rec: { song: string; foundInLibrary?: boolean; actualSong?: CachedSong; searchError?: boolean; explanation?: string }, index: number) => {
                    const currentFeedback = songFeedback[rec.song];
                    const hasFeedback = currentFeedback !== undefined && currentFeedback !== null;

                    return (
                      <RecommendationCard
                        key={rec.song}
                        rec={rec}
                        index={index}
                        currentFeedback={currentFeedback}
                        hasFeedback={hasFeedback}
                        onFeedback={(type) => feedbackMutation.mutate({
                          song: rec.song,
                          feedbackType: type,
                          songId: rec.actualSong?.id
                        })}
                        onQueueAction={(position) => handleQueueAction(rec.song, position)}
                        isPending={feedbackMutation.isPending}
                      />
                    );
                  }}
                />
              </div>
            )}
              </>
            )}
          </section>
        </OllamaErrorBoundary>
      )}

      {/* Preference Analytics Widget - Moved to sidebar (Analytics link) */}
      {/* Taste Profile is now accessible via sidebar → Analytics */}

      {/* Story 7.3: Discovery Queue Panel - Deferred loading */}
      <DeferredDiscoveryQueue />

      {/* DJ Features Section - hidden on mobile, deferred loading (non-critical) */}
      <DeferredDJFeatures />

      <OllamaErrorBoundary>
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <button
              onClick={() => setPlaylistCollapsed(!playlistCollapsed)}
              className="flex items-center gap-2 text-left group"
            >
              <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Generate Playlist</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Describe your vibe
                </span>
              </h2>
              {playlistCollapsed ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <ChevronUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </button>
            {!playlistCollapsed && (
              <Button onClick={clearPlaylistCache} variant="outline" size="sm" className="min-h-[44px] w-full sm:w-auto hover:bg-destructive/5 hover:border-destructive/50 transition-all" aria-label="Clear playlist cache">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                Clear Cache
              </Button>
            )}
          </div>
          {playlistCollapsed && (
            <p className="text-sm text-muted-foreground">Click to expand playlist generator</p>
          )}
          {!playlistCollapsed && (
            <>

        <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/5 to-cyan-500/5 border border-blue-500/20 space-y-4">
          {/* Story 7.1: Source Mode Selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Source</label>
            <SourceModeSelector
              value={sourceMode}
              onChange={setSourceMode}
              mixRatio={mixRatio}
              onMixRatioChange={setMixRatio}
            />
          </div>

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
                // Reset generation stage to show loading immediately
                setGenerationStage('generating');
                // Use query key factory for consistent cache management
                queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generatedByStyle(trimmedStyle, sourceMode, mixRatio) });
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
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  Generating Playlist
                  {activePreset && (
                    <span className="text-sm font-normal text-muted-foreground">
                      &quot;{STYLE_PRESETS.find(p => p.id === activePreset)?.label || trimmedStyle}&quot;
                    </span>
                  )}
                </h3>
                {/* Story 7.4: Cancel button for long operations */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelPlaylistGeneration}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="m15 9-6 6"/>
                    <path d="m9 9 6 6"/>
                  </svg>
                  Cancel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <GenerationProgress stage={generationStage} />
            </CardContent>
          </Card>
        )}
        {playlistError && playlistError.message !== 'cancelled' && (
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
                  {/* Story 7.1: Show source mode info in summary */}
                  <p className="text-xs text-muted-foreground">
                    {sourceMode === 'library' ? (
                      `${(playlistData.data.playlist as PlaylistItem[]).filter(item => item.songId).length} of 5 songs found in your library`
                    ) : sourceMode === 'discovery' ? (
                      `${(playlistData.data.playlist as PlaylistItem[]).length} new discoveries to explore`
                    ) : (
                      `${(playlistData.data.playlist as PlaylistItem[]).filter(item => item.inLibrary).length} library + ${(playlistData.data.playlist as PlaylistItem[]).filter(item => item.isDiscovery).length} discoveries`
                    )}
                    {' '}<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted">
                      {sourceMode === 'library' ? 'Library Only' : sourceMode === 'discovery' ? 'Discovery' : `Mix ${mixRatio}/${100-mixRatio}`}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white shadow-sm" aria-label="Add playlist to queue">
                      <ListPlus className="mr-1 h-4 w-4" />
                      Queue
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => handlePlaylistQueueAction('now')}
                      className="min-h-[44px]"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Play Now (First Song)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handlePlaylistQueueAction('next')}
                      className="min-h-[44px]"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add All to Play Next
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handlePlaylistQueueAction('end')}
                      className="min-h-[44px]"
                    >
                      <ListPlus className="mr-2 h-4 w-4" />
                      Add All to End
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Use query key factory for cache invalidation - React Query handles caching
                    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.generatedByStyle(debouncedStyle, sourceMode, mixRatio) });
                    // Reset generation stage to show loading immediately
                    setGenerationStage('generating');
                    console.log(`🗑️ Invalidated cache for "${debouncedStyle}" (${sourceMode}), regenerating...`);
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
                const isDiscovery = item.isDiscovery || false;
                // Story 7.1: Determine card styling based on source
                // Story 7.2: Different colors for Last.fm vs AI discoveries
                const isLastFm = item.discoverySource === 'lastfm';
                const cardStyle = hasSong
                  ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5 hover:border-green-500/50'
                  : isDiscovery
                    ? isLastFm
                      ? 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-pink-500/5 hover:border-red-500/50'
                      : 'border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-pink-500/5 hover:border-purple-500/50'
                    : 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5 hover:border-orange-500/50';

                return (
                  <div
                    key={index}
                    className={`group rounded-xl border transition-all duration-300 hover:shadow-md ${cardStyle}`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-background/80 text-xs font-medium">
                              {index + 1}
                            </span>
                            <span className="font-semibold text-base">{item.song}</span>
                            {/* Story 7.2: Use SourceBadge with discoverySource */}
                            <SourceBadge
                              inLibrary={hasSong}
                              isDiscovery={isDiscovery && !hasSong}
                              discoverySource={item.discoverySource}
                            />
                            {!hasSong && !isDiscovery && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                Not Found
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.explanation}</p>
                          {/* Story 7.5: Harmonic mixing badges - lazy loaded */}
                          {currentSong && (item.bpm || item.key) && (
                            <div className="mt-1">
                              <Suspense fallback={<Skeleton className="h-5 w-20" />}>
                                <MixCompatibilityBadges
                                  currentBpm={currentSong.bpm}
                                  currentKey={currentSong.key}
                                  candidateBpm={item.bpm}
                                  candidateKey={item.key}
                                  compact
                                  showLabel
                                />
                              </Suspense>
                            </div>
                          )}
                          {/* Story 7.1: Show discovery info */}
                          {isDiscovery && !hasSong && (
                            <p className={`text-xs ${isLastFm ? 'text-red-600 dark:text-red-400' : 'text-purple-600 dark:text-purple-400'}`}>
                              {isLastFm ? 'From Last.fm - similar to artists in your library' : 'AI discovery - search or add to your library'}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Feedback buttons for playlist recommendations */}
                          <SongFeedbackButtons
                            songId={item.songId || undefined}
                            artistName={item.song.split(' - ')[0] || 'Unknown'}
                            songTitle={item.song.split(' - ').slice(1).join(' - ') || item.song}
                            source="playlist_generator"
                            likeMessage="Good recommendation"
                            dislikeMessage="Bad recommendation"
                            size="sm"
                          />
                          {hasSong ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                >
                                  <ListPlus className="mr-1 h-4 w-4" />
                                  Queue
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() => {
                                    const parts = item.song.split(' - ');
                                    const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
                                    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;

                                    const songForPlayer = {
                                      id: item.songId!,
                                      name: title,
                                      title: title,
                                      albumId: '',
                                      duration: 0,
                                      track: 1,
                                      url: item.url!,
                                      artist: artist,
                                    };

                                    // Use playNow to preserve shuffle state
                                    playNow(item.songId!, songForPlayer);
                                    toast.success(`Now playing: ${title}`);
                                    
                                    // Set user action flag to prevent AI DJ auto-refresh
                                    setAIUserActionInProgress(true);
                                    setTimeout(() => setAIUserActionInProgress(false), 2000);
                                  }}
                                  className="min-h-[44px]"
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Play Now
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const parts = item.song.split(' - ');
                                    const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
                                    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;
                                    
                                    const { addToQueueNext } = useAudioStore.getState();
                                    addToQueueNext([{
                                      id: item.songId!,
                                      name: title,
                                      title: title,
                                      albumId: '',
                                      duration: 0,
                                      track: 1,
                                      url: item.url!,
                                      artist: artist,
                                    }]);
                                    toast.success(`Added "${title}" to play next`);
                                    
                                    // Set user action flag to prevent AI DJ auto-refresh
                                    setAIUserActionInProgress(true);
                                    setTimeout(() => setAIUserActionInProgress(false), 2000);
                                  }}
                                  className="min-h-[44px]"
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Play Next
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const parts = item.song.split(' - ');
                                    const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
                                    const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;

                                    const { addToQueueEnd } = useAudioStore.getState();
                                    addToQueueEnd([{
                                      id: item.songId!,
                                      name: title,
                                      title: title,
                                      albumId: '',
                                      duration: 0,
                                      track: 1,
                                      url: item.url!,
                                      artist: artist,
                                    }]);
                                    toast.success(`Added "${title}" to end of queue`);
                                    
                                    // Set user action flag to prevent AI DJ auto-refresh
                                    setAIUserActionInProgress(true);
                                    setTimeout(() => setAIUserActionInProgress(false), 2000);
                                  }}
                                  className="min-h-[44px]"
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add to End
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : isDiscovery ? (
                            /* Story 7.1: Discovery song - show Download button */
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const parts = item.song.split(' - ');
                                const artist = parts.length >= 2 ? parts[0].trim() : '';
                                const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : item.song;
                                const toastId = `lidarr-add-${index}`;

                                // Try to add directly to Lidarr
                                try {
                                  toast.loading(`🔍 Searching for "${title}" by ${artist}...`, { id: toastId, duration: Infinity });
                                  const response = await fetch('/api/lidarr/add', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ song: item.song }),
                                  });
                                  const data = await response.json();

                                  if (response.ok) {
                                    // Story 7.3: Track discovery in queue
                                    addDiscovery({
                                      song: item.song,
                                      artist,
                                      title,
                                      source: item.discoverySource === 'lastfm' ? 'lastfm' : 'ollama',
                                      lidarrArtistId: data.artistId,
                                    });
                                    toast.success(`✅ ${data.message || `Found and added "${title}" to download queue`}`, {
                                      id: toastId,
                                      description: 'Tracking in Discovery Queue',
                                      duration: 5000,
                                    });
                                  } else {
                                    // If adding failed, navigate to downloads page to search manually
                                    toast.error(`❌ ${data.message || data.error || 'Could not find automatically'}`, {
                                      id: toastId,
                                      description: 'Opening downloads page for manual search...',
                                      duration: 3000,
                                    });
                                    setTimeout(() => navigate({ to: '/downloads', search: { search: artist } }), 1500);
                                  }
                                } catch (error) {
                                  console.error('Lidarr add error:', error);
                                  toast.error('Failed to search', {
                                    id: toastId,
                                    description: 'Opening downloads page...',
                                    duration: 3000,
                                  });
                                  setTimeout(() => {
                                    window.location.href = `/downloads?search=${encodeURIComponent(artist)}`;
                                  }, 1500);
                                }
                              }}
                              className="border-purple-500/30 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300"
                            >
                              <Download className="mr-1 h-4 w-4" />
                              Find & Download
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const [artistPart] = item.song.split(' - ');
                                if (artistPart) {
                                  navigate({ to: '/library', search: { search: artistPart.trim() } });
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
          </>
          )}
        </section>
      </OllamaErrorBoundary>

      {/* Additional Features - Compact Grid - Deferred loading (bottom of page) */}
      <DeferredMoreFeatures />

      </div>
    </div>
  );
}

// ===== DEFERRED COMPONENTS: Wrap lazy components with deferred rendering =====

/**
 * Deferred PreferenceInsights - REMOVED
 * Taste Profile moved to Analytics page (accessible via sidebar → Analytics)
 */
// function DeferredPreferenceInsights() {
//   const shouldRender = useDeferredRender(1000);
//   if (!shouldRender) {
//     return (
//       <div className="rounded-lg border bg-card p-4">
//         <SectionSkeleton lines={4} />
//       </div>
//     );
//   }
//   return (
//     <Suspense fallback={<SectionSkeleton lines={4} />}>
//       <PreferenceInsights />
//     </Suspense>
//   );
// }

/**
 * Deferred DiscoveryQueuePanel - loads after idle callback
 * Discovery queue is secondary to main dashboard content
 */
function DeferredDiscoveryQueue() {
  const shouldRender = useDeferredRender(500);

  if (!shouldRender) {
    return null; // No skeleton - panel may be hidden anyway
  }

  return (
    <Suspense fallback={null}>
      <DiscoveryQueuePanel />
    </Suspense>
  );
}

/**
 * Deferred DJFeatures - loads after 1.5 second delay
 * Hidden on mobile, low priority on desktop
 */
function DeferredDJFeatures() {
  const shouldRender = useDeferredRender(1500);

  if (!shouldRender) {
    return (
      <div className="hidden md:block">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCardSkeleton />
            <FeatureCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block">
      <Suspense fallback={<FeatureCardSkeleton />}>
        <DJFeatures />
      </Suspense>
    </div>
  );
}

/**
 * Deferred MoreFeatures - loads after initial render
 * Bottom of page content, lowest priority
 */
function DeferredMoreFeatures() {
  const shouldRender = useDeferredRender(2000);

  if (!shouldRender) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-5 w-32 mx-auto" />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <Suspense
      fallback={
        <section className="space-y-4">
          <Skeleton className="h-5 w-32 mx-auto" />
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </section>
      }
    >
      <MoreFeatures />
    </Suspense>
  );
}
