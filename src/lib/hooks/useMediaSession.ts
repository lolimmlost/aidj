import { useRef, useEffect, useCallback } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { Song } from './useDualDeckAudio';

export interface UseMediaSessionOptions {
  currentSong: Song | null;
  getActiveDeck: () => HTMLAudioElement | null;
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
  setGainImmediate?: (deck: 'A' | 'B', value: number) => void;
  resumeContext?: () => Promise<boolean>;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

/**
 * Manages iOS lock screen / notification controls via Media Session API.
 *
 * Key requirements for iOS:
 * 1. Set action handlers INSIDE the 'playing' event, NOT on component mount
 * 2. Do NOT set seekbackward/seekforward - iOS shows seek OR track buttons, not both
 * 3. Update position state periodically via setPositionState()
 * 4. Set metadata with artwork for lock screen display
 *
 * Features:
 * - Debounce mechanism for Bluetooth disconnect/reconnect rapid events
 * - Registers handlers on BOTH decks for crossfade support
 * - Guards against inactive deck events during crossfade
 */
export function useMediaSession({
  currentSong,
  getActiveDeck,
  deckARef,
  deckBRef,
  activeDeckRef,
  crossfadeInProgressRef,
  setGainImmediate,
  resumeContext,
  onPreviousTrack,
  onNextTrack,
}: UseMediaSessionOptions): void {
  // Debounce state refs (survive remounts during Bluetooth changes)
  const mediaSessionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaSessionPendingActionRef = useRef<'play' | 'pause' | null>(null);
  const mediaSessionLastExecutedRef = useRef<{ action: 'play' | 'pause'; time: number } | null>(null);

  const { setIsPlaying, markUserPause } = useAudioStore();

  // Debounce mechanism for Bluetooth disconnect/reconnect rapid events
  const DEBOUNCE_MS = 300;
  const COOLDOWN_MS = 500;
  const GLITCH_WINDOW_MS = 2000;

  const executeMediaAction = useCallback((action: 'play' | 'pause') => {
    const activeDeck = getActiveDeck();
    if (!activeDeck) return;

    // Cooldown check: prevent rapid toggling
    const lastExec = mediaSessionLastExecutedRef.current;
    if (lastExec && lastExec.action !== action) {
      const timeSinceLastExec = Date.now() - lastExec.time;
      if (timeSinceLastExec < COOLDOWN_MS) {
        console.log(`🎛️ Media Session: cooldown active (${timeSinceLastExec}ms since ${lastExec.action})`);
        const audioIsPlaying = !activeDeck.paused;
        if ((action === 'play' && audioIsPlaying) || (action === 'pause' && !audioIsPlaying)) {
          console.log(`🎛️ Media Session: audio already ${audioIsPlaying ? 'playing' : 'paused'} - syncing store only`);
          setIsPlaying(audioIsPlaying);
          mediaSessionLastExecutedRef.current = { action, time: Date.now() };
          return;
        }
      }
    }

    // Reality check: only block spurious pause events during rapid toggling
    const storeIsPlaying = useAudioStore.getState().isPlaying;
    const audioIsPlaying = !activeDeck.paused;
    const lastExecTime = mediaSessionLastExecutedRef.current?.time || 0;
    const timeSinceLastAction = Date.now() - lastExecTime;

    if (action === 'pause' && audioIsPlaying && storeIsPlaying) {
      if (timeSinceLastAction < GLITCH_WINDOW_MS && lastExecTime > 0) {
        console.log(`🎛️ Media Session: ignoring pause - within glitch window`);
        return;
      }

      console.log(`🎛️ Media Session: accepting pause - user-initiated`);
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
      markUserPause();
      setIsPlaying(false);
    }

    mediaSessionLastExecutedRef.current = { action, time: Date.now() };
  }, [getActiveDeck, setIsPlaying, markUserPause]);

  const debouncedMediaAction = useCallback((action: 'play' | 'pause') => {
    if (mediaSessionPendingActionRef.current === action) {
      console.log(`🎛️ Media Session: ignoring duplicate ${action}`);
      return;
    }

    mediaSessionPendingActionRef.current = action;

    if (mediaSessionDebounceRef.current) {
      clearTimeout(mediaSessionDebounceRef.current);
    }

    mediaSessionDebounceRef.current = setTimeout(() => {
      if (mediaSessionPendingActionRef.current) {
        executeMediaAction(mediaSessionPendingActionRef.current);
        mediaSessionPendingActionRef.current = null;
      }
      mediaSessionDebounceRef.current = null;
    }, DEBOUNCE_MS);
  }, [executeMediaAction]);

  // Media Session effect
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB || !currentSong) return;

