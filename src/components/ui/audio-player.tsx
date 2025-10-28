import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from './button';
import { Volume2, VolumeX, SkipBack, SkipForward, Play, Pause, Heart } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';
import { AIDJToggle } from '../ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
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
    const onCanPlay = () => {};
    const onWaiting = () => {};
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
    audio.addEventListener('ended', onEnded);

    audio.volume = volume;

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
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
            if (isPlaying) {
              audio.play().catch((e) => console.error('Auto-play failed:', e));
            }
            audio.removeEventListener('canplay', handleCanPlay);
          };

          audio.addEventListener('canplay', handleCanPlay);
          loadSong(currentSong);

          // Cleanup: Scrobble when changing songs if 50% threshold was reached
          return () => {
            audio.removeEventListener('canplay', handleCanPlay);

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
        audio.play().catch((e) => console.error('Play failed:', e));
      } else {
        audio.pause();
      }
    }
  }, [isPlaying]);

  if (playlist.length === 0 || currentSongIndex === -1) return null;

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-background/95 backdrop-blur-sm border-t border-border/50 shadow-lg">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout (< 768px) - Stacked */}
        <div className="md:hidden space-y-2">
          {/* Track Info + Play/Pause */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-muted to-muted-foreground/20 rounded-lg flex items-center justify-center overflow-hidden">
                  {currentSong.artist && (
                    <span className="text-xs font-medium text-muted-foreground/70">
                      {currentSong.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {isPlaying && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 animate-pulse rounded-lg" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to="/albums/$id"
                  params={{ id: currentSong.albumId }}
                  className="font-semibold text-sm truncate block hover:text-primary transition-colors"
                  title={currentSong.name || currentSong.title || 'Unknown Song'}
                >
                  {currentSong.name || currentSong.title || 'Unknown Song'}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  <span className="hover:text-primary transition-colors cursor-pointer" title={currentSong.artist || 'Unknown Artist'}>
                    {currentSong.artist || 'Unknown Artist'}
                  </span>
                  {currentSong.album && (
                    <>
                      {' • '}
                      <Link
                        to="/albums/$id"
                        params={{ id: currentSong.albumId }}
                        className="hover:text-primary transition-colors"
                      >
                        {currentSong.album}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Mobile Controls */}
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className={`min-h-[44px] min-w-[44px] p-2 rounded-full ${isLiked ? 'text-red-500' : ''} hover:bg-accent/20`}
                onClick={handleToggleLike}
                disabled={likeMutation.isPending}
                aria-label={isLiked ? 'Unlike song' : 'Like song'}
              >
                <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
              </Button>
              <AddToPlaylistButton
                songId={currentSong.id}
                artistName={currentSong.artist || 'Unknown Artist'}
                songTitle={currentSong.name}
                size="icon"
              />
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] min-w-[44px] p-2 rounded-full hover:bg-accent/20"
                onClick={previousSong}
                aria-label="Previous song"
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className={`min-h-[44px] min-w-[44px] p-2 rounded-full ${isPlaying ? 'bg-primary hover:bg-primary/90' : 'bg-accent hover:bg-accent/80'}`}
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-0.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] min-w-[44px] p-2 rounded-full hover:bg-accent/20"
                onClick={nextSong}
                aria-label="Next song"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Mobile Progress Bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1 relative min-h-[44px] flex items-center">
              <input
                type="range"
                value={currentTime}
                max={duration || 0}
                step={0.1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                onInput={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                className="w-full h-2 bg-muted/50 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:w-5
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${(currentTime / (duration || 1)) * 100}%, var(--muted) ${(currentTime / (duration || 1)) * 100}%)`,
                }}
                aria-label="Seek position"
                aria-valuemin={0}
                aria-valuemax={duration || 0}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
              {formatTime(duration)}
            </span>
          </div>

          {/* Mobile AI DJ Toggle */}
          <div className="pt-2 border-t border-border/50">
            <AIDJToggle compact />
          </div>
        </div>

        {/* Desktop Layout (>= 768px) - Original Horizontal */}
        <div className="hidden md:flex items-center justify-between">
          {/* Track Info - Left Side */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-muted to-muted-foreground/20 rounded-lg flex items-center justify-center overflow-hidden">
                {currentSong.artist && (
                  <span className="text-xs font-medium text-muted-foreground/70 truncate w-20">
                    {currentSong.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 animate-pulse rounded-lg" />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <Link
                to="/albums/$id"
                params={{ id: currentSong.albumId }}
                className="font-semibold text-sm truncate block hover:text-primary transition-colors"
                title={currentSong.name || currentSong.title || 'Unknown Song'}
              >
                {currentSong.name || currentSong.title || 'Unknown Song'}
              </Link>
              <p className="text-xs text-muted-foreground truncate">
                <span className="hover:text-primary transition-colors cursor-pointer" title={currentSong.artist || 'Unknown Artist'}>
                  {currentSong.artist || 'Unknown Artist'}
                </span>
                {currentSong.album && (
                  <>
                    {' • '}
                    <Link
                      to="/albums/$id"
                      params={{ id: currentSong.albumId }}
                      className="hover:text-primary transition-colors"
                    >
                      {currentSong.album}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 w-9 rounded-full ${isLiked ? 'text-red-500' : ''} hover:bg-accent/20`}
              onClick={handleToggleLike}
              disabled={likeMutation.isPending}
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
            >
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
          </div>

          {/* Controls - Center */}
          <div className="flex items-center space-x-3 px-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 rounded-full hover:bg-accent/20 transition-colors"
              onClick={previousSong}
              aria-label="Previous song"
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 rounded-full transition-all duration-200 ${isPlaying ? 'bg-primary hover:bg-primary/90' : 'bg-accent hover:bg-accent/80'}`}
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 rounded-full hover:bg-accent/20 transition-colors"
              onClick={nextSong}
              aria-label="Next song"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress & Volume - Right Side */}
          <div className="flex items-center space-x-4">
            {/* Progress Bar */}
            <div className="flex flex-col space-y-1 min-w-[180px]">
              <div className="flex justify-between text-xs font-mono text-muted-foreground px-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  value={currentTime}
                  max={duration || 0}
                  step={0.1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                  onInput={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                  className="w-full h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer relative z-10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:h-3.5
                    [&::-webkit-slider-thumb]:w-3.5
                    [&::-webkit-slider-thumb]:bg-primary
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:shadow-md
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:h-3.5
                    [&::-moz-range-thumb]:w-3.5
                    [&::-moz-range-thumb]:bg-primary
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0
                    [&::-moz-range-thumb]:cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--primary) ${(currentTime / (duration || 1)) * 100}%, var(--muted) ${(currentTime / (duration || 1)) * 100}%)`,
                  }}
                  aria-label="Seek position"
                  aria-valuemin={0}
                  aria-valuemax={duration || 0}
                  aria-valuenow={Math.round(currentTime)}
                  aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                />
              </div>
            </div>

            {/* Volume Control */}
            <div className="flex items-center space-x-2 pr-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-11 p-0 hover:bg-accent/20"
                onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}
                aria-label={volume > 0 ? 'Mute' : 'Unmute'}
              >
                {volume > 0 ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>
              <input
                type="range"
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeVolume(Number(e.target.value))}
                onInput={(e: React.ChangeEvent<HTMLInputElement>) => changeVolume(Number(e.target.value))}
                className="w-20 h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:w-3.5
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:h-3.5
                  [&::-moz-range-thumb]:w-3.5
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${volume * 100}%, var(--muted) ${volume * 100}%)`,
                }}
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(volume * 100)}
              />
            </div>

            {/* AI DJ Toggle */}
            <div className="pl-4 border-l border-border/50">
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