import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Button } from './button';
import { Volume2, VolumeX, SkipBack, SkipForward, Play, Pause, Heart, Loader2, AlertCircle } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';
import { AIDJToggle } from '../ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Custom slider component to replace inline styles
const Slider = ({
  value,
  max,
  min = 0,
  step = 0.01,
  onChange,
  onInput,
  className = "",
  ariaLabel,
  ariaValueMin,
  ariaValueMax,
  ariaValueNow,
  ariaValueText,
  progressColor = "var(--primary)"
}: {
  value: number;
  max: number;
  min?: number;
  step?: number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInput?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  ariaLabel?: string;
  ariaValueMin?: number;
  ariaValueMax?: number;
  ariaValueNow?: number;
  ariaValueText?: string;
  progressColor?: string;
}) => {
  const percentage = max > 0 ? ((value - min) / (max - min)) * 100 : 0;
  
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
      onInput={onInput}
      className={cn(
        "h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer",
        "[&::-webkit-slider-thumb]:appearance-none",
        "[&::-webkit-slider-thumb]:h-3.5",
        "[&::-webkit-slider-thumb]:w-3.5",
        "[&::-webkit-slider-thumb]:bg-primary",
        "[&::-webkit-slider-thumb]:rounded-full",
        "[&::-webkit-slider-thumb]:shadow-md",
        "[&::-webkit-slider-thumb]:cursor-pointer",
        "[&::-moz-range-thumb]:h-3.5",
        "[&::-moz-range-thumb]:w-3.5",
        "[&::-moz-range-thumb]:bg-primary",
        "[&::-moz-range-thumb]:rounded-full",
        "[&::-moz-range-thumb]:border-0",
        "[&::-moz-range-thumb]:cursor-pointer",
        className
      )}
      style={{
        background: `linear-gradient(to right, ${progressColor} ${percentage}%, var(--muted) ${percentage}%)`,
      }}
      aria-label={ariaLabel}
      aria-valuemin={ariaValueMin ?? min}
      aria-valuemax={ariaValueMax ?? max}
      aria-valuenow={ariaValueNow ?? Math.round(value)}
      aria-valuetext={ariaValueText}
    />
  );
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
          value={volume}
          min={0}
          max={1}
          step={0.01}
          onChange={(e) => onChange(Number(e.target.value))}
          onInput={(e) => onChange(Number(e.target.value))}
          className="w-20 h-1.5"
          ariaLabel="Volume"
          ariaValueMax={100}
          ariaValueNow={Math.round(volume * 100)}
        />
      </div>
    </div>
  );
};

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
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong,
  } = useAudioStore();
  const currentSong = playlist[currentSongIndex];
  const queryClient = useQueryClient();

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);
  const isLiked = feedbackData?.feedback?.[currentSong?.id] === 'thumbs_up';

  // Like/unlike mutation
  const likeMutation = useMutation({
    mutationFn: async (liked: boolean) => {
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to update feedback');
      }

      return response.json();
    },
    onSuccess: (_, liked) => {
      queryClient.invalidateQueries({ queryKey: ['songFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] }); // Refresh Liked Songs playlist
      toast.success(liked ? '❤️ Added to Liked Songs' : '💔 Removed from Liked Songs');
    },
    onError: (error: Error) => {
      toast.error('Failed to update', { description: error.message });
    },
  });

  const handleToggleLike = () => {
    if (!currentSong) return;
    likeMutation.mutate(!isLiked);
  };

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

  const togglePlayPause = () => {
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
  };

  const seek = (time: number) => {
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
  };

  const changeVolume = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  };

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
      if (currentSongIdRef.current && !hasScrobbledRef.current) {
        hasScrobbledRef.current = true;
        console.log(`🎵 Song ended, scrobbling: ${currentSongIdRef.current}`);
        scrobbleSong(currentSongIdRef.current, true).catch(err =>
          console.error('Failed to scrobble on song end:', err)
        );
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

  if (playlist.length === 0 || currentSongIndex === -1) return null;

  return (
    <div
      className="relative bg-gradient-to-r from-background via-background/98 to-background border-t border-border/50 shadow-2xl backdrop-blur-xl"
      role="region"
      aria-label="Audio Player"
    >
      {/* Gradient overlay for visual interest */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />

      <div className="relative w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        {/* Mobile Layout (< 768px) - Navidrome Style */}
        <div className="md:hidden space-y-3" role="group" aria-label="Mobile audio controls">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm shadow-md animate-in slide-in-from-top-2 duration-300" role="alert">
              <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              </div>
              <span className="flex-1">{error}</span>
            </div>
          )}
          
          {/* Album Artwork + Song Info */}
          <div className="flex items-start gap-3" role="group" aria-label="Song information">
            {/* Album Artwork */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 rounded-lg flex items-center justify-center overflow-hidden shadow-md ring-2 ring-primary/10 transition-all duration-300">
                {currentSong.artist && (
                  <span className="font-bold text-primary/70 truncate px-2 text-center text-sm">
                    {currentSong.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                {isPlaying && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 animate-pulse rounded-lg" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex gap-0.5">
                        <div className="w-0.5 h-2 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0s'}} />
                        <div className="w-0.5 h-3 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.1s'}} />
                        <div className="w-0.5 h-2 bg-primary/60 animate-[wave_1s_ease-in-out_infinite]" style={{animationDelay: '0.2s'}} />
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Glow effect on playing */}
              {isPlaying && (
                <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full -z-10 animate-pulse" />
              )}
            </div>
            
            {/* Song Info */}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base truncate block hover:text-primary transition-colors leading-tight" title={currentSong.name || currentSong.title || 'Unknown Song'}>
                {currentSong.name || currentSong.title || 'Unknown Song'}
              </h3>
              <p className="font-medium text-sm text-foreground/70 truncate mt-1">
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
            </div>
          </div>

          {/* Progress Bar */}
          <div role="group" aria-label="Playback progress">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
                {formatTime(currentTime)}
              </span>
              <Slider
                value={isFinite(currentTime) ? currentTime : 0}
                max={isFinite(duration) ? duration : 0}
                step={0.1}
                onChange={(e) => seek(Number(e.target.value))}
                onInput={(e) => seek(Number(e.target.value))}
                className="flex-1 h-2"
                ariaLabel="Seek position"
                ariaValueMax={isFinite(duration) ? duration : 0}
                ariaValueNow={Math.round(isFinite(currentTime) ? currentTime : 0)}
                progressColor={isFinite(duration) && duration > 0
                  ? `linear-gradient(to right, hsl(var(--primary)) ${(currentTime / duration) * 100}%, hsl(var(--muted)) ${(currentTime / duration) * 100}%)`
                  : 'hsl(var(--muted))'
                }
              />
              <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="flex items-center justify-between gap-2" role="group" aria-label="Playback controls">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full hover:bg-accent/20"
                onClick={handleToggleLike}
                disabled={likeMutation.isPending}
                aria-label={isLiked ? 'Unlike song' : 'Like song'}
              >
                <Heart className={cn("h-4 w-4", isLiked ? "fill-current text-red-500" : "")} />
              </Button>
              
              <div className="min-h-[44px] min-w-[44px] flex items-center">
                <AddToPlaylistButton
                  songId={currentSong.id}
                  artistName={currentSong.artist || 'Unknown Artist'}
                  songTitle={currentSong.name}
                  size="icon"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full hover:bg-accent/20"
                onClick={previousSong}
                aria-label="Previous song"
              >
                <SkipBack className="h-4 w-4" />
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="rounded-full hover:bg-accent/20"
                onClick={nextSong}
                aria-label="Next song"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <VolumeControl
                volume={volume}
                onChange={changeVolume}
              />
              <AIDJToggle compact />
            </div>
          </div>
        </div>

        {/* Desktop Layout (>= 768px) - Navidrome Style */}
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
                  value={isFinite(currentTime) ? currentTime : 0}
                  max={isFinite(duration) ? duration : 0}
                  step={0.1}
                  onChange={(e) => seek(Number(e.target.value))}
                  onInput={(e) => seek(Number(e.target.value))}
                  className="flex-1 h-2"
                  ariaLabel="Seek position"
                  ariaValueMax={isFinite(duration) ? duration : 0}
                  ariaValueNow={Math.round(isFinite(currentTime) ? currentTime : 0)}
                  progressColor={isFinite(duration) && duration > 0
                    ? `linear-gradient(to right, hsl(var(--primary)) ${(currentTime / duration) * 100}%, hsl(var(--muted)) ${(currentTime / duration) * 100}%)`
                    : 'hsl(var(--muted))'
                  }
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
              disabled={likeMutation.isPending}
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
            >
              <Heart className={cn("h-5 w-5", isLiked ? "fill-current text-red-500" : "")} />
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
                <AIDJToggle compact />
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