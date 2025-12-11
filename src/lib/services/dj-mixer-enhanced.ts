// Enhanced DJ Mixer Service with advanced BPM matching and transition algorithms
// Provides professional DJ-style mixing with sophisticated compatibility analysis

import type { Song } from '@/lib/types/song';
import type { AudioAnalysis, BPMCompatibility, KeyCompatibility, EnergyFlow, MusicalKey } from './audio-analysis';
import { analyzeAudioFeatures, calculateKeyCompatibility, analyzeEnergyFlow } from './audio-analysis';
import { ServiceError } from '../utils';

// Enhanced DJ mixing configuration
export interface EnhancedDJMixerConfig {
  enableBPMMatching: boolean;
  enableHarmonicMixing: boolean;
  enableEnergyFlow: boolean;
  transitionDuration: number; // in seconds
  crossfadeCurve: 'linear' | 'exponential' | 'logarithmic' | 's-curve';
  autoMixMode: 'off' | 'conservative' | 'balanced' | 'aggressive';
  minCompatibilityThreshold: number; // 0.0-1.0
  maxBPMDifference: number; // in BPM
  enableKeyLock: boolean; // Maintain key when adjusting BPM
  enableAdvancedTransitions: boolean; // Enable beatmatching, harmonic mixing, etc.
  genreAwareness: boolean; // Consider genre when matching
  energyFlowControl: 'strict' | 'moderate' | 'flexible'; // How strictly to follow energy curves
}

// Enhanced DJ transition types with more sophisticated options
export type EnhancedDJTransitionType = 
  | 'cut' // Immediate cut
  | 'crossfade' // Gradual crossfade
  | 'beatmatch' // Beat-matched transition
  | 'harmonic' // Harmonic mixing transition
  | 'energy_buildup' // Build energy with risers
  | 'breakdown' // Energy breakdown
  | 'echo_out' // Echo out transition
  | 'filter_sweep' // Filter sweep transition
  | 'phase_align' // Phase alignment for beatmatching
  | 'tempo_ramp' // Gradual tempo change
  | 'key_modulation' // Key modulation during transition
  | 'reverse_spin' // Reverse spin effect
  | 'stutter_cut' // Stutter cut effect
  | 'sidechain_compression' // Sidechain compression during transition;

// Enhanced DJ transition plan with more detailed parameters
export interface EnhancedDJTransition {
  fromSong: Song;
  toSong: Song;
  fromAnalysis: AudioAnalysis;
  toAnalysis: AudioAnalysis;
  transitionType: EnhancedDJTransitionType;
  startTime: number; // When to start transition (seconds before end of fromSong)
  duration: number; // Transition duration in seconds
  bpmAdjustment: number; // BPM adjustment needed (1.0 = no change)
  pitchAdjustment: number; // Pitch adjustment in semitones
  energyCurve: number[]; // Energy levels throughout transition (0.0-1.0)
  volumeCurve: number[]; // Volume levels throughout transition (0.0-1.0)
  filterCurve?: number[]; // Filter cutoff throughout transition (0.0-1.0)
  eqCurve?: { low: number[]; mid: number[]; high: number[] }; // EQ adjustments
  phaseAlignment?: number[]; // Phase alignment for beatmatching
  effects?: string[]; // Additional effects to apply
  compatibility: number; // Overall compatibility score (0.0-1.0)
  notes: string; // DJ notes about the transition
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'; // Transition difficulty
  confidence: number; // Confidence in this transition (0.0-1.0)
}

// Enhanced BPM compatibility with more sophisticated analysis
export interface EnhancedBPMCompatibility extends BPMCompatibility {
  harmonicRelationship: 'perfect' | 'strong' | 'moderate' | 'weak';
  genreMatch: boolean;
  energyCompatibility: number;
  recommendedTechnique: string;
  confidence: number;
}

// Enhanced key compatibility with detailed analysis
export interface EnhancedKeyCompatibility extends KeyCompatibility {
  modulationPath: string[];
  modulationDifficulty: 'easy' | 'medium' | 'hard';
  harmonicStrength: number; // 0.0-1.0
  recommendedMixingStyle: string;
}

