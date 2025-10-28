// DJ Mixer Service for professional DJ-style mixing
// Handles BPM matching, harmonic mixing, transitions, and auto-mixing

import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis, BPMCompatibility, KeyCompatibility, EnergyFlow } from './audio-analysis';
import { analyzeAudioFeatures, calculateBPMCompatibility, calculateKeyCompatibility, analyzeEnergyFlow } from './audio-analysis';
import { ServiceError } from '../utils';

// DJ mixing configuration
export interface DJMixerConfig {
  enableBPMMatching: boolean;
  enableHarmonicMixing: boolean;
  enableEnergyFlow: boolean;
  transitionDuration: number; // in seconds
  crossfadeCurve: 'linear' | 'exponential' | 'logarithmic' | 's-curve';
  autoMixMode: 'off' | 'conservative' | 'balanced' | 'aggressive';
  minCompatibilityThreshold: number; // 0.0-1.0
  maxBPMDifference: number; // in BPM
  enableKeyLock: boolean; // Maintain key when adjusting BPM
}

// DJ transition types
export type DJTransitionType = 
  | 'cut' // Immediate cut
  | 'crossfade' // Gradual crossfade
  | 'beatmatch' // Beat-matched transition
  | 'harmonic' // Harmonic mixing transition
  | 'energy_buildup' // Build energy with risers
  | 'breakdown' // Energy breakdown
  | 'echo_out' // Echo out transition
  | 'filter_sweep' // Filter sweep transition;

// DJ transition plan
export interface DJTransition {
  fromSong: Song;
  toSong: Song;
  fromAnalysis: AudioAnalysis;
  toAnalysis: AudioAnalysis;
  transitionType: DJTransitionType;
  startTime: number; // When to start transition (seconds before end of fromSong)
  duration: number; // Transition duration in seconds
  bpmAdjustment: number; // BPM adjustment needed (1.0 = no change)
  pitchAdjustment: number; // Pitch adjustment in semitones
  energyCurve: number[]; // Energy levels throughout transition (0.0-1.0)
  volumeCurve: number[]; // Volume levels throughout transition (0.0-1.0)
  filterCurve?: number[]; // Filter cutoff throughout transition (0.0-1.0)
  compatibility: number; // Overall compatibility score (0.0-1.0)
  notes: string; // DJ notes about the transition
}

// DJ mix analysis
export interface DJMixAnalysis {
  song: Song;
  analysis: AudioAnalysis;
  bpmCompatibility: BPMCompatibility;
  keyCompatibility: KeyCompatibility;
  energyFlow: EnergyFlow;
  overallCompatibility: number;
  recommendedTransition: DJTransitionType;
  transitionNotes: string[];
}

// DJ set plan
export interface DJSetPlan {
  songs: Song[];
  transitions: DJTransition[];
  totalDuration: number;
  averageEnergy: number;
  energyProfile: number[]; // Energy levels throughout the set
  bpmProgression: number[]; // BPM progression throughout the set
  keyProgression: MusicalKey[]; // Key progression throughout the set
  compatibility: number; // Overall set compatibility
  notes: string[];
}

// Default DJ mixer configuration
export const DEFAULT_DJ_MIXER_CONFIG: DJMixerConfig = {
  enableBPMMatching: true,
  enableHarmonicMixing: true,
  enableEnergyFlow: true,
  transitionDuration: 8.0, // 8 seconds default transition
  crossfadeCurve: 's-curve',
  autoMixMode: 'balanced',
  minCompatibilityThreshold: 0.6,
  maxBPMDifference: 10,
  enableKeyLock: true
};

// Musical key type (re-export for convenience)
export type MusicalKey = 
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' 
  | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
  | 'Cm' | 'C#m' | 'Dm' | 'D#m' | 'Em' | 'Fm'
  | 'F#m' | 'Gm' | 'G#m' | 'Am' | 'A#m' | 'Bm';

/**
 * Analyze a song for DJ mixing compatibility
 */
