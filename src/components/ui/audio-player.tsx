import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Link } from '@tanstack/react-router';
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
  const percentage = ((value - min) / (max - min)) * 100;
  
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

// Song info component
const SongInfo = ({ song, isPlaying, isLiked, onToggleLike, isPending, compact = false }: {
  song: Song;
  isPlaying: boolean;
  isLiked: boolean;
  onToggleLike: () => void;
  isPending: boolean;
  compact?: boolean;
}) => {
  const sizeClasses = compact
    ? "w-12 h-12 text-xs sm:w-10 sm:h-10"
    : "w-12 h-12 text-xs";
    
  const buttonClasses = compact
    ? "min-h-[44px] min-w-[44px] h-10 w-10 sm:h-9 sm:w-9"
    : "h-9 w-9";

  return (
    <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
      <div className="relative">
        <div className={cn(
          "bg-gradient-to-br from-muted to-muted-foreground/20 rounded-lg flex items-center justify-center overflow-hidden",
          sizeClasses
        )}>
          {song.artist && (
            <span className="font-medium text-muted-foreground/70 truncate w-20">
              {song.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
          {isPlaying && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 animate-pulse rounded-lg" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to="/library/artists/id/albums/albumId"
          params={{ id: song.artist || 'unknown', albumId: song.albumId }}
          className="font-semibold text-sm truncate block hover:text-primary transition-colors py-1"
          title={song.name || song.title || 'Unknown Song'}
        >
          {song.name || song.title || 'Unknown Song'}
        </Link>
        <p className="text-xs text-muted-foreground truncate">
          <span className="hover:text-primary transition-colors cursor-pointer" title={song.artist || 'Unknown Artist'}>
            {song.artist || 'Unknown Artist'}
          </span>
          {song.album && (
            <>
              {' • '}
              <Link
                to="/library/artists/id/albums/albumId"
                params={{ id: song.artist || 'unknown', albumId: song.albumId }}
                className="hover:text-primary transition-colors"
              >
                {song.album}
              </Link>
            </>
          )}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-full hover:bg-accent/20",
          isLiked ? "text-red-500" : "",
          buttonClasses
        )}
        onClick={onToggleLike}
        disabled={isPending}
        aria-label={isLiked ? 'Unlike song' : 'Like song'}
      >
        <Heart className={cn("h-4 w-5", isLiked ? "fill-current" : "")} />
      </Button>
    </div>
  );
};

// Playback controls component
const PlaybackControls = ({
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  compact = false,
  isLoading = false
}: {
  isPlaying: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  compact?: boolean;
  isLoading?: boolean;
}) => {
  const controlSize = compact
    ? "min-h-[44px] min-w-[44px] h-12 w-12 sm:h-11 sm:w-11"
    : "h-11 w-11";
    
  const playButtonSize = compact
    ? "min-h-[48px] min-w-[48px] h-14 w-14 sm:h-10 sm:w-10"
    : "h-10 w-10";

  return (
    <div className="flex items-center space-x-2 sm:space-x-3">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-full hover:bg-accent/20 transition-colors",
          controlSize
        )}
        onClick={onPrevious}
        aria-label="Previous song"
      >
        <SkipBack className="h-5 w-5 sm:h-4 sm:w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-full transition-all duration-200",
          isPlaying ? "bg-primary hover:bg-primary/90" : "bg-accent hover:bg-accent/80",
          playButtonSize
        )}
        onClick={onPlayPause}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause" : "Play"}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-6 w-6 sm:h-5 sm:w-5" />
        ) : (
          <Play className="h-6 w-6 sm:h-5 sm:w-5 ml-0.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-full hover:bg-accent/20 transition-colors",
          controlSize
        )}
        onClick={onNext}
        aria-label="Next song"
      >
        <SkipForward className="h-5 w-5 sm:h-4 sm:w-4" />
      </Button>
    </div>
  );
};

