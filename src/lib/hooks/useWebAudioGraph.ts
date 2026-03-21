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

/** True if an audio element has a real stream loaded (not a data: URI or empty). */
function hasRealSource(el: HTMLAudioElement | null): boolean {
  return el?.src != null && !el.src.startsWith('data:');
}

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
        if (hasRealSource(el) && el!.currentTime > 0) {
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
      const FADE_MS = 350;

      const doFade = () => {
        if (!master) return;
        master.gain.setValueAtTime(0, ctx.currentTime);
        master.gain.linearRampToValueAtTime(
          userVolume, ctx.currentTime + FADE_MS / 1000,
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

        // Disconnect masterGain from destination. The pitch/speed artifact
        // happens in the audio rendering pipeline during interrupted→running,
        // BEFORE any JS callback fires. Gain manipulation can't prevent it.
        // disconnect() modifies graph topology synchronously — no path to
        // speakers means no audible artifact.
        const master = masterGainRef.current;
        if (master) {
          try { master.disconnect(); } catch {}
        }

        console.log(`[WEB AUDIO] Context ${state} — wasPlaying=${wasPlayingBeforeInterruptRef.current}, disconnected`);

        // Aggressively attempt resume (iOS may allow it via MediaSession)
        nudgeResume();
        setTimeout(nudgeResume, 200);
        setTimeout(nudgeResume, 1000);
        setTimeout(nudgeResume, 3000);

      } else if (state === 'running') {
        const shouldResume = wasPlayingBeforeInterruptRef.current || useAudioStore.getState().isPlaying;
        const interruptDuration = interruptedAtRef.current > 0
          ? Date.now() - interruptedAtRef.current : 0;
        interruptedAtRef.current = 0;
        const needsResync = interruptDuration > 500;

        console.log(`[WEB AUDIO] Context running — shouldResume=${shouldResume}, interruptMs=${interruptDuration}, needsResync=${needsResync}`);

        // Mute audio elements at the element level BEFORE reconnecting the graph.
        // This is a safety net: even if the audio thread renders a few samples
        // before the GainNode value takes effect, element.volume=0 prevents
        // any pitch/speed artifacts from reaching speakers.
        const deckA = deckAElementRef.current;
        const deckB = deckBElementRef.current;
        if (deckA) deckA.volume = 0;
        if (deckB) deckB.volume = 0;

        // Reconnect masterGain → destination at gain=0.
        // While masterGain=0, restore element volumes to 1 — this is inaudible
        // because the GainNode blocks all output. Then let the GainNode fade
        // handle the entire smooth transition. This avoids any element volume
        // ramp issues (rAF doesn't fire when backgrounded on iOS).
        const master = masterGainRef.current;
        if (master) {
          try { master.gain.cancelScheduledValues(0); } catch {}
          master.gain.setValueAtTime(0, ctx.currentTime);
          try { master.connect(ctx.destination); } catch {}
        }

        // Snap element volumes back to 1 while masterGain=0 masks all output
        if (deckA) deckA.volume = 1;
        if (deckB) deckB.volume = 1;

        if (shouldResume) {
          // Delay clearing wasPlaying so rapid interrupt cycles don't lose the signal.
          // If another interrupted fires within 3s, the timer is cancelled above.
          if (clearWasPlayingTimerRef.current) clearTimeout(clearWasPlayingTimerRef.current);
          clearWasPlayingTimerRef.current = setTimeout(() => {
            wasPlayingBeforeInterruptRef.current = false;
            clearWasPlayingTimerRef.current = null;
          }, 3000);

          if (!useAudioStore.getState().isPlaying) {
            useAudioStore.getState().setIsPlaying(true);
          }

          const active = findActiveDeck();
          if (active?.paused) {
            active.deck.play().catch((err) =>
              console.warn(`[WEB AUDIO] Resume deck ${active.label} failed:`, err.message));
          }

          if (active && needsResync) {
            // Long interruption (app switch, call) — force pipeline resync via seek,
            // then wait for the pipeline to fully stabilize before fading in.
            active.deck.currentTime = active.deck.currentTime;
            console.log(`[WEB AUDIO] Resynced deck ${active.label} at ${active.deck.currentTime.toFixed(1)}s`);
            fadeInMaster(350);
          } else {
            // Quick bounce (lock screen, home button)
            fadeInMaster(150);
          }
        } else {
          wasPlayingBeforeInterruptRef.current = false;
          // Not playing — just restore master gain immediately
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
      if (state === 'suspended' || state === 'interrupted') {
        console.log(`[WEB AUDIO] Visibility returned, context ${state} — resuming`);
        ctx.resume().catch((err) =>
          console.warn('[WEB AUDIO] Resume on visibility failed:', err));
      }
    };

    ctx.addEventListener('statechange', handleStateChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      ctx.removeEventListener('statechange', handleStateChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
