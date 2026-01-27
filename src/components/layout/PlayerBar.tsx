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
  const isPrimingRef = useRef<boolean>(false); // Track if we're actively priming (to allow inactive deck play)

  // Media Session debounce state (refs to survive remounts during Bluetooth changes)
  const mediaSessionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaSessionPendingActionRef = useRef<'play' | 'pause' | null>(null);
  const mediaSessionLastExecutedRef = useRef<{ action: 'play' | 'pause'; time: number } | null>(null);

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
            // Set flag to allow handlePlaying to ignore this deck during priming
            isPrimingRef.current = true;
            inactiveDeck.play()
              .then(() => {
                inactiveDeck.pause();
                inactiveDeck.src = originalSrc || '';
                inactiveDeck.volume = originalVolume;
                decksPrimedRef.current = true;
                isPrimingRef.current = false;
                console.log('[MOBILE] Inactive deck primed successfully');
              })
              .catch((e) => {
                console.log('[MOBILE] Could not prime inactive deck:', e);
                inactiveDeck.src = originalSrc || '';
                inactiveDeck.volume = originalVolume;
                isPrimingRef.current = false;
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

    console.log(`🔀 [XFADE] Starting TRUE crossfade, duration=${xfadeDuration}s, from deck ${activeDeckRef.current}`);
    crossfadeInProgressRef.current = true;
    crossfadeCanPlayFiredRef.current = false; // Reset for this crossfade
    targetVolumeRef.current = activeDeck.volume > 0 ? activeDeck.volume : 1;

    // Preload and start the next song on inactive deck
    inactiveDeck.src = nextSongData.url;
    inactiveDeck.load();
    inactiveDeck.volume = 0;

    // Helper to abort crossfade and reset state
    const abortCrossfade = (reason: string) => {
      console.warn(`⚠️ [XFADE] Aborting crossfade: ${reason}`);
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      crossfadeInProgressRef.current = false;
      crossfadeCanPlayFiredRef.current = false;

      // Restore active deck volume
      activeDeck.volume = targetVolumeRef.current;

      // Reset inactive deck to clean state
      inactiveDeck.pause();
      inactiveDeck.currentTime = 0;
      inactiveDeck.volume = 0;
      // Clear source to prevent accidental playback (use silent audio to avoid error events)
      inactiveDeck.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';

      console.log(`⚠️ [XFADE] Abort cleanup complete - active deck remains ${activeDeckRef.current}`);

      // CRITICAL: Check if the active deck's song has already ended
      // If so, onEnded was skipped because crossfade was in progress, so we need to
      // trigger the fallback transition here
      const songHasEnded = activeDeck.duration > 0 &&
        (activeDeck.currentTime >= activeDeck.duration - 0.5 || activeDeck.ended);

      if (songHasEnded && nextSongData) {
        console.log(`⚠️ [XFADE] Active deck song has ended - triggering fallback transition to: ${nextSongData.name || nextSongData.title}`);

        // Reset scrobble tracking for new song
        hasScrobbledRef.current = false;
        scrobbleThresholdReachedRef.current = false;
        currentSongIdRef.current = nextSongData.id;

        // Load and play next song directly on active deck (same as onEnded does)
        activeDeck.src = nextSongData.url;
        activeDeck.play().catch(err => {
          console.error('⚠️ [XFADE] Fallback transition play failed:', err);
        });

        // Update store state
        nextSong();
      }
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
      // Only start the crossfade interval AFTER play() succeeds
      inactiveDeck.play()
        .then(() => {
          console.log(`[XFADE] Inactive deck play() succeeded, starting crossfade interval`);

          const fadeStartTime = Date.now();
          crossfadeIntervalRef.current = setInterval(() => {
            // Check if user paused - abort crossfade and pause both decks
            const storeState = useAudioStore.getState();
            if (!storeState.isPlaying && crossfadeInProgressRef.current) {
              console.log('[XFADE] User paused during crossfade - aborting');
              activeDeck.pause();
              inactiveDeck.pause();
              abortCrossfade('user paused');
              return;
            }

            // Safety check: if inactive deck stopped playing mid-crossfade, abort
            if (inactiveDeck.paused && crossfadeInProgressRef.current) {
              abortCrossfade('inactive deck stopped playing');
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

              // Stop the old deck completely - pause, reset, and clear source
              // This prevents the old deck from accidentally playing when phone unlocks
              activeDeck.pause();
              activeDeck.currentTime = 0;
              const oldDeckRef = activeDeck; // Keep reference before swap

              // Swap active deck
              activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
              inactiveDeck.volume = targetVolumeRef.current;

              console.log(`[XFADE] Crossfade complete, active deck is now ${activeDeckRef.current}`);

              // Clear the old deck's source IMMEDIATELY to prevent accidental playback
              // iOS can suspend the page at any time, so we can't rely on setTimeout
              // Use silent audio data URL instead of empty string to avoid error events
              oldDeckRef.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';
              oldDeckRef.pause();
              console.log(`[XFADE] Cleared old deck source to prevent accidental playback`);

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
        })
        .catch((err) => {
          console.error(`❌ [XFADE] Inactive deck play() FAILED: ${err.name} - ${err.message}`);
          abortCrossfade('play() failed - likely autoplay blocked');
        });
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
    }, 5000);  // 5 seconds for iOS - needs time for multiple range requests

    // Safety timeout: if crossfade is still in progress after xfadeDuration + 5s, something is wrong
    // BUT: iOS throttles intervals when screen is locked, so the fade may have essentially completed
    // Check if incoming deck is playing successfully before aborting
    setTimeout(() => {
      if (!crossfadeInProgressRef.current) return; // Already completed

      // Check if incoming deck (inactiveDeck at start) is playing and has progressed
      // This means the crossfade essentially succeeded but interval got throttled
      if (!inactiveDeck.paused && inactiveDeck.currentTime > 1) {
        console.log(`[XFADE] Safety timeout: incoming deck playing at ${inactiveDeck.currentTime.toFixed(1)}s - completing crossfade`);

        // Clear the interval if still running
        if (crossfadeIntervalRef.current) {
          clearInterval(crossfadeIntervalRef.current);
          crossfadeIntervalRef.current = null;
        }

        // Complete the crossfade properly
        activeDeck.pause();
        activeDeck.currentTime = 0;
        const oldDeckRef = activeDeck;

        // Swap active deck
        activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
        inactiveDeck.volume = targetVolumeRef.current;

        console.log(`[XFADE] Crossfade force-completed, active deck is now ${activeDeckRef.current}`);

        // Clear old deck source IMMEDIATELY - can't rely on setTimeout with iOS
        oldDeckRef.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';
        oldDeckRef.pause();
        console.log(`[XFADE] Cleared old deck source`);

        // Mark as completed
        crossfadeJustCompletedRef.current = true;
        currentSongIdRef.current = nextSongData.id;
        crossfadeInProgressRef.current = false;
        nextSongPreloadedRef.current = false;

        nextSong();

        setTimeout(() => {
          crossfadeJustCompletedRef.current = false;
        }, 100);
      } else {
        // Incoming deck not playing - genuine failure, abort
        console.warn(`⚠️ [XFADE] Safety timeout: incoming deck not playing (paused=${inactiveDeck.paused}, time=${inactiveDeck.currentTime}) - aborting`);
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

      // CRITICAL: Ignore ENDED events for very short audio (e.g., silent data URL)
      // iOS may auto-resume the silent audio on visibility change, causing it to immediately end
      // The silent data URL has duration ~0.1s, real songs are much longer
      if (deck.duration && deck.duration < 5) {
        console.log(`[MOBILE] Ignoring ended event for short audio (duration=${deck.duration.toFixed(2)}s) - likely silent data URL`);
        // Also pause and reset this deck to prevent further issues
        deck.pause();
        deck.currentTime = 0;
        return;
      }

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

      // Skip if crossfade is in progress - the crossfade handles song loading
      if (crossfadeInProgressRef.current) {
        console.log(`[XFADE] Skipping loadSong - crossfade in progress`);
        return;
      }

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
          // Only handle errors from the active deck - ignore errors from inactive deck
          // (e.g., when we clear the old deck's source after crossfade)
          const errorDeck = e.target as HTMLAudioElement;
          const activeDeck = getActiveDeck();
          if (errorDeck !== activeDeck) {
            console.log('[XFADE] Ignoring error from inactive deck');
            return;
          }
          console.error('Audio load error:', errorDeck?.error);
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
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // Helper to check if a deck has a real song (not silent data URL)
    const hasRealSong = (deck: HTMLAudioElement) =>
      deck.src && deck.src.indexOf('data:audio') === -1;

    // CRITICAL: Check if activeDeckRef is pointing to the wrong deck
    // This can happen after component remount when activeDeckRef resets to 'A'
    // but Deck B was actually playing
    //
    // Use currentTime > 0 as the PRIMARY signal - if a deck has progressed, it WAS playing
    // Don't rely on !paused because iOS may briefly pause audio during visibility changes
    const deckAWasPlaying = deckA.currentTime > 0 && hasRealSong(deckA);
    const deckBWasPlaying = deckB.currentTime > 0 && hasRealSong(deckB);

    // Correct activeDeckRef based on which deck has actually been playing
    // A deck that has progressed (currentTime > 0) is clearly the active one
    if (deckBWasPlaying && !deckAWasPlaying && activeDeckRef.current === 'A') {
      console.log('🎮 [STORE] Correcting activeDeckRef: Deck B has progress but ref says A');
      activeDeckRef.current = 'B';
    } else if (deckAWasPlaying && !deckBWasPlaying && activeDeckRef.current === 'B') {
      console.log('🎮 [STORE] Correcting activeDeckRef: Deck A has progress but ref says B');
      activeDeckRef.current = 'A';
    }

    const audio = activeDeckRef.current === 'A' ? deckA : deckB;
    if (!audio.src) return;

    // Debug log store state changes
    if (localStorage.getItem('debug') === 'true') {
      console.log(`🎮 [STORE] isPlaying=${isPlaying} | audio.paused=${audio.paused} readyState=${audio.readyState} time=${audio.currentTime.toFixed(1)} deck=${activeDeckRef.current}`);
    }

    // Only handle pause immediately; play is handled by canplay listener or when ready
    if (!isPlaying) {
      // DEFENSIVE: Don't pause audio that's actually playing - store might be stale
      // (e.g., after component remount, HMR, or visibility change)
      if (!audio.paused) {
        console.log('🎮 [STORE] Store says pause but audio is playing - syncing store to match reality');
        setIsPlaying(true);
        return;
      }
      audio.pause();
    } else if (audio.readyState >= 2) {
      // Only try to play if audio is ready (has enough data)
      audio.play().catch((err) => {
        if (localStorage.getItem('debug') === 'true') {
          console.error(`❌ [PLAY] Failed: ${err.name} - ${err.message}`);
        }
      });
    }
    // If isPlaying is true but readyState < 2, the canplay handler will start playback
  }, [isPlaying, setIsPlaying]);

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

    // Debounce mechanism for Bluetooth disconnect/reconnect rapid events
    // iOS sends rapid play/pause toggling when Bluetooth state changes
    // State is stored in refs to survive component remounts during Bluetooth changes
    const DEBOUNCE_MS = 300;
    const COOLDOWN_MS = 500; // Minimum time between executing opposite actions

    const executeMediaAction = (action: 'play' | 'pause') => {
      const activeDeck = getActiveDeck();
      if (!activeDeck) return;

      // Cooldown check: prevent rapid toggling (play->pause->play etc.)
      const lastExec = mediaSessionLastExecutedRef.current;
      if (lastExec && lastExec.action !== action) {
        const timeSinceLastExec = Date.now() - lastExec.time;
        if (timeSinceLastExec < COOLDOWN_MS) {
          console.log(`🎛️ Media Session: cooldown active (${timeSinceLastExec}ms since ${lastExec.action}) - checking audio state`);
          // Instead of ignoring, check what the audio is actually doing
          const audioIsPlaying = !activeDeck.paused;
          if ((action === 'play' && audioIsPlaying) || (action === 'pause' && !audioIsPlaying)) {
            console.log(`🎛️ Media Session: audio already ${audioIsPlaying ? 'playing' : 'paused'} - syncing store only`);
            setIsPlaying(audioIsPlaying);
            mediaSessionLastExecutedRef.current = { action, time: Date.now() };
            return;
          }
        }
      }

      // Reality check: only block spurious pause events during rapid toggling (Bluetooth glitch)
      // If enough time has passed since last event, trust it as a user-initiated action
      const GLITCH_WINDOW_MS = 2000; // Only suspect Bluetooth glitch within 2 seconds of last action
      const storeIsPlaying = useAudioStore.getState().isPlaying;
      const audioIsPlaying = !activeDeck.paused;
      const lastExecTime = mediaSessionLastExecutedRef.current?.time || 0;
      const timeSinceLastAction = Date.now() - lastExecTime;

      if (action === 'pause' && audioIsPlaying && storeIsPlaying) {
        // Only block if we're in rapid-event territory (potential Bluetooth glitch)
        if (timeSinceLastAction < GLITCH_WINDOW_MS && lastExecTime > 0) {
          console.log(`🎛️ Media Session: ignoring pause - within glitch window (${timeSinceLastAction}ms since last action)`);
          return;
        }
        // Otherwise, it's been a while - trust it as a user-initiated pause
        console.log(`🎛️ Media Session: accepting pause - ${timeSinceLastAction}ms since last action (user-initiated)`);
      }

      if (action === 'play') {
        console.log('🎛️ Media Session: executing play');
        activeDeck.play().catch(err => {
          console.error('🎛️ Media Session play failed:', err);
        });
        setIsPlaying(true);
      } else {
        console.log('🎛️ Media Session: executing pause');
        activeDeck.pause();
        setIsPlaying(false);
      }

      mediaSessionLastExecutedRef.current = { action, time: Date.now() };
    };

    const debouncedMediaAction = (action: 'play' | 'pause') => {
      // If same action is pending, ignore duplicate
      if (mediaSessionPendingActionRef.current === action) {
        console.log(`🎛️ Media Session: ignoring duplicate ${action}`);
        return;
      }

      mediaSessionPendingActionRef.current = action;

      // Clear any existing timeout
      if (mediaSessionDebounceRef.current) {
        clearTimeout(mediaSessionDebounceRef.current);
      }

      // Wait for rapid events to settle before executing
      mediaSessionDebounceRef.current = setTimeout(() => {
        if (mediaSessionPendingActionRef.current) {
          executeMediaAction(mediaSessionPendingActionRef.current);
          mediaSessionPendingActionRef.current = null;
        }
        mediaSessionDebounceRef.current = null;
      }, DEBOUNCE_MS);
    };

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
    const handlePlaying = (event?: Event) => {
      // Get the deck that fired the event, or fall back to active deck for direct calls
      const playingDeck = event?.target as HTMLAudioElement | undefined ?? getActiveDeck();
      if (!playingDeck) return;

      const isActiveDeck = playingDeck === (activeDeckRef.current === 'A' ? deckA : deckB);

      // IMPORTANT: Only set up Media Session for the ACTIVE deck
      // iOS may auto-resume the inactive deck (with silent data URL) on visibility change
      // BUT: During crossfade or priming, we WANT the inactive deck to play
      if (!isActiveDeck && !crossfadeInProgressRef.current && !isPrimingRef.current) {
        console.log(`🎛️ PlayerBar: Ignoring playing event from inactive deck - stopping it`);
        playingDeck.pause();
        playingDeck.currentTime = 0;
        return;
      }

      // During priming, don't set up Media Session for the inactive deck (let priming handle it)
      if (!isActiveDeck && isPrimingRef.current) {
        console.log(`🎛️ PlayerBar: Inactive deck playing during priming - allowing it`);
        return;
      }

      // During crossfade, don't set up Media Session for the inactive deck (let crossfade handle it)
      if (!isActiveDeck && crossfadeInProgressRef.current) {
        console.log(`🎛️ PlayerBar: Inactive deck playing during crossfade - allowing it`);
        return;
      }

      console.log('🎛️ PlayerBar: Audio playing - setting up Media Session');
      setupMediaSession();
      navigator.mediaSession.playbackState = 'playing';

      // CRITICAL: Sync store state when audio starts playing
      // This prevents the isPlaying sync useEffect from incorrectly pausing audio
      // that started playing via crossfade or other non-store-triggered means
      if (!useAudioStore.getState().isPlaying) {
        console.log('🎛️ PlayerBar: Syncing store isPlaying=true (audio started externally)');
        setIsPlaying(true);
      }

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('🎛️ Media Session: play requested');
          debouncedMediaAction('play');
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause requested');
          debouncedMediaAction('pause');
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
      // Clear debounce timeout (use ref so it persists across remounts)
      if (mediaSessionDebounceRef.current) {
        clearTimeout(mediaSessionDebounceRef.current);
        mediaSessionDebounceRef.current = null;
      }
      mediaSessionPendingActionRef.current = null;

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

  // ==========================================================================
  // VISIBILITY CHANGE RECOVERY - Sync store state with actual audio state
  // Helps recover from Bluetooth disconnect/reconnect and iOS background scenarios
  // Also fixes activeDeckRef if component remounted and lost track of which deck is playing
  // ==========================================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const deckA = deckARef.current;
      const deckB = deckBRef.current;
      if (!deckA || !deckB) return;

      // Helper to check if a deck has a real song (not silent data URL)
      const hasRealSong = (deck: HTMLAudioElement) =>
        deck.src && deck.src.indexOf('data:audio') === -1;

      // Small delay to let iOS settle after visibility change
      setTimeout(() => {
        // CRITICAL: Use currentTime > 0 as the PRIMARY signal for which deck was playing
        // Don't rely on !paused because iOS may briefly pause audio during visibility changes
        const deckAHasProgress = deckA.currentTime > 0 && hasRealSong(deckA);
        const deckBHasProgress = deckB.currentTime > 0 && hasRealSong(deckB);

        // Fix activeDeckRef based on which deck has actual playback progress
        if (deckBHasProgress && !deckAHasProgress && activeDeckRef.current === 'A') {
          console.log('👁️ [VISIBILITY] Correcting activeDeckRef: Deck B has progress but ref says A');
          activeDeckRef.current = 'B';
        } else if (deckAHasProgress && !deckBHasProgress && activeDeckRef.current === 'B') {
          console.log('👁️ [VISIBILITY] Correcting activeDeckRef: Deck A has progress but ref says B');
          activeDeckRef.current = 'A';
        }

        const activeDeck = activeDeckRef.current === 'A' ? deckA : deckB;
        const storeIsPlaying = useAudioStore.getState().isPlaying;
        const audioIsActuallyPlaying = !activeDeck.paused;
        const audioHadProgress = activeDeck.currentTime > 0 && hasRealSong(activeDeck);

        console.log(`👁️ [VISIBILITY] State check: store=${storeIsPlaying}, audio=${audioIsActuallyPlaying ? 'playing' : 'paused'}, progress=${activeDeck.currentTime.toFixed(1)}s, deck=${activeDeckRef.current}`);

        // KEY INSIGHT: If audio has progress (currentTime > 0), it WAS playing
        // iOS may have briefly paused it during visibility change
        // In this case, we should try to RESUME, not sync to paused
        if (audioHadProgress && !audioIsActuallyPlaying) {
          console.log('👁️ [VISIBILITY] Audio has progress but is paused - attempting resume');
          activeDeck.play()
            .then(() => {
              console.log('👁️ [VISIBILITY] Resume successful');
              setIsPlaying(true);
            })
            .catch((err) => {
              console.log('👁️ [VISIBILITY] Resume failed:', err.message);
              // If resume fails, sync store to paused
              setIsPlaying(false);
            });
          return;
        }

        // If there's a mismatch, sync store to match audio reality
        if (storeIsPlaying !== audioIsActuallyPlaying) {
          console.log(`👁️ [VISIBILITY] State mismatch - syncing store to ${audioIsActuallyPlaying ? 'playing' : 'paused'}`);

          if (audioIsActuallyPlaying) {
            setIsPlaying(true);
          } else if (activeDeck.readyState >= 2 && hasRealSong(activeDeck)) {
            // Only sync to paused if audio is ready and has valid source
            // (don't sync empty/cleared decks to paused state)
            setIsPlaying(false);
          }
        }
      }, 200);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [setIsPlaying]);

  // ==========================================================================
  // DEBUG LOGGING for iOS audio issues
  // Only active when ?debug=true
  // ==========================================================================
  useEffect(() => {
    // Only enable if debug mode is active
    if (typeof window === 'undefined' || localStorage.getItem('debug') !== 'true') {
      return;
    }

    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    const networkStateMap: Record<number, string> = {
      0: 'EMPTY', 1: 'IDLE', 2: 'LOADING', 3: 'NO_SOURCE'
    };
    const readyStateMap: Record<number, string> = {
      0: 'NOTHING', 1: 'METADATA', 2: 'CURRENT', 3: 'FUTURE', 4: 'ENOUGH'
    };

    const logAudioState = (event: string, deck: 'A' | 'B', audio: HTMLAudioElement) => {
      console.log(`🔊 [${event}] Deck ${deck} | paused=${audio.paused} network=${networkStateMap[audio.networkState]} ready=${readyStateMap[audio.readyState]} time=${audio.currentTime.toFixed(1)} src=${audio.src ? 'SET' : 'NONE'}`);
    };

    // Audio element events
    const events = ['play', 'pause', 'playing', 'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'error', 'ended', 'canplay', 'canplaythrough', 'loadstart', 'loadeddata', 'loadedmetadata'];

    const createHandler = (deck: 'A' | 'B', audio: HTMLAudioElement) => (e: Event) => {
      logAudioState(e.type.toUpperCase(), deck, audio);
      if (e.type === 'error' && audio.error) {
        console.error(`❌ [ERROR] Deck ${deck} code=${audio.error.code} msg=${audio.error.message}`);
      }
    };

    const handlerA = createHandler('A', deckA);
    const handlerB = createHandler('B', deckB);

    events.forEach(evt => {
      deckA.addEventListener(evt, handlerA);
      deckB.addEventListener(evt, handlerB);
    });

    // Network state changes
    const handleOnline = () => console.log('🌐 [NETWORK] Online');
    const handleOffline = () => console.log('🌐 [NETWORK] Offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Visibility changes (app going to background)
    const handleVisibility = () => {
      const state = document.visibilityState;
      const active = getActiveDeck();
      console.log(`👁️ [VISIBILITY] ${state} | isPlaying=${isPlaying} paused=${active?.paused}`);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Page lifecycle events (iOS-specific)
    const handlePageHide = (e: PageTransitionEvent) => {
      console.log(`📄 [PAGEHIDE] persisted=${e.persisted}`);
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      const active = getActiveDeck();
      console.log(`📄 [PAGESHOW] persisted=${e.persisted} paused=${active?.paused}`);
    };
    const handleFreeze = () => console.log('🧊 [FREEZE] Page frozen');
    const handleResume = () => {
      const active = getActiveDeck();
      console.log(`▶️ [RESUME] Page resumed | paused=${active?.paused}`);
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);

    // Log initial state
    console.log('🔧 [DEBUG] Audio debug logging enabled');
    console.log(`🌐 [NETWORK] Initial: ${navigator.onLine ? 'Online' : 'Offline'}`);
    logAudioState('INIT', 'A', deckA);
    logAudioState('INIT', 'B', deckB);

    // Periodic state logging every 10 seconds + inactive deck safety check
    const stateInterval = setInterval(() => {
      const active = getActiveDeck();
      const activeDeckLabel = activeDeckRef.current;
      const inactive = activeDeckLabel === 'A' ? deckB : deckA;
      const inactiveDeckLabel = activeDeckLabel === 'A' ? 'B' : 'A';

      if (active) {
        console.log(`📊 [STATE] Deck ${activeDeckLabel} | playing=${!active.paused} time=${active.currentTime.toFixed(1)}/${active.duration?.toFixed(1) || '?'} network=${networkStateMap[active.networkState]} ready=${readyStateMap[active.readyState]} buffered=${active.buffered.length > 0 ? active.buffered.end(0).toFixed(1) : '0'}`);
      }

      // SAFETY CHECK: If inactive deck is playing and no crossfade is in progress, stop it
      // This catches cases where crossfade cleanup failed (e.g., iOS suspended setTimeout)
      if (inactive && !inactive.paused && !crossfadeInProgressRef.current) {
        console.warn(`⚠️ [SAFETY] Deck ${inactiveDeckLabel} playing unexpectedly (time=${inactive.currentTime.toFixed(1)}) - stopping it`);
        inactive.pause();
        inactive.currentTime = 0;
        inactive.volume = 0;
        inactive.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';
      }
    }, 10000);

    return () => {
      clearInterval(stateInterval);
      events.forEach(evt => {
        deckA.removeEventListener(evt, handlerA);
        deckB.removeEventListener(evt, handlerB);
      });
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleResume);
    };
  }, [getActiveDeck, isPlaying]);

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
