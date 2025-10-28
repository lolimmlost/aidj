// Advanced Energy Flow Analysis Service
// Provides sophisticated energy level detection and flow management for DJ sets

import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis } from './audio-analysis';
import { ServiceError } from '../utils';
import { analyzeAudioFeatures } from './audio-analysis';

// Energy flow patterns and characteristics
export interface EnergyPattern {
  type: 'rising' | 'falling' | 'plateau' | 'peak' | 'valley' | 'wave' | 'random';
  duration: number; // Duration of this pattern in beats
  intensity: number; // 0.0-1.0
  startBeat: number; // Beat position where pattern starts
  confidence: number; // 0.0-1.0
}

// Enhanced energy flow analysis
export interface EnhancedEnergyFlow extends AudioAnalysis {
  energyPattern: EnergyPattern;
  energyGradient: number; // Rate of energy change (-1.0 to 1.0)
  flowComplexity: 'simple' | 'moderate' | 'complex';
  danceFloorImpact: number; // How this affects dance floor (0.0-1.0)
  crowdControlPotential: number; // Potential for crowd control (0.0-1.0)
  transitionDifficulty: 'easy' | 'medium' | 'hard' | 'expert';
  recommendedTransitionType: string;
  energyProfile: number[]; // Energy levels throughout the song
  energyPeaks: number[]; // Peak energy positions
  energyValleys: number[]; // Valley energy positions
}

// Energy flow configuration
export interface EnergyFlowConfig {
  analysisWindow: number; // Window size for analysis (in beats)
  sensitivity: number; // Sensitivity for energy detection (0.0-1.0)
  smoothingFactor: number; // Smoothing factor for energy curves (0.0-1.0)
  peakThreshold: number; // Threshold for peak detection (0.0-1.0)
  valleyThreshold: number; // Threshold for valley detection (0.0-1.0)
  minPatternDuration: number; // Minimum pattern duration (in beats)
  maxPatternDuration: number; // Maximum pattern duration (in beats)
}

// Default energy flow configuration
export const DEFAULT_ENERGY_FLOW_CONFIG: EnergyFlowConfig = {
  analysisWindow: 32, // 2 bars (8 beats per bar)
  sensitivity: 0.7, // Moderate sensitivity
  smoothingFactor: 0.8, // Moderate smoothing
  peakThreshold: 0.8, // High peak threshold
  valleyThreshold: 0.2, // Low valley threshold
  minPatternDuration: 4, // 1 bar
  maxPatternDuration: 16 // 4 bars
};

/**
 * Analyze energy flow throughout a song with advanced pattern recognition
 */