export async function analyzeSongForDJMixing(
  song: Song,
  previousSong?: Song,
  config: DJMixerConfig = DEFAULT_DJ_MIXER_CONFIG
): Promise<DJMixAnalysis> {
  try {
    // Analyze current song
    const analysis = await analyzeAudioFeatures(song);
    
    let bpmCompatibility: BPMCompatibility = { bpm: analysis.bpm, compatibility: 1.0, relationship: 'exact_match' };
    let keyCompatibility: KeyCompatibility = { key: analysis.key, compatibility: 1.0, relationship: 'perfect_match' };
    let energyFlow: EnergyFlow = { currentEnergy: analysis.energy, targetEnergy: analysis.energy, energyDirection: 'steady', transitionType: 'cooldown' };
    
    // If we have a previous song, calculate compatibility
    if (previousSong) {
      const previousAnalysis = await analyzeAudioFeatures(previousSong);
      bpmCompatibility = calculateBPMCompatibility(previousAnalysis.bpm, analysis.bpm);
      keyCompatibility = calculateKeyCompatibility(previousAnalysis.key, analysis.key);
      energyFlow = analyzeEnergyFlow(previousAnalysis, analysis);
    }
    
    // Calculate overall compatibility
    let overallCompatibility = 0;
    const weights = {
      bpm: config.enableBPMMatching ? 0.4 : 0,
      key: config.enableHarmonicMixing ? 0.4 : 0,
      energy: config.enableEnergyFlow ? 0.2 : 0
    };
    
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    
    if (totalWeight > 0) {
      overallCompatibility = (
        (bpmCompatibility.compatibility * weights.bpm) +
        (keyCompatibility.compatibility * weights.key) +
        (Math.abs(1 - Math.abs(energyFlow.currentEnergy - energyFlow.targetEnergy)) * weights.energy)
      ) / totalWeight;
    } else {
      overallCompatibility = 0.5; // Default if all features disabled
    }
    
    // Determine recommended transition type
    const recommendedTransition = determineRecommendedTransition(
      bpmCompatibility,
      keyCompatibility,
      energyFlow,
      analysis
    );
    
    // Generate transition notes
    const transitionNotes = generateTransitionNotes(
      bpmCompatibility,
      keyCompatibility,
      energyFlow,
      recommendedTransition
    );
    
    return {
      song,
      analysis,
      bpmCompatibility,
      keyCompatibility,
      energyFlow,
      overallCompatibility,
      recommendedTransition,
      transitionNotes
    };
  } catch (error) {
    throw new ServiceError(
      'DJ_MIX_ANALYSIS_ERROR',
      `Failed to analyze song for DJ mixing: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Determine the best transition type based on compatibility analysis
 */
function determineRecommendedTransition(
  bpmCompatibility: BPMCompatibility,
  keyCompatibility: KeyCompatibility,
  energyFlow: EnergyFlow,
  analysis: AudioAnalysis
): DJTransitionType {
  // High energy buildup
  if (energyFlow.energyDirection === 'rising' && energyFlow.targetEnergy > 0.7) {
    return 'energy_buildup';
  }
  
  // Energy breakdown
  if (energyFlow.energyDirection === 'falling' && energyFlow.targetEnergy < 0.3) {
    return 'breakdown';
  }
  
  // Perfect harmonic match
  if (keyCompatibility.compatibility > 0.9) {
    return 'harmonic';
  }
  
  // Good BPM match
  if (bpmCompatibility.compatibility > 0.8) {
    return 'beatmatch';
  }
  
  // Default to crossfade
  return 'crossfade';
}

/**
 * Generate DJ notes about the transition
 */
function generateTransitionNotes(
  bpmCompatibility: BPMCompatibility,
  keyCompatibility: KeyCompatibility,
  energyFlow: EnergyFlow,
  transitionType: DJTransitionType
): string[] {
  const notes: string[] = [];
  
  // BPM notes
  if (bpmCompatibility.relationship === 'exact_match') {
    notes.push('Perfect BPM match - no adjustment needed');
  } else if (bpmCompatibility.relationship === 'close_match') {
    notes.push(`Close BPM match (${Math.round(bpmCompatibility.bpm)} BPM) - slight adjustment may be needed`);
  } else if (bpmCompatibility.relationship === 'double_time') {
    notes.push('Double time transition - use beatjump or half-time mixing');
  } else if (bpmCompatibility.relationship === 'half_time') {
    notes.push('Half time transition - good for breakdown sections');
  } else {
    notes.push(`BPM adjustment needed: ${Math.round(bpmCompatibility.bpm)} BPM`);
  }
  
  // Key notes
  if (keyCompatibility.relationship === 'perfect_match') {
    notes.push('Same key - perfect harmonic mixing');
  } else if (keyCompatibility.relationship === 'relative_minor') {
    notes.push('Relative minor/major relationship - excellent for harmonic mixing');
  } else if (keyCompatibility.relationship === 'dominant') {
    notes.push('Dominant relationship - strong harmonic connection');
  } else if (keyCompatibility.relationship === 'compatible') {
    notes.push('Compatible keys - harmonic mixing possible');
  } else {
    notes.push('Key clash detected - consider using filter or effects');
  }
  
  // Energy notes
  if (energyFlow.energyDirection === 'rising') {
    notes.push('Energy rising - build up tension');
  } else if (energyFlow.energyDirection === 'falling') {
    notes.push('Energy falling - create breakdown or cooldown');
  } else {
    notes.push('Energy steady - maintain current vibe');
  }
  
  // Transition-specific notes
  switch (transitionType) {
    case 'energy_buildup':
      notes.push('Use risers, filter sweeps, and snare rolls');
      break;
    case 'breakdown':
      notes.push('Strip back to percussion or atmospheric elements');
      break;
    case 'harmonic':
      notes.push('Focus on smooth EQ transitions and melody blending');
      break;
    case 'beatmatch':
      notes.push('Align phrases and use precise timing');
      break;
    case 'crossfade':
      notes.push('Use EQ to prevent frequency clashes during crossfade');
      break;
  }
  
  return notes;
}

/**
 * Create a detailed transition plan between two songs
 */
export async function createTransitionPlan(
  fromSong: Song,
  toSong: Song,
  config: DJMixerConfig = DEFAULT_DJ_MIXER_CONFIG
): Promise<DJTransition> {
  try {
    // Analyze both songs
    const fromAnalysis = await analyzeAudioFeatures(fromSong);
    const toAnalysis = await analyzeAudioFeatures(toSong);
    
    // Calculate compatibility
    const bpmCompatibility = calculateBPMCompatibility(fromAnalysis.bpm, toAnalysis.bpm);
    const keyCompatibility = calculateKeyCompatibility(fromAnalysis.key, toAnalysis.key);
    const energyFlow = analyzeEnergyFlow(fromAnalysis, toAnalysis);
    
    // Determine transition type
    const transitionType = determineRecommendedTransition(bpmCompatibility, keyCompatibility, energyFlow, toAnalysis);
    
    // Calculate transition parameters
    const { startTime, duration, bpmAdjustment, pitchAdjustment } = calculateTransitionParameters(
      fromAnalysis,
      toAnalysis,
      bpmCompatibility,
      config
    );
    
    // Generate transition curves
    const { energyCurve, volumeCurve, filterCurve } = generateTransitionCurves(
      transitionType,
      duration,
      energyFlow,
      config
    );
    
    // Calculate overall compatibility
    const overallCompatibility = (
      (bpmCompatibility.compatibility * 0.4) +
      (keyCompatibility.compatibility * 0.4) +
      (Math.abs(1 - Math.abs(energyFlow.currentEnergy - energyFlow.targetEnergy)) * 0.2)
    );
    
    // Generate DJ notes
    const notes = generateTransitionNotes(bpmCompatibility, keyCompatibility, energyFlow, transitionType).join('. ');
    
    return {
      fromSong,
      toSong,
      fromAnalysis,
      toAnalysis,
      transitionType,
      startTime,
      duration,
      bpmAdjustment,
      pitchAdjustment,
      energyCurve,
      volumeCurve,
      filterCurve,
      compatibility: overallCompatibility,
      notes
    };
  } catch (error) {
    throw new ServiceError(
      'TRANSITION_PLAN_ERROR',
      `Failed to create transition plan: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate transition parameters based on song analysis
 */
function calculateTransitionParameters(
  fromAnalysis: AudioAnalysis,
  toAnalysis: AudioAnalysis,
  bpmCompatibility: BPMCompatibility,
  config: DJMixerConfig
): {
  startTime: number;
  duration: number;
  bpmAdjustment: number;
  pitchAdjustment: number;
} {
  // Calculate when to start transition (typically 8-32 bars before end)
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / fromAnalysis.bpm;
  const barsBeforeEnd = 8; // Start transition 8 bars before end
  const startTime = barsBeforeEnd * beatsPerBar * secondsPerBeat;
  
  // Calculate duration based on transition type and compatibility
  let duration = config.transitionDuration;
  
  // Longer transitions for better compatibility
  if (bpmCompatibility.compatibility > 0.8 && bpmCompatibility.relationship !== 'exact_match') {
    duration *= 1.5; // Extra time for BPM adjustment
  }
  
  // Calculate BPM adjustment
  let bpmAdjustment = 1.0;
  if (config.enableBPMMatching) {
    switch (bpmCompatibility.relationship) {
      case 'exact_match':
      case 'close_match':
        bpmAdjustment = 1.0;
        break;
      case 'double_time':
        bpmAdjustment = 0.5;
        break;
      case 'half_time':
        bpmAdjustment = 2.0;
        break;
      default:
        // Gradual BPM adjustment
        bpmAdjustment = fromAnalysis.bpm / toAnalysis.bpm;
        break;
    }
  }
  
  // Calculate pitch adjustment (if key lock is disabled)
  let pitchAdjustment = 0;
  if (!config.enableKeyLock && config.enableBPMMatching) {
    // Simple pitch adjustment calculation (would be more sophisticated in real implementation)
    pitchAdjustment = 12 * Math.log2(bpmAdjustment);
  }
  
  return {
    startTime,
    duration,
    bpmAdjustment,
    pitchAdjustment
  };
}

/**
 * Generate transition curves for volume, energy, and filters
 */
function generateTransitionCurves(
  transitionType: DJTransitionType,
  duration: number,
  energyFlow: EnergyFlow,
  config: DJMixerConfig
): {
  energyCurve: number[];
  volumeCurve: number[];
  filterCurve?: number[];
} {
  const steps = Math.floor(duration * 10); // 10 steps per second
  const energyCurve: number[] = [];
  const volumeCurve: number[] = [];
  const filterCurve: number[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps; // 0.0 to 1.0
    
    // Apply curve function based on crossfade curve setting
    let curvedProgress = progress;
    switch (config.crossfadeCurve) {
      case 'linear':
        curvedProgress = progress;
        break;
      case 'exponential':
        curvedProgress = Math.pow(progress, 2);
        break;
      case 'logarithmic':
        curvedProgress = Math.sqrt(progress);
        break;
      case 's-curve':
        // Smooth S-curve using cosine interpolation
        curvedProgress = 0.5 * (1 - Math.cos(progress * Math.PI));
        break;
    }
    
    // Generate volume curve (fade out old, fade in new)
    const toVolume = Math.min(1, curvedProgress);
    volumeCurve.push(toVolume); // We'll use this for the incoming track
    
    // Generate energy curve based on transition type
    let energy = 0;
    switch (transitionType) {
      case 'energy_buildup':
        energy = energyFlow.currentEnergy + (energyFlow.targetEnergy - energyFlow.currentEnergy) * Math.pow(curvedProgress, 0.5);
        break;
      case 'breakdown':
        energy = energyFlow.currentEnergy * (1 - curvedProgress * 0.8);
        break;
      case 'harmonic':
        energy = energyFlow.currentEnergy + (energyFlow.targetEnergy - energyFlow.currentEnergy) * curvedProgress;
        break;
      case 'beatmatch':
        energy = Math.max(energyFlow.currentEnergy, energyFlow.targetEnergy);
        break;
      case 'crossfade':
      default:
        energy = energyFlow.currentEnergy + (energyFlow.targetEnergy - energyFlow.currentEnergy) * curvedProgress;
        break;
    }
    energyCurve.push(Math.max(0, Math.min(1, energy)));
    
    // Generate filter curve (for filter sweep transitions)
    if (transitionType === 'energy_buildup' || transitionType === 'breakdown') {
      let filter = 0;
      if (transitionType === 'energy_buildup') {
        // Low to high frequency sweep
        filter = curvedProgress;
      } else {
        // High to low frequency sweep
        filter = 1 - curvedProgress * 0.7;
      }
      filterCurve.push(filter);
    }
  }
  
  const result: { energyCurve: number[]; volumeCurve: number[]; filterCurve?: number[] } = {
    energyCurve,
    volumeCurve
  };
  
  if (filterCurve.length > 0) {
    result.filterCurve = filterCurve;
  }
  
  return result;
}

/**
 * Plan an entire DJ set with optimal transitions
 */
export async function planDJSet(
  songs: Song[],
  config: DJMixerConfig = DEFAULT_DJ_MIXER_CONFIG
): Promise<DJSetPlan> {
  if (songs.length < 2) {
    throw new ServiceError('DJ_SET_ERROR', 'Need at least 2 songs to plan a DJ set');
  }
  
  try {
    // Analyze all songs
    const analyses = await Promise.all(
      songs.map(song => analyzeAudioFeatures(song))
    );
    
    // Create transitions between consecutive songs
    const transitions: DJTransition[] = [];
    for (let i = 0; i < songs.length - 1; i++) {
      const transition = await createTransitionPlan(songs[i], songs[i + 1], config);
      transitions.push(transition);
    }
    
    // Calculate set statistics
    const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0);
    const averageEnergy = analyses.reduce((sum, analysis) => sum + analysis.energy, 0) / analyses.length;
    
    // Generate energy profile
    const energyProfile: number[] = [];
    const bpmProgression: number[] = [];
    const keyProgression: MusicalKey[] = [];
    
    for (let i = 0; i < songs.length; i++) {
      energyProfile.push(analyses[i].energy);
      bpmProgression.push(analyses[i].bpm);
      keyProgression.push(analyses[i].key);
    }
    
    // Calculate overall set compatibility
    const compatibility = transitions.reduce((sum, transition) => sum + transition.compatibility, 0) / transitions.length;
    
    // Generate set notes
    const notes = generateSetNotes(songs, analyses, transitions, config);
    
    return {
      songs,
      transitions,
      totalDuration,
      averageEnergy,
      energyProfile,
      bpmProgression,
      keyProgression,
      compatibility,
      notes
    };
  } catch (error) {
    throw new ServiceError(
      'DJ_SET_PLANNING_ERROR',
      `Failed to plan DJ set: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate notes about the DJ set
 */
function generateSetNotes(
  songs: Song[],
  analyses: AudioAnalysis[],
  transitions: DJTransition[],
  config: DJMixerConfig
): string[] {
  const notes: string[] = [];
  
  // Energy flow notes
  const energyChanges = transitions.filter(t => 
    Math.abs(t.fromAnalysis.energy - t.toAnalysis.energy) > 0.3
  );
  
  if (energyChanges.length > transitions.length * 0.5) {
    notes.push('High energy variation - good for dynamic mixing');
  } else if (energyChanges.length === 0) {
    notes.push('Consistent energy level - good for steady vibe');
  } else {
    notes.push('Moderate energy variation - balanced set structure');
  }
  
  // BPM progression notes
  const bpmChanges = transitions.filter(t => 
    Math.abs(t.fromAnalysis.bpm - t.toAnalysis.bpm) > 10
  );
  
  if (bpmChanges.length > transitions.length * 0.5) {
    notes.push('Significant BPM variations - requires careful mixing');
  } else if (bpmChanges.length === 0) {
    notes.push('Consistent BPM - easy to mix');
  } else {
    notes.push('Moderate BPM variation - standard progression');
  }
  
  // Key compatibility notes
  const keyIssues = transitions.filter(t => {
    // Calculate key compatibility for this transition
    const keyComp = calculateKeyCompatibility(t.fromAnalysis.key, t.toAnalysis.key);
    return keyComp.compatibility < 0.5;
  });
  
  if (keyIssues.length > 0) {
    notes.push(`${keyIssues.length} key clashes detected - consider using effects or filters`);
  } else {
    notes.push('Good harmonic compatibility throughout the set');
  }
  
  // Auto-mix mode notes
  switch (config.autoMixMode) {
    case 'conservative':
      notes.push('Conservative mixing - prioritizes smooth transitions over creativity');
      break;
    case 'balanced':
      notes.push('Balanced mixing - good balance between smoothness and creativity');
      break;
    case 'aggressive':
      notes.push('Aggressive mixing - prioritizes energy and creativity');
      break;
  }
  
  return notes;
}