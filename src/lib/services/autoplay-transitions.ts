/**
 * Autoplay Transitions Service
 *
 * Provides smart transitions for playlist autoplay queueing.
 * Handles crossfade, silence, and reverb tail blend modes
 * with optional AI-driven transition optimization.
 */

import type { Song } from '@/lib/types/song';
import { analyzeTransition, type TransitionAnalysis, type TransitionType } from './transition-effects';

// Blend mode types for autoplay transitions
export type AutoplayBlendMode = 'crossfade' | 'silence' | 'reverb_tail';

// Autoplay transition configuration
export interface AutoplayTransitionConfig {
  blendMode: AutoplayBlendMode;
  duration: number; // Duration in seconds (1-10)
  smartTransitions: boolean; // Use AI to determine optimal transition
}

// Result of transition analysis for autoplay
export interface AutoplayTransitionResult {
  transitionType: TransitionType;
  fadeOutDuration: number; // milliseconds
  fadeInDuration: number; // milliseconds
  gapDuration: number; // milliseconds (for silence mode)
  reverbTailDuration: number; // milliseconds (for reverb_tail mode)
  compatibility: number; // 0-1 score
  energyFlow: 'rising' | 'falling' | 'stable';
}

// Default configuration
export const DEFAULT_AUTOPLAY_CONFIG: AutoplayTransitionConfig = {
  blendMode: 'crossfade',
  duration: 4, // 4 seconds default
  smartTransitions: true,
};

/**
 * Calculate the optimal transition parameters for autoplay
 * Based on blend mode and optional smart analysis
 */
export async function calculateAutoplayTransition(
  currentSong: Song,
  nextSong: Song,
  config: AutoplayTransitionConfig = DEFAULT_AUTOPLAY_CONFIG
): Promise<AutoplayTransitionResult> {
  const durationMs = config.duration * 1000;

  // Base result with defaults
  let result: AutoplayTransitionResult = {
    transitionType: 'crossfade',
    fadeOutDuration: durationMs / 2,
    fadeInDuration: durationMs / 2,
    gapDuration: 0,
    reverbTailDuration: 0,
    compatibility: 0.7,
    energyFlow: 'stable',
  };

  // If smart transitions are enabled, analyze the song pair
  let analysis: TransitionAnalysis | null = null;
  if (config.smartTransitions) {
    try {
      analysis = await analyzeTransition(currentSong, nextSong);
      result.compatibility = analysis.compatibility;
      result.energyFlow = analysis.energyFlow;
    } catch (error) {
      console.warn('Smart transition analysis failed, using defaults:', error);
    }
  }

  // Apply blend mode-specific parameters
  switch (config.blendMode) {
    case 'crossfade':
      result = applyCrossfadeMode(result, durationMs, analysis);
      break;
    case 'silence':
      result = applySilenceMode(result, durationMs, analysis);
      break;
    case 'reverb_tail':
      result = applyReverbTailMode(result, durationMs, analysis);
      break;
  }

  return result;
}

/**
 * Apply crossfade blend mode parameters
 * Creates an overlapping fade between songs
 */
function applyCrossfadeMode(
  result: AutoplayTransitionResult,
  durationMs: number,
  analysis: TransitionAnalysis | null
): AutoplayTransitionResult {
  const updated = { ...result };
  updated.transitionType = 'crossfade';

  if (analysis) {
    // Adjust crossfade based on compatibility
    if (analysis.compatibility > 0.8) {
      // High compatibility: longer, more gradual crossfade
      updated.fadeOutDuration = durationMs * 0.6;
      updated.fadeInDuration = durationMs * 0.6;
    } else if (analysis.compatibility < 0.4) {
      // Low compatibility: shorter crossfade
      updated.fadeOutDuration = durationMs * 0.3;
      updated.fadeInDuration = durationMs * 0.3;
    } else {
      // Medium compatibility: balanced crossfade
      updated.fadeOutDuration = durationMs * 0.5;
      updated.fadeInDuration = durationMs * 0.5;
    }

    // Adjust based on energy flow
    if (analysis.energyFlow === 'rising') {
      // Building up: fade in faster
      updated.fadeInDuration = updated.fadeInDuration * 0.8;
    } else if (analysis.energyFlow === 'falling') {
      // Coming down: fade out slower
      updated.fadeOutDuration = updated.fadeOutDuration * 1.2;
    }
  } else {
    // No analysis: use equal crossfade
    updated.fadeOutDuration = durationMs / 2;
    updated.fadeInDuration = durationMs / 2;
  }

  return updated;
}

/**
 * Apply silence blend mode parameters
 * Creates a brief gap of silence between songs
 */
function applySilenceMode(
  result: AutoplayTransitionResult,
  durationMs: number,
  analysis: TransitionAnalysis | null
): AutoplayTransitionResult {
  const updated = { ...result };
  updated.transitionType = 'cut';

  // Split duration into fade out, gap, fade in
  const fadeTime = durationMs * 0.3; // 30% for each fade
  const gapTime = durationMs * 0.4; // 40% for silence gap

  updated.fadeOutDuration = fadeTime;
  updated.fadeInDuration = fadeTime;
  updated.gapDuration = gapTime;

  if (analysis) {
    // Adjust gap based on energy flow
    if (analysis.energyFlow === 'rising') {
      // Building anticipation: slightly longer gap
      updated.gapDuration = gapTime * 1.2;
    } else if (analysis.energyFlow === 'falling') {
      // Transition down: shorter gap
      updated.gapDuration = gapTime * 0.8;
    }
  }

  return updated;
}

