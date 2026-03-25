import { useRef, useCallback, useState, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';

export interface WebAudioGraph {
  audioContextRef: React.RefObject<AudioContext | null>;
  gainARef: React.RefObject<GainNode | null>;
  gainBRef: React.RefObject<GainNode | null>;
  analyserRef: React.RefObject<AnalyserNode | null>;
  isInitialized: boolean;
  initializeGraph: (deckA: HTMLAudioElement, deckB: HTMLAudioElement) => boolean;
  scheduleGainRamp: (deck: 'A' | 'B', target: number, durationSec: number, curve?: 'linear' | 'equalpower') => void;
  cancelGainRamp: (deck: 'A' | 'B') => void;
  setGainImmediate: (deck: 'A' | 'B', value: number) => void;
  getGainValue: (deck: 'A' | 'B') => number;
  setMasterVolume: (volume: number) => void;
  resumeContext: () => Promise<boolean>;
}

// --- Helpers (pure, no hooks) ---

import { hasRealSong } from './useDualDeckAudio';

/** Compute an equal-power (sin²/cos²) curve value at position t ∈ [0,1]. */
function equalPowerValue(start: number, end: number, t: number): number {
  if (end > start) {
    // Fade in: sin²(t·π/2)
    return start + (end - start) * Math.pow(Math.sin(t * Math.PI / 2), 2);
  }
  // Fade out: 1 − cos²(t·π/2)
  return start + (end - start) * (1 - Math.pow(Math.cos(t * Math.PI / 2), 2));
}

/**
 * Manages a single shared AudioContext and the Web Audio graph for dual-deck crossfade.
 *
 * Audio graph:
 *   <audio A> → SourceA → GainA ──┬──→ masterGain → destination
 *                                  ├──→ AnalyserNode (pre-master)
 *   <audio B> → SourceB → GainB ──┘
 *
 * - GainA/GainB: crossfade ramps (0–1), scheduled on the audio thread
 * - masterGain: user volume slider (immediate value changes)
 * - AnalyserNode: tapped pre-master so visualization is unaffected by volume
 */
export function useWebAudioGraph(): WebAudioGraph {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Deck element refs — stored during initializeGraph for iOS recovery
  const deckAElementRef = useRef<HTMLAudioElement | null>(null);
  const deckBElementRef = useRef<HTMLAudioElement | null>(null);

  // iOS interrupt recovery state.
  // wasPlaying captures playback intent before usePlaybackStateSync corrupts
  // the store's isPlaying to false (iOS force-pauses the element).
  // interruptedAt distinguishes quick state bounces (<500ms) from real suspensions.
  // clearWasPlayingTimerRef delays clearing wasPlaying so rapid interrupt cycles
  // don't lose the "was playing" signal.
  const wasPlayingBeforeInterruptRef = useRef<boolean>(false);
  const interruptedAtRef = useRef<number>(0);
  const clearWasPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getGainNode = useCallback((deck: 'A' | 'B'): GainNode | null => {
    return deck === 'A' ? gainARef.current : gainBRef.current;
  }, []);

  // --- Graph initialization ---

  const initializeGraph = useCallback((deckA: HTMLAudioElement, deckB: HTMLAudioElement): boolean => {
    if (isInitialized || audioContextRef.current) return false;

    try {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('[WEB AUDIO] AudioContext not available');
        return false;
      }

      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const gainA = ctx.createGain();
      const gainB = ctx.createGain();
      const masterGain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const merge = ctx.createGain();
      const sourceA = ctx.createMediaElementSource(deckA);
      const sourceB = ctx.createMediaElementSource(deckB);

      // Wire: source → deckGain → merge → {masterGain → destination, analyser}
      sourceA.connect(gainA);
      sourceB.connect(gainB);
      gainA.connect(merge);
      gainB.connect(merge);
      merge.connect(masterGain);
      merge.connect(analyser);
      masterGain.connect(ctx.destination);

      gainA.gain.value = 1.0;
      gainB.gain.value = 0.0;

      // Silent keep-alive oscillator prevents iOS from suspending the context
      // when backgrounded. Without it, createMediaElementSource goes silent.
      try {
        const osc = ctx.createOscillator();
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        osc.connect(silentGain);
        silentGain.connect(ctx.destination);
        osc.start();
        console.log('[WEB AUDIO] Silent keep-alive oscillator started');
      } catch (e) {
        console.warn('[WEB AUDIO] Failed to create keep-alive oscillator:', e);
      }

      // Lock element.volume — all volume control goes through GainNodes
      deckA.volume = 1.0;
      deckB.volume = 1.0;

      gainARef.current = gainA;
      gainBRef.current = gainB;
      masterGainRef.current = masterGain;
      analyserRef.current = analyser;
      deckAElementRef.current = deckA;
      deckBElementRef.current = deckB;

      setIsInitialized(true);
      console.log('[WEB AUDIO] Graph initialized successfully');
      return true;
    } catch (err) {
      console.error('[WEB AUDIO] Failed to initialize graph:', err);
      return false;
    }
  }, [isInitialized]);

  // --- Gain ramp scheduling ---

  const scheduleGainRamp = useCallback((
    deck: 'A' | 'B',
    target: number,
    durationSec: number,
    curve: 'linear' | 'equalpower' = 'linear',
  ) => {
    const ctx = audioContextRef.current;
    const gain = getGainNode(deck);
    if (!ctx || !gain) return;

    const now = ctx.currentTime;
    const param = gain.gain;

    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);

    if (curve === 'linear' || durationSec <= 0) {
      if (durationSec <= 0) param.setValueAtTime(target, now);
      else param.linearRampToValueAtTime(target, now + durationSec);
      return;
    }

    // Equal power: segmented linearRamps (cancellable, unlike setValueCurveAtTime)
    const SEGMENTS = 20;
    const startValue = param.value;
    for (let i = 1; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      param.linearRampToValueAtTime(
        equalPowerValue(startValue, target, t),
        now + t * durationSec,
      );
    }
  }, [getGainNode]);

  const cancelGainRamp = useCallback((deck: 'A' | 'B') => {
    const ctx = audioContextRef.current;
    const gain = getGainNode(deck);
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
  }, [getGainNode]);

  const setGainImmediate = useCallback((deck: 'A' | 'B', value: number) => {
    const ctx = audioContextRef.current;
    const gain = getGainNode(deck);
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(value, now);
  }, [getGainNode]);

  const getGainValue = useCallback((deck: 'A' | 'B'): number => {
    const gain = getGainNode(deck);
    if (!gain) return deck === 'A' ? 1 : 0;
    return gain.gain.value;
  }, [getGainNode]);

  // --- Master volume ---

  const setMasterVolume = useCallback((volume: number) => {
    const ctx = audioContextRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    master.gain.setValueAtTime(volume, ctx.currentTime);
  }, []);

  // --- Context resume ---

  const resumeContext = useCallback(async (): Promise<boolean> => {
    const ctx = audioContextRef.current;
    if (!ctx) return true;

    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
      console.log(`[WEB AUDIO] Context state="${ctx.state}" — attempting resume`);
      try {
        await Promise.race([
          ctx.resume(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('resume timeout')), 2000)),
        ]);
        console.log('[WEB AUDIO] Context resumed successfully');
      } catch (err) {
        console.warn(`[WEB AUDIO] Resume failed/timed out: ${(err as Error).message}`);
      }
    }
    return true;
  }, []);

  // --- iOS AudioContext state recovery ---
  //
  // When audio is routed through createMediaElementSource, iOS may
  // suspend/interrupt the AudioContext (screen lock, background, call).
  //
  // Key invariant: NEVER pause HTMLAudioElements — iOS can keep playing in
  // the background via MediaSession. Pausing kills background playback.
  //
  // On interrupted: disconnect masterGain → destination so any pipeline
  // transient (pitch/speed artifact) during the state bounce is inaudible.
  //
  // On running: reconnect masterGain (gain=0), then fade in after a brief
  // settle. Resume paused decks if needed, resync on long interruptions.
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    /** Find the deck with a real audio source and current progress. */
    const findActiveDeck = (): { deck: HTMLAudioElement; label: string; paused: boolean } | null => {
      const deckA = deckAElementRef.current;
      const deckB = deckBElementRef.current;
      for (const [el, label] of [[deckA, 'A'], [deckB, 'B']] as const) {
        if (hasRealSong(el) && el!.currentTime > 0) {
          return { deck: el!, label, paused: el!.paused };
        }
      }
      return null;
    };

    /** Smoothly ramp masterGain from 0 → userVolume after an optional delay. */
    const fadeInMaster = (delayMs: number) => {
      const master = masterGainRef.current;
      if (!master) return;
      const userVolume = useAudioStore.getState().volume ?? 1.0;
      const FADE_MS = 250;

      const doFade = () => {
        if (!master) return;
        const now = ctx.currentTime;
        // Start from a tiny non-zero value to avoid the hard 0→signal discontinuity
        // that causes clicks. Use exponential ramp for a natural fade curve.
        master.gain.setValueAtTime(0.001, now);
        master.gain.exponentialRampToValueAtTime(
          Math.max(userVolume, 0.001), now + FADE_MS / 1000,
        );
        console.log(`[WEB AUDIO] Fading in masterGain to ${userVolume} over ${FADE_MS}ms`);
      };

      if (delayMs > 0) setTimeout(doFade, delayMs);
      else doFade();
    };

    /** Attempt ctx.resume() if not already running. */
    const nudgeResume = () => {
      if ((ctx.state as string) !== 'running') {
        ctx.resume().catch(() => {});
      }
    };

    const handleStateChange = () => {
      const state = ctx.state as string; // iOS adds 'interrupted'

      if (state === 'interrupted' || state === 'suspended') {
        // Cancel any pending wasPlaying clear — we're back in interrupt
        if (clearWasPlayingTimerRef.current) {
          clearTimeout(clearWasPlayingTimerRef.current);
          clearWasPlayingTimerRef.current = null;
        }

        // Capture playback intent before store is corrupted
        const storeState = useAudioStore.getState();
        const deckA = deckAElementRef.current;
        const deckB = deckBElementRef.current;
        const eitherPlaying = (deckA && !deckA.paused) || (deckB && !deckB.paused);
        if (storeState.isPlaying || eitherPlaying) {
          wasPlayingBeforeInterruptRef.current = true;
        }

        if (interruptedAtRef.current === 0) {
          interruptedAtRef.current = Date.now();
        }

        // Publish interrupt timestamp so usePlaybackStateSync doesn't
        // cement a false pause during rapid AudioContext state bounces.
        useAudioStore.setState({ _lastAudioContextInterrupt: Date.now() });

        // Disconnect masterGain from destination to prevent pitch-shifted audio
        // when the context transitions back to running through the Web Audio graph.
        //
        // CRITICAL: Do NOT set element.volume=0 here. When AudioContext is
        // interrupted, iOS releases createMediaElementSource and routes audio
        // directly through the HTMLAudioElement. Setting volume=0 kills that
        // direct path, which stops background audio AND removes media controls
        // from the lock screen. The element must stay at volume=1 so iOS can
        // continue playing audio in the background.
        {
          const m = masterGainRef.current;
          if (m) {
            try { m.disconnect(); } catch { /* already disconnected */ }
          }
        }

        console.log(`[WEB AUDIO] Context ${state} — wasPlaying=${wasPlayingBeforeInterruptRef.current}, masterGain disconnected (elements untouched)`);

        // Persistent resume retry — iOS may not allow resume immediately after
        // interrupt. Instead of a fixed set of timeouts that can all expire while
        // the system hasn't settled, use a setInterval that keeps trying until
        // the context reaches 'running' (at which point the statechange handler
        // fires and runs the recovery path).
        if (resumeIntervalRef.current) clearInterval(resumeIntervalRef.current);
        nudgeResume(); // immediate first attempt
        resumeIntervalRef.current = setInterval(() => {
          if ((ctx.state as string) === 'running') {
            if (resumeIntervalRef.current) {
              clearInterval(resumeIntervalRef.current);
              resumeIntervalRef.current = null;
            }
            return;
          }
          console.log(`[WEB AUDIO] Retry resume — context still ${ctx.state}`);
          nudgeResume();
        }, 2000);

      } else if (state === 'running') {
        // Clear the persistent resume interval — context is running now
        if (resumeIntervalRef.current) {
          clearInterval(resumeIntervalRef.current);
          resumeIntervalRef.current = null;
        }

        const shouldResume = wasPlayingBeforeInterruptRef.current || useAudioStore.getState().isPlaying;
        const interruptDuration = interruptedAtRef.current > 0
          ? Date.now() - interruptedAtRef.current : 0;
        interruptedAtRef.current = 0;
        const needsResync = interruptDuration > 500;

        console.log(`[WEB AUDIO] Context running — shouldResume=${shouldResume}, interruptMs=${interruptDuration}, needsResync=${needsResync}`);

        // Recovery sequence (order matters):
        // 1. Briefly mute elements — prevents pitch artifact during graph reconnect.
        //    Elements were left at volume=1 during interrupted state (for background
        //    audio), so we mute them now just for the reconnection transition.
        const deckA = deckAElementRef.current;
        const deckB = deckBElementRef.current;
        if (deckA) deckA.volume = 0;
        if (deckB) deckB.volume = 0;

        // 2. Reconnect masterGain at gain=0
        const master = masterGainRef.current;
        if (master) {
          try { master.gain.cancelScheduledValues(0); } catch { /* no scheduled values */ }
          master.gain.setValueAtTime(0, ctx.currentTime);
          try { master.connect(ctx.destination); } catch { /* already connected */ }
        }

        // 3. Restore element volumes after brief settle (graph is now connected,
        //    masterGain=0 masks any transient)
        setTimeout(() => {
          if (deckA) deckA.volume = 1;
          if (deckB) deckB.volume = 1;
        }, 50);

        if (shouldResume) {
          // Delay clearing wasPlaying so rapid interrupt cycles don't lose the signal.
          if (clearWasPlayingTimerRef.current) clearTimeout(clearWasPlayingTimerRef.current);
          clearWasPlayingTimerRef.current = setTimeout(() => {
            wasPlayingBeforeInterruptRef.current = false;
            clearWasPlayingTimerRef.current = null;
          }, 3000);

          if (!useAudioStore.getState().isPlaying) {
            useAudioStore.getState().setIsPlaying(true);
          }

          const active = findActiveDeck();

          // 3. Fade in masterGain — the only audible transition
          if (active && needsResync) {
            // Long interruption (app switch) — the audio pipeline stays pitch-shifted
            // for seconds after a simple seek. Force a full source reload to reset it:
            // save position → reload src → seek → play → fade in.
            const savedTime = active.deck.currentTime;
            const src = active.deck.src;
            console.log(`[WEB AUDIO] Hard resync deck ${active.label} at ${savedTime.toFixed(1)}s`);
            active.deck.pause();
            active.deck.src = src;
            active.deck.currentTime = savedTime;
            active.deck.play().catch((err) =>
              console.warn(`[WEB AUDIO] Resume deck ${active.label} failed:`, err.message));
            // Keep element muted until pipeline stabilizes from reload
            const dA = deckAElementRef.current;
            const dB = deckBElementRef.current;
            if (dA) dA.volume = 0;
            if (dB) dB.volume = 0;
            // Wait for pipeline to settle, then unmute and fade
            setTimeout(() => {
              if (dA) dA.volume = 1;
              if (dB) dB.volume = 1;
              fadeInMaster(0);
            }, 300);
          } else {
            if (active?.paused) {
              active.deck.play().catch((err) =>
                console.warn(`[WEB AUDIO] Resume deck ${active.label} failed:`, err.message));
            }
            // Quick bounce (lock screen) — immediate fade
            fadeInMaster(0);
          }
        } else {
          wasPlayingBeforeInterruptRef.current = false;
          // Not playing — just restore master gain
          const userVolume = useAudioStore.getState().volume ?? 1.0;
          if (master) {
            master.gain.setValueAtTime(userVolume, ctx.currentTime);
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const state = ctx.state as string;
      console.log(`[WEB AUDIO] Visibility returned, context ${state}`);

      if (state === 'suspended' || state === 'interrupted') {
        console.log(`[WEB AUDIO] Context ${state} — attempting resume`);
        ctx.resume().catch((err) =>
          console.warn('[WEB AUDIO] Resume on visibility failed:', err));
      }

      // CRITICAL: The interrupted handler disconnects masterGain and sets
      // element.volume=0 to prevent pitch artifacts. If the context is already
      // 'running' when visibility returns (e.g. lock/unlock recovered it), the
      // statechange handler may have already fired before this event, leaving
      // audio silently connected but volumes at 0. Do a full reconnection check.
      // Also handles the case where ctx.resume() above succeeds synchronously.
      setTimeout(() => {
        const currentState = ctx.state as string;
        if (currentState !== 'running') return;

        const master = masterGainRef.current;
        const deckA = deckAElementRef.current;
        const deckB = deckBElementRef.current;
        const shouldBeAudible = wasPlayingBeforeInterruptRef.current || useAudioStore.getState().isPlaying;

        // Check if masterGain is disconnected (gain=0 is our signal from interrupted handler)
        const needsReconnect = master && master.gain.value === 0;

        if (needsReconnect && shouldBeAudible) {
          const visInterruptDuration = interruptedAtRef.current > 0
            ? Date.now() - interruptedAtRef.current : 0;
          const visNeedsResync = visInterruptDuration > 500;
          console.log(`[WEB AUDIO] Visibility recovery: reconnecting audio graph (interruptMs=${visInterruptDuration}, hardResync=${visNeedsResync})`);

          // Reconnect masterGain
          try { master.gain.cancelScheduledValues(0); } catch { /* no scheduled values */ }
          master.gain.setValueAtTime(0, ctx.currentTime);
          try { master.connect(ctx.destination); } catch { /* already connected */ }

          // Ensure store says playing
          if (!useAudioStore.getState().isPlaying) {
            useAudioStore.getState().setIsPlaying(true);
          }

          const active = findActiveDeck();

          if (active && visNeedsResync) {
            // Long interruption — do hard resync to fix pitch artifacts
            // (same logic as the statechange handler)
            if (deckA) deckA.volume = 0;
            if (deckB) deckB.volume = 0;
            const savedTime = active.deck.currentTime;
            const src = active.deck.src;
            console.log(`[WEB AUDIO] Visibility hard resync deck ${active.label} at ${savedTime.toFixed(1)}s`);
            active.deck.pause();
            active.deck.src = src;
            active.deck.currentTime = savedTime;
            active.deck.play().catch((err) =>
              console.warn(`[WEB AUDIO] Visibility resume deck ${active.label} failed:`, err.message));
            setTimeout(() => {
              if (deckA) deckA.volume = 1;
              if (deckB) deckB.volume = 1;
              fadeInMaster(0);
            }, 300);
          } else {
            // Short interruption — just restore volumes and fade in
            if (deckA) deckA.volume = 1;
            if (deckB) deckB.volume = 1;

            // Resume any paused deck
            if (active?.paused) {
              active.deck.play().catch((err) =>
                console.warn(`[WEB AUDIO] Visibility resume deck ${active.label} failed:`, err.message));
            }

            // Fade in
            fadeInMaster(50);
          }

          // Clear wasPlaying after recovery
          if (clearWasPlayingTimerRef.current) clearTimeout(clearWasPlayingTimerRef.current);
          clearWasPlayingTimerRef.current = setTimeout(() => {
            wasPlayingBeforeInterruptRef.current = false;
            clearWasPlayingTimerRef.current = null;
          }, 3000);
        }
      }, 300); // Brief delay to let ctx.resume() settle
    };

    ctx.addEventListener('statechange', handleStateChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      ctx.removeEventListener('statechange', handleStateChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (resumeIntervalRef.current) {
        clearInterval(resumeIntervalRef.current);
        resumeIntervalRef.current = null;
      }
    };
  }, [isInitialized]);

  return {
    audioContextRef,
    gainARef,
    gainBRef,
    analyserRef,
    isInitialized,
    initializeGraph,
    scheduleGainRamp,
    cancelGainRamp,
    setGainImmediate,
    getGainValue,
    setMasterVolume,
    resumeContext,
  };
}
