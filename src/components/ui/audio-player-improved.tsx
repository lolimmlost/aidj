// Improved Audio Player Component
// Uses unified design system for better cohesion

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  AudioButton,
  AudioProgressBar,
  AudioVolumeControl,
  AudioSongInfo,
  AudioStatusBadge,
  AudioContainer
} from './audio-design-system';
import { SkipBack, SkipForward, Play, Pause, AlertCircle } from 'lucide-react';
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
  title?: string;
  albumId: string;
  album?: string;
  duration: number;
  track: number;
  url: string;
  artist?: string;
};

export function ImprovedAudioPlayer() {
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
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
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
      audio.src = song.url;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
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

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);

      if (audio.duration > 0 && currentSong) {
        const playedPercentage = (audio.currentTime / audio.duration) * 100;

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

  // Song loading logic
  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const currentSong = playlist[currentSongIndex];
      const audio = audioRef.current;

      if (audio && currentSong) {
        if (currentSongIdRef.current !== currentSong.id) {
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

          return () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', (e: Event) => {
              const audio = e.target as HTMLAudioElement;
              setError(`Audio error: ${audio.error?.message || 'Unknown error'}`);
              setIsLoading(false);
              console.error('Audio error:', audio.error);
            });

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

  // Play/pause state management
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

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
    <div role="region" aria-label="Audio Player">
      <AudioContainer variant="player">
      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
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
          <div className="flex items-center justify-between gap-4 flex-shrink-0" role="group" aria-label="Song information and playback controls">
            <div className="flex-1 min-w-0">
              <AudioSongInfo
                song={currentSong}
                isPlaying={isPlaying}
                isLiked={isLiked}
                onToggleLike={handleToggleLike}
                isPending={likeMutation.isPending}
                compact
              />
            </div>
            
            {/* Mobile Controls */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="min-h-[44px] min-w-[44px] flex items-center">
                <AddToPlaylistButton
                  songId={currentSong.id}
                  artistName={currentSong.artist || 'Unknown Artist'}
                  songTitle={currentSong.name}
                  size="icon"
                />
              </div>
              <div className="flex items-center gap-2">
                <AudioButton
                  variant="ghost"
                  size="sm"
                  onClick={previousSong}
                  aria-label="Previous song"
                  icon={<SkipBack className="h-4 w-4" />}
                />
                <AudioButton
                  variant={isPlaying ? "playing" : "primary"}
                  size="md"
                  onClick={togglePlayPause}
                  disabled={isLoading}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  icon={
                    isLoading ? (
                      <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
                    ) : isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-0.5" />
                    )
                  }
                />
                <AudioButton
                  variant="ghost"
                  size="sm"
                  onClick={nextSong}
                  aria-label="Next song"
                  icon={<SkipForward className="h-4 w-4" />}
                />
              </div>
            </div>
          </div>

          {/* Mobile Progress Bar */}
          <div role="group" aria-label="Playback progress">
            <AudioProgressBar
              value={currentTime}
              max={duration}
              onSeek={seek}
              currentTime={currentTime}
              duration={duration}
              compact
            />
          </div>

          {/* Mobile AI DJ Toggle */}
          <div className="pt-3 border-t border-border/50" role="group" aria-label="AI DJ controls">
            <AIDJToggle compact />
          </div>
        </div>

        {/* Desktop Layout (>= 768px) - Horizontal */}
        <div className="hidden md:flex items-center justify-between flex-shrink-0" role="group" aria-label="Desktop audio controls">
          {/* Track Info - Left Side */}
          <div className="flex-1 min-w-0 mr-4" role="group" aria-label="Song information">
            <AudioSongInfo
              song={currentSong}
              isPlaying={isPlaying}
              isLiked={isLiked}
              onToggleLike={handleToggleLike}
              isPending={likeMutation.isPending}
            />
          </div>

          {/* Controls - Center */}
          <div className="flex-shrink-0 px-4" role="group" aria-label="Playback controls">
            <div className="flex items-center gap-3">
              <AudioButton
                variant="ghost"
                size="md"
                onClick={previousSong}
                aria-label="Previous song"
                icon={<SkipBack className="h-5 w-5" />}
              />
              <AudioButton
                variant={isPlaying ? "playing" : "primary"}
                size="lg"
                onClick={togglePlayPause}
                disabled={isLoading}
                aria-label={isPlaying ? "Pause" : "Play"}
                icon={
                  isLoading ? (
                    <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
                  ) : isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6 ml-0.5" />
                  )
                }
              />
              <AudioButton
                variant="ghost"
                size="md"
                onClick={nextSong}
                aria-label="Next song"
                icon={<SkipForward className="h-5 w-5" />}
              />
            </div>
          </div>

          {/* Progress & Volume - Right Side */}
          <div className="flex items-center gap-4 flex-shrink-0" role="group" aria-label="Audio settings">
            <div className="flex items-center gap-2">
              <AudioStatusBadge status={isPlaying ? 'playing' : 'paused'} />
              <AudioProgressBar
                value={currentTime}
                max={duration}
                onSeek={seek}
                currentTime={currentTime}
                duration={duration}
              />
            </div>
            <AudioVolumeControl
              volume={volume}
              onVolumeChange={changeVolume}
              showLabel={false}
            />
            <div className="pl-3 border-l border-border/50 flex-shrink-0" role="group" aria-label="AI DJ controls">
              <AIDJToggle />
            </div>
          </div>
        </div>
      </div>
      </AudioContainer>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}