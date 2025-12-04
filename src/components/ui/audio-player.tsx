import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { SkipBack, SkipForward, Play, Pause, Heart, Loader2, AlertCircle, Volume2, VolumeX, Shuffle } from 'lucide-react';
import { Button } from './button';
import { Slider } from './slider';
import { useAudioStore } from '@/lib/stores/audio';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';
import { AIDJToggle } from '../ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type Song = {
  id: string;
  name: string;
  title?: string; // Alternative name field from API
  albumId: string;
  album?: string; // Album name for display
  duration: number;
  track: number;
  url: string;
  artist?: string; // Optional for display
};


// Helper function for time formatting
const formatTime = (time: number) => {
  // Handle NaN, undefined, or invalid values
  if (!isFinite(time) || time < 0) {
    return '0:00';
  }
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Volume control component
const VolumeControl = ({ volume, onChange }: {
  volume: number;
  onChange: (volume: number) => void;
}) => {
  return (
    <div className="flex items-center space-x-2 pr-2">
      <Button
        variant="ghost"
        size="sm"
        className="min-h-[44px] min-w-[44px] h-11 w-11 p-0 hover:bg-accent/20"
        onClick={() => onChange(volume > 0 ? 0 : 0.5)}
        aria-label={volume > 0 ? 'Mute' : 'Unmute'}
      >
        {volume > 0 ? (
          <Volume2 className="h-4 w-4" />
        ) : (
          <VolumeX className="h-4 w-4" />
        )}
      </Button>
      <div className="relative min-h-[44px] flex items-center">
        <Slider
          value={[volume * 100]}
          max={100}
          step={1}
          onValueChange={([newValue]) => onChange(newValue / 100)}
          className="w-20 h-1.5"
          aria-label="Volume"
          aria-valuemax={100}
          aria-valuenow={Math.round(volume * 100)}
        />
      </div>
    </div>
  );
};

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
  } = useAudioStore();
  const currentSong = useMemo(() => playlist[currentSongIndex] || null, [playlist, currentSongIndex]);
  const queryClient = useQueryClient();

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);
  const isLiked = useMemo(() => feedbackData?.feedback?.[currentSong?.id] === 'thumbs_up', [feedbackData, currentSong?.id]);

  // Like/unlike mutation
  const { mutate: likeMutate, isPending: isLikePending } = useMutation({
    mutationFn: async (liked: boolean) => {
      // Set user action flag to prevent AI DJ auto-refresh
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

      if (!response.ok) {
        // Handle 409 Conflict (duplicate feedback) gracefully
        if (response.status === 409) {
          await response.json(); // Consume response body
          console.log('✓ Feedback already exists, continuing with recommendations');
          return; // Return undefined to prevent error
        }
        const error = await response.json();
        throw new Error(error.message || 'Failed to update feedback');
      }

      return response.json();
    },
    onSuccess: (_, liked) => {
      queryClient.invalidateQueries({ queryKey: ['songFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success(liked ? '❤️ Added to Liked Songs' : '💔 Removed from Liked Songs');
    },
    onError: (error: Error) => {
      toast.error('Failed to update', { description: error.message });
    },
    onSettled: () => {
      setTimeout(() => {
        setAIUserActionInProgress(false);
      }, 1000);
    },
  });

  const handleToggleLike = useCallback(() => {
    if (!currentSong || isLikePending) return;
    likeMutate(!isLiked);
  }, [currentSong, isLikePending, isLiked, likeMutate]);

  const loadSong = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (audio) {
      audio.src = song.url; // Proxied stream URL from service
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      // Reset scrobble tracking for new song
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      currentSongIdRef.current = song.id;
      console.log(`🎵 Loaded song: ${song.name || song.title} (ID: ${song.id})`);
    }
  }, [setCurrentTime, setDuration]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setError(null);
      if (isPlaying) {
        audio.pause();
      } else {
        setIsLoading(true);
        audio.play().catch((e) => {
          setError('Failed to play audio');
          setIsLoading(false);
          console.error('Play failed:', e);
        }).finally(() => {
          setIsLoading(false);
        });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, setIsPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio && !isNaN(time) && isFinite(time)) {
      setError(null);
      try {
        audio.currentTime = time;
        setCurrentTime(time);
      } catch (e) {
        setError('Failed to seek');
        console.error('Seek failed:', e);
      }
    }
  }, [setCurrentTime]);

  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, [setVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);

      // Check if we've crossed the 50% threshold for scrobbling
      if (audio.duration > 0 && currentSong) {
        const playedPercentage = (audio.currentTime / audio.duration) * 100;

        // Mark threshold reached at 50%
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
          console.log(`📊 50% threshold reached for: ${currentSong.name}`);
        }
      }
    };

    const updateDuration = () => setDuration(audio.duration);
    const onCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };
    const onWaiting = () => {
      setIsLoading(true);
      setError(null);
    };
    const onError = (e: Event) => {
      const audio = e.target as HTMLAudioElement;
      setError(`Audio error: ${audio.error?.message || 'Unknown error'}`);
      setIsLoading(false);
      console.error('Audio error:', audio.error);
    };
    const onEnded = () => {
      // Scrobble on song end if we haven't already
      if (currentSongIdRef.current && !hasScrobbledRef.current && currentSong) {
        hasScrobbledRef.current = true;
        console.log(`🎵 Song ended, scrobbling: ${currentSongIdRef.current}`);
        scrobbleSong(currentSongIdRef.current, true).catch(err =>
          console.error('Failed to scrobble on song end:', err)
        );

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
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    audio.volume = volume;

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong]);

  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const currentSong = playlist[currentSongIndex];
      const audio = audioRef.current;

      if (audio && currentSong) {
        // Only load if the song ID has actually changed
        if (currentSongIdRef.current !== currentSong.id) {
          // Set up one-time canplay listener to handle autoplay
          const handleCanPlay = () => {
            setIsLoading(false);
            setError(null);
            if (isPlaying) {
              audio.play().catch((e) => {
                setError('Auto-play failed');
                console.error('Auto-play failed:', e);
              });
            }
            audio.removeEventListener('canplay', handleCanPlay);
          };

          audio.addEventListener('canplay', handleCanPlay);
          audio.addEventListener('error', (e: Event) => {
            const audio = e.target as HTMLAudioElement;
            setError(`Audio error: ${audio.error?.message || 'Unknown error'}`);
            setIsLoading(false);
            console.error('Audio error:', audio.error);
          });
          loadSong(currentSong);

          // Cleanup: Scrobble when changing songs if 50% threshold was reached
          return () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', (e: Event) => {
              const audio = e.target as HTMLAudioElement;
              setError(`Audio error: ${audio.error?.message || 'Unknown error'}`);
              setIsLoading(false);
              console.error('Audio error:', audio.error);
            });

            // If user skipped after 50% threshold, scrobble before loading next song
            if (scrobbleThresholdReachedRef.current && !hasScrobbledRef.current && currentSongIdRef.current) {
              hasScrobbledRef.current = true;
              console.log(`🎵 Song skipped after 50%, scrobbling: ${currentSongIdRef.current}`);
              scrobbleSong(currentSongIdRef.current, true).catch(err =>
                console.error('Failed to scrobble on song change:', err)
              );
            }
          };
        }
      }
    }
  }, [currentSongIndex, playlist, isPlaying, loadSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Only handle pause/resume for already-loaded audio
    if (audio.src && audio.readyState >= 2) {
      if (isPlaying) {
        const handlePlay = () => {
          setIsLoading(false);
          setError(null);
        };
        
        const handlePlayError = (e: Event) => {
          setError('Failed to play audio');
          setIsLoading(false);
          console.error('Play failed:', e);
        };
        
        audio.addEventListener('play', handlePlay, { once: true });
        audio.addEventListener('error', handlePlayError, { once: true });
        
        // Use setTimeout to defer state update and avoid React warning
        setTimeout(() => setIsLoading(true), 0);
        audio.play().catch((e) => {
          setError('Failed to play audio');
          setIsLoading(false);
          console.error('Play failed:', e);
        });
      } else {
        audio.pause();
      }
    }
  }, [isPlaying]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when not focused on input elements
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        return;
      }

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
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.05));
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
  }, [togglePlayPause, seek, changeVolume, handleToggleLike, currentTime, duration, volume]);

  if (playlist.length === 0 || currentSongIndex === -1) return null;

  return (
    <div
      role="region"
      aria-label="Audio Player"
      aria-live="polite"
      tabIndex={0}
    >
      <div
        className="relative bg-gradient-to-r from-background via-background/98 to-background border-t border-border/50 shadow-2xl backdrop-blur-xl"
      >
        {/* Gradient overlay for visual interest */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />

        <div className="relative w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          {/* Mobile Layout (< 768px) - Compact single-row design */}
          <div className="md:hidden space-y-2" role="group" aria-label="Mobile audio controls">
            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-800 rounded-lg text-red-300 text-xs" role="alert">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="flex-1 truncate">{error}</span>
              </div>
            )}

            {/* Progress Bar at top */}
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
                aria-label="Seek position"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8">
                {formatTime(duration)}
              </span>
            </div>

            {/* Main row: Album art, song info, controls */}
            <div className="flex items-center gap-3">
              {/* Small Album Artwork */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg flex items-center justify-center overflow-hidden">
                  {currentSong.artist && (
                    <span className="font-bold text-primary/70 text-xs">
                      {currentSong.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex gap-0.5">
                        <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" />
                        <div className="w-0.5 h-3 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.1s'}} />
                        <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.2s'}} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Song Info */}
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate">
                  {currentSong.name || currentSong.title || 'Unknown Song'}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {currentSong.artist || 'Unknown Artist'}
                </p>
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

          {/* Desktop Layout (>= 768px) */}
          <div className="hidden md:flex items-center gap-4 flex-shrink-0" role="group" aria-label="Desktop audio controls">
            {/* Album Artwork - Left Side */}
            <div className="relative flex-shrink-0" role="group" aria-label="Album artwork">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 rounded-xl flex items-center justify-center overflow-hidden shadow-lg ring-2 ring-primary/10 transition-all duration-300">
                {currentSong.artist && (
                  <span className="font-bold text-primary/70 truncate px-2 text-center text-lg">
                    {currentSong.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                {isPlaying && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 animate-pulse rounded-xl" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex gap-0.5">
                        <div className="w-0.5 h-3 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0s'}} />
                        <div className="w-0.5 h-4 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.1s'}} />
                        <div className="w-0.5 h-3 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.2s'}} />
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Glow effect on playing */}
              {isPlaying && (
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full -z-10 animate-pulse" />
              )}
            </div>

            {/* Song Information - Middle */}
            <div className="flex-1 min-w-0" role="group" aria-label="Song information">
              <div className="space-y-1">
                <h3 className="font-semibold text-lg truncate block hover:text-primary transition-colors leading-tight" title={currentSong.name || currentSong.title || 'Unknown Song'}>
                  {currentSong.name || currentSong.title || 'Unknown Song'}
                </h3>
                <p className="font-medium text-sm text-foreground/70 truncate">
                  <span className="hover:text-primary transition-colors cursor-pointer" title={currentSong.artist || 'Unknown Artist'}>
                    {currentSong.artist || 'Unknown Artist'}
                  </span>
                  {currentSong.album && (
                    <>
                      {' • '}
                      <span className="hover:text-primary transition-colors cursor-pointer" title={currentSong.album}>
                        {currentSong.album}
                      </span>
                    </>
                  )}
                </p>
                {/* Progress Bar */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
                    {formatTime(currentTime)}
                  </span>
                  <Slider
                    value={[isFinite(currentTime) ? currentTime : 0]}
                    max={isFinite(duration) && duration > 0 ? duration : 100}
                    step={0.1}
                    onValueChange={([newValue]) => seek(newValue)}
                    className="flex-1 h-2"
                    aria-label="Seek position"
                    aria-valuemax={isFinite(duration) && duration > 0 ? duration : 100}
                    aria-valuenow={Math.round(isFinite(currentTime) ? currentTime : 0)}
                  />
                  <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>

            {/* Controls - Right Side */}
            <div className="flex items-center gap-2 flex-shrink-0" role="group" aria-label="Playback controls">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full hover:bg-accent/20"
                onClick={handleToggleLike}
                disabled={isLikePending}
                aria-label={isLiked ? 'Unlike song' : 'Like song'}
              >
                <Heart className={cn("h-5 w-5", isLiked ? "fill-current text-red-500" : "")} />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full hover:bg-accent/20 transition-all duration-200",
                  isShuffled ? "text-primary bg-primary/10 hover:bg-primary/20" : ""
                )}
                onClick={toggleShuffle}
                aria-label={isShuffled ? "Disable shuffle" : "Enable shuffle"}
                aria-pressed={isShuffled}
              >
                <Shuffle className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="rounded-full hover:bg-accent/20"
                onClick={previousSong}
                aria-label="Previous song"
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="rounded-full transition-all duration-300 shadow-lg hover:scale-105 relative"
                onClick={togglePlayPause}
                disabled={isLoading}
                aria-label={isPlaying ? "Pause" : "Play"}
                aria-busy={isLoading}
              >
                {isPlaying && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-md -z-10 animate-pulse" />
                )}
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
                className="rounded-full hover:bg-accent/20"
                onClick={nextSong}
                aria-label="Next song"
              >
                <SkipForward className="h-5 w-5" />
              </Button>

              <div className="pl-2 border-l border-border/50 flex-shrink-0" role="group" aria-label="Additional controls">
                <div className="flex items-center gap-2">
                  <VolumeControl
                    volume={volume}
                    onChange={changeVolume}
                  />
                  <AIDJToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}