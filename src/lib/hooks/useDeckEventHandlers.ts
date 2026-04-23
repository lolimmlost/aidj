import { useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { scrobbleSong } from '@/lib/services/navidrome';
import { hasRealSong, Song, SILENT_AUDIO_DATA_URL, type SetActiveDeckOptions } from './useDualDeckAudio';
import type { QueryClient } from '@tanstack/react-query';

export interface UseDeckEventHandlersOptions {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  setActiveDeck: (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
  crossfadeAbortedAtRef: React.MutableRefObject<number>;
  currentSongIdRef: React.MutableRefObject<string | null>;
  playbackSnapshotRef: React.MutableRefObject<{ currentTime: number; duration: number; songId: string | null }>;
  scrobbleThresholdReachedRef: React.MutableRefObject<boolean>;
  hasScrobbledRef: React.MutableRefObject<boolean>;
  lastProgressTimeRef: React.MutableRefObject<number>;
  lastProgressValueRef: React.MutableRefObject<number>;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setIsLoading: (v: boolean) => void;
  nextSong: () => void;
  currentSong: Song | null;
  currentSongIndex: number;
  playlist: Song[];
  volume: number;
  startCrossfade: (song: Song, duration: number) => void;
  attemptStallRecovery: (audio: HTMLAudioElement, source: string) => Promise<boolean>;
  webAudioInitialized: boolean;
  setMasterVolume: (v: number) => void;
  getActiveDeck: () => HTMLAudioElement | null;
  queryClient: QueryClient;
  recordListeningHistory: (
    song: Song | null,
    songId: string | null,
    playDuration?: number,
    songDuration?: number,
    userInitiatedSkip?: boolean,
  ) => void;
}

/**
 * Manages audio event listeners (timeupdate, ended, stalled, etc.) for both decks.
 *
 * Extracted from PlayerBar to reduce component size. Handles:
 * - DESYNC detection and correction via setActiveDeck
 * - Scrobble threshold tracking
 * - Crossfade triggering based on time remaining
 * - Ended/stalled/waiting/canplay events for both decks
 * - Volume initialization
 */
export function useDeckEventHandlers({
  deckARef,
  deckBRef,
  activeDeckRef,
  setActiveDeck,
  crossfadeInProgressRef,
  crossfadeAbortedAtRef,
  currentSongIdRef,
  playbackSnapshotRef,
  scrobbleThresholdReachedRef,
  hasScrobbledRef,
  lastProgressTimeRef,
  lastProgressValueRef,
  setCurrentTime,
  setDuration,
  setIsLoading,
  nextSong,
  currentSong,
  currentSongIndex,
  playlist,
  volume,
  startCrossfade,
  attemptStallRecovery,
  webAudioInitialized,
  setMasterVolume,
  getActiveDeck,
  queryClient,
  recordListeningHistory,
}: UseDeckEventHandlersOptions): void {
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // Create handlers that check if the event came from the active deck
    const createUpdateTime = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      // CRITICAL FIX: If this deck is playing with progress but isn't marked as active,
      // auto-correct activeDeckRef. This can happen after crossfade or component remount.
      if (activeDeckRef.current !== deckName) {
        const otherDeck = deckName === 'A' ? deckBRef.current : deckARef.current;

        if (!deck.paused && deck.currentTime > 1 && hasRealSong(deck) && !crossfadeInProgressRef.current) {
          // If BOTH decks are playing, pick the one with MORE progress (the "real" active one)
          // and pause the other to break the feedback loop
          if (otherDeck && !otherDeck.paused && otherDeck.currentTime > 1 && hasRealSong(otherDeck)) {
            // Both decks playing — compare progress to decide which is the "intended" active deck
            const thisDeckIsNewer = deck.currentTime < otherDeck.currentTime;
            if (thisDeckIsNewer) {
              // This deck (deckName) has less progress — it's the newly loaded one, make it active
              setActiveDeck(deckName, `desync: deck ${deckName} newer (${deck.currentTime.toFixed(1)}s)`, { cooldownMs: 2000 });
              // Always pause the stale deck even if cooldown blocked the switch —
              // two decks playing simultaneously is worse than a wrong activeDeckRef
              otherDeck.pause();
              otherDeck.currentTime = 0;
            } else {
              // Other deck has less progress — it's the active one, this deck is stale
              deck.pause();
              deck.currentTime = 0;
            }
            return;
          }

          setActiveDeck(deckName, `desync: deck ${deckName} playing at ${deck.currentTime.toFixed(1)}s`, { cooldownMs: 2000 });
        } else {
          return; // Not the active deck and not a desync situation
        }
      }

      setCurrentTime(deck.currentTime);

      // Keep the playback snapshot up-to-date so handleNextSong can read the
      // real position even after the deck has been reassigned on a rapid skip.
      playbackSnapshotRef.current = { currentTime: deck.currentTime, duration: deck.duration || 0, songId: currentSongIdRef.current };

      // CRITICAL: Always update lastProgressValueRef for recovery purposes
      // This ensures we have the correct position even if watchdog isn't running
      if (deck.currentTime > 0 && !deck.paused) {
        lastProgressTimeRef.current = Date.now();
        lastProgressValueRef.current = deck.currentTime;
      }

      // Use the audio element's duration when finite, otherwise fall back
      // to the store's metadata duration (set from song metadata at load time).
      // Transcoded/chunked streams report Infinity because there's no Content-Length.
      const storeDuration = useAudioStore.getState().duration;
      const effectiveDuration = (isFinite(deck.duration) && deck.duration > 0)
        ? deck.duration
        : (storeDuration > 0 ? storeDuration : 0);

      if (effectiveDuration > 0 && currentSong) {
        const playedPercentage = (deck.currentTime / effectiveDuration) * 100;
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
        }

        // CROSSFADE: Check if we should start crossfade
        const timeRemaining = effectiveDuration - deck.currentTime;
        const xfadeDuration = useAudioStore.getState().crossfadeDuration;

        // Cooldown: don't re-trigger crossfade within 10s of an abort
        // (the abort already called nextSong — the old deck is finishing its last moments)
        const crossfadeCooldownActive = Date.now() - crossfadeAbortedAtRef.current < 10000;

        if (xfadeDuration > 0 && timeRemaining <= xfadeDuration && timeRemaining > 0.5 && !crossfadeInProgressRef.current && !crossfadeCooldownActive) {
          const currentRepeatMode = useAudioStore.getState().repeatMode;

          // Don't crossfade when repeat-one is active — the onEnded handler
          // will seek back to 0 and replay the same song
          if (currentRepeatMode !== 'one') {
            const isLastSong = currentSongIndex + 1 >= playlist.length;

            // Don't crossfade at end of playlist when repeat is off — let it stop naturally
            if (!isLastSong || currentRepeatMode === 'all' || useAudioStore.getState().isShuffled) {
              const nextIndex = (currentSongIndex + 1) % playlist.length;
              const nextSongData = playlist[nextIndex] as Song;

              if (nextSongData && playlist.length > 1) {
                startCrossfade(nextSongData, xfadeDuration);
              }
            }
          }
        }

        // SAFETY NET: When audio duration is Infinity (chunked/transcoded stream)
        // but we have metadata duration, detect end-of-song and advance manually.
        // The browser won't fire 'ended' when duration is Infinity.
        if (!isFinite(deck.duration) && timeRemaining <= 0.5 && !crossfadeInProgressRef.current) {
          console.log(`⏭️ [INFINITY] Song reached metadata duration (${effectiveDuration.toFixed(1)}s) with Infinity audio duration — triggering end-of-song`);
          deck.pause();
          nextSong();
        }
      }
    };

    const createUpdateDuration = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      // Guard against Infinity duration from streaming audio where content-length
      // is unknown. Keep the metadata duration from loadSong instead.
      if (!isFinite(deck.duration) || deck.duration <= 0) return;
      setDuration(deck.duration);
    };

    const createOnCanPlay = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(false);
    };

    const createOnWaiting = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(true);
    };

    // Stalled event handler
    const lastStalledTimeRef = { current: 0 };
    const createOnStalled = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      if (deck.paused) return;
      if (deck.currentTime < 2) return;
      if (crossfadeInProgressRef.current) return;

      const now = Date.now();
      if (now - lastStalledTimeRef.current < 10000) return;
      lastStalledTimeRef.current = now;

      const bufferedEnd = deck.buffered.length > 0
        ? deck.buffered.end(deck.buffered.length - 1)
        : 0;

      if (deck.currentTime >= bufferedEnd - 1) {
        console.log(`🔴 [STALLED EVENT] Deck ${deckName} genuinely stalled at ${deck.currentTime.toFixed(1)}s`);
        attemptStallRecovery(deck, 'stalled-event');
      }
    };

    const createOnEnded = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;

      // Ignore ENDED events for very short audio (e.g., silent data URL)
      if (deck.duration && deck.duration < 5) {
        console.log(`[MOBILE] Ignoring ended event for short audio`);
        deck.pause();
        deck.currentTime = 0;
        return;
      }

      // If crossfade already handled the transition, skip
      if (crossfadeInProgressRef.current) {
        console.log(`[XFADE] onEnded fired but crossfade in progress, skipping`);
        return;
      }

      // If a crossfade abort just handled the transition, skip
      // (the abort already called nextSong — this ended event is for the old deck)
      if (Date.now() - crossfadeAbortedAtRef.current < 3000) {
        console.log(`[XFADE] onEnded fired but crossfade abort recently handled transition, skipping`);
        return;
      }

      if (currentSongIdRef.current && !hasScrobbledRef.current && currentSong) {
        hasScrobbledRef.current = true;
        scrobbleSong(currentSongIdRef.current, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['most-played-songs'] });
            queryClient.invalidateQueries({ queryKey: ['top-artists'] });
          })
          .catch(console.error);

        // Record in listening history
        recordListeningHistory(currentSong, currentSongIdRef.current, deck.currentTime, deck.duration);
      }

      // Repeat-one (or repeat-all with single song): restart the same track
      const currentRepeatMode = useAudioStore.getState().repeatMode;
      const isSingleSongRepeatAll = currentRepeatMode === 'all' && useAudioStore.getState().playlist.length === 1;

      if (currentRepeatMode === 'one' || isSingleSongRepeatAll) {
        // After 'ended', browsers put the element in a finished state.
        // Use a microtask to let the browser settle, then seek + play.
        // Also re-load if readyState dropped (can happen on mobile).
        const restartDeck = () => {
          deck.currentTime = 0;
          setCurrentTime(0);
          if (deck.readyState >= 2) {
            deck.play().catch((err) => {
              console.warn('[REPEAT] play() after restart failed:', err.message);
            });
          } else {
            // Deck lost data — re-trigger load then play on canplay
            const onReady = () => {
              deck.removeEventListener('canplay', onReady);
              deck.play().catch(() => {});
            };
            deck.addEventListener('canplay', onReady);
            deck.load();
          }
        };

        // Microtask delay lets the browser finish processing the 'ended' event
        setTimeout(restartDeck, 0);
        return;
      }

      // Prime the opposite deck while we're still inside the ended event's
      // user-activation context. iOS Safari revokes autoplay grants on idle
      // <audio> elements; without a fresh gesture-derived play() on the
      // inactive deck, the next song's crossfade will be rejected with
      // NotAllowedError. The `ended` handler inherits activation from the
      // original play() chain, so a silent play() here succeeds where a
      // timeupdate-initiated one does not.
      const inactiveDeck = deckName === 'A' ? deckBRef.current : deckARef.current;
      if (inactiveDeck && !inactiveDeck.src) {
        inactiveDeck.src = SILENT_AUDIO_DATA_URL;
        inactiveDeck.play()
          .then(() => {
            inactiveDeck.pause();
            inactiveDeck.removeAttribute('src');
            inactiveDeck.load();
            console.log(`[PRIME] Deck ${deckName === 'A' ? 'B' : 'A'} primed via ended-event gesture`);
          })
          .catch((err) => {
            console.warn(`[PRIME] Ended-event prime failed: ${err?.name || 'unknown'}`);
          });
      }

      // Let the useEffect watching currentSongIndex handle loading the next song.
      // Don't manually set deck.src here — it races with the effect and causes
      // "The operation was aborted" errors.
      nextSong();
    };

    // Create handlers for each deck
    const updateTimeA = createUpdateTime(deckA, 'A');
    const updateTimeB = createUpdateTime(deckB, 'B');
    const updateDurationA = createUpdateDuration(deckA, 'A');
    const updateDurationB = createUpdateDuration(deckB, 'B');
    const onCanPlayA = createOnCanPlay('A');
    const onCanPlayB = createOnCanPlay('B');
    const onWaitingA = createOnWaiting('A');
    const onWaitingB = createOnWaiting('B');
    const onStalledA = createOnStalled(deckA, 'A');
    const onStalledB = createOnStalled(deckB, 'B');
    const onEndedA = createOnEnded(deckA, 'A');
    const onEndedB = createOnEnded(deckB, 'B');

    // Register listeners on both decks
    deckA.addEventListener('timeupdate', updateTimeA);
    deckA.addEventListener('loadedmetadata', updateDurationA);
    deckA.addEventListener('durationchange', updateDurationA);
    deckA.addEventListener('canplay', onCanPlayA);
    deckA.addEventListener('waiting', onWaitingA);
    deckA.addEventListener('stalled', onStalledA);
    deckA.addEventListener('ended', onEndedA);

    deckB.addEventListener('timeupdate', updateTimeB);
    deckB.addEventListener('loadedmetadata', updateDurationB);
    deckB.addEventListener('durationchange', updateDurationB);
    deckB.addEventListener('canplay', onCanPlayB);
    deckB.addEventListener('waiting', onWaitingB);
    deckB.addEventListener('stalled', onStalledB);
    deckB.addEventListener('ended', onEndedB);

    // Set initial volume — use masterGain when Web Audio is initialized, else element.volume
    if (webAudioInitialized) {
      setMasterVolume(volume);
    } else {
      const activeDeck = getActiveDeck();
      if (activeDeck && !crossfadeInProgressRef.current) {
        activeDeck.volume = volume;
      }
    }

    return () => {
      deckA.removeEventListener('timeupdate', updateTimeA);
      deckA.removeEventListener('loadedmetadata', updateDurationA);
      deckA.removeEventListener('durationchange', updateDurationA);
      deckA.removeEventListener('canplay', onCanPlayA);
      deckA.removeEventListener('waiting', onWaitingA);
      deckA.removeEventListener('stalled', onStalledA);
      deckA.removeEventListener('ended', onEndedA);

      deckB.removeEventListener('timeupdate', updateTimeB);
      deckB.removeEventListener('loadedmetadata', updateDurationB);
      deckB.removeEventListener('durationchange', updateDurationB);
      deckB.removeEventListener('canplay', onCanPlayB);
      deckB.removeEventListener('waiting', onWaitingB);
      deckB.removeEventListener('stalled', onStalledB);
      deckB.removeEventListener('ended', onEndedB);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong, queryClient, startCrossfade, getActiveDeck, playlist, attemptStallRecovery, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef, lastProgressTimeRef, lastProgressValueRef, webAudioInitialized, setMasterVolume, setActiveDeck, crossfadeAbortedAtRef, currentSongIdRef, playbackSnapshotRef, scrobbleThresholdReachedRef, hasScrobbledRef, setIsLoading, recordListeningHistory]);
}