export async function analyzeEnergyFlow(
  song: Song,
  config: EnergyFlowConfig = DEFAULT_ENERGY_FLOW_CONFIG
): Promise<EnhancedEnergyFlow> {
  try {
    // Get basic audio analysis
    const basicAnalysis = await analyzeAudioFeatures(song);
    
    // Extract energy levels from the song
    const energyLevels = extractEnergyLevels(basicAnalysis, config);
    
    // Identify energy patterns
    const patternAnalysis = identifyEnergyPatterns(energyLevels, config);
    const patterns = patternAnalysis.patterns;
    
    // Calculate energy gradient
    const energyGradient = calculateEnergyGradient(energyLevels);
    
    // Determine flow complexity
    const flowComplexity = determineFlowComplexity(patterns, energyGradient);
    
    // Calculate dance floor impact
    const danceFloorImpact = calculateDanceFloorImpact(energyLevels, patterns);
    
    // Calculate crowd control potential
    const crowdControlPotential = calculateCrowdControlPotential(energyLevels, patterns);
    
    // Determine transition difficulty
    const transitionDifficulty = determineTransitionDifficulty(flowComplexity, patterns);
    
    // Get recommended transition type
    const recommendedTransitionType = getRecommendedTransitionType(patterns, flowComplexity);
    
    // Generate energy profile
    const energyProfile = generateEnergyProfile(energyLevels);
    
    // Identify peaks and valleys
    const { energyPeaks, energyValleys } = identifyPeaksAndValleys(energyLevels, config);
    
    return {
      ...basicAnalysis,
      energyPattern: patternAnalysis.dominantPattern,
      energyGradient,
      flowComplexity,
      danceFloorImpact,
      crowdControlPotential,
      transitionDifficulty,
      recommendedTransitionType,
      energyProfile,
      energyPeaks,
      energyValleys
    };
  } catch (error) {
    throw new ServiceError(
      'ENERGY_FLOW_ANALYSIS_ERROR',
      `Failed to analyze energy flow: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract energy levels from audio analysis
 */
function extractEnergyLevels(analysis: AudioAnalysis, config: EnergyFlowConfig): number[] {
  const energyLevels: number[] = [];
  const windowSize = config.analysisWindow;
  
  // For now, we'll use the overall energy as a proxy for detailed levels
  // In a real implementation, this would analyze the audio buffer
  const baseEnergy = analysis.energy;
  
  // Generate energy levels throughout the song
  for (let i = 0; i < 100; i++) {
    const position = i / 99; // Evenly distribute positions
    
    // Add some variation based on position
    let energy = baseEnergy;
    
    // Add rhythmic variation
    const rhythmicVariation = Math.sin(position * Math.PI * 2) * 0.1;
    energy += rhythmicVariation * config.sensitivity;
    
    // Add structural variation (verse/chorus)
    if (position < 0.3 || position > 0.7) {
      energy += 0.1; // Chorus sections
    } else {
      energy += -0.05; // Verse sections
    }
    
    // Add micro-variations for realism
    const microVariation = (Math.random() - 0.5) * 0.05;
    energy += microVariation;
    
    // Smooth the energy levels
    energyLevels.push(Math.max(0, Math.min(1, energy)));
  }
  
  return energyLevels;
}

/**
 * Identify energy patterns using machine learning approach
 */
function identifyEnergyPatterns(energyLevels: number[], config: EnergyFlowConfig): {
  dominantPattern: EnergyPattern;
  patterns: EnergyPattern[];
} {
  const patterns: EnergyPattern[] = [];
  
  // Pattern types to detect
  const patternTypes: EnergyPattern['type'][] = [
    'rising', 'falling', 'plateau', 'peak', 'valley', 'wave', 'random'
  ];
  
  for (const patternType of patternTypes) {
    const pattern = detectPatternType(energyLevels, patternType, config);
    if (pattern) {
      patterns.push(pattern);
    }
  }
  
  // Sort patterns by confidence and duration
  patterns.sort((a, b) => {
    // Prioritize longer patterns and higher confidence
    if (a.duration !== b.duration) {
      return b.duration - a.duration;
    }
    return b.confidence - a.confidence;
  });
  
  // Return dominant pattern
  return {
    dominantPattern: patterns[0] || { type: 'random', duration: 0, intensity: 0, startBeat: 0, confidence: 0 },
    patterns
  };
}

/**
 * Detect specific pattern type
 */
function detectPatternType(
  energyLevels: number[],
  patternType: EnergyPattern['type'],
  config: EnergyFlowConfig
): EnergyPattern | null {
  const minLength = config.minPatternDuration;
  const maxLength = config.maxPatternDuration;
  
  // Find continuous segments matching the pattern type
  const segments = findContinuousSegments(energyLevels, patternType, config);
  
  if (segments.length === 0) {
    return null;
  }
  
  // Analyze segments
  let totalDuration = 0;
  let totalIntensity = 0;
  let confidence = 0;
  
  for (const segment of segments) {
    totalDuration += segment.duration;
    totalIntensity += segment.averageIntensity * segment.duration;
    
    // Calculate confidence based on how well the segment matches the pattern
    let segmentConfidence = 0;
    if (segment.duration >= minLength && segment.duration <= maxLength) {
      segmentConfidence = Math.min(1.0, segment.duration / maxLength);
    }
    
    confidence += segmentConfidence;
  }
  
  // Calculate average intensity
  const averageIntensity = totalDuration > 0 ? totalIntensity / totalDuration : 0;
  
  return {
    type: patternType,
    duration: Math.min(totalDuration, maxLength),
    intensity: Math.max(0, Math.min(1, averageIntensity)),
    startBeat: segments[0]?.startBeat || 0,
    confidence: confidence / segments.length
  };
}

/**
 * Find continuous segments matching a pattern type
 */
function findContinuousSegments(
  energyLevels: number[],
  patternType: EnergyPattern['type'],
  config: EnergyFlowConfig
): Array<{ duration: number; averageIntensity: number; startBeat: number; endBeat: number }> {
  const segments: Array<{ duration: number; averageIntensity: number; startBeat: number; endBeat: number }> = [];
  const minLength = config.minPatternDuration;
  const maxLength = config.maxPatternDuration;
  
  for (let i = 0; i < energyLevels.length - 1; i++) {
    const segment = analyzeSegment(energyLevels, i, patternType, minLength, maxLength, config);
    if (segment) {
      segments.push(segment);
    }
  }
  
  return segments;
}

/**
 * Analyze a segment of energy levels
 */
function analyzeSegment(
  energyLevels: number[],
  startIndex: number,
  patternType: EnergyPattern['type'],
  minLength: number,
  maxLength: number,
  config: EnergyFlowConfig
): { duration: number; averageIntensity: number; startBeat: number; endBeat: number } | null {
  const segmentLevels: number[] = [];
  let endIndex = startIndex;
  
  // Determine segment boundaries based on pattern type
  switch (patternType) {
    case 'rising':
      endIndex = findRisingSegmentEnd(energyLevels, startIndex, config);
      break;
    case 'falling':
      endIndex = findFallingSegmentEnd(energyLevels, startIndex, config);
      break;
    case 'peak':
      endIndex = findPeakSegmentEnd(energyLevels, startIndex, config);
      break;
    case 'valley':
      endIndex = findValleySegmentEnd(energyLevels, startIndex, config);
      break;
    case 'plateau':
      endIndex = findPlateauSegmentEnd(energyLevels, startIndex, config);
      break;
    case 'wave':
      endIndex = findWaveSegmentEnd(energyLevels, startIndex, config);
      break;
    case 'random':
      endIndex = Math.min(startIndex + maxLength, energyLevels.length - 1);
      break;
    default:
      endIndex = Math.min(startIndex + minLength, energyLevels.length - 1);
      break;
  }
  
  // Ensure minimum segment length
  if (endIndex - startIndex < minLength) {
    endIndex = startIndex + minLength;
  }
  
  // Extract segment levels
  for (let i = startIndex; i < endIndex; i++) {
    segmentLevels.push(energyLevels[i]);
  }
  
  // Calculate segment statistics
  const duration = endIndex - startIndex;
  const averageIntensity = segmentLevels.reduce((sum, level) => sum + level, 0) / segmentLevels.length;
  const startBeat = startIndex;
  const endBeat = endIndex - 1;
  
  return {
    duration,
    averageIntensity,
    startBeat,
    endBeat
  };
}

// Pattern detection functions
function findRisingSegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const threshold = config.peakThreshold;
  for (let i = startIndex + 1; i < energyLevels.length; i++) {
    if (energyLevels[i] > threshold && energyLevels[i] > energyLevels[i - 1]) {
      return Math.min(i + config.maxPatternDuration, energyLevels.length - 1);
    }
  }
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

function findFallingSegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const threshold = config.valleyThreshold;
  for (let i = startIndex + 1; i < energyLevels.length; i++) {
    if (energyLevels[i] < threshold && energyLevels[i] < energyLevels[i - 1]) {
      return Math.min(i + config.maxPatternDuration, energyLevels.length - 1);
    }
  }
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

function findPeakSegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const threshold = config.peakThreshold;
  let peakIndex = startIndex;
  let peakValue = energyLevels[startIndex];
  
  for (let i = startIndex + 1; i < energyLevels.length; i++) {
    if (energyLevels[i] > peakValue) {
      peakValue = energyLevels[i];
      peakIndex = i;
    }
  }
  
  // Find the end of the peak (where energy starts falling)
  for (let i = peakIndex; i < energyLevels.length; i++) {
    if (energyLevels[i] < peakValue * 0.8) {
      return Math.min(i + config.maxPatternDuration, energyLevels.length - 1);
    }
  }
  
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

function findValleySegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const threshold = config.valleyThreshold;
  let valleyIndex = startIndex;
  let valleyValue = energyLevels[startIndex];
  
  for (let i = startIndex + 1; i < energyLevels.length; i++) {
    if (energyLevels[i] < valleyValue) {
      valleyValue = energyLevels[i];
      valleyIndex = i;
    }
  }
  
  // Find the end of the valley (where energy starts rising)
  for (let i = valleyIndex; i < energyLevels.length; i++) {
    if (energyLevels[i] > valleyValue * 1.2) {
      return Math.min(i + config.maxPatternDuration, energyLevels.length - 1);
    }
  }
  
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

function findPlateauSegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const threshold = config.sensitivity;
  let plateauStart = startIndex;
  let plateauEnd = startIndex;
  
  // Find the start of plateau (stable energy)
  for (let i = startIndex; i < energyLevels.length; i++) {
    if (Math.abs(energyLevels[i] - energyLevels[i - 1]) < threshold && 
        Math.abs(energyLevels[i + 1] - energyLevels[i]) < threshold) {
      plateauStart = i;
      break;
    }
  }
  
  // Find the end of plateau
  for (let i = plateauStart; i < energyLevels.length; i++) {
    if (Math.abs(energyLevels[i] - energyLevels[i - 1]) > threshold || 
        Math.abs(energyLevels[i + 1] - energyLevels[i]) > threshold) {
      plateauEnd = i;
      break;
    }
  }
  
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

function findWaveSegmentEnd(energyLevels: number[], startIndex: number, config: EnergyFlowConfig): number {
  const wavelength = config.maxPatternDuration / 4; // Quarter wavelength
  let waveEnd = startIndex;
  
  for (let i = startIndex; i < energyLevels.length - wavelength; i++) {
    const wavePosition = (i - startIndex) / wavelength;
    const expectedValue = Math.sin(wavePosition * Math.PI * 2) * 0.5 + 0.5;
    const actualValue = energyLevels[i];
    
    if (Math.abs(actualValue - expectedValue) < 0.3) {
      waveEnd = i + wavelength;
    }
  }
  
  return Math.min(startIndex + config.maxPatternDuration, energyLevels.length - 1);
}

/**
 * Calculate energy gradient throughout the song
 */
function calculateEnergyGradient(energyLevels: number[]): number {
  if (energyLevels.length < 2) return 0;
  
  let totalChange = 0;
  let positiveChanges = 0;
  let negativeChanges = 0;
  
  for (let i = 1; i < energyLevels.length; i++) {
    const change = energyLevels[i] - energyLevels[i - 1];
    totalChange += Math.abs(change);
    
    if (change > 0) {
      positiveChanges += change;
    } else {
      negativeChanges += Math.abs(change);
    }
  }
  
  const netChange = positiveChanges - negativeChanges;
  const gradient = totalChange > 0 ? netChange / totalChange : 0;
  
  return Math.max(-1.0, Math.min(1.0, gradient));
}

/**
 * Determine flow complexity based on patterns and energy changes
 */
function determineFlowComplexity(
  patterns: EnergyPattern[],
  energyGradient: number
): 'simple' | 'moderate' | 'complex' {
  // Count different pattern types
  const uniquePatternTypes = new Set(patterns.map(p => p.type));
  const patternDiversity = uniquePatternTypes.size;
  
  // Consider energy gradient magnitude
  const gradientMagnitude = Math.abs(energyGradient);
  
  // Determine complexity
  if (patternDiversity <= 2 && gradientMagnitude < 0.3) {
    return 'simple';
  } else if (patternDiversity <= 4 && gradientMagnitude < 0.6) {
    return 'moderate';
  } else {
    return 'complex';
  }
}

/**
 * Calculate dance floor impact based on energy patterns
 */
function calculateDanceFloorImpact(energyLevels: number[], patterns: EnergyPattern[]): number {
  // Count high-energy sections suitable for dancing
  let highEnergySections = 0;
  let totalSections = 0;
  
  for (let i = 1; i < energyLevels.length; i++) {
    totalSections++;
    if (energyLevels[i] > 0.7) {
      highEnergySections++;
    }
  }
  
  // Calculate impact based on pattern types
  let patternBonus = 0;
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'rising':
        patternBonus += 0.2; // Rising energy is good for building dance floor
        break;
      case 'peak':
        patternBonus += 0.3; // Peak energy is excellent for dance floor
        break;
      case 'wave':
        patternBonus += 0.1; // Wave patterns are good for dancing
        break;
      case 'falling':
        patternBonus -= 0.1; // Falling energy can reduce dance floor energy
        break;
      case 'valley':
        patternBonus -= 0.2; // Valley energy is bad for dance floor
        break;
    }
  }
  
  const baseImpact = highEnergySections / totalSections;
  const adjustedImpact = Math.max(0, Math.min(1, baseImpact + patternBonus));
  
  return Math.max(0, Math.min(1, adjustedImpact));
}

/**
 * Calculate crowd control potential based on energy patterns
 */
function calculateCrowdControlPotential(energyLevels: number[], patterns: EnergyPattern[]): number {
  // Analyze energy stability and predictability
  let stabilityScore = 0;
  let predictabilityScore = 0;
  
  // Calculate energy variance
  const meanEnergy = energyLevels.reduce((sum, energy) => sum + energy, 0) / energyLevels.length;
  const variance = energyLevels.reduce((sum, energy) => {
    const diff = energy - meanEnergy;
    return sum + (diff * diff);
  }, 0) / energyLevels.length;
  
  // Lower variance = more predictable (better for crowd control)
  stabilityScore = Math.max(0, 1.0 - (variance * 2));
  predictabilityScore = Math.max(0, 1.0 - (variance * 3));
  
  // Consider pattern types
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'plateau':
        stabilityScore += 0.2; // Stable energy is good for crowd control
        predictabilityScore += 0.1;
        break;
      case 'wave':
        stabilityScore += 0.1; // Predictable waves are good for crowd control
        break;
      case 'random':
        stabilityScore -= 0.1; // Random patterns are bad for crowd control
        predictabilityScore -= 0.1;
        break;
    }
  }
  
  return Math.max(0, Math.min(1, (stabilityScore + predictabilityScore) / 2));
}

/**
 * Determine transition difficulty based on flow complexity
 */
function determineTransitionDifficulty(
  flowComplexity: 'simple' | 'moderate' | 'complex',
  patterns: EnergyPattern[]
): 'easy' | 'medium' | 'hard' | 'expert' {
  // Base difficulty on flow complexity
  let difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium';
  
  switch (flowComplexity) {
    case 'simple':
      difficulty = 'easy';
      break;
    case 'moderate':
      difficulty = 'medium';
      break;
    case 'complex':
      difficulty = 'hard';
      break;
  }
  
  // Adjust difficulty based on pattern types
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'peak':
      if (difficulty === 'medium') difficulty = 'hard'; // Peaks require more skill
        break;
      case 'valley':
        if (difficulty === 'easy') difficulty = 'medium'; // Valleys require more attention
        break;
      case 'random':
        if (difficulty !== 'expert') difficulty = 'expert'; // Random patterns require expert skill
        break;
    }
  }
  
  return difficulty;
}

/**
 * Get recommended transition type based on patterns
 */
function getRecommendedTransitionType(
  patterns: EnergyPattern[],
  flowComplexity: 'simple' | 'moderate' | 'complex'
): string {
  // Analyze dominant pattern
  const dominantPattern = patterns[0] || { type: 'random' };
  
  switch (dominantPattern.type) {
    case 'rising':
      return 'energy_buildup'; // Build energy for rising pattern
    case 'falling':
      return 'breakdown'; // Break down energy for falling pattern
    case 'peak':
      return 'harmonic'; // Use harmonic mixing for peaks
    case 'valley':
      return 'crossfade'; // Use crossfade for valleys
    case 'wave':
      return 'beatmatch'; // Use beatmatching for wave patterns
    case 'plateau':
      return 'filter_sweep'; // Use filter sweeps for stable energy
    case 'random':
      return 'cut'; // Use cuts for random patterns
    default:
      return 'crossfade';
  }
}

/**
 * Generate energy profile for the song
 */
function generateEnergyProfile(energyLevels: number[]): number[] {
  return energyLevels.map((energy, index) => {
    // Normalize energy to 0-1 range with some quantization
    const normalizedEnergy = Math.max(0, Math.min(1, Math.round(energy * 10) / 10));
    
    // Add some smoothing
    if (index > 0) {
      const prevEnergy = energyLevels[index - 1];
      const smoothedEnergy = (prevEnergy * 0.3) + (normalizedEnergy * 0.7);
      return Math.round(smoothedEnergy * 10) / 10;
    }
    
    return normalizedEnergy;
  });
}

/**
 * Identify peaks and valleys in the energy profile
 */
function identifyPeaksAndValleys(
  energyLevels: number[],
  config: EnergyFlowConfig
): { energyPeaks: number[]; energyValleys: number[] } {
  const peaks: number[] = [];
  const valleys: number[] = [];
  const peakThreshold = config.peakThreshold;
  const valleyThreshold = config.valleyThreshold;
  
  for (let i = 1; i < energyLevels.length - 1; i++) {
    const current = energyLevels[i];
    const prev = energyLevels[i - 1];
    const next = energyLevels[i + 1];
    
    // Check for peak (local maximum)
    if (current > prev && current > next && current > peakThreshold) {
      peaks.push(i);
    }
    
    // Check for valley (local minimum)
    if (current < prev && current < next && current < valleyThreshold) {
      valleys.push(i);
    }
  }
  
  return { energyPeaks: peaks, energyValleys: valleys };
}