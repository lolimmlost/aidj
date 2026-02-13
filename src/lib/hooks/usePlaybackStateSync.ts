import { useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';

export interface UsePlaybackStateSyncOptions {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  isPlaying: boolean;
  getActiveDeck: () => HTMLAudioElement | null;
  checkAndResumeAudioContext: () => Promise<boolean>;
  attemptStallRecovery: (audio: HTMLAudioElement, source: string) => Promise<boolean>;
  lastProgressTimeRef: React.MutableRefObject<number>;
  lastProgressValueRef: React.MutableRefObject<number>;
}

/**
 * Syncs store isPlaying state with actual audio state.
 *
 * Handles:
 * - Correcting activeDeckRef if component remounted
 * - Sync store to match audio reality on mismatch
 * - Visibility change recovery (tab switch, background/foreground)
 * - Playback state preservation (beforeunload)
 * - Pending playback resume on mount
 */
export function usePlaybackStateSync({
  deckARef,
  deckBRef,
  activeDeckRef,
  isPlaying,
  getActiveDeck,
  checkAndResumeAudioContext,
  attemptStallRecovery,
  lastProgressTimeRef,
  lastProgressValueRef,
}: UsePlaybackStateSyncOptions): void {
  const { setIsPlaying, setCurrentTime } = useAudioStore();

  // Handle play/pause state changes
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // Helper to check if a deck has a real song (not silent data URL)
    const hasRealSong = (deck: HTMLAudioElement) =>
      deck.src && deck.src.indexOf('data:audio') === -1;

    // CRITICAL: Check if activeDeckRef is pointing to the wrong deck
    const deckAWasPlaying = deckA.currentTime > 0 && hasRealSong(deckA);
    const deckBWasPlaying = deckB.currentTime > 0 && hasRealSong(deckB);

    // Correct activeDeckRef based on which deck has actually been playing
    if (deckBWasPlaying && !deckAWasPlaying && activeDeckRef.current === 'A') {
      console.log('🎮 [STORE] Correcting activeDeckRef: Deck B has progress but ref says A');
      activeDeckRef.current = 'B';
    } else if (deckAWasPlaying && !deckBWasPlaying && activeDeckRef.current === 'B') {
      console.log('🎮 [STORE] Correcting activeDeckRef: Deck A has progress but ref says B');
      activeDeckRef.current = 'A';
    }

    const audio = activeDeckRef.current === 'A' ? deckA : deckB;
    if (!audio.src) return;

    // Debug log store state changes
    if (localStorage.getItem('debug') === 'true') {
      console.log(`🎮 [STORE] isPlaying=${isPlaying} | audio.paused=${audio.paused} readyState=${audio.readyState} time=${audio.currentTime.toFixed(1)} deck=${activeDeckRef.current}`);
    }

    // Only handle pause immediately; play is handled by canplay listener or when ready
    if (!isPlaying) {
      // DEFENSIVE: Don't pause audio that's actually playing - store might be stale
      if (!audio.paused) {
        console.log('🎮 [STORE] Store says pause but audio is playing - syncing store to match reality');
        setIsPlaying(true);
        return;
      }
      audio.pause();
    } else if (audio.readyState >= 2) {
      // Only try to play if audio is ready (has enough data)
      audio.play().catch((err) => {
        if (localStorage.getItem('debug') === 'true') {
          console.error(`❌ [PLAY] Failed: ${err.name} - ${err.message}`);
        }
      });
    }
  }, [isPlaying, setIsPlaying, deckARef, deckBRef, activeDeckRef]);

  // Visibility change recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const deckA = deckARef.current;
      const deckB = deckBRef.current;
      if (!deckA || !deckB) return;

      const hasRealSong = (deck: HTMLAudioElement) =>
        deck.src && deck.src.indexOf('data:audio') === -1;

      setTimeout(() => {
        // Use currentTime > 0 as the PRIMARY signal for which deck was playing
        const deckAHasProgress = deckA.currentTime > 0 && hasRealSong(deckA);
        const deckBHasProgress = deckB.currentTime > 0 && hasRealSong(deckB);

        // Fix activeDeckRef based on which deck has actual playback progress
        if (deckBHasProgress && !deckAHasProgress && activeDeckRef.current === 'A') {
          console.log('👁️ [VISIBILITY] Correcting activeDeckRef: Deck B has progress but ref says A');
          activeDeckRef.current = 'B';
        } else if (deckAHasProgress && !deckBHasProgress && activeDeckRef.current === 'B') {
          console.log('👁️ [VISIBILITY] Correcting activeDeckRef: Deck A has progress but ref says B');
          activeDeckRef.current = 'A';
        }

        const activeDeck = activeDeckRef.current === 'A' ? deckA : deckB;
        const storeIsPlaying = useAudioStore.getState().isPlaying;
        const audioIsActuallyPlaying = !activeDeck.paused;
        const audioHadProgress = activeDeck.currentTime > 0 && hasRealSong(activeDeck);

        // Check for buffer stall
        const getBufferedEnd = (deck: HTMLAudioElement) => {
          if (deck.buffered.length > 0) {
            return deck.buffered.end(deck.buffered.length - 1);
          }
          return 0;
        };
        const bufferedEnd = getBufferedEnd(activeDeck);
        const isStalled = audioHadProgress && activeDeck.currentTime >= bufferedEnd - 0.5;

        console.log(`👁️ [VISIBILITY] State check: store=${storeIsPlaying}, audio=${audioIsActuallyPlaying ? 'playing' : 'paused'}, progress=${activeDeck.currentTime.toFixed(1)}s, stalled=${isStalled}`);

        // STALL RECOVERY
        if (isStalled && storeIsPlaying) {
          console.log('👁️ [VISIBILITY] Audio stalled - delegating to recovery system');
          attemptStallRecovery(activeDeck, 'visibility-stall');
          return;
        }

        // If audio has progress but is paused and store says playing - try to resume
        if (audioHadProgress && !audioIsActuallyPlaying && storeIsPlaying) {
          console.log('👁️ [VISIBILITY] Audio has progress but is paused - attempting resume');
          checkAndResumeAudioContext().then(() => {
            activeDeck.play()
              .then(() => {
                console.log('👁️ [VISIBILITY] Resume successful');
                setIsPlaying(true);
                lastProgressTimeRef.current = Date.now();
                lastProgressValueRef.current = activeDeck.currentTime;
              })
              .catch((err) => {
                console.log('👁️ [VISIBILITY] Resume failed:', err.message);
                setIsPlaying(false);
              });
          });
          return;
        }

        // If there's a mismatch, sync store to match audio reality
        if (storeIsPlaying !== audioIsActuallyPlaying) {
          console.log(`👁️ [VISIBILITY] State mismatch - syncing store to ${audioIsActuallyPlaying ? 'playing' : 'paused'}`);

          if (audioIsActuallyPlaying) {
            setIsPlaying(true);
          } else if (activeDeck.readyState >= 2 && hasRealSong(activeDeck)) {
            setIsPlaying(false);
          }
        }
      }, 200);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [setIsPlaying, attemptStallRecovery, checkAndResumeAudioContext, deckARef, deckBRef, activeDeckRef, lastProgressTimeRef, lastProgressValueRef]);

  // Playback state preservation (beforeunload, visibility hidden)
  useEffect(() => {
    const savePlaybackState = () => {
      const audio = getActiveDeck();
      const storeState = useAudioStore.getState();

      if (audio && audio.currentTime > 0) {
        storeState.setCurrentTime(audio.currentTime);
      }

      storeState.setWasPlayingBeforeUnload(storeState.isPlaying);

      console.log(`💾 [SAVE] Playback state saved: isPlaying=${storeState.isPlaying}, time=${audio?.currentTime?.toFixed(1) || 0}s`);
    };

    const handleBeforeUnload = () => {
      savePlaybackState();
    };

    const handleVisibilityHidden = () => {
      if (document.visibilityState === 'hidden') {
        savePlaybackState();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityHidden);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityHidden);
    };
  }, [getActiveDeck]);

  // Playback recovery on mount
  useEffect(() => {
    const state = useAudioStore.getState();
    if (state.pendingPlaybackResume && state.currentTime > 0) {
      console.log(`🔄 [RECOVERY] Pending playback resume detected at ${state.currentTime.toFixed(1)}s`);
      setIsPlaying(true);
      useAudioStore.setState({ pendingPlaybackResume: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
