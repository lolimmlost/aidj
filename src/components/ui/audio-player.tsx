import React, { useRef, useEffect, useCallback } from 'react';
import { Button } from './button';
import { Volume2, VolumeX, SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { AddToPlaylistButton } from '../playlists/AddToPlaylistButton';

export type Song = {
  id: string;
  name: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  artist?: string; // Optional for display
};

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
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

  const loadSong = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (audio) {
      audio.src = song.url; // Proxied stream URL from service
      audio.load();
      setCurrentTime(0);
      setDuration(0);
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
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onCanPlay = () => {};
    const onWaiting = () => {};
    const onEnded = () => {
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
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch((e) => console.error('Auto-play failed:', e));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      loadSong(playlist[currentSongIndex]);
    }
  }, [currentSongIndex, playlist, loadSong]);

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
                <h3 className="font-semibold text-sm truncate" title={currentSong.name}>
                  {currentSong.name}
                </h3>
                <p className="text-xs text-muted-foreground truncate" title={currentSong.artist || 'Unknown Artist'}>
                  {currentSong.artist || 'Unknown Artist'}
                </p>
              </div>
            </div>

            {/* Mobile Controls */}
            <div className="flex items-center space-x-1">
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
                onInput={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                className="w-full h-2 bg-muted/50 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:w-5
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${(currentTime / (duration || 1)) * 100}%, var(--muted) ${(currentTime / (duration || 1)) * 100}%)`,
                }}
                aria-label="Seek position"
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
              {formatTime(duration)}
            </span>
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
              <h3 className="font-semibold text-sm truncate" title={currentSong.name}>
                {currentSong.name}
              </h3>
              <p className="text-xs text-muted-foreground truncate" title={currentSong.artist || 'Unknown Artist'}>
                {currentSong.artist || 'Unknown Artist'}
              </p>
            </div>
          </div>

          {/* Controls - Center */}
          <div className="flex items-center space-x-3 px-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full hover:bg-accent/20 transition-colors"
              onClick={previousSong}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 rounded-full transition-all duration-200 ${isPlaying ? 'bg-primary hover:bg-primary/90' : 'bg-accent hover:bg-accent/80'}`}
              onClick={togglePlayPause}
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
              className="h-8 w-8 rounded-full hover:bg-accent/20 transition-colors"
              onClick={nextSong}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress & Volume - Right Side */}
          <div className="flex items-center space-x-4">
            {/* Progress Bar */}
            <div className="flex items-center space-x-2 min-w-[120px]">
              <span className="text-xs font-mono text-muted-foreground min-w-[3rem] text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 w-24 relative">
                <input
                  type="range"
                  value={currentTime}
                  max={duration || 0}
                  step={0.1}
                  onInput={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
                  className="w-full h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer relative z-10
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:bg-primary
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:shadow-md
                    [&::-moz-range-thumb]:h-3
                    [&::-moz-range-thumb]:w-3
                    [&::-moz-range-thumb]:bg-primary
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0
                    disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!isPlaying}
                  style={{
                    background: `linear-gradient(to right, var(--primary) ${ (currentTime / (duration || 1)) * 100 }%, var(--muted) ${ (currentTime / (duration || 1)) * 100 }%)`,
                  }}
                />
                {duration > 0 && (
                  <div
                    className="absolute inset-0 h-1.5 bg-primary/20 rounded-full -z-10"
                    style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }}
                  />
                )}
              </div>
              <span className="text-xs font-mono text-muted-foreground min-w-[3rem]">
                {formatTime(duration)}
              </span>
            </div>

            {/* Volume Control */}
            <div className="flex items-center space-x-2 pr-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-accent/20"
                onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}
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
                max={1}
                step={0.05}
                onInput={(e: React.ChangeEvent<HTMLInputElement>) => changeVolume(Number(e.target.value))}
                className="w-16 h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:h-3
                  [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${volume * 100}%, var(--muted) ${volume * 100}%)`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}