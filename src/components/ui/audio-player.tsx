import React, { useRef, useState, useEffect } from 'react';
import { Button } from './button';
import { Volume2, VolumeX, SkipBack, SkipForward, Play, Pause } from 'lucide-react';

export type Song = {
  id: string;
  name: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  artist?: string; // Optional for display
};

interface AudioPlayerProps {
  songs: Song[];
  initialSongId?: string;
  onSongChange?: (song: Song) => void;
}

export function AudioPlayer({ songs, initialSongId, onSongChange }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const loadSong = (song: Song) => {
    const audio = audioRef.current;
    if (audio) {
      audio.src = song.url; // Proxied stream URL from service
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      if (onSongChange) onSongChange(song);
    }
  };

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

  const previousSong = () => {
    const newIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    setCurrentSongIndex(newIndex);
    loadSong(songs[newIndex]);
  };

  const nextSong = () => {
    const newIndex = (currentSongIndex + 1) % songs.length;
    setCurrentSongIndex(newIndex);
    loadSong(songs[newIndex]);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onCanPlay = () => setIsBuffering(false);
    const onWaiting = () => setIsBuffering(true);
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
  }, [volume, currentSongIndex]); // Add currentSongIndex for reload

  useEffect(() => {
    if (songs.length === 0) return;

    let index = 0;
    if (initialSongId) {
      index = songs.findIndex(song => song.id === initialSongId);
      if (index === -1) index = 0;
    }
    setCurrentSongIndex(index);
  }, [songs, initialSongId]);

  useEffect(() => {
    if (songs.length > 0 && currentSongIndex >= 0 && currentSongIndex < songs.length) {
      loadSong(songs[currentSongIndex]);
    }
  }, [currentSongIndex]);

  const currentSong = songs[currentSongIndex];

  if (!currentSong) return null;

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!currentSong) return null;

  return (
    <div className="bg-background border-t p-4 flex flex-col space-y-4">
      {/* Current Track Info */}
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-gray-300 rounded" /> {/* Placeholder for artwork */}
        <div>
          <div className="font-semibold">{currentSong.name}</div>
          <div className="text-sm text-muted-foreground">{currentSong.artist || 'Unknown Artist'}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center space-x-4">
        <Button variant="ghost" size="icon" onClick={previousSong}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={togglePlayPause}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={nextSong}>
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center space-x-2">
        <span className="text-sm">{formatTime(currentTime)}</span>
        <input
          type="range"
          value={currentTime}
          max={duration || 0}
          onInput={(e: React.ChangeEvent<HTMLInputElement>) => seek(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          disabled={!isPlaying || isBuffering}
          style={{
            background: `linear-gradient(to right, #3b82f6 ${ (currentTime / (duration || 1)) * 100 }%, #d1d5db ${ (currentTime / (duration || 1)) * 100 }%)`,
          }}
        />
        <span className="text-sm">{formatTime(duration)}</span>
        {isBuffering && <span className="text-xs text-yellow-500">Buffering...</span>}
      </div>

      {/* Volume Control */}
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="icon" onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}>
          {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <input
          type="range"
          value={volume}
          max={1}
          step={0.1}
          onInput={(e: React.ChangeEvent<HTMLInputElement>) => changeVolume(Number(e.target.value))}
          className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${volume * 100}%, #d1d5db ${volume * 100}%)`,
          }}
        />
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}