// Enhanced energy flow analysis
export interface EnhancedEnergyFlow extends EnergyFlow {
  energyGradient: number; // Rate of energy change (-1.0 to 1.0)
  transitionComplexity: 'simple' | 'moderate' | 'complex';
  danceFloorImpact: number; // How this affects dance floor (0.0-1.0)
  crowdControlPotential: number; // Potential for crowd control (0.0-1.0)
}

// Default enhanced DJ mixer configuration
export const DEFAULT_ENHANCED_DJ_MIXER_CONFIG: EnhancedDJMixerConfig = {
  enableBPMMatching: true,
  enableHarmonicMixing: true,
  enableEnergyFlow: true,
  transitionDuration: 8.0, // 8 seconds default transition
  crossfadeCurve: 's-curve',
  autoMixMode: 'balanced',
  minCompatibilityThreshold: 0.6,
  maxBPMDifference: 15,
  enableKeyLock: true,
  enableAdvancedTransitions: true,
  genreAwareness: true,
  energyFlowControl: 'moderate'
};

/**
 * Advanced BPM compatibility calculation with genre and energy consideration
 */
export function calculateEnhancedBPMCompatibility(
  bpm1: number,
  bpm2: number,
  options: {
    genre1?: string;
    genre2?: string;
    energy1?: number;
    energy2?: number;
    strictness?: 'strict' | 'moderate' | 'flexible';
  } = {}
): EnhancedBPMCompatibility {
  const ratio = bpm2 / bpm1;
  const diff = Math.abs(bpm1 - bpm2);
  
  // Basic compatibility calculation
  let baseCompatibility = 1.0;
  let relationship: BPMCompatibility['relationship'] = 'exact_match';
  
  // Exact match
  if (diff < 1) {
    baseCompatibility = 1.0;
    relationship = 'exact_match';
  }
  // Double time (2x)
  else if (Math.abs(ratio - 2) < 0.05) {
    baseCompatibility = 0.9;
    relationship = 'double_time';
  }
  // Half time (0.5x)
  else if (Math.abs(ratio - 0.5) < 0.05) {
    baseCompatibility = 0.9;
    relationship = 'half_time';
  }
  // Close match (within 5 BPM)
  else if (diff <= 5) {
    baseCompatibility = 0.8;
    relationship = 'close_match';
  }
  // Compatible (within 10 BPM)
  else if (diff <= 10) {
    baseCompatibility = 0.6;
    relationship = 'compatible';
  }
  
  // Check for harmonic BPM relationships (1.5x, 2/3, 3/4)
  let harmonicRelationship: EnhancedBPMCompatibility['harmonicRelationship'] = 'weak';
  const harmonicRatio = ratio;
  
  if (Math.abs(harmonicRatio - 1.5) < 0.05) {
    harmonicRelationship = 'perfect';
    baseCompatibility = Math.min(1.0, baseCompatibility + 0.1);
  } else if (Math.abs(harmonicRatio - (2/3)) < 0.05) {
    harmonicRelationship = 'strong';
    baseCompatibility = Math.min(1.0, baseCompatibility + 0.05);
  } else if (Math.abs(harmonicRatio - (3/4)) < 0.05) {
    harmonicRelationship = 'moderate';
    baseCompatibility = Math.min(1.0, baseCompatibility + 0.03);
  }
  
  // Genre compatibility
  const genreMatch = calculateGenreCompatibility(options.genre1, options.genre2);
  
  // Energy compatibility
  const energyDiff = Math.abs((options.energy1 || 0.5) - (options.energy2 || 0.5));
  const energyCompatibility = Math.max(0, 1.0 - (energyDiff / 1.0));
  
  // Combine all compatibility factors
  const weights = {
    bpm: 0.4,
    harmonic: 0.3,
    genre: genreMatch ? 0.2 : 0,
    energy: 0.1
  };
  
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const combinedCompatibility = (
    (baseCompatibility * weights.bpm) +
    (baseCompatibility * weights.harmonic) +
    (genreMatch ? 0.8 : 0.5) +
    energyCompatibility
  ) / totalWeight;
  
  // Determine recommended technique
  let recommendedTechnique = 'crossfade';
  if (harmonicRelationship === 'perfect' && diff < 5) {
    recommendedTechnique = 'harmonic';
  } else if (harmonicRelationship === 'strong' && diff < 10) {
    recommendedTechnique = 'beatmatch';
  } else if (diff > 15) {
    recommendedTechnique = 'tempo_ramp';
  } else if (energyCompatibility < 0.3) {
    recommendedTechnique = 'filter_sweep';
  }
  
  return {
    bpm: bpm2,
    compatibility: Math.min(1.0, combinedCompatibility),
    relationship,
    harmonicRelationship,
    genreMatch,
    energyCompatibility,
    recommendedTechnique,
    confidence: calculateTransitionConfidence(baseCompatibility, harmonicRelationship, genreMatch)
  };
}

/**
 * Calculate genre compatibility between two genres
 */
function calculateGenreCompatibility(genre1?: string, genre2?: string): boolean {
  if (!genre1 || !genre2) return false;
  
  // Define compatible genre groups
  const electronicGenres = ['electronic', 'techno', 'house', 'trance', 'dubstep', 'drum & bass'];
  const acousticGenres = ['acoustic', 'folk', 'classical', 'jazz'];
  const rockGenres = ['rock', 'metal', 'punk', 'alternative'];
  const popGenres = ['pop', 'r&b', 'soul'];
  
  // Check if genres are in the same group
  const genre1Group = electronicGenres.some(g => genre1.toLowerCase().includes(g)) ||
                    acousticGenres.some(g => genre1.toLowerCase().includes(g)) ||
                    rockGenres.some(g => genre1.toLowerCase().includes(g)) ||
                    popGenres.some(g => genre1.toLowerCase().includes(g));
  
  const genre2Group = electronicGenres.some(g => genre2.toLowerCase().includes(g)) ||
                    acousticGenres.some(g => genre2.toLowerCase().includes(g)) ||
                    rockGenres.some(g => genre2.toLowerCase().includes(g)) ||
                    popGenres.some(g => genre2.toLowerCase().includes(g));
  
  return genre1Group && genre2Group;
}

/**
 * Calculate transition confidence based on multiple factors
 */
