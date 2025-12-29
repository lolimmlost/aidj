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

// Re-export Song type from centralized location for backwards compatibility
export type { Song } from '@/lib/types/song';


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
  console.log('🎵 AudioPlayer component rendering');

  const audioRef = useRef<HTMLAudioElement>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null); // For preloading next song
  const preloadedSongIdRef = useRef<string | null>(null); // Track what's preloaded
  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we were playing before an iOS interruption (notification, call, etc.)
  const wasPlayingBeforeInterruptionRef = useRef<boolean>(false);
  const isUserInitiatedPauseRef = useRef<boolean>(false);
  // Track if we should auto-play the next song (set to true when current song ends)
  const shouldAutoPlayRef = useRef<boolean>(false);

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

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (audio) {
      setError(null);
      if (isPlaying) {
        // Mark this as a user-initiated pause so we don't auto-resume
        isUserInitiatedPauseRef.current = true;
        audio.pause();
        setIsPlaying(false);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      } else {
        isUserInitiatedPauseRef.current = false;
        setIsLoading(true);
        try {
          // Check if audio source needs to be reloaded (network error recovery)
          if (audio.error || audio.networkState === 3) { // NETWORK_NO_SOURCE
            console.log('🔄 Reloading audio source after network error...');
            // Force fresh URL with cache buster
            if (currentSong?.url) {
              audio.src = '';
              audio.src = currentSong.url + '?t=' + Date.now();
              console.log('🔄 Refreshed audio URL with cache buster');
            }
            // Wait for canplay event after reload
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Load timeout')), 10000);
              const onCanPlay = () => {
                clearTimeout(timeout);
                audio.removeEventListener('error', onError);
                resolve();
              };
              const onError = () => {
                clearTimeout(timeout);
                audio.removeEventListener('canplay', onCanPlay);
                reject(new Error('Load failed'));
              };
              audio.addEventListener('canplay', onCanPlay, { once: true });
              audio.addEventListener('error', onError, { once: true });
              audio.load();
            });
          }
          await audio.play();
          setIsPlaying(true);
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        } catch (e) {
          console.error('Play failed, attempting fresh reload:', e);
          // Try reloading with fresh URL and playing again
          try {
            if (currentSong?.url) {
              audio.src = '';
              audio.src = currentSong.url + '?t=' + Date.now();
            }
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Retry load timeout')), 10000);
              const onCanPlay = () => {
                clearTimeout(timeout);
                audio.removeEventListener('error', onError);
                resolve();
              };
              const onError = () => {
                clearTimeout(timeout);
                audio.removeEventListener('canplay', onCanPlay);
                reject(new Error('Retry load failed'));
              };
              audio.addEventListener('canplay', onCanPlay, { once: true });
              audio.addEventListener('error', onError, { once: true });
              audio.load();
            });
            await audio.play();
            setIsPlaying(true);
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'playing';
            }
          } catch (retryError) {
            setError('Failed to play - check network connection');
            console.error('Retry also failed:', retryError);
          }
        } finally {
          setIsLoading(false);
        }
      }
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

        // iOS FIX: Preload next song when 10 seconds from end (or 90% through)
        // This ensures the next song is ready to play instantly when current ends
        const timeRemaining = audio.duration - audio.currentTime;
        if (timeRemaining <= 10 || playedPercentage >= 90) {
          const state = useAudioStore.getState();
          const nextIndex = (state.currentSongIndex + 1) % state.playlist.length;
          const nextTrack = state.playlist[nextIndex];

          // Only preload if we haven't already preloaded this song
          if (nextTrack && preloadedSongIdRef.current !== nextTrack.id) {
            console.log('🔄 Preloading next song:', nextTrack.name || nextTrack.title);
            preloadedSongIdRef.current = nextTrack.id;

            // Create or reuse preload audio element
            if (!preloadAudioRef.current) {
              preloadAudioRef.current = new Audio();
              preloadAudioRef.current.preload = 'auto';
            }
            preloadAudioRef.current.src = nextTrack.url;
            preloadAudioRef.current.load();
          }
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
    const onStalled = () => {
      console.log('🔴 Audio stalled - possible network issue');
      setIsLoading(true);
    };
    const onError = (e: Event) => {
      const audio = e.target as HTMLAudioElement;
      const errorMessage = audio.error?.message || 'Unknown error';
      setError(`Audio error: ${errorMessage}`);
      setIsLoading(false);
      console.error('Audio error:', audio.error);
      // Sync Media Session to paused state on error
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      // If network error, update state to allow recovery
      if (audio.error?.code === MediaError.MEDIA_ERR_NETWORK) {
        console.log('🔴 Network error detected - source may need reload on play');
        setIsPlaying(false);
      }
    };
    const onEnded = () => {
      console.log('🔴 SONG ENDED EVENT FIRED - advancing to next song');
      // Mark as user-initiated to prevent iOS interruption handler from interfering
      isUserInitiatedPauseRef.current = true;

      // Capture the ended song's info BEFORE we change anything
      const endedSongId = currentSongIdRef.current;
      const endedSong = currentSong;
      const endedDuration = audio.duration;
      const endedPlayTime = audio.currentTime;

      // iOS FIX: Start playback of next song IMMEDIATELY and SYNCHRONOUSLY
      // iOS requires play() to be called in the same execution context as a user gesture
      // or within an active audio session. By calling play() here before any state updates,
      // we maintain the audio session continuity from the ended event.
      const state = useAudioStore.getState();
      // Match store's nextSong logic exactly (playlist is already shuffled if shuffle is on)
      const nextIndex = (state.currentSongIndex + 1) % state.playlist.length;
      const nextTrack = state.playlist[nextIndex];

      if (nextTrack && state.playlist.length > 0) {
        console.log('🔴 iOS FIX: Loading next song SYNCHRONOUSLY:', nextTrack.name || nextTrack.title);
        // Change src and play IMMEDIATELY - this keeps play() in same sync context
        audio.src = nextTrack.url;
        // Reset scrobble tracking for new song
        hasScrobbledRef.current = false;
        scrobbleThresholdReachedRef.current = false;
        currentSongIdRef.current = nextTrack.id;

        audio.play()
          .then(() => {
            console.log('🟢 iOS: Immediate play SUCCESS');
            isUserInitiatedPauseRef.current = false;
          })
          .catch((e) => {
            console.error('🔴 iOS: Immediate play FAILED:', e);
            // Fall back to letting the effect handle it
            shouldAutoPlayRef.current = true;
          });
      }

      // Scrobble the song that just ended (async, after starting next song)
      if (endedSongId && endedSong) {
        console.log(`🎵 Song ended, scrobbling: ${endedSongId}`);
        scrobbleSong(endedSongId, true).catch(err =>
          console.error('Failed to scrobble on song end:', err)
        );

        // Record in listening history for compound scoring (Phase 4)
        fetch('/api/listening-history/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: endedSongId,
            artist: endedSong.artist || 'Unknown',
            title: endedSong.name || endedSong.title || 'Unknown',
            album: endedSong.album,
            genre: endedSong.genre,
            duration: endedDuration,
            playDuration: endedPlayTime,
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

      // Now update state (this syncs the UI, playback already started above)
      console.log('🔴 Calling nextSong() to sync state');
      nextSong();
      setIsPlaying(true);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    audio.volume = volume;

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, setIsPlaying, nextSong, currentSong]);

  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const currentSong = playlist[currentSongIndex];
      const audio = audioRef.current;

      if (audio && currentSong) {
        // Only load if the song ID has actually changed
        if (currentSongIdRef.current !== currentSong.id) {
          console.log('🔵 Song changed effect - loading new song:', currentSong.name || currentSong.title, 'prevId:', currentSongIdRef.current, 'newId:', currentSong.id);
          // Set up one-time canplay listener to handle autoplay
          const handleCanPlay = () => {
            console.log('🟢 handleCanPlay fired - isPlaying:', isPlaying, 'shouldAutoPlayRef:', shouldAutoPlayRef.current);
            setIsLoading(false);
            setError(null);
            // Auto-play if: currently playing OR we should auto-play from song end
            if (isPlaying || shouldAutoPlayRef.current) {
              console.log('🟢 Auto-playing next song...');
              shouldAutoPlayRef.current = false; // Reset the flag
              // NOTE: Don't reset isUserInitiatedPauseRef here - let handlePlaying do it
              // This prevents the iOS pause handler from interfering if play() fails
              audio.play()
                .then(() => {
                  console.log('🟢 Auto-play SUCCESS');
                  isUserInitiatedPauseRef.current = false; // Reset now that playback started
                })
                .catch((e) => {
                  setError('Auto-play failed');
                  console.error('🔴 Auto-play FAILED:', e);
                });
            } else {
              console.log('🟡 NOT auto-playing - isPlaying is false and shouldAutoPlayRef is false');
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

  // iOS audio interruption handling (notifications, calls, Siri, etc.)
  // Scenarios:
  // 1. Screen unlocked, notification comes in → pause briefly → should resume
  // 2. Screen locked, music playing in background, notification comes in → should resume
  // 3. User locks screen or switches apps → should NOT auto-resume when they return
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let interruptionTimestamp: number | null = null;
    let wasHiddenBeforePause = document.visibilityState === 'hidden';

    // Handle system-initiated pause (iOS notification, phone call, etc.)
    const handlePause = () => {
      // Only track if we were playing and this wasn't user-initiated
      if (isPlaying && !isUserInitiatedPauseRef.current) {
        // Record when the interruption happened and visibility state
        interruptionTimestamp = Date.now();
        wasHiddenBeforePause = document.visibilityState === 'hidden';
        wasPlayingBeforeInterruptionRef.current = true;
        console.log(`🔔 Audio paused (wasHidden: ${wasHiddenBeforePause})`);

        // If we were already in background (screen locked), try to resume after a short delay
        // This handles notifications while screen is locked
        // iOS may need multiple attempts as the audio session recovers
        if (wasHiddenBeforePause) {
          const attemptResume = (attempt: number, maxAttempts: number, delay: number) => {
            setTimeout(() => {
              if (wasPlayingBeforeInterruptionRef.current && audio.paused) {
                console.log(`🔔 Background resume attempt ${attempt}/${maxAttempts}...`);
                audio.play()
                  .then(() => {
                    console.log('🔔 Background playback resumed');
                    wasPlayingBeforeInterruptionRef.current = false;
                    interruptionTimestamp = null;
                    // Ensure Media Session shows playing state
                    if ('mediaSession' in navigator) {
                      navigator.mediaSession.playbackState = 'playing';
                    }
                  })
                  .catch((e) => {
                    console.log(`🔔 Background resume attempt ${attempt} failed:`, e.message);
                    // Retry with increasing delay
                    if (attempt < maxAttempts) {
                      attemptResume(attempt + 1, maxAttempts, delay * 1.5);
                    } else {
                      console.log('🔔 All background resume attempts failed, waiting for user interaction');
                      // Ensure Media Session shows paused state so play button works
                      if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused';
                      }
                    }
                  });
              }
            }, delay);
          };
          // Start with 500ms delay, retry up to 3 times
          attemptResume(1, 3, 500);
        }
      }
    };

    // Handle visibility change - distinguish between brief interruptions and intentional backgrounding
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page going hidden - only clear flag if there's no active interruption
        // (i.e., user is intentionally leaving, not a notification while playing)
        if (wasPlayingBeforeInterruptionRef.current && interruptionTimestamp) {
          const elapsed = Date.now() - interruptionTimestamp;
          // If the pause happened more than 1 second ago, user probably locked screen intentionally
          if (elapsed > 1000) {
            console.log('🔔 Page hidden after pause - user left intentionally');
            wasPlayingBeforeInterruptionRef.current = false;
            interruptionTimestamp = null;
          }
          // Otherwise keep the flag - this might be a notification causing both pause and hide
        }
      } else if (document.visibilityState === 'visible') {
        // Page becoming visible - try to resume if we have a pending interruption
        if (wasPlayingBeforeInterruptionRef.current && interruptionTimestamp) {
          const elapsed = Date.now() - interruptionTimestamp;
          // Resume if interruption was within last 30 seconds (generous for lock screen scenarios)
          if (elapsed < 30000) {
            console.log(`🔔 Page visible, interruption ${elapsed}ms ago, attempting resume...`);
            setTimeout(() => {
              if (audio && wasPlayingBeforeInterruptionRef.current && audio.paused) {
                audio.play()
                  .then(() => {
                    console.log('🔔 Playback resumed successfully');
                    wasPlayingBeforeInterruptionRef.current = false;
                    interruptionTimestamp = null;
                    setIsPlaying(true);
                    // Ensure Media Session shows playing state
                    if ('mediaSession' in navigator) {
                      navigator.mediaSession.playbackState = 'playing';
                    }
                  })
                  .catch((e) => {
                    console.log('🔔 Resume failed, user can tap play on lock screen:', e.message);
                    // Clear the flag - user will need to manually press play
                    wasPlayingBeforeInterruptionRef.current = false;
                    interruptionTimestamp = null;
                    // Ensure Media Session shows paused state so play button works on lock screen
                    if ('mediaSession' in navigator) {
                      navigator.mediaSession.playbackState = 'paused';
                    }
                  });
              }
            }, 100);
          } else {
            console.log(`🔔 Interruption too old (${elapsed}ms), not auto-resuming`);
            wasPlayingBeforeInterruptionRef.current = false;
            interruptionTimestamp = null;
          }
        }
      }
    };

    // iOS-specific: handle the 'playing' event which fires when playback actually starts
    const handlePlaying = () => {
      wasPlayingBeforeInterruptionRef.current = false;
      isUserInitiatedPauseRef.current = false;
      interruptionTimestamp = null;
    };

    audio.addEventListener('pause', handlePause);
    audio.addEventListener('playing', handlePlaying);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('playing', handlePlaying);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, setIsPlaying]);

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

  // Media Session API for lock screen / notification controls
  // iOS FIX: Action handlers MUST be set inside the 'playing' event, not during setup
  // See: https://stackoverflow.com/questions/73993512/web-audio-player-ios-next-song-previous-song-buttons-are-not-in-control-cent/78001443#78001443
  useEffect(() => {
    console.log('🎛️ Media Session effect running, currentSong:', currentSong?.name);

    if (!('mediaSession' in navigator)) {
      console.log('🎛️ Media Session API not available in this browser');
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      console.log('🎛️ Audio ref not ready yet');
      return;
    }

    console.log('🎛️ Audio ref ready, setting up Media Session');

    const setupMediaSession = () => {
      if (!currentSong) return;

      console.log('🎛️ Setting up Media Session for:', currentSong.name || currentSong.title);

      // Build artwork array - iOS needs this for full control center display
      const artwork: MediaImage[] = [];
      if (currentSong.albumId) {
        // Navidrome cover art endpoint
        const coverUrl = `/api/navidrome/rest/getCoverArt?id=${currentSong.albumId}&size=512`;
        artwork.push(
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
          { src: coverUrl.replace('size=512', 'size=256'), sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl.replace('size=512', 'size=128'), sizes: '128x128', type: 'image/jpeg' },
        );
      }

      // Set metadata for lock screen display
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.name || currentSong.title || 'Unknown Song',
        artist: currentSong.artist || 'Unknown Artist',
        album: currentSong.album || '',
        artwork: artwork.length > 0 ? artwork : undefined,
      });

      // Update position state for iOS
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

      // iOS FIX: Set play/pause handlers during setup (not just in 'playing' event)
      // This ensures lock screen play button works even after interruption
      // Skip buttons are set in 'playing' event per iOS requirements
      try {
        navigator.mediaSession.setActionHandler('play', async () => {
          console.log('🎛️ Media Session: play (from setup)');
          try {
            // Check if audio source needs to be reloaded (network error recovery)
            if (audio.error || audio.networkState === 3) { // NETWORK_NO_SOURCE
              console.log('🎛️ Reloading audio source after error...');
              // Force reload with fresh URL by setting src again
              if (currentSong?.url) {
                const currentSrc = audio.src;
                audio.src = ''; // Clear source
                audio.src = currentSong.url + '?t=' + Date.now(); // Add cache-busting param
                console.log('🎛️ Refreshed audio URL with cache buster');
              }
              audio.load();
            }
            await audio.play();
            setIsPlaying(true);
            navigator.mediaSession.playbackState = 'playing';
          } catch (e) {
            console.error('🎛️ Media Session play failed:', e);
            // Try reloading with fresh URL and playing again
            try {
              console.log('🎛️ Attempting fresh source reload and retry...');
              if (currentSong?.url) {
                audio.src = ''; // Clear source
                audio.src = currentSong.url + '?t=' + Date.now(); // Force fresh request
              }
              audio.load();
              await audio.play();
              setIsPlaying(true);
              navigator.mediaSession.playbackState = 'playing';
            } catch (retryError) {
              console.error('🎛️ Retry also failed:', retryError);
              navigator.mediaSession.playbackState = 'paused';
              setError('Failed to play - try refreshing the page');
            }
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause (from setup)');
          isUserInitiatedPauseRef.current = true;
          audio.pause();
          setIsPlaying(false);
          navigator.mediaSession.playbackState = 'paused';
        });

        // seekto is OK during setup - it doesn't conflict with track buttons
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && isFinite(details.seekTime)) {
            console.log('🎛️ Media Session: seekto', details.seekTime);
            audio.currentTime = details.seekTime;
          }
        });

        console.log('🎛️ Media Session play/pause handlers registered (in setup)');
      } catch (e) {
        console.error('🎛️ Failed to set media session handlers in setup:', e);
      }
    };

    // iOS FIX: Set action handlers inside the 'playing' event
    // Key insights:
    // 1. Do NOT set seekbackward/seekforward handlers - iOS shows seek OR track buttons, not both
    // 2. Set handlers AFTER audio starts playing, not during component mount
    // 3. Call audio.play() after skip to ensure playback continues
    const handlePlaying = () => {
      console.log('🎛️ Audio playing - setting up Media Session handlers for iOS');

      setupMediaSession();
      navigator.mediaSession.playbackState = 'playing';

      try {
        navigator.mediaSession.setActionHandler('play', async () => {
          console.log('🎛️ Media Session: play');
          try {
            // Check if audio source needs to be reloaded (network error recovery)
            if (audio.error || audio.networkState === 3) {
              console.log('🎛️ Reloading audio source after error...');
              // Force reload with fresh URL
              if (currentSong?.url) {
                audio.src = '';
                audio.src = currentSong.url + '?t=' + Date.now();
                console.log('🎛️ Refreshed audio URL with cache buster');
              }
              audio.load();
            }
            await audio.play();
            setIsPlaying(true);
            navigator.mediaSession.playbackState = 'playing';
          } catch (e) {
            console.error('🎛️ Media Session play failed, retrying with fresh reload:', e);
            try {
              if (currentSong?.url) {
                audio.src = '';
                audio.src = currentSong.url + '?t=' + Date.now();
              }
              audio.load();
              await audio.play();
              setIsPlaying(true);
              navigator.mediaSession.playbackState = 'playing';
            } catch (retryError) {
              console.error('🎛️ Retry failed:', retryError);
              navigator.mediaSession.playbackState = 'paused';
              setError('Failed to play - try refreshing the page');
            }
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause');
          isUserInitiatedPauseRef.current = true;
          audio.pause();
          setIsPlaying(false);
          navigator.mediaSession.playbackState = 'paused';
        });

        // iOS: previoustrack and nexttrack - these will show as skip buttons
        // Do NOT set seekbackward/seekforward or these won't appear!
        // IMPORTANT: Must load and play SYNCHRONOUSLY like onEnded handler
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🎛️ Media Session: previoustrack');
          const state = useAudioStore.getState();
          const prevIndex = state.currentSongIndex > 0
            ? state.currentSongIndex - 1
            : state.playlist.length - 1;
          const prevTrack = state.playlist[prevIndex];

          if (prevTrack) {
            // Load and play IMMEDIATELY - same pattern as onEnded
            audio.src = prevTrack.url;
            hasScrobbledRef.current = false;
            scrobbleThresholdReachedRef.current = false;
            currentSongIdRef.current = prevTrack.id;
            audio.play().catch(e => console.error('🎛️ Previous track play failed:', e));
          }
          // Sync state after starting playback
          previousSong();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🎛️ Media Session: nexttrack');
          const state = useAudioStore.getState();
          // Match store's nextSong logic exactly (playlist is already shuffled if shuffle is on)
          const nextIndex = (state.currentSongIndex + 1) % state.playlist.length;
          const nextTrack = state.playlist[nextIndex];

          if (nextTrack) {
            // Load and play IMMEDIATELY - same pattern as onEnded
            audio.src = nextTrack.url;
            hasScrobbledRef.current = false;
            scrobbleThresholdReachedRef.current = false;
            currentSongIdRef.current = nextTrack.id;
            audio.play().catch(e => console.error('🎛️ Next track play failed:', e));
          }
          // Sync state after starting playback
          nextSong();
        });

        // seekto is OK - it doesn't conflict with track buttons
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && isFinite(details.seekTime)) {
            console.log('🎛️ Media Session: seekto', details.seekTime);
            audio.currentTime = details.seekTime;
          }
        });

        console.log('🎛️ Media Session handlers registered (inside playing event)');
      } catch (e) {
        console.error('🎛️ Failed to set media session handlers:', e);
      }
    };

    const handlePause = () => {
      navigator.mediaSession.playbackState = 'paused';
    };

    const handleLoadedMetadata = () => {
      setupMediaSession();
    };

    // Update position periodically for lock screen progress
    const handleTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration) && isFinite(audio.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (e) {
          // Ignore position state errors
        }
      }
    };

    // Use 'playing' event instead of 'play' - this fires when playback actually starts
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    // Initial setup if song is already loaded and playing
    if (currentSong && !audio.paused) {
      handlePlaying();
    } else if (currentSong) {
      setupMediaSession();
    }

    return () => {
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
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
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0"
                  onClick={handleToggleLike}
                  disabled={isLikePending}
                  aria-label={isLiked ? 'Unlike song' : 'Like song'}
                >
                  <Heart className={cn("h-4 w-4", isLiked && "fill-current text-red-500")} />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 active:scale-95 transition-transform"
                  onClick={previousSong}
                  aria-label="Previous song"
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="h-11 w-11 p-0 rounded-full mx-0.5"
                  onClick={togglePlayPause}
                  disabled={isLoading}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
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
                  className="h-10 w-10 p-0 active:scale-95 transition-transform"
                  onClick={nextSong}
                  aria-label="Next song"
                >
                  <SkipForward className="h-5 w-5" />
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

      {/* Hidden Audio Element - iOS-optimized attributes */}
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline // Required for iOS to not go fullscreen
        webkit-playsinline="true" // Legacy iOS support
        x-webkit-airplay="allow" // Enable AirPlay on iOS
      />
    </div>
  );
}