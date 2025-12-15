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
  ListMusic,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAudioStore } from '@/lib/stores/audio';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    playlist,
    currentSongIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffled,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong,
    toggleShuffle,
    setAIUserActionInProgress,
    toggleQueuePanel,
  } = useAudioStore();

  const currentSong = useMemo(() => playlist[currentSongIndex] || null, [playlist, currentSongIndex]);
  const queryClient = useQueryClient();

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);
  const isLiked = useMemo(() => feedbackData?.feedback?.[currentSong?.id] === 'thumbs_up', [feedbackData, currentSong?.id]);

  // Like/unlike mutation
  const { mutate: likeMutate, isPending: isLikePending } = useMutation({
    mutationFn: async (liked: boolean) => {
      setAIUserActionInProgress(true);
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: currentSong.id,
          songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
          feedbackType: liked ? 'thumbs_up' : 'thumbs_down',
          source: 'library',
        }),
      });
      if (!response.ok && response.status !== 409) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update feedback');
      }
      return response.json();
    },
    onSuccess: (_, liked) => {
      queryClient.invalidateQueries({ queryKey: ['songFeedback'] });
      toast.success(liked ? '❤️ Liked' : '💔 Unliked', { duration: 1500 });
    },
    onError: (error: Error) => {
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

  const loadSong = useCallback((song: typeof currentSong) => {
    const audio = audioRef.current;
    if (audio && song) {
      audio.src = song.url;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      currentSongIdRef.current = song.id;
    }
  }, [setCurrentTime, setDuration]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        setIsLoading(true);
        audio.play().catch((e) => {
          setIsLoading(false);
          console.error('Play failed:', e);
        }).finally(() => setIsLoading(false));
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, setIsPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio && !isNaN(time) && isFinite(time)) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, [setCurrentTime]);

  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, [setVolume]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0 && currentSong) {
        const playedPercentage = (audio.currentTime / audio.duration) * 100;
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
        }
      }
    };

    const updateDuration = () => setDuration(audio.duration);
    const onCanPlay = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    const onEnded = () => {
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
            duration: audio.duration,
            playDuration: audio.currentTime,
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
      nextSong();
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.volume = volume;

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong, queryClient]);

  // Track the canplay handler so we can manage it properly
  const canPlayHandlerRef = useRef<(() => void) | null>(null);
  const errorHandlerRef = useRef<((e: Event) => void) | null>(null);

  // Load song when it changes
  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const song = playlist[currentSongIndex];
      const audio = audioRef.current;

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
  }, [currentSongIndex, playlist, isPlaying, loadSong]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        if (canPlayHandlerRef.current) {
          audio.removeEventListener('canplay', canPlayHandlerRef.current);
        }
        if (errorHandlerRef.current) {
          audio.removeEventListener('error', errorHandlerRef.current);
        }
      }
    };
  }, []);

  // Handle play/pause state changes (for toggling on existing loaded song)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    // Only handle pause immediately; play is handled by canplay listener or when ready
    if (!isPlaying) {
      audio.pause();
    } else if (audio.readyState >= 2) {
      // Only try to play if audio is ready (has enough data)
      audio.play().catch(console.error);
    }
    // If isPlaying is true but readyState < 2, the canplay handler will start playback
  }, [isPlaying]);

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
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const audio = audioRef.current;
    if (!audio || !currentSong) return;

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

      // Update position state
      if (audio.duration && isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (e) {
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
          audio.play();
          setIsPlaying(true);
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause');
          audio.pause();
          setIsPlaying(false);
        });

        // previoustrack and nexttrack - shows as skip buttons on iOS
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🎛️ Media Session: previoustrack');
          previousSong();
          // Need to trigger play after state update
          setTimeout(() => {
            const newAudio = audioRef.current;
            if (newAudio) newAudio.play().catch(console.error);
          }, 100);
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🎛️ Media Session: nexttrack');
          nextSong();
          // Need to trigger play after state update
          setTimeout(() => {
            const newAudio = audioRef.current;
            if (newAudio) newAudio.play().catch(console.error);
          }, 100);
        });

        // seekto works alongside track buttons
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && isFinite(details.seekTime)) {
            console.log('🎛️ Media Session: seekto', details.seekTime);
            audio.currentTime = details.seekTime;
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
      if (audio.duration && isFinite(audio.duration) && isFinite(audio.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (e) {
          // Ignore
        }
      }
    };

    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', setupMediaSession);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    // Initial setup if already playing
    if (!audio.paused) {
      handlePlaying();
    } else {
      setupMediaSession();
    }

    return () => {
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', setupMediaSession);
      audio.removeEventListener('timeupdate', handleTimeUpdate);

      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [currentSong, setIsPlaying, previousSong, nextSong]);

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
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
            <span className="font-bold text-xs text-primary/60">
              {currentSong.artist?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '♪'}
            </span>
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
          <div className="w-14 h-14 rounded-md bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 relative">
            <span className="font-bold text-lg text-primary/60">
              {currentSong.artist?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '♪'}
            </span>
            {isPlaying && (
              <div className="absolute inset-0 bg-primary/10 animate-pulse rounded-md" />
            )}
          </div>
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
            onClick={toggleQueuePanel}
          >
            <ListMusic className="h-4 w-4" />
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

      {/* Hidden Audio Element - shared between mobile and desktop */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </>
  );
}
