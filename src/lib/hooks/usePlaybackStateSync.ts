import { useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { hasRealSong, type SetActiveDeckOptions } from './useDualDeckAudio';

export interface UsePlaybackStateSyncOptions {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.RefObject<'A' | 'B'>;
  isPlaying: boolean;
  getActiveDeck: () => HTMLAudioElement | null;
  checkAndResumeAudioContext: () => Promise<boolean>;
  attemptStallRecovery: (audio: HTMLAudioElement, source: string) => Promise<boolean>;
  lastProgressTimeRef: React.RefObject<number>;
  lastProgressValueRef: React.RefObject<number>;
  setActiveDeck: (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
  /** Source of truth for what song the active deck actually has loaded. */
  currentSongIdRef: React.RefObject<string | null>;
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
  setActiveDeck,
  currentSongIdRef,
}: UsePlaybackStateSyncOptions): void {
  const { setIsPlaying } = useAudioStore();

  // Handle play/pause state changes
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // CRITICAL: Check if activeDeckRef is pointing to the wrong deck
    const deckAWasPlaying = deckA.currentTime > 0 && hasRealSong(deckA);
    const deckBWasPlaying = deckB.currentTime > 0 && hasRealSong(deckB);

    // Correct activeDeckRef based on which deck has actually been playing
    if (deckBWasPlaying && !deckAWasPlaying && activeDeckRef.current === 'A') {
      setActiveDeck('B', 'mount-correction: deck B has progress');
    } else if (deckAWasPlaying && !deckBWasPlaying && activeDeckRef.current === 'B') {
      setActiveDeck('A', 'mount-correction: deck A has progress');
    }

    const audio = activeDeckRef.current === 'A' ? deckA : deckB;
    if (!audio.src) return;

    // Debug log store state changes
    if (localStorage.getItem('debug') === 'true') {
      console.log(`🎮 [STORE] isPlaying=${isPlaying} | audio.paused=${audio.paused} readyState=${audio.readyState} time=${audio.currentTime.toFixed(1)} deck=${activeDeckRef.current}`);
    }

    // Only handle pause immediately; play is handled by canplay listener or when ready
    if (!isPlaying) {
      // DEFENSIVE: Store says pause but audio element is still playing
      if (!audio.paused) {
        const userPauseAt = useAudioStore.getState()._userPauseAt;
        const isRecentUserPause = userPauseAt > 0 && (Date.now() - userPauseAt) < 3000;
        if (isRecentUserPause) {
          console.log('🎮 [STORE] Intentional pause detected — pausing audio element');
          audio.pause();
        } else {
          console.log('🎮 [STORE] Store says pause but audio is playing - syncing store to match reality');
          setIsPlaying(true);
        }
        return;
      }
      // DEFENSIVE: If audio was recently making progress but got paused by a network stall,
      // don't accept the pause — re-enable playback so the watchdog can recover.
      // BUT: if the user intentionally paused within the last 3 seconds, respect it.
      if (audio.paused && audio.networkState === HTMLMediaElement.NETWORK_LOADING
          && audio.currentTime > 0 && hasRealSong(audio)
          && lastProgressTimeRef.current > 0
          && (Date.now() - lastProgressTimeRef.current) < 10000) {
        const userPauseAt = useAudioStore.getState()._userPauseAt;
        const isRecentUserPause = userPauseAt > 0 && (Date.now() - userPauseAt) < 3000;
        if (!isRecentUserPause) {
          console.log('🎮 [STORE] Store says pause but network is loading — likely stall-triggered, resuming');
          setIsPlaying(true);
          audio.play().catch(() => { /* watchdog will handle */ });
          return;
        }
        console.log('🎮 [STORE] Network loading but user recently paused — respecting pause');
      }
      // iOS screen lock destroys the audio element: readyState=0, currentTime=0, paused=true.
      // If wasPlayingBeforeUnload is still true, don't accept the pause — register a one-shot
      // canplay listener so playback auto-resumes once the element finishes reloading.
      const storeState = useAudioStore.getState();
      if (audio.paused && audio.readyState === 0 && audio.currentTime === 0
          && hasRealSong(audio) && storeState.wasPlayingBeforeUnload) {
        console.log('🎮 [STORE] Audio destroyed (iOS screen lock) — registering canplay resume');
        const savedTime = storeState.currentTime;
        const resumeOnReload = () => {
          audio.removeEventListener('canplay', resumeOnReload);
          if (savedTime > 0 && isFinite(savedTime)) {
            audio.currentTime = savedTime;
          }
          audio.play()
            .then(() => {
              setIsPlaying(true);
              useAudioStore.setState({ pendingPlaybackResume: false, wasPlayingBeforeUnload: false });
              console.log('🎮 [STORE] Resumed after iOS screen lock destroy');
            })
            .catch(() => { setIsPlaying(false); });
        };
        audio.addEventListener('canplay', resumeOnReload, { once: true });
        return; // Don't call audio.pause()
      }
      // iOS AudioContext state bounces (interrupted→running→interrupted) can cause
      // isPlaying to flip false transiently. If there was a recent AudioContext interrupt
      // and no user-initiated pause, don't cement the pause — the statechange handler
      // will set isPlaying=true when the context stabilizes.
      {
        const lastInterrupt = storeState._lastAudioContextInterrupt;
        const isRecentInterrupt = lastInterrupt > 0 && (Date.now() - lastInterrupt) < 5000;
        const userPauseAt = storeState._userPauseAt;
        const isRecentUserPause = userPauseAt > 0 && (Date.now() - userPauseAt) < 3000;
        if (isRecentInterrupt && !isRecentUserPause && audio.currentTime > 0 && hasRealSong(audio)) {
          console.log('🎮 [STORE] Ignoring pause during AudioContext interrupt recovery');
          return;
        }
      }
      // External audio session interruption (Siri, phone call, etc.)
      // These force-pause the HTMLAudioElement WITHOUT triggering AudioContext
      // statechange events. If the audio was recently making progress and no
      // user-initiated pause occurred, attempt auto-resume after a delay.
      {
        const userPauseAt = storeState._userPauseAt;
        const isRecentUserPause = userPauseAt > 0 && (Date.now() - userPauseAt) < 3000;
        const wasRecentlyPlaying = lastProgressTimeRef.current > 0
          && (Date.now() - lastProgressTimeRef.current) < 10000;
        if (!isRecentUserPause && wasRecentlyPlaying && audio.currentTime > 0 && hasRealSong(audio)) {
          console.log('🎮 [STORE] External audio session interruption detected — attempting auto-resume');
          // Delay resume to let the interrupting app (Siri) finish
          setTimeout(() => {
            const currentState = useAudioStore.getState();
            // Only resume if still not playing and no user pause occurred since
            if (!currentState.isPlaying && !(currentState._userPauseAt > userPauseAt)) {
              checkAndResumeAudioContext().then(() => {
                audio.play()
                  .then(() => {
                    setIsPlaying(true);
                    lastProgressTimeRef.current = Date.now();
                    lastProgressValueRef.current = audio.currentTime;
                    console.log('🎮 [STORE] Auto-resumed after external interruption');
                  })
                  .catch(() => {
                    console.log('🎮 [STORE] Auto-resume failed — accepting pause');
                    setIsPlaying(false);
                  });
              });
            }
          }, 1500);
          return; // Don't call audio.pause()
        }
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
  }, [isPlaying, setIsPlaying, deckARef, deckBRef, activeDeckRef, lastProgressTimeRef, setActiveDeck]);

  // Visibility change recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const deckA = deckARef.current;
      const deckB = deckBRef.current;
      if (!deckA || !deckB) return;

      // eslint-disable-next-line @eslint-react/web-api/no-leaked-timeout -- one-shot delay inside event handler, no cleanup needed
      setTimeout(() => {
        // Use currentTime > 0 as the PRIMARY signal for which deck was playing
        const deckAHasProgress = deckA.currentTime > 0 && hasRealSong(deckA);
        const deckBHasProgress = deckB.currentTime > 0 && hasRealSong(deckB);

        // Fix activeDeckRef based on which deck has actual playback progress
        if (deckBHasProgress && !deckAHasProgress && activeDeckRef.current === 'A') {
          setActiveDeck('B', 'visibility-correction: deck B has progress');
        } else if (deckAHasProgress && !deckBHasProgress && activeDeckRef.current === 'B') {
          setActiveDeck('A', 'visibility-correction: deck A has progress');
        }

        const activeDeck = activeDeckRef.current === 'A' ? deckA : deckB;
        const storeIsPlaying = useAudioStore.getState().isPlaying;
        const audioIsActuallyPlaying = !activeDeck.paused;
        const audioHadProgress = activeDeck.currentTime > 0 && hasRealSong(activeDeck);

        // OPTION A: reconcile currentSongIndex with the deck's actual song.
        // Covers skip-during-crossfade and any path where the index drifted
        // while we weren't looking.
        useAudioStore.getState().syncIndexToActiveSong(currentSongIdRef.current);

        // OPTION B: the song ended while the screen was locked — iOS throttles
        // timeupdate + ended so nextSong() never fired. If the active deck
        // has reached its natural end, force-advance now.
        const deckDuration = activeDeck.duration;
        const deckReachedEnd = activeDeck.ended ||
          (isFinite(deckDuration) && deckDuration > 0 &&
            activeDeck.currentTime >= deckDuration - 0.5);
        if ((storeIsPlaying || useAudioStore.getState().wasPlayingBeforeUnload) && deckReachedEnd) {
          const state = useAudioStore.getState();
          if (state.playlist.length > 1 && state.currentSongIndex + 1 < state.playlist.length) {
            console.log('👁️ [VISIBILITY] Song ended while backgrounded — advancing');
            state.nextSong();
            return;
          }
        }

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

        // OPTION B: next song stuck loading. If the active deck has a real
        // song set but readyState is still low (iOS throttled the fetch while
        // the screen was locked), kick the browser with a fresh load() so we
        // don't sit here silent waiting for the user to wake the screen again.
        const wantsToPlay = storeIsPlaying || useAudioStore.getState().wasPlayingBeforeUnload;
        if (wantsToPlay && hasRealSong(activeDeck) && activeDeck.readyState < 2 && !audioHadProgress) {
          console.log(`👁️ [VISIBILITY] Active deck stuck loading (readyState=${activeDeck.readyState}) — forcing reload`);
          checkAndResumeAudioContext().then(() => {
            activeDeck.load();
            // Best-effort play() once it can — no-op if still not ready.
            activeDeck.play().catch(() => { /* waiting for canplay */ });
          });
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

        // iOS screen lock recovery: audio was destroyed and reloaded, store already says paused,
        // but wasPlayingBeforeUnload tells us the user WAS playing before lock.
        const wasPlaying = useAudioStore.getState().wasPlayingBeforeUnload;
        if (!storeIsPlaying && !audioIsActuallyPlaying && wasPlaying && activeDeck.readyState >= 2) {
          console.log('👁️ [VISIBILITY] iOS recovery: wasPlayingBeforeUnload=true, resuming');
          const savedTime = useAudioStore.getState().currentTime;
          if (savedTime > 0 && isFinite(savedTime) && activeDeck.duration > savedTime) {
            activeDeck.currentTime = savedTime;
          }
          checkAndResumeAudioContext().then(() => {
            activeDeck.play()
              .then(() => {
                setIsPlaying(true);
                useAudioStore.setState({ wasPlayingBeforeUnload: false });
                lastProgressTimeRef.current = Date.now();
                lastProgressValueRef.current = activeDeck.currentTime;
              })
              .catch((err) => {
                console.log('👁️ [VISIBILITY] iOS resume failed:', err.message);
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
  }, [setIsPlaying, attemptStallRecovery, checkAndResumeAudioContext, deckARef, deckBRef, activeDeckRef, lastProgressTimeRef, lastProgressValueRef, setActiveDeck, currentSongIdRef]);

  // Playback state preservation (beforeunload, pagehide, visibility hidden)
  // Uses a flag to prevent triple-save on iOS (visibilitychange + pagehide + beforeunload
  // can all fire in quick succession; the 2nd/3rd call may read a destroyed audio element).
  useEffect(() => {
    let savedThisUnload = false;

    const savePlaybackState = () => {
      if (savedThisUnload) return;
      savedThisUnload = true;

      const audio = getActiveDeck();
      const storeState = useAudioStore.getState();

      // Use audio.currentTime if available and non-zero; otherwise fall back to
      // lastProgressValueRef (iOS may destroy the audio element before this fires,
      // leaving audio.currentTime at 0).
      const audioTime = audio && audio.currentTime > 0
        ? audio.currentTime
        : lastProgressValueRef.current;

      if (audioTime > 0) {
        storeState.setCurrentTime(audioTime);
      }

      // Use both store state and audio element as signals for playing intent
      const wasPlaying = storeState.isPlaying || (audio != null && !audio.paused);
      storeState.setWasPlayingBeforeUnload(wasPlaying);

      console.log(`💾 [SAVE] Playback state saved: wasPlaying=${wasPlaying}, time=${audioTime?.toFixed(1) || 0}s`);
    };

    const handleBeforeUnload = () => {
      savePlaybackState();
    };

    const handlePageHide = () => {
      savePlaybackState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        savePlaybackState();
      } else {
        // Re-arm the flag when the user returns so the next hide can save
        savedThisUnload = false;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [getActiveDeck, lastProgressValueRef]);

  // Playback recovery on mount
  useEffect(() => {
    const state = useAudioStore.getState();
    // Skip if rehydration recovery path is active (Change 4 in PlayerBar handles
    // seeking + resume atomically via canplay listener — early play here would
    // call audio.play() on an element that hasn't loaded yet).
    if (state._rehydratedCurrentTime > 0) {
      console.log(`🔄 [RECOVERY] Deferring to rehydration recovery path (_rehydratedCurrentTime=${state._rehydratedCurrentTime.toFixed(1)}s)`);
      useAudioStore.setState({ pendingPlaybackResume: false });
      return;
    }
    if (state.pendingPlaybackResume && state.currentTime > 0) {
      console.log(`🔄 [RECOVERY] Pending playback resume detected at ${state.currentTime.toFixed(1)}s`);
      setIsPlaying(true);
      useAudioStore.setState({ pendingPlaybackResume: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