// Progress bar component
const ProgressBar = ({
  currentTime,
  duration,
  onSeek,
  compact = false
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  compact?: boolean;
}) => {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const containerClasses = compact
    ? "flex items-center gap-2"
    : "flex flex-col space-y-1 min-w-[180px]";

  const sliderClasses = compact
    ? "w-full h-3 relative min-h-[48px] flex items-center py-3"
    : "w-full relative";

  return (
    <div className={containerClasses}>
      {!compact && (
        <div className="flex justify-between text-xs font-mono text-muted-foreground px-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
      <div className={sliderClasses}>
        {compact && (
          <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem] sm:min-w-[3rem]">
            {formatTime(currentTime)}
          </span>
        )}
        <Slider
          value={currentTime}
          max={duration || 0}
          step={0.1}
          onChange={(e) => onSeek(Number(e.target.value))}
          onInput={(e) => onSeek(Number(e.target.value))}
          className={cn("w-full", compact ? "h-3" : "h-1.5")}
          ariaLabel="Seek position"
          ariaValueMax={duration || 0}
          ariaValueNow={Math.round(currentTime)}
          ariaValueText={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        />
        {compact && (
          <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem] sm:min-w-[3rem]">
            {formatTime(duration)}
          </span>
        )}
      </div>
    </div>
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
      className="bg-background/95 backdrop-blur-sm border-t border-border/50 shadow-lg"
      role="region"
      aria-label="Audio Player"
    >
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout (< 768px) - Stacked */}
        <div className="md:hidden space-y-3" role="group" aria-label="Mobile audio controls">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {/* Track Info + Controls */}
          <div className="flex items-center justify-between gap-3" role="group" aria-label="Song information and playback controls">
            <SongInfo
              song={currentSong}
              isPlaying={isPlaying}
              isLiked={isLiked}
              onToggleLike={handleToggleLike}
              isPending={likeMutation.isPending}
              compact
            />
            
            {/* Mobile Controls */}
            <div className="flex items-center space-x-2">
              <div className="min-h-[44px] min-w-[44px] flex items-center">
                <AddToPlaylistButton
                  songId={currentSong.id}
                  artistName={currentSong.artist || 'Unknown Artist'}
                  songTitle={currentSong.name}
                  size="icon"
                />
              </div>
              <PlaybackControls
                isPlaying={isPlaying}
                onPrevious={previousSong}
                onPlayPause={togglePlayPause}
                onNext={nextSong}
                compact
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Mobile Progress Bar */}
          <div role="group" aria-label="Playback progress">
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              onSeek={seek}
              compact
            />
          </div>

          {/* Mobile AI DJ Toggle */}
          <div className="pt-3 border-t border-border/50" role="group" aria-label="AI DJ controls">
            <AIDJToggle compact />
          </div>
        </div>

        {/* Desktop Layout (>= 768px) - Horizontal */}
        <div className="hidden md:flex items-center justify-between" role="group" aria-label="Desktop audio controls">
          {/* Track Info - Left Side */}
          <div role="group" aria-label="Song information">
            <SongInfo
              song={currentSong}
              isPlaying={isPlaying}
              isLiked={isLiked}
              onToggleLike={handleToggleLike}
              isPending={likeMutation.isPending}
            />
          </div>

          {/* Controls - Center */}
          <div className="px-6" role="group" aria-label="Playback controls">
            <PlaybackControls
              isPlaying={isPlaying}
              onPrevious={previousSong}
              onPlayPause={togglePlayPause}
              onNext={nextSong}
              isLoading={isLoading}
            />
          </div>

          {/* Progress & Volume - Right Side */}
          <div className="flex items-center space-x-4" role="group" aria-label="Audio settings">
            <div role="group" aria-label="Playback progress">
              <ProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seek}
              />
            </div>
            <div role="group" aria-label="Volume controls">
              <VolumeControl
                volume={volume}
                onChange={changeVolume}
              />
            </div>
            <div className="pl-4 border-l border-border/50" role="group" aria-label="AI DJ controls">
              <AIDJToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}