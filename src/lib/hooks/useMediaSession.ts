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
  isPrimingRef: React.MutableRefObject<boolean>;
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
  isPrimingRef,
  onPreviousTrack,
  onNextTrack,
}: UseMediaSessionOptions): void {
  // Debounce state refs (survive remounts during Bluetooth changes)
  const mediaSessionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaSessionPendingActionRef = useRef<'play' | 'pause' | null>(null);
  const mediaSessionLastExecutedRef = useRef<{ action: 'play' | 'pause'; time: number } | null>(null);

  const { setIsPlaying } = useAudioStore();

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
      setIsPlaying(false);
    }

    mediaSessionLastExecutedRef.current = { action, time: Date.now() };
  }, [getActiveDeck, setIsPlaying]);

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

      // Update position state from active deck
      const activeDeck = getActiveDeck();
      if (activeDeck && activeDeck.duration && isFinite(activeDeck.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: activeDeck.duration,
            playbackRate: activeDeck.playbackRate,
            position: activeDeck.currentTime,
          });
        } catch {
          // Position state not supported
        }
      }
    };

    // iOS FIX: Set action handlers inside 'playing' event
    const handlePlaying = (event?: Event) => {
      const playingDeck = event?.target as HTMLAudioElement | undefined ?? getActiveDeck();
      if (!playingDeck) return;

      const isActiveDeck = playingDeck === (activeDeckRef.current === 'A' ? deckA : deckB);

      // Only set up Media Session for the ACTIVE deck
      if (!isActiveDeck && !crossfadeInProgressRef.current && !isPrimingRef.current) {
        console.log(`🎛️ Media Session: Ignoring playing event from inactive deck - muting it`);
        playingDeck.volume = 0;
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = 'playing';
        }
        return;
      }

      if (!isActiveDeck && isPrimingRef.current) {
        console.log(`🎛️ Media Session: Inactive deck playing during priming`);
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
          debouncedMediaAction('play');
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('🎛️ Media Session: pause requested');
          debouncedMediaAction('pause');
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('🎛️ Media Session: previoustrack');
          onPreviousTrack();
          setTimeout(() => {
            const activeDeck = getActiveDeck();
            if (activeDeck) activeDeck.play().catch(console.error);
          }, 100);
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('🎛️ Media Session: nexttrack');
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
      navigator.mediaSession.playbackState = 'paused';
    };

    const handleTimeUpdate = () => {
      const activeDeck = getActiveDeck();
      if (activeDeck && activeDeck.duration && isFinite(activeDeck.duration) && isFinite(activeDeck.currentTime)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: activeDeck.duration,
            playbackRate: activeDeck.playbackRate,
            position: activeDeck.currentTime,
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

    // Register handlers on BOTH decks
    [deckA, deckB].forEach(deck => {
      deck.addEventListener('playing', handlePlaying);
      deck.addEventListener('pause', handlePause);
      deck.addEventListener('loadedmetadata', handleLoadedMetadata);
      deck.addEventListener('timeupdate', handleTimeUpdate);
    });

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
  }, [currentSong, setIsPlaying, onPreviousTrack, onNextTrack, getActiveDeck, debouncedMediaAction, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef, isPrimingRef]);
}