function calculateTransitionConfidence(
  baseCompatibility: number,
  harmonicRelationship: string,
  genreMatch: boolean
): number {
  let confidence = baseCompatibility;
  
  // Boost confidence for perfect harmonic matches
  if (harmonicRelationship === 'perfect') {
    confidence = Math.min(1.0, confidence + 0.2);
  }
  
  // Boost confidence for genre matches
  if (genreMatch) {
    confidence = Math.min(1.0, confidence + 0.1);
  }
  
  // Reduce confidence for large BPM differences
  if (baseCompatibility < 0.7) {
    confidence = Math.max(0.3, confidence - 0.2);
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Advanced key compatibility calculation with modulation analysis
 */
export function calculateEnhancedKeyCompatibility(
  key1: string,
  key2: string,
  options: {
    allowModulation?: boolean;
    modulationComplexity?: 'simple' | 'moderate' | 'complex';
  } = {}
): EnhancedKeyCompatibility {
  const basicCompatibility = calculateKeyCompatibility(key1, key2);
  
  // Determine modulation path if allowed
  let modulationPath: string[] = [];
  let modulationDifficulty: 'easy' | 'medium' | 'hard' = 'medium';
  
  if (options.allowModulation !== false) {
    modulationPath = calculateModulationPath(key1, key2);
    modulationDifficulty = determineModulationDifficulty(modulationPath, options.modulationComplexity);
  }
  
  // Calculate harmonic strength
  const harmonicStrength = calculateHarmonicStrength(key1, key2);
  
  // Determine recommended mixing style
  let recommendedMixingStyle = 'crossfade';
  if (harmonicStrength > 0.8) {
    recommendedMixingStyle = 'harmonic';
  } else if (modulationPath.length > 0 && modulationPath.length <= 3) {
    recommendedMixingStyle = 'key_modulation';
  } else if (harmonicStrength > 0.6) {
    recommendedMixingStyle = 'phase_align';
  }
  
  return {
    key: key2 as MusicalKey,
    compatibility: basicCompatibility.compatibility,
    relationship: basicCompatibility.relationship,
    modulationPath,
    modulationDifficulty,
    harmonicStrength,
    recommendedMixingStyle
  };
}

/**
 * Calculate modulation path between two keys
 */
function calculateModulationPath(key1: string, key2: string): string[] {
  // Simplified modulation path calculation
  // In a real implementation, this would use music theory
  const path: string[] = [];
  
  // If keys are the same, no modulation needed
  if (key1 === key2) {
    return path;
  }
  
  // Simple modulation: go up or down the circle of fifths
  const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const key1Index = circleOfFifths.indexOf(key1.replace('m', ''));
  const key2Index = circleOfFifths.indexOf(key2.replace('m', ''));
  
  if (key1Index === -1 || key2Index === -1) return path;
  
  // Calculate shortest path around the circle
  const forwardDistance = (key2Index - key1Index + 12) % 12;
  const backwardDistance = (key1Index - key2Index + 12) % 12;
  
  if (forwardDistance <= backwardDistance) {
    path.push(`Forward: ${key1} → ${key2}`);
  } else {
    path.push(`Backward: ${key1} → ${key2}`);
  }
  
  return path;
}

/**
 * Determine modulation difficulty based on path complexity
 */
function determineModulationDifficulty(
  path: string[],
  complexity: 'simple' | 'moderate' | 'complex' = 'moderate'
): 'easy' | 'medium' | 'hard' {
  if (path.length === 0) return 'easy';
  if (path.length === 1) return complexity === 'simple' ? 'easy' : 'medium';
  if (path.length === 2) return complexity === 'complex' ? 'hard' : 'medium';
  return 'hard';
}

/**
 * Calculate harmonic strength between two keys
 */
function calculateHarmonicStrength(key1: string, key2: string): number {
  // Use the existing key compatibility calculation
  const compatibility = calculateKeyCompatibility(key1 as any, key2 as any);
  
  // Convert relationship to strength score
  switch (compatibility.relationship) {
    case 'perfect_match': return 1.0;
    case 'relative_minor': return 0.95;
    case 'dominant': return 0.9;
    case 'subdominant': return 0.85;
    case 'compatible': return 0.7;
    case 'incompatible': return 0.3;
    default: return 0.5;
  }
}

/**
 * Create enhanced transition plan with advanced features
 */
export async function createEnhancedTransitionPlan(
  fromSong: Song,
  toSong: Song,
  config: EnhancedDJMixerConfig = DEFAULT_ENHANCED_DJ_MIXER_CONFIG
): Promise<EnhancedDJTransition> {
  try {
    // Analyze both songs
    const fromAnalysis = await analyzeAudioFeatures(fromSong);
    const toAnalysis = await analyzeAudioFeatures(toSong);
    
    // Calculate enhanced compatibility
    const bpmCompatibility = calculateEnhancedBPMCompatibility(
      fromAnalysis.bpm,
      toAnalysis.bpm,
      {
        genre1: extractGenreFromSong(fromSong),
        genre2: extractGenreFromSong(toSong),
        energy1: fromAnalysis.energy,
        energy2: toAnalysis.energy,
        strictness: config.energyFlowControl
      }
    );
    
    const keyCompatibility = calculateEnhancedKeyCompatibility(
      fromAnalysis.key,
      toAnalysis.key,
      {
        allowModulation: config.enableAdvancedTransitions,
        modulationComplexity: 'moderate'
      }
    );
    
    // Determine enhanced transition type
    const transitionType = determineEnhancedTransitionType(
      bpmCompatibility,
      keyCompatibility,
      fromAnalysis,
      toAnalysis,
      config
    );
    
    // Calculate transition parameters
    const { startTime, duration, bpmAdjustment, pitchAdjustment } = calculateEnhancedTransitionParameters(
      fromAnalysis,
      toAnalysis,
      bpmCompatibility,
      transitionType,
      config
    );
    
    // Generate enhanced transition curves
    const { energyCurve, volumeCurve, filterCurve, eqCurve, effects } = generateEnhancedTransitionCurves(
      transitionType,
      duration,
      fromAnalysis,
      toAnalysis,
      bpmCompatibility,
      config
    );
    
    // Calculate overall compatibility
    const overallCompatibility = (
      (bpmCompatibility.compatibility * 0.35) +
      (keyCompatibility.compatibility * 0.35) +
      (bpmCompatibility.energyCompatibility * 0.2) +
      (bpmCompatibility.genreMatch ? 0.1 : 0)
    );
    
    // Generate DJ notes
    const notes = generateEnhancedTransitionNotes(
      bpmCompatibility,
      keyCompatibility,
      transitionType,
      fromAnalysis,
      toAnalysis
    );
    
    // Determine transition difficulty
    const difficulty = determineTransitionDifficulty(
      overallCompatibility,
      transitionType,
      bpmCompatibility.confidence
    );
    
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
      eqCurve,
      effects,
      compatibility: overallCompatibility,
      notes,
      difficulty,
      confidence: bpmCompatibility.confidence
    };
  } catch (error) {
    throw new ServiceError(
      'ENHANCED_TRANSITION_PLAN_ERROR',
      `Failed to create enhanced transition plan: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract genre from song metadata
 */
function extractGenreFromSong(song: Song): string {
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  // Common genre keywords
  const genreKeywords = [
    'electronic', 'techno', 'house', 'trance', 'dubstep', 'drum & bass',
    'acoustic', 'folk', 'classical', 'jazz',
    'rock', 'metal', 'punk', 'alternative',
    'pop', 'r&b', 'soul'
  ];
  
  // Find first matching genre keyword
  for (const keyword of genreKeywords) {
    if (metadata.includes(keyword)) {
      return keyword;
    }
  }
  
  return 'unknown';
}

/**
 * Determine enhanced transition type based on advanced analysis
 */
function determineEnhancedTransitionType(
  bpmCompatibility: EnhancedBPMCompatibility,
  keyCompatibility: EnhancedKeyCompatibility,
  fromAnalysis: AudioAnalysis,
  toAnalysis: AudioAnalysis,
  config: EnhancedDJMixerConfig
): EnhancedDJTransitionType {
  // High energy buildup with harmonic compatibility
  if (toAnalysis.energy > 0.8 && keyCompatibility.harmonicStrength > 0.8) {
    return 'energy_buildup';
  }
  
  // Energy breakdown with compatible keys
  if (toAnalysis.energy < 0.3 && keyCompatibility.compatibility > 0.6) {
    return 'breakdown';
  }
  
  // Perfect harmonic match with good BPM
  if (keyCompatibility.harmonicStrength > 0.9 && bpmCompatibility.compatibility > 0.8) {
    return 'harmonic';
  }
  
  // Beatmatch with phase alignment
  if (bpmCompatibility.harmonicRelationship === 'perfect' && config.enableAdvancedTransitions) {
    return 'phase_align';
  }
  
  // Tempo ramp for large BPM differences
  if (Math.abs(fromAnalysis.bpm - toAnalysis.bpm) > 15) {
    return 'tempo_ramp';
  }
  
  // Key modulation for complex transitions
  if (keyCompatibility.modulationPath.length > 0 && config.enableAdvancedTransitions) {
    return 'key_modulation';
  }
  
  // Advanced effects for high compatibility
  if (bpmCompatibility.confidence > 0.8 && config.enableAdvancedTransitions) {
    return 'filter_sweep';
  }
  
  // Default to crossfade
  return 'crossfade';
}

/**
 * Calculate enhanced transition parameters
 */
function calculateEnhancedTransitionParameters(
  fromAnalysis: AudioAnalysis,
  toAnalysis: AudioAnalysis,
  bpmCompatibility: EnhancedBPMCompatibility,
  transitionType: EnhancedDJTransitionType,
  config: EnhancedDJMixerConfig
): {
  startTime: number;
  duration: number;
  bpmAdjustment: number;
  pitchAdjustment: number;
} {
  // Calculate when to start transition
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / fromAnalysis.bpm;
  const barsBeforeEnd = 8; // Start transition 8 bars before end
  const startTime = barsBeforeEnd * beatsPerBar * secondsPerBeat;
  
  // Calculate duration based on transition type and compatibility
  let duration = config.transitionDuration;
  
  // Longer transitions for better compatibility
  if (bpmCompatibility.compatibility > 0.8) {
    duration *= 1.2;
  }
  
  // Shorter transitions for high energy differences
  if (Math.abs(fromAnalysis.energy - toAnalysis.energy) > 0.5) {
    duration *= 0.8;
  }
  
  // Calculate BPM adjustment
  let bpmAdjustment = 1.0;
  if (config.enableBPMMatching) {
    switch (bpmCompatibility.harmonicRelationship) {
      case 'perfect':
      case 'strong':
        bpmAdjustment = 1.0;
        break;
      case 'moderate':
        bpmAdjustment = fromAnalysis.bpm / toAnalysis.bpm;
        break;
      default:
        // Gradual BPM adjustment
        bpmAdjustment = 1.0 + (fromAnalysis.bpm - toAnalysis.bpm) / fromAnalysis.bpm;
        break;
    }
  }
  
  // Calculate pitch adjustment
  let pitchAdjustment = 0;
  if (!config.enableKeyLock && config.enableBPMMatching) {
    // Simple pitch adjustment calculation
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
 * Generate enhanced transition curves with multiple parameters
 */
function generateEnhancedTransitionCurves(
  transitionType: EnhancedDJTransitionType,
  duration: number,
  fromAnalysis: AudioAnalysis,
  toAnalysis: AudioAnalysis,
  bpmCompatibility: EnhancedBPMCompatibility,
  config: EnhancedDJMixerConfig
): {
  energyCurve: number[];
  volumeCurve: number[];
  filterCurve?: number[];
  eqCurve?: { low: number[]; mid: number[]; high: number[] };
  effects: string[];
} {
  const steps = Math.floor(duration * 10); // 10 steps per second
  const energyCurve: number[] = [];
  const volumeCurve: number[] = [];
  const filterCurve: number[] = [];
  const eqCurve = { low: [], mid: [], high: [] };
  const effects: string[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps; // 0.0 to 1.0
    
    // Apply curve function based on crossfade setting
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
    
    // Generate energy curve based on transition type
    let energy = 0;
    switch (transitionType) {
      case 'energy_buildup':
        energy = fromAnalysis.energy + (toAnalysis.energy - fromAnalysis.energy) * Math.pow(curvedProgress, 0.7);
        break;
      case 'breakdown':
        energy = fromAnalysis.energy * (1 - curvedProgress * 0.8);
        break;
      case 'harmonic':
        energy = fromAnalysis.energy + (toAnalysis.energy - fromAnalysis.energy) * curvedProgress;
        break;
      case 'phase_align':
        energy = Math.max(fromAnalysis.energy, toAnalysis.energy) * (0.5 + 0.5 * Math.sin(progress * Math.PI * 2));
        break;
      case 'tempo_ramp':
        energy = fromAnalysis.energy + (toAnalysis.energy - fromAnalysis.energy) * progress;
        break;
      case 'filter_sweep':
        energy = fromAnalysis.energy * (1 - curvedProgress * 0.6);
        break;
      default:
        energy = fromAnalysis.energy + (toAnalysis.energy - fromAnalysis.energy) * curvedProgress;
        break;
    }
    
    energyCurve.push(Math.max(0, Math.min(1, energy)));
    
    // Generate volume curve (fade out old, fade in new)
    const toVolume = Math.min(1, curvedProgress);
    volumeCurve.push(toVolume);
    
    // Generate filter curve for filter sweep transitions
    if (transitionType === 'filter_sweep' || transitionType === 'energy_buildup') {
      let filter = 0;
      if (transitionType === 'filter_sweep') {
        // High to low frequency sweep
        filter = 1 - curvedProgress;
      } else {
        // Low to high frequency sweep
        filter = curvedProgress;
      }
      filterCurve.push(filter);
    }
    
    // Generate EQ curve for frequency balancing
    if (config.enableAdvancedTransitions) {
      // Simple EQ automation based on energy
      const lowEnergy = Math.min(0.3, energy);
      const midEnergy = energy;
      const highEnergy = Math.max(0.7, energy);
      
      eqCurve.low.push(lowEnergy);
      eqCurve.mid.push(midEnergy);
      eqCurve.high.push(highEnergy);
    }
    
    // Add effects based on transition type
    if (transitionType === 'echo_out') {
      effects.push('echo_decay', 'reverb_tail');
    } else if (transitionType === 'filter_sweep') {
      effects.push('filter_resonance', 'sweep_automation');
    } else if (transitionType === 'phase_align') {
      effects.push('phase_sync', 'beat_sync');
    }
  }
  
  return {
    energyCurve,
    volumeCurve,
    filterCurve: filterCurve.length > 0 ? filterCurve : undefined,
    eqCurve: eqCurve.low.length > 0 ? eqCurve : undefined,
    effects
  };
}

/**
 * Generate enhanced DJ notes about the transition
 */
function generateEnhancedTransitionNotes(
  bpmCompatibility: EnhancedBPMCompatibility,
  keyCompatibility: EnhancedKeyCompatibility,
  transitionType: EnhancedDJTransitionType,
  fromAnalysis: AudioAnalysis,
  toAnalysis: AudioAnalysis
): string {
  const notes: string[] = [];
  
  // BPM notes
  if (bpmCompatibility.harmonicRelationship === 'perfect') {
    notes.push('Perfect harmonic BPM relationship - seamless beatmatching possible');
  } else if (bpmCompatibility.harmonicRelationship === 'strong') {
    notes.push('Strong harmonic BPM relationship - excellent for phrase mixing');
  } else if (bpmCompatibility.confidence > 0.8) {
    notes.push('High confidence BPM match - recommended for advanced transitions');
  }
  
  // Key notes
  if (keyCompatibility.harmonicStrength > 0.9) {
    notes.push('Exceptional harmonic compatibility - perfect for harmonic mixing');
  } else if (keyCompatibility.modulationPath.length > 0) {
    notes.push(`Key modulation path: ${keyCompatibility.modulationPath.join(' → ')}`);
  }
  
  // Energy notes
  const energyDiff = Math.abs(fromAnalysis.energy - toAnalysis.energy);
  if (energyDiff > 0.6) {
    notes.push('Significant energy shift - use breakdown transition');
  } else if (energyDiff < 0.2) {
    notes.push('Minimal energy change - maintain flow with crossfade');
  }
  
  // Transition-specific notes
  switch (transitionType) {
    case 'energy_buildup':
      notes.push('Build energy with risers and filter automation');
      break;
    case 'breakdown':
      notes.push('Create space with breakdown and atmospheric elements');
      break;
    case 'harmonic':
      notes.push('Focus on melodic elements and smooth EQ transitions');
      break;
    case 'phase_align':
      notes.push('Align beats precisely for seamless transition');
      break;
    case 'tempo_ramp':
      notes.push('Gradual tempo change with phrase alignment');
      break;
    case 'key_modulation':
      notes.push('Modulate key during transition for harmonic progression');
      break;
    case 'filter_sweep':
      notes.push('Use filter sweep to create dramatic effect');
      break;
  }
  
  return notes.join('. ');
}

/**
 * Determine transition difficulty based on compatibility and confidence
 */
function determineTransitionDifficulty(
  compatibility: number,
  transitionType: EnhancedDJTransitionType,
  confidence: number
): 'easy' | 'medium' | 'hard' | 'expert' {
  // Base difficulty on compatibility
  let difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium';
  
  if (compatibility > 0.8) {
    difficulty = 'easy';
  } else if (compatibility > 0.6) {
    difficulty = 'medium';
  } else if (compatibility > 0.4) {
    difficulty = 'hard';
  } else {
    difficulty = 'expert';
  }
  
  // Adjust difficulty based on transition complexity
  if (transitionType === 'phase_align' || transitionType === 'key_modulation') {
    if (difficulty === 'easy') difficulty = 'medium';
    else if (difficulty === 'medium') difficulty = 'hard';
  }
  
  // Adjust difficulty based on confidence
  if (confidence < 0.5 && difficulty !== 'expert') {
    difficulty = 'hard';
  }
  
  return difficulty;
}