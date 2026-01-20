import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Heart,
  Loader2,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Maximize2,
  Music,
  MicVocal,
  AudioWaveform,
} from 'lucide-react';
import { LyricsModal } from '@/components/lyrics';
import { VisualizerModal } from '@/components/visualizer';

// Helper to get cover art URL from Navidrome
const getCoverArtUrl = (albumId: string | undefined, size: number = 128) => {
  if (!albumId) return null;
  return `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`;
};

// Album art component with fallback
const AlbumArt = ({
  albumId,
  songId,
  artist,
  size = 'md',
  isPlaying = false,
  className = ''
}: {
  albumId?: string;
  songId?: string;
  artist?: string;
  size?: 'sm' | 'md' | 'lg';
  isPlaying?: boolean;
  className?: string;
}) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [resolvedAlbumId, setResolvedAlbumId] = useState<string | null>(albumId || null);

  // Fetch albumId from Navidrome if not provided but songId is available
  useEffect(() => {
    if (albumId) {
      setResolvedAlbumId(albumId);
      return;
    }

    if (!songId) {
      setResolvedAlbumId(null);
      return;
    }

    // Fetch song metadata to get albumId
    const fetchAlbumId = async () => {
      try {
        const response = await fetch(`/api/navidrome/rest/getSong?id=${songId}&f=json`);
        if (response.ok) {
          const data = await response.json();
          const song = data['subsonic-response']?.song;
          if (song?.albumId) {
            setResolvedAlbumId(song.albumId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch album ID:', error);
      }
    };

    fetchAlbumId();
  }, [albumId, songId]);

  // Reset states when albumId changes
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [resolvedAlbumId]);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  };

  const imgSizes = {
    sm: 96,
    md: 112,
    lg: 160,
  };

  const coverUrl = getCoverArtUrl(resolvedAlbumId || undefined, imgSizes[size]);
  const initials = artist?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '♪';

  return (
    <div className={cn(
      sizeClasses[size],
      'rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 relative overflow-hidden',
      className
    )}>
      {coverUrl && !imgError ? (
        <>
          <img
            src={coverUrl}
            alt="Album cover"
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              imgLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Music className="h-4 w-4 text-primary/40 animate-pulse" />
            </div>
          )}
        </>
      ) : (
        <span className={cn(
          'font-bold text-primary/60',
          size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg'
        )}>
          {initials}
        </span>
      )}

      {/* Playing animation overlay */}
      {isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" />
            <div className="w-0.5 h-3 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
            <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}
    </div>
  );
};
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAudioStore } from '@/lib/stores/audio';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query';

// Helper function for time formatting
const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Compact Player Bar for the new three-column layout
 * Fixed at the bottom of the screen
 *
 * ============================================================================
 * iOS BACKGROUND PLAYBACK & LOCK SCREEN CONTROLS - WORKING IMPLEMENTATION
 * ============================================================================
 *
 * Tested: 2024-12-15 on Opera Mobile (iOS, non-PWA web app)
 *
 * KEY REQUIREMENTS FOR iOS MEDIA SESSION API:
 *
 * 1. Set action handlers INSIDE the 'playing' event, NOT on component mount
 *    - iOS ignores handlers set before audio actually plays
 *    - Use audio.addEventListener('playing', handlePlaying) pattern
 *
 * 2. Do NOT set seekbackward/seekforward handlers
 *    - iOS shows EITHER seek controls OR track skip buttons, not both
 *    - If you set seekbackward/seekforward, skip buttons disappear
 *    - Only set 'seekto' for scrubbing (works alongside track buttons)
 *
 * 3. Required handlers for full lock screen controls:
 *    - 'play' / 'pause' - play/pause button
 *    - 'previoustrack' / 'nexttrack' - skip buttons (⏮ ⏭)
 *    - 'seekto' - scrubber/progress bar seeking
 *
 * 4. Update position state periodically:
 *    - Call setPositionState() on 'timeupdate' events
 *    - Enables progress bar on lock screen
 *
 * 5. Set metadata with artwork for lock screen display:
 *    - Include multiple artwork sizes (128, 256, 512)
 *    - iOS will pick appropriate size
 *
 * References:
 * - https://stackoverflow.com/questions/73993512/web-audio-player-ios-next-song-previous-song-buttons-are-not-in-control-cent/78001443#78001443
 * - https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
 * ============================================================================
 */