    // Helper: get a usable duration value. iOS streaming via range requests
    // often reports audio.duration as Infinity. Fall back to the store's
    // duration (set from the song metadata or a previous valid read).
    const getUsableDuration = (deck: HTMLAudioElement): number => {
      if (deck.duration && isFinite(deck.duration) && deck.duration > 0) {
        return deck.duration;
      }
      const storeDuration = useAudioStore.getState().duration;
      if (storeDuration && isFinite(storeDuration) && storeDuration > 0) {
        return storeDuration;
      }
      return 0;
    };

    const setupMediaSession = () => {
      // Read current song from store to avoid stale closure during rapid skips.
      // The effect re-runs on currentSong change, but rapid next presses can
      // fire 'playing' events before the effect re-runs with the new song.
      const storeState = useAudioStore.getState();
      const liveSong = storeState.playlist[storeState.currentSongIndex] || currentSong;
      const song = liveSong as Song & { albumId?: string; album?: string };

      // Build artwork array for lock screen display
      const artwork: MediaImage[] = [];
      if (song.albumId) {
        const coverUrl = `/api/navidrome/rest/getCoverArt?id=${song.albumId}&size=512`;
        artwork.push(
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
          { src: coverUrl.replace('size=512', 'size=256'), sizes: '256x256', type: 'image/jpeg' },
        );
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name || song.title || 'Unknown Song',
        artist: song.artist || 'Unknown Artist',
        album: song.album || '',
        artwork: artwork.length > 0 ? artwork : undefined,
      });

      // Update position state from active deck
      const activeDeck = getActiveDeck();
      if (activeDeck) {
        const duration = getUsableDuration(activeDeck);
        if (duration > 0 && isFinite(activeDeck.currentTime)) {
          try {
            navigator.mediaSession.setPositionState({
              duration,
              playbackRate: activeDeck.playbackRate,
              position: Math.min(activeDeck.currentTime, duration),
            });
          } catch {
            // Position state not supported
          }
        }
      }
    };

    // iOS FIX: Set action handlers inside 'playing' event
    const handlePlaying = (event?: Event) => {
      const playingDeck = event?.target as HTMLAudioElement | undefined ?? getActiveDeck();
      if (!playingDeck) return;

      const isActiveDeck = playingDeck === (activeDeckRef.current === 'A' ? deckA : deckB);

      // Only set up Media Session for the ACTIVE deck
      if (!isActiveDeck && !crossfadeInProgressRef.current) {
        console.log(`🎛️ Media Session: Ignoring playing event from inactive deck - muting via GainNode`);
        // Mute via GainNode instead of element.volume (which is locked at 1.0)
        const inactiveDeckLabel = activeDeckRef.current === 'A' ? 'B' : 'A';
        setGainImmediate?.(inactiveDeckLabel, 0);
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = 'playing';
        }
        return;
      }

      if (!isActiveDeck && crossfadeInProgressRef.current) {
        console.log(`🎛️ Media Session: Inactive deck playing during crossfade`);
        return;
      }

      console.log('🎛️ Media Session: Setting up handlers');
      setupMediaSession();
      navigator.mediaSession.playbackState = 'playing';

      // Sync store state when audio starts playing
      if (!useAudioStore.getState().isPlaying) {
        console.log('🎛️ Media Session: Syncing store isPlaying=true');
        setIsPlaying(true);
      }

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('🎛️ Media Session: play requested');
          // Resume AudioContext — this handler runs with user gesture context
          // from the lock screen, so iOS will allow ctx.resume() here.
          resumeContext?.();
          debouncedMediaAction('play');
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause requested');
          debouncedMediaAction('pause');
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🎛️ Media Session: previoustrack');
          resumeContext?.();
          onPreviousTrack();
          setTimeout(() => {
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.play().catch(console.error);
          }, 100);
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🎛️ Media Session: nexttrack');
          resumeContext?.();
          onNextTrack();
          setTimeout(() => {
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.play().catch(console.error);
          }, 100);
        });

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

    const handlePause = (event: Event) => {
      if (crossfadeInProgressRef.current) return;
      const pausedDeck = event.target as HTMLAudioElement;
      const currentActive = getActiveDeck();
      if (pausedDeck !== currentActive) return;
      // iOS fires a spurious pause event on visibility change even though
      // audio keeps playing. Delay slightly and re-check before telling
      // the lock screen we're paused, otherwise the controls show "paused"
      // and the duration/scrubber disappears.
      setTimeout(() => {
        const deck = getActiveDeck();
        if (deck && !deck.paused) {
          // Audio is actually still playing — don't mark as paused
          navigator.mediaSession.playbackState = 'playing';
          return;
        }
        navigator.mediaSession.playbackState = 'paused';
      }, 100);
    };

    const handleTimeUpdate = () => {
      const activeDeck = getActiveDeck();
      if (!activeDeck || !isFinite(activeDeck.currentTime)) return;
      const duration = getUsableDuration(activeDeck);
      if (duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: activeDeck.playbackRate,
            position: Math.min(activeDeck.currentTime, duration),
          });
        } catch {
          // Ignore
        }
      }
    };

    const handleLoadedMetadata = (event: Event) => {
      const deck = event.target as HTMLAudioElement;
      const currentActive = getActiveDeck();
      if (deck !== currentActive) return;
      setupMediaSession();
    };

    // Re-push position state and playback status on visibility return.
    // iOS stops firing timeupdate while backgrounded, so the lock screen
    // scrubber/duration goes stale. On return, force an update.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const deck = getActiveDeck();
      if (!deck) return;

      // Re-push position state so lock screen scrubber catches up
      const duration = getUsableDuration(deck);
      if (duration > 0 && isFinite(deck.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: deck.playbackRate,
            position: Math.min(deck.currentTime, duration),
          });
        } catch {
          // Ignore
        }
      }

      // Correct playback state in case iOS set it to paused spuriously
      if (!deck.paused) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    // Register handlers on BOTH decks
    [deckA, deckB].forEach(deck => {
      deck.addEventListener('playing', handlePlaying);
      deck.addEventListener('pause', handlePause);
      deck.addEventListener('loadedmetadata', handleLoadedMetadata);
      deck.addEventListener('timeupdate', handleTimeUpdate);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup if active deck is already playing
    const activeDeck = getActiveDeck();
    if (activeDeck && !activeDeck.paused) {
      handlePlaying();
    } else {
      setupMediaSession();
    }

    return () => {
      if (mediaSessionDebounceRef.current) {
        clearTimeout(mediaSessionDebounceRef.current);
        mediaSessionDebounceRef.current = null;
      }
      mediaSessionPendingActionRef.current = null;

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      [deckA, deckB].forEach(deck => {
        deck.removeEventListener('playing', handlePlaying);
        deck.removeEventListener('pause', handlePause);
        deck.removeEventListener('loadedmetadata', handleLoadedMetadata);
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
  }, [currentSong, setIsPlaying, onPreviousTrack, onNextTrack, getActiveDeck, debouncedMediaAction, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef, setGainImmediate, resumeContext]);
}