/**
 * Apply reverb tail blend mode parameters
 * Creates a wash of reverb at the end of the current song
 */
function applyReverbTailMode(
  result: AutoplayTransitionResult,
  durationMs: number,
  analysis: TransitionAnalysis | null
): AutoplayTransitionResult {
  const updated = { ...result };
  updated.transitionType = 'reverb_wash';

  // Reverb tail mode: most time on reverb, short fade in
  const reverbTime = durationMs * 0.7; // 70% for reverb tail
  const fadeInTime = durationMs * 0.3; // 30% for fade in next song

  updated.reverbTailDuration = reverbTime;
  updated.fadeInDuration = fadeInTime;
  updated.fadeOutDuration = 0; // No fade out, reverb handles it

  if (analysis) {
    // Adjust reverb based on compatibility
    if (analysis.compatibility > 0.8) {
      // High compatibility: shorter reverb, blend more
      updated.reverbTailDuration = reverbTime * 0.8;
      updated.fadeInDuration = fadeInTime * 1.2;
    } else if (analysis.compatibility < 0.4) {
      // Low compatibility: longer reverb to smooth transition
      updated.reverbTailDuration = reverbTime * 1.2;
    }
  }

  return updated;
}

/**
 * Generate Web Audio API parameters for the transition
 * Can be used by the audio player for applying effects
 */
export function getWebAudioTransitionParams(
  transitionResult: AutoplayTransitionResult
): {
  fadeOutCurve: 'linear' | 'exponential';
  fadeInCurve: 'linear' | 'exponential';
  reverbParams: {
    roomSize: number;
    damping: number;
    wetLevel: number;
  } | null;
} {
  // Default exponential curves for smoother transitions
  let fadeOutCurve: 'linear' | 'exponential' = 'exponential';
  let fadeInCurve: 'linear' | 'exponential' = 'exponential';
  let reverbParams: { roomSize: number; damping: number; wetLevel: number } | null = null;

  switch (transitionResult.transitionType) {
    case 'crossfade':
      // Equal power crossfade uses exponential curves
      fadeOutCurve = 'exponential';
      fadeInCurve = 'exponential';
      break;

    case 'cut':
      // Silence mode: linear for cleaner cuts
      fadeOutCurve = 'linear';
      fadeInCurve = 'linear';
      break;

    case 'reverb_wash':
      // Reverb tail: exponential fade with reverb
      fadeOutCurve = 'exponential';
      fadeInCurve = 'exponential';
      reverbParams = {
        roomSize: 0.8,
        damping: 0.5,
        wetLevel: 0.7,
      };
      break;

    case 'echo_out':
      // Echo transition
      fadeOutCurve = 'exponential';
      fadeInCurve = 'linear';
      break;

    default:
      // Default to exponential
      fadeOutCurve = 'exponential';
      fadeInCurve = 'exponential';
  }

  return { fadeOutCurve, fadeInCurve, reverbParams };
}

/**
 * Get a human-readable description of the transition
 * For UI display purposes
 */
export function getTransitionDescription(
  blendMode: AutoplayBlendMode,
  duration: number,
  transitionResult?: AutoplayTransitionResult
): string {
  const durationStr = `${duration}s`;

  switch (blendMode) {
    case 'crossfade':
      if (transitionResult && transitionResult.compatibility > 0.8) {
        return `Smooth ${durationStr} crossfade (high compatibility)`;
      } else if (transitionResult && transitionResult.compatibility < 0.4) {
        return `Quick ${durationStr} crossfade (low compatibility)`;
      }
      return `${durationStr} crossfade`;

    case 'silence':
      return `${durationStr} transition with brief silence`;

    case 'reverb_tail':
      return `${durationStr} reverb wash transition`;

    default:
      return `${durationStr} transition`;
  }
}

/**
 * Check if autoplay should trigger based on queue state
 * Called when the current playlist is about to end
 */
export function shouldTriggerAutoplay(
  currentSongIndex: number,
  playlistLength: number,
  autoplayEnabled: boolean
): boolean {
  if (!autoplayEnabled) return false;
  if (playlistLength === 0) return false;

  // Trigger when we're on the last song
  const isLastSong = currentSongIndex === playlistLength - 1;

  return isLastSong;
}

/**
 * Calculate the time before song end to start transition
 * Based on transition duration and blend mode
 */
export function getTransitionStartTime(
  songDuration: number, // in seconds
  transitionResult: AutoplayTransitionResult
): number {
  // Start transition early enough for the fade out to complete
  const fadeOutSeconds = transitionResult.fadeOutDuration / 1000;
  const reverbSeconds = transitionResult.reverbTailDuration / 1000;

  // Use the larger of fade out or reverb time
  const transitionTime = Math.max(fadeOutSeconds, reverbSeconds);

  // Start time is song duration minus transition time
  return Math.max(0, songDuration - transitionTime);
}