export function PlayerBar() {
  // Dual-deck audio system for true crossfade
  const deckARef = useRef<HTMLAudioElement>(null);
  const deckBRef = useRef<HTMLAudioElement>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');


  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);

  // Crossfade state for dual-deck system
  const crossfadeInProgressRef = useRef<boolean>(false);
  const crossfadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crossfadeCanPlayFiredRef = useRef<boolean>(false); // Prevent duplicate canplaythrough handling
  const crossfadeJustCompletedRef = useRef<boolean>(false); // Prevent reload after crossfade
  const nextSongPreloadedRef = useRef<boolean>(false);
  const targetVolumeRef = useRef<number>(1);
  const decksPrimedRef = useRef<boolean>(false); // Track if both decks have been user-activated for mobile

  // Helper to get active and inactive decks
  const getActiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  const getInactiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);

  const {
    playlist,
    currentSongIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffled,
    crossfadeDuration,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong,
    toggleShuffle,
    setAIUserActionInProgress,
  } = useAudioStore();

  const currentSong = useMemo(() => playlist[currentSongIndex] || null, [playlist, currentSongIndex]);
  const queryClient = useQueryClient();

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);

  // Determine if song is liked based on server state
  const isLiked = useMemo(() => {
    if (!currentSong?.id) return false;
    return feedbackData?.feedback?.[currentSong.id] === 'thumbs_up';
  }, [feedbackData?.feedback, currentSong?.id]);

  // Like/unlike mutation - simplified without complex optimistic updates
  const { mutate: likeMutate, isPending: isLikePending } = useMutation({
    mutationFn: async (liked: boolean) => {
      if (!currentSong) {
        throw new Error('No song selected');
      }

      setAIUserActionInProgress(true);

      const payload = {
        songId: currentSong.id,
        songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
        feedbackType: liked ? 'thumbs_up' : 'thumbs_down',
        source: 'library',
      };

      console.log('Sending feedback:', payload);

      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status !== 409) {
        const errorData = await response.json();
        console.error('Feedback API error:', response.status, errorData);
        throw new Error(errorData.message || 'Failed to update feedback');
      }

      return liked;
    },
    onSuccess: (liked) => {
      // Invalidate all feedback queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      toast.success(liked ? '❤️ Liked' : '💔 Unliked', { duration: 1500 });
    },
    onError: (error: Error) => {
      console.error('Like/unlike error:', error);
      toast.error('Failed', { description: error.message });
    },
    onSettled: () => {
      setTimeout(() => setAIUserActionInProgress(false), 1000);
    },
  });

  const handleToggleLike = useCallback(() => {
    if (!currentSong || isLikePending) return;
    likeMutate(!isLiked);
  }, [currentSong, isLikePending, isLiked, likeMutate]);

  // Load song on the active deck (normal playback)
  const loadSong = useCallback((song: typeof currentSong) => {
    const audio = getActiveDeck();
    if (audio && song) {
      // Clear any running crossfade interval
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      audio.src = song.url;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      currentSongIdRef.current = song.id;
      // Reset crossfade refs for new song
      crossfadeInProgressRef.current = false;
      crossfadeCanPlayFiredRef.current = false;
      nextSongPreloadedRef.current = false;
      console.log(`[XFADE] loadSong called on deck ${activeDeckRef.current}`);
    }
  }, [setCurrentTime, setDuration, getActiveDeck]);

  // Preload song on inactive deck for crossfade
  const preloadNextSong = useCallback((song: typeof currentSong) => {
    const inactiveDeck = getInactiveDeck();
    if (inactiveDeck && song) {
      console.log(`[XFADE] Preloading next song on inactive deck`);
      inactiveDeck.src = song.url;
      inactiveDeck.load();
      inactiveDeck.volume = 0;
      nextSongPreloadedRef.current = true;
    }
  }, [getInactiveDeck]);

  const togglePlayPause = useCallback(() => {
    const audio = getActiveDeck();
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        setIsLoading(true);

        // MOBILE FIX: Prime both decks on first user interaction
        // This gives both audio elements the "user activated" flag needed for crossfade
        if (!decksPrimedRef.current) {
          const inactiveDeck = getInactiveDeck();
          if (inactiveDeck) {
            console.log('[MOBILE] Priming both decks for crossfade support');
            // Create a silent audio context moment to "activate" the inactive deck
            // We play and immediately pause with volume 0
            const originalVolume = inactiveDeck.volume;
            inactiveDeck.volume = 0;
            // Use a data URL for a tiny silent audio to prime the element
            const originalSrc = inactiveDeck.src;
            // Silent MP3 (smallest valid MP3)
            inactiveDeck.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';
            inactiveDeck.play()
              .then(() => {
                inactiveDeck.pause();
                inactiveDeck.src = originalSrc || '';
                inactiveDeck.volume = originalVolume;
                decksPrimedRef.current = true;
                console.log('[MOBILE] Inactive deck primed successfully');
              })
              .catch((e) => {
                console.log('[MOBILE] Could not prime inactive deck:', e);
                inactiveDeck.src = originalSrc || '';
                inactiveDeck.volume = originalVolume;
              });
          }
        }

        audio.play().catch((e) => {
          setIsLoading(false);
          console.error('Play failed:', e);
        }).finally(() => setIsLoading(false));
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, setIsPlaying, getActiveDeck, getInactiveDeck]);

  const seek = useCallback((time: number) => {
    const audio = getActiveDeck();
    if (audio && !isNaN(time) && isFinite(time)) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, [setCurrentTime, getActiveDeck]);

  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    // Only set volume on active deck if not crossfading
    const activeDeck = getActiveDeck();
    if (activeDeck && !crossfadeInProgressRef.current) {
      activeDeck.volume = clampedVolume;
    }
    targetVolumeRef.current = clampedVolume;
  }, [setVolume, getActiveDeck]);

  // Start true crossfade between decks
  const startCrossfade = useCallback((nextSongData: typeof currentSong, xfadeDuration: number) => {
    if (crossfadeInProgressRef.current || !nextSongData) return;

    const activeDeck = getActiveDeck();
    const inactiveDeck = getInactiveDeck();
    if (!activeDeck || !inactiveDeck) return;

    // Clear any existing interval (safety check)
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }

    console.log(`[XFADE] Starting TRUE crossfade, duration=${xfadeDuration}s`);
    crossfadeInProgressRef.current = true;
    crossfadeCanPlayFiredRef.current = false; // Reset for this crossfade
    targetVolumeRef.current = activeDeck.volume > 0 ? activeDeck.volume : 1;

    // Preload and start the next song on inactive deck
    inactiveDeck.src = nextSongData.url;
    inactiveDeck.load();
    inactiveDeck.volume = 0;

    // Helper to abort crossfade and reset state
    const abortCrossfade = (reason: string) => {
      console.log(`[XFADE] Aborting crossfade: ${reason}`);
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      crossfadeInProgressRef.current = false;
      crossfadeCanPlayFiredRef.current = false;
      // Restore active deck volume
      activeDeck.volume = targetVolumeRef.current;
    };

    // Wait for inactive deck to be ready, then start crossfade
    const onCanPlayThrough = () => {
      // Guard: only fire once per crossfade
      if (crossfadeCanPlayFiredRef.current) {
        console.log(`[XFADE] canplaythrough already fired, ignoring duplicate`);
        return;
      }
      crossfadeCanPlayFiredRef.current = true;
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      console.log(`[XFADE] Inactive deck ready, starting playback and crossfade`);

      // Start playing the next song - CRITICAL: handle failure on mobile
      inactiveDeck.play()
        .then(() => {
          console.log(`[XFADE] Inactive deck play() succeeded`);
        })
        .catch((err) => {
          console.error(`[XFADE] Inactive deck play() FAILED:`, err);
          abortCrossfade('play() failed - likely autoplay blocked');
          return; // Don't start the crossfade interval
        });

      const fadeStartTime = Date.now();
      crossfadeIntervalRef.current = setInterval(() => {
        // Safety check: if inactive deck isn't actually playing, abort
        if (inactiveDeck.paused && crossfadeInProgressRef.current) {
          abortCrossfade('inactive deck not playing');
          return;
        }

        const elapsed = (Date.now() - fadeStartTime) / 1000;
        const fadeProgress = Math.min(elapsed / xfadeDuration, 1);

        // Equal power crossfade curves
        const fadeOutVolume = Math.cos(fadeProgress * Math.PI / 2) * targetVolumeRef.current;
        const fadeInVolume = Math.sin(fadeProgress * Math.PI / 2) * targetVolumeRef.current;

        activeDeck.volume = Math.max(0, fadeOutVolume);
        inactiveDeck.volume = Math.min(targetVolumeRef.current, fadeInVolume);

        // Debug log every second
        if (Math.floor(elapsed) !== Math.floor(elapsed - 0.05) && elapsed > 0.05) {
          console.log(`[XFADE] Progress: ${Math.round(fadeProgress * 100)}%, active=${fadeOutVolume.toFixed(2)}, incoming=${fadeInVolume.toFixed(2)}`);
        }

        if (fadeProgress >= 1) {
          // Crossfade complete
          if (crossfadeIntervalRef.current) {
            clearInterval(crossfadeIntervalRef.current);
            crossfadeIntervalRef.current = null;
          }

          // Stop the old deck
          activeDeck.pause();
          activeDeck.currentTime = 0;

          // Swap active deck
          activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
          inactiveDeck.volume = targetVolumeRef.current;

          console.log(`[XFADE] Crossfade complete, active deck is now ${activeDeckRef.current}`);

          // Mark crossfade as just completed - this prevents the useEffect from reloading the song
          crossfadeJustCompletedRef.current = true;

          // Update the currentSongId to match the new song BEFORE calling nextSong
          currentSongIdRef.current = nextSongData.id;

          // Update store state
          crossfadeInProgressRef.current = false;
          nextSongPreloadedRef.current = false;

          // Trigger nextSong in store to update the currentSongIndex
          nextSong();

          // Reset the "just completed" flag after a short delay
          setTimeout(() => {
            crossfadeJustCompletedRef.current = false;
          }, 100);
        }
      }, 50);
    };

    inactiveDeck.addEventListener('canplaythrough', onCanPlayThrough);

    // Timeout fallback in case canplaythrough doesn't fire
    setTimeout(() => {
      // Only fire if crossfade is in progress AND we haven't started the interval yet
      if (!crossfadeInProgressRef.current || crossfadeCanPlayFiredRef.current) return;
      if (inactiveDeck.readyState >= 3) {
        console.log(`[XFADE] Timeout fallback: forcing canplaythrough`);
        onCanPlayThrough();
      } else {
        // canplaythrough never fired and deck not ready - abort
        abortCrossfade('timeout - deck never became ready');
      }
    }, 2000);

    // Safety timeout: if crossfade is still in progress after xfadeDuration + 5s, something is wrong
    setTimeout(() => {
      if (crossfadeInProgressRef.current) {
        abortCrossfade('safety timeout exceeded');
      }
    }, (xfadeDuration + 5) * 1000);
  }, [getActiveDeck, getInactiveDeck, nextSong]);

  // Audio event listeners for BOTH decks (needed for crossfade to work properly)
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // Create handlers that check if the event came from the active deck
    const createUpdateTime = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      // Only process timeupdate from active deck
      if (activeDeckRef.current !== deckName) return;

      setCurrentTime(deck.currentTime);
      if (deck.duration > 0 && currentSong) {
        const playedPercentage = (deck.currentTime / deck.duration) * 100;
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
        }

        // CROSSFADE: Check if we should start crossfade
        const timeRemaining = deck.duration - deck.currentTime;
        const state = useAudioStore.getState();
        const xfadeDuration = state.crossfadeDuration;

        // Debug log when near end
        if (timeRemaining <= 15 && timeRemaining > 0 && Math.floor(timeRemaining) % 3 === 0) {
          console.log(`[XFADE] Deck ${deckName}: remaining=${Math.round(timeRemaining)}s, xfadeDuration=${xfadeDuration}, crossfading=${crossfadeInProgressRef.current}`);
        }

        // Start crossfade when approaching end
        if (xfadeDuration > 0 && timeRemaining <= xfadeDuration && timeRemaining > 0.5 && !crossfadeInProgressRef.current) {
          // Get next song from playlist
          const nextIndex = (currentSongIndex + 1) % playlist.length;
          const nextSongData = playlist[nextIndex];

          if (nextSongData && playlist.length > 1) {
            startCrossfade(nextSongData, xfadeDuration);
          }
        }
      }
    };

    const createUpdateDuration = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setDuration(deck.duration);
    };

    const createOnCanPlay = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(false);
    };

    const createOnWaiting = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(true);
    };

    const createOnEnded = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      // Only process ended from active deck
      if (activeDeckRef.current !== deckName) return;

      // If crossfade already handled the transition, don't do anything
      if (crossfadeInProgressRef.current) {
        console.log(`[XFADE] onEnded fired on deck ${deckName} but crossfade in progress, skipping`);
        return;
      }

      if (currentSongIdRef.current && !hasScrobbledRef.current && currentSong) {
        hasScrobbledRef.current = true;
        // Scrobble to Navidrome
        scrobbleSong(currentSongIdRef.current, true)
          .then(() => {
            // Invalidate most-played and top-artists queries since play counts changed
            queryClient.invalidateQueries({ queryKey: ['most-played-songs'] });
            queryClient.invalidateQueries({ queryKey: ['top-artists'] });
          })
          .catch(console.error);

        // Record in listening history for compound scoring (Phase 4)
        fetch('/api/listening-history/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: currentSongIdRef.current,
            artist: currentSong.artist || 'Unknown',
            title: currentSong.name || currentSong.title || 'Unknown',
            album: currentSong.album,
            genre: currentSong.genre,
            duration: deck.duration,
            playDuration: deck.currentTime,
          }),
        })
          .then(res => {
            if (!res.ok) {
              return res.json().then(data => {
                console.warn('Listening history API error:', data);
              });
            }
            console.log('📊 Recorded listening history');
          })
          .catch(err => console.warn('Failed to record listening history:', err));
      }

      // MOBILE FIX: Load and play next song directly on the audio element
      // This maintains the "playback chain" that mobile browsers require
      // If we go through React state updates, the browser loses the user gesture context
      const nextIndex = (currentSongIndex + 1) % playlist.length;
      const nextSongData = playlist[nextIndex];

      if (nextSongData && playlist.length > 0) {
        console.log(`[MOBILE] Direct transition to next song: ${nextSongData.name || nextSongData.title}`);

        // Reset scrobble tracking for new song
        hasScrobbledRef.current = false;
        scrobbleThresholdReachedRef.current = false;
        currentSongIdRef.current = nextSongData.id;

        // Directly set src and play - don't call load() as it breaks the playback chain
        deck.src = nextSongData.url;
        deck.play().catch(err => {
          console.error('[MOBILE] Direct play failed:', err);
        });

        // Update store state (this won't trigger reload due to currentSongIdRef check)
        nextSong();
      } else {
        // Fallback: just call nextSong if no next song data
        nextSong();
      }
    };

    // Create handlers for each deck
    const updateTimeA = createUpdateTime(deckA, 'A');
    const updateTimeB = createUpdateTime(deckB, 'B');
    const updateDurationA = createUpdateDuration(deckA, 'A');
    const updateDurationB = createUpdateDuration(deckB, 'B');
    const onCanPlayA = createOnCanPlay('A');
    const onCanPlayB = createOnCanPlay('B');
    const onWaitingA = createOnWaiting('A');
    const onWaitingB = createOnWaiting('B');
    const onEndedA = createOnEnded(deckA, 'A');
    const onEndedB = createOnEnded(deckB, 'B');

    // Register listeners on both decks
    deckA.addEventListener('timeupdate', updateTimeA);
    deckA.addEventListener('loadedmetadata', updateDurationA);
    deckA.addEventListener('canplay', onCanPlayA);
    deckA.addEventListener('waiting', onWaitingA);
    deckA.addEventListener('ended', onEndedA);

    deckB.addEventListener('timeupdate', updateTimeB);
    deckB.addEventListener('loadedmetadata', updateDurationB);
    deckB.addEventListener('canplay', onCanPlayB);
    deckB.addEventListener('waiting', onWaitingB);
    deckB.addEventListener('ended', onEndedB);

    // Set initial volume on active deck if not crossfading
    const activeDeck = getActiveDeck();
    if (activeDeck && !crossfadeInProgressRef.current) {
      activeDeck.volume = volume;
    }

    return () => {
      deckA.removeEventListener('timeupdate', updateTimeA);
      deckA.removeEventListener('loadedmetadata', updateDurationA);
      deckA.removeEventListener('canplay', onCanPlayA);
      deckA.removeEventListener('waiting', onWaitingA);
      deckA.removeEventListener('ended', onEndedA);

      deckB.removeEventListener('timeupdate', updateTimeB);
      deckB.removeEventListener('loadedmetadata', updateDurationB);
      deckB.removeEventListener('canplay', onCanPlayB);
      deckB.removeEventListener('waiting', onWaitingB);
      deckB.removeEventListener('ended', onEndedB);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong, queryClient, startCrossfade, getActiveDeck, playlist]);

  // Track the canplay handler so we can manage it properly
  const canPlayHandlerRef = useRef<(() => void) | null>(null);
  const errorHandlerRef = useRef<((e: Event) => void) | null>(null);

  // Load song when it changes
  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const song = playlist[currentSongIndex];
      const audio = getActiveDeck();

      // Skip if crossfade just completed - the song is already loaded and playing on the new active deck
      if (crossfadeJustCompletedRef.current) {
        console.log(`[XFADE] Skipping loadSong - crossfade just completed, song already playing`);
        return;
      }

      // Skip if song ID already matches (e.g., direct transition in onEnded for mobile)
      if (audio && song && currentSongIdRef.current === song.id) {
        console.log(`[MOBILE] Skipping loadSong - already loaded via direct transition`);
        return;
      }

      if (audio && song && currentSongIdRef.current !== song.id) {
        // Capture isPlaying at this moment - store sets isPlaying: true when playNow is called
        const shouldAutoPlay = isPlaying;

        // Remove old handlers if any
        if (canPlayHandlerRef.current) {
          audio.removeEventListener('canplay', canPlayHandlerRef.current);
        }
        if (errorHandlerRef.current) {
          audio.removeEventListener('error', errorHandlerRef.current);
        }

        const handleCanPlay = () => {
          setIsLoading(false);
          if (shouldAutoPlay) {
            audio.play().catch(console.error);
          }
        };

        const handleError = (e: Event) => {
          console.error('Audio load error:', (e.target as HTMLAudioElement)?.error);
          setIsLoading(false);
        };

        canPlayHandlerRef.current = handleCanPlay;
        errorHandlerRef.current = handleError;

        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('error', handleError);
        setIsLoading(true);
        loadSong(song);

        return () => {
          // Only scrobble on cleanup, don't remove listeners here
          // (they'll be removed when a new song loads or component unmounts)
          if (scrobbleThresholdReachedRef.current && !hasScrobbledRef.current && currentSongIdRef.current) {
            hasScrobbledRef.current = true;
            scrobbleSong(currentSongIdRef.current, true).catch(console.error);
          }
        };
      }
    }
  }, [currentSongIndex, playlist, isPlaying, loadSong, getActiveDeck]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      // Clean up both decks
      [deckARef.current, deckBRef.current].forEach(audio => {
        if (audio) {
          if (canPlayHandlerRef.current) {
            audio.removeEventListener('canplay', canPlayHandlerRef.current);
          }
          if (errorHandlerRef.current) {
            audio.removeEventListener('error', errorHandlerRef.current);
          }
        }
      });
      // Clear crossfade interval if running
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
      }
    };
  }, []);

  // Handle play/pause state changes (for toggling on existing loaded song)
  useEffect(() => {
    const audio = getActiveDeck();
    if (!audio || !audio.src) return;

    // Only handle pause immediately; play is handled by canplay listener or when ready
    if (!isPlaying) {
      audio.pause();
    } else if (audio.readyState >= 2) {
      // Only try to play if audio is ready (has enough data)
      audio.play().catch(console.error);
    }
    // If isPlaying is true but readyState < 2, the canplay handler will start playback
  }, [isPlaying, getActiveDeck]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 5));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          changeVolume(volume > 0 ? 0 : 0.5);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          handleToggleLike();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          toggleShuffle();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, seek, changeVolume, handleToggleLike, currentTime, duration, volume, toggleShuffle]);

  // Media Session API for iOS lock screen / notification controls
  // iOS requires handlers to be set during 'playing' event, not on mount
  // IMPORTANT: Register on BOTH decks for crossfade to work with iOS background playback
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB || !currentSong) return;

    const setupMediaSession = () => {
      // Build artwork array for lock screen display
      const artwork: MediaImage[] = [];
      if (currentSong.albumId) {
        const coverUrl = `/api/navidrome/rest/getCoverArt?id=${currentSong.albumId}&size=512`;
        artwork.push(
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
          { src: coverUrl.replace('size=512', 'size=256'), sizes: '256x256', type: 'image/jpeg' },
        );
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.name || currentSong.title || 'Unknown Song',
        artist: currentSong.artist || 'Unknown Artist',
        album: currentSong.album || '',
        artwork: artwork.length > 0 ? artwork : undefined,
      });

      // Update position state from active deck
      const activeDeck = getActiveDeck();
      if (activeDeck && activeDeck.duration && isFinite(activeDeck.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: activeDeck.duration,
            playbackRate: activeDeck.playbackRate,
            position: activeDeck.currentTime,
          });
        } catch {
          // Position state not supported
        }
      }
    };

    // iOS FIX: Set action handlers inside 'playing' event
    // Key: Do NOT set seekbackward/seekforward - iOS shows seek OR track buttons, not both
    const handlePlaying = () => {
      console.log('🎛️ PlayerBar: Audio playing - setting up Media Session');
      setupMediaSession();
      navigator.mediaSession.playbackState = 'playing';

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('🎛️ Media Session: play');
          const activeDeck = getActiveDeck();
          if (activeDeck) activeDeck.play();
          setIsPlaying(true);
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause');
          const activeDeck = getActiveDeck();
          if (activeDeck) activeDeck.pause();
          setIsPlaying(false);
        });

        // previoustrack and nexttrack - shows as skip buttons on iOS
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🎛️ Media Session: previoustrack');
          previousSong();
          // Need to trigger play after state update
          setTimeout(() => {
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.play().catch(console.error);
          }, 100);
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🎛️ Media Session: nexttrack');
          nextSong();
          // Need to trigger play after state update
          setTimeout(() => {
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.play().catch(console.error);
          }, 100);
        });

        // seekto works alongside track buttons
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && isFinite(details.seekTime)) {
            console.log('🎛️ Media Session: seekto', details.seekTime);
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.currentTime = details.seekTime;
          }
        });

        console.log('🎛️ Media Session handlers registered');
      } catch (e) {
        console.error('🎛️ Failed to set media session handlers:', e);
      }
    };

    const handlePause = () => {
      navigator.mediaSession.playbackState = 'paused';
    };

    const handleTimeUpdate = () => {
      const activeDeck = getActiveDeck();
      if (activeDeck && activeDeck.duration && isFinite(activeDeck.duration) && isFinite(activeDeck.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: activeDeck.duration,
            playbackRate: activeDeck.playbackRate,
            position: activeDeck.currentTime,
          });
        } catch {
          // Ignore
        }
      }
    };

    // Register handlers on BOTH decks for iOS background playback during crossfade
    [deckA, deckB].forEach(deck => {
      deck.addEventListener('playing', handlePlaying);
      deck.addEventListener('pause', handlePause);
      deck.addEventListener('loadedmetadata', setupMediaSession);
      deck.addEventListener('timeupdate', handleTimeUpdate);
    });

    // Initial setup if active deck is already playing
    const activeDeck = getActiveDeck();
    if (activeDeck && !activeDeck.paused) {
      handlePlaying();
    } else {
      setupMediaSession();
    }

    return () => {
      [deckA, deckB].forEach(deck => {
        deck.removeEventListener('playing', handlePlaying);
        deck.removeEventListener('pause', handlePause);
        deck.removeEventListener('loadedmetadata', setupMediaSession);
        deck.removeEventListener('timeupdate', handleTimeUpdate);
      });

      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [currentSong, setIsPlaying, previousSong, nextSong, getActiveDeck]);

  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mobile Layout */}
      <div className="md:hidden px-3 py-2 space-y-2">
        {/* Progress bar at top */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[isFinite(currentTime) ? currentTime : 0]}
            max={isFinite(duration) && duration > 0 ? duration : 100}
            step={0.1}
            onValueChange={([newValue]) => seek(newValue)}
            className="flex-1 h-1"
          />
          <span className="text-[10px] font-mono text-muted-foreground w-8">
            -{formatTime(Math.max(0, duration - currentTime))}
          </span>
        </div>

        {/* Main row: Album art, song info, controls */}
        <div className="flex items-center gap-3">
          {/* Small Album Artwork */}
          <AlbumArt
            albumId={currentSong.albumId}
            songId={currentSong.id}
            artist={currentSong.artist}
            size="sm"
            isPlaying={isPlaying}
          />

          {/* Song Info */}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{currentSong.name || currentSong.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist || 'Unknown'}</p>
          </div>

          {/* Compact Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleToggleLike}
              disabled={isLikePending}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current text-red-500")} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={previousSong}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={nextSong}
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowLyrics(true)}
              title="Show lyrics"
            >
              <MicVocal className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowVisualizer(true)}
              title="Show visualizer"
            >
              <AudioWaveform className="h-4 w-4" />
            </Button>

            <AIDJToggle compact />
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-20 px-4 items-center gap-4 relative">
        {/* Progress bar - thin line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Left: Song Info */}
        <div className="flex items-center gap-3 w-72 min-w-0">
          {/* Mini Album Art */}
          <AlbumArt
            albumId={currentSong.albumId}
            songId={currentSong.id}
            artist={currentSong.artist}
            size="md"
            isPlaying={isPlaying}
            className="rounded-md"
          />
          <div className="min-w-0">
            <p className="font-medium truncate text-sm">{currentSong.name || currentSong.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist || 'Unknown'}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={handleToggleLike}
            disabled={isLikePending}
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current text-red-500")} />
          </Button>
        </div>

        {/* Center: Controls + Progress */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto gap-1">
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 p-0",
                isShuffled && "text-primary"
              )}
              onClick={toggleShuffle}
            >
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={previousSong}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={nextSong}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
            >
              <Repeat className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground w-10 text-right font-mono">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[isFinite(currentTime) ? currentTime : 0]}
              max={isFinite(duration) && duration > 0 ? duration : 100}
              step={0.1}
              onValueChange={([newValue]) => seek(newValue)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10 font-mono">
              -{formatTime(Math.max(0, duration - currentTime))}
            </span>
          </div>
        </div>

        {/* Right: Volume + Queue + AI DJ */}
        <div className="flex items-center gap-2 w-72 justify-end">
          <AIDJToggle compact />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowLyrics(true)}
            title="Show lyrics"
          >
            <MicVocal className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowVisualizer(true)}
            title="Show visualizer"
          >
            <AudioWaveform className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}
            >
              {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([newValue]) => changeVolume(newValue / 100)}
              className="w-24"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dual-Deck Audio Elements for crossfade */}
      <audio ref={deckARef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      <audio ref={deckBRef} preload="metadata" crossOrigin="anonymous" className="hidden" />

      {/* Lyrics Modal */}
      <LyricsModal isOpen={showLyrics} onClose={() => setShowLyrics(false)} />

      {/* Visualizer Modal */}
      <VisualizerModal
        isOpen={showVisualizer}
        onClose={() => setShowVisualizer(false)}
        audioElement={getActiveDeck()}
      />
    </>
  );
}
