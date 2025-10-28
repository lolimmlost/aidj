// Advanced Harmonic Mixing Service
// Provides sophisticated key detection and harmonic mixing for DJ sets

import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis, MusicalKey } from './audio-analysis';
import { ServiceError } from '../utils';
import { analyzeAudioFeatures, calculateKeyCompatibility } from './audio-analysis';

// Harmonic mixing modes
export type HarmonicMode = 
  | 'perfect_match'      // Same key
  | 'relative_minor'     // Relative minor/major
  | 'dominant'          // Perfect fifth up/down
  | 'subdominant'       // Perfect fourth up/down
  | 'parallel_minor'    // Same root, different mode
  | 'energy_boost'      // Up a semitone
  | 'energy_drop'       // Down a semitone
  | 'circle_progression' // Move around Circle of Fifths
  | 'diatonic_progression' // Move within scale
  | 'chromatic_medley'   // Chromatic movement
  | 'modal_interchange'  // Borrow from parallel modes
  | 'key_change'        // Any key change
  | 'compatible';       // Any compatible key

// Enhanced key analysis with harmonic context
export interface EnhancedKeyAnalysis extends AudioAnalysis {
  // Basic key information
  rootNote: string; // C, D, E, etc.
  mode: 'major' | 'minor';
  keySignature: string; // e.g., "C major", "A minor"
  
  // Harmonic relationships
  dominantKey: MusicalKey; // Perfect fifth
  subdominantKey: MusicalKey; // Perfect fourth
  relativeKey: MusicalKey; // Relative minor/major
  parallelKey: MusicalKey; // Same root, different mode
  
  // Circle of Fifths position
  circlePosition: number; // 0-11 position in Circle of Fifths
  circleDistance: Record<MusicalKey, number>; // Distance to all other keys
  
  // Harmonic features
  chordProgression: string[]; // Detected chord progression
  harmonicRhythm: number; // How often chords change (0-1)
  modulationCount: number; // Number of key changes in song
  tonalCenter: number; // Strength of tonal center (0-1)
  
  // Advanced features
  melodicContour: 'rising' | 'falling' | 'stable' | 'complex';
  harmonicComplexity: 'simple' | 'moderate' | 'complex';
  modulationPoints: number[]; // Positions where key changes occur
  tonalStability: number; // How stable the key is throughout (0-1)
}

// Harmonic mixing recommendation
export interface HarmonicMixingRecommendation {
  targetKey: MusicalKey;
  mode: HarmonicMode;
  compatibility: number; // 0-1 score
  energyChange: 'rising' | 'falling' | 'stable';
  transitionDifficulty: 'easy' | 'medium' | 'hard' | 'expert';
  recommendedTransition: string;
  harmonicRationale: string;
  alternativeKeys: Array<{
    key: MusicalKey;
    mode: HarmonicMode;
    compatibility: number;
    reason: string;
  }>;
}

// Harmonic set planning
export interface HarmonicSetPlan {
  keyProgression: MusicalKey[];
  harmonicModes: HarmonicMode[];
  energyFlow: number[];
  transitions: Array<{
    fromKey: MusicalKey;
    toKey: MusicalKey;
    mode: HarmonicMode;
    compatibility: number;
    recommendedTransition: string;
  }>;
  overallHarmony: number; // 0-1 score
  keyChanges: number;
  harmonicComplexity: 'simple' | 'moderate' | 'complex';
}

// Circle of Fifths mapping with positions
const CIRCLE_OF_FIFTHS_POSITIONS: Record<MusicalKey, number> = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5,
  'F#': 6, 'C#': 7, 'G#': 8, 'D#': 9, 'A#': 10, 'F': 11,
  'Cm': 0, 'Gm': 1, 'Dm': 2, 'Am': 3, 'Em': 4, 'Bm': 5,
  'F#m': 6, 'C#m': 7, 'G#m': 8, 'D#m': 9, 'A#m': 10, 'Fm': 11
};

// Harmonic relationships mapping
const HARMONIC_RELATIONSHIPS: Record<MusicalKey, {
  dominant: MusicalKey;
  subdominant: MusicalKey;
  relative: MusicalKey;
  parallel: MusicalKey;
}> = {
  'C': { dominant: 'G', subdominant: 'F', relative: 'Am', parallel: 'Cm' },
  'G': { dominant: 'D', subdominant: 'C', relative: 'Em', parallel: 'Gm' },
  'D': { dominant: 'A', subdominant: 'G', relative: 'Bm', parallel: 'Dm' },
  'A': { dominant: 'E', subdominant: 'D', relative: 'F#m', parallel: 'Am' },
  'E': { dominant: 'B', subdominant: 'A', relative: 'G#m', parallel: 'Em' },
  'B': { dominant: 'F#', subdominant: 'E', relative: 'D#m', parallel: 'Bm' },
  'F#': { dominant: 'C#', subdominant: 'B', relative: 'A#m', parallel: 'F#m' },
  'C#': { dominant: 'G#', subdominant: 'F#', relative: 'A#m', parallel: 'C#m' },
  'G#': { dominant: 'D#', subdominant: 'C#', relative: 'Bm', parallel: 'G#m' },
  'D#': { dominant: 'A#', subdominant: 'G#', relative: 'Cm', parallel: 'D#m' },
  'A#': { dominant: 'F', subdominant: 'D#', relative: 'Dm', parallel: 'A#m' },
  'F': { dominant: 'C', subdominant: 'A#', relative: 'Dm', parallel: 'Fm' },
  'Cm': { dominant: 'Gm', subdominant: 'Fm', relative: 'C', parallel: 'C' },
  'Gm': { dominant: 'Dm', subdominant: 'Cm', relative: 'C', parallel: 'G' },
  'Dm': { dominant: 'Am', subdominant: 'Gm', relative: 'F', parallel: 'D' },
  'Am': { dominant: 'Em', subdominant: 'Dm', relative: 'C', parallel: 'A' },
  'Em': { dominant: 'Bm', subdominant: 'Am', relative: 'G', parallel: 'E' },
  'Bm': { dominant: 'F#m', subdominant: 'Em', relative: 'D', parallel: 'B' },
  'F#m': { dominant: 'C#m', subdominant: 'Bm', relative: 'A', parallel: 'F#' },
  'C#m': { dominant: 'G#m', subdominant: 'F#m', relative: 'E', parallel: 'C#' },
  'G#m': { dominant: 'D#m', subdominant: 'C#m', relative: 'B', parallel: 'G#' },
  'D#m': { dominant: 'A#m', subdominant: 'G#m', relative: 'F', parallel: 'D#' },
  'A#m': { dominant: 'Fm', subdominant: 'D#m', relative: 'G', parallel: 'A#' },
  'Fm': { dominant: 'Cm', subdominant: 'A#m', relative: 'C', parallel: 'F' }
};

/**
 * Perform enhanced key analysis for harmonic mixing
 */
export async function analyzeKeyForHarmonicMixing(song: Song): Promise<EnhancedKeyAnalysis> {
  try {
    // Get basic audio analysis
    const basicAnalysis = await analyzeAudioFeatures(song);
    
    // Extract key components
    const { rootNote, mode } = parseKey(basicAnalysis.key);
    const keySignature = `${rootNote} ${mode}`;
    
    // Get Circle of Fifths position
    const circlePosition = CIRCLE_OF_FIFTHS_POSITIONS[basicAnalysis.key];
    
    // Calculate distances to all other keys
    const circleDistance = calculateCircleDistances(basicAnalysis.key);
    
    // Get harmonic relationships
    const relationships = HARMONIC_RELATIONSHIPS[basicAnalysis.key];
    
    // Detect chord progression (simplified)
    const chordProgression = detectChordProgression(basicAnalysis);
    
    // Calculate harmonic rhythm
    const harmonicRhythm = calculateHarmonicRhythm(basicAnalysis);
    
    // Detect modulations
    const { modulationCount, modulationPoints } = detectModulations(basicAnalysis);
    
    // Calculate tonal center strength
    const tonalCenter = calculateTonalCenter(basicAnalysis);
    
    // Determine melodic contour
    const melodicContour = determineMelodicContour(basicAnalysis);
    
    // Calculate harmonic complexity
    const harmonicComplexity = calculateHarmonicComplexity(
      chordProgression,
      modulationCount,
      harmonicRhythm
    );
    
    // Calculate tonal stability
    const tonalStability = calculateTonalStability(
      tonalCenter,
      modulationCount,
      basicAnalysis.keyConfidence
    );
    
    return {
      ...basicAnalysis,
      rootNote,
      mode,
      keySignature,
      dominantKey: relationships.dominant,
      subdominantKey: relationships.subdominant,
      relativeKey: relationships.relative,
      parallelKey: relationships.parallel,
      circlePosition,
      circleDistance,
      chordProgression,
      harmonicRhythm,
      modulationCount,
      tonalCenter,
      melodicContour,
      harmonicComplexity,
      modulationPoints,
      tonalStability
    };
  } catch (error) {
    throw new ServiceError(
      'HARMONIC_ANALYSIS_ERROR',
      `Failed to analyze key for harmonic mixing: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse musical key into root note and mode
 */
function parseKey(key: MusicalKey): { rootNote: string; mode: 'major' | 'minor' } {
  const isMinor = key.endsWith('m');
  const rootNote = key.replace('m', '');
  const mode = isMinor ? 'minor' : 'major';
  
  return { rootNote, mode };
}

/**
 * Calculate Circle of Fifths distances to all other keys
 */
function calculateCircleDistances(fromKey: MusicalKey): Record<MusicalKey, number> {
  const distances: Record<string, number> = {};
  const fromPosition = CIRCLE_OF_FIFTHS_POSITIONS[fromKey];
  
  const keys: MusicalKey[] = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
  ];
  
  for (const key of keys) {
    const toPosition = CIRCLE_OF_FIFTHS_POSITIONS[key];
    const distance = Math.min(
      Math.abs(toPosition - fromPosition),
      12 - Math.abs(toPosition - fromPosition)
    );
    distances[key] = distance;
  }
  
  return distances as Record<MusicalKey, number>;
}

/**
 * Detect chord progression (simplified implementation)
 */
function detectChordProgression(analysis: AudioAnalysis): string[] {
  // In a real implementation, this would analyze the harmonic content
  // For now, we'll return a plausible progression based on the key
  
  const key = analysis.key;
  const isMinor = key.endsWith('m');
  const rootNote = key.replace('m', '');
  
  // Common progressions for major keys
  const majorProgressions = [
    ['I', 'IV', 'V', 'I'],
    ['I', 'vi', 'IV', 'V'],
    ['I', 'V', 'vi', 'IV'],
    ['vi', 'IV', 'I', 'V'],
    ['I', 'iii', 'vi', 'IV']
  ];
  
  // Common progressions for minor keys
  const minorProgressions = [
    ['i', 'iv', 'v', 'i'],
    ['i', 'VI', 'III', 'VII'],
    ['i', 'VII', 'VI', 'VII'],
    ['VI', 'iv', 'i', 'V'],
    ['i', 'III', 'VI', 'iv']
  ];
  
  const progressions = isMinor ? minorProgressions : majorProgressions;
  const selectedProgression = progressions[Math.floor(Math.random() * progressions.length)];
  
  // Convert to actual chord names
  return selectedProgression.map(roman => {
    // This is simplified - in reality, we'd map Roman numerals to actual chords
    return `${roman} (${key})`;
  });
}

/**
 * Calculate harmonic rhythm (how often chords change)
 */
function calculateHarmonicRhythm(analysis: AudioAnalysis): number {
  // In a real implementation, this would analyze chord change frequency
  // For now, we'll estimate based on genre and tempo
  
  const genreHints = extractGenreHints(analysis);
  const tempo = analysis.bpm;
  
  let baseRhythm = 0.5; // Default moderate rhythm
  
  // Adjust based on tempo
  if (tempo > 140) {
    baseRhythm += 0.2; // Faster tempo = faster harmonic rhythm
  } else if (tempo < 100) {
    baseRhythm -= 0.2; // Slower tempo = slower harmonic rhythm
  }
  
  // Adjust based on genre
  if (genreHints.includes('classical') || genreHints.includes('jazz')) {
    baseRhythm += 0.3; // Complex harmonic rhythm
  } else if (genreHints.includes('pop') || genreHints.includes('electronic')) {
    baseRhythm -= 0.1; // Simpler harmonic rhythm
  }
  
  return Math.max(0, Math.min(1, baseRhythm));
}

/**
 * Detect modulations in the song
 */
function detectModulations(analysis: AudioAnalysis): { modulationCount: number; modulationPoints: number[] } {
  // In a real implementation, this would analyze key changes throughout the song
  // For now, we'll simulate based on genre and complexity
  
  const genreHints = extractGenreHints(analysis);
  const complexity = analysis.instrumentalness; // Higher instrumental = more complex
  
  let modulationCount = 0;
  const modulationPoints: number[] = [];
  
  // Base modulation count on genre
  if (genreHints.includes('classical') || genreHints.includes('jazz')) {
    modulationCount = Math.floor(Math.random() * 4) + 1; // 1-4 modulations
  } else if (genreHints.includes('pop') || genreHints.includes('rock')) {
    modulationCount = Math.random() > 0.7 ? 1 : 0; // 30% chance of 1 modulation
  } else {
    modulationCount = Math.random() > 0.8 ? 1 : 0; // 20% chance of 1 modulation
  }
  
  // Generate modulation points (as percentages through the song)
  for (let i = 0; i < modulationCount; i++) {
    const point = 0.3 + (Math.random() * 0.5); // Between 30% and 80% through
    modulationPoints.push(point);
  }
  
  return { modulationCount, modulationPoints };
}

/**
 * Calculate tonal center strength
 */
function calculateTonalCenter(analysis: AudioAnalysis): number {
  // Combine key confidence with other factors
  const keyConfidence = analysis.keyConfidence;
  const instrumentalness = analysis.instrumentalness;
  const acousticness = analysis.acousticness;
  
  // Higher key confidence and instrumentalness = stronger tonal center
  let tonalCenter = keyConfidence * 0.6;
  tonalCenter += instrumentalness * 0.3;
  tonalCenter += acousticness * 0.1;
  
  return Math.max(0, Math.min(1, tonalCenter));
}

/**
 * Determine melodic contour
 */
function determineMelodicContour(analysis: AudioAnalysis): 'rising' | 'falling' | 'stable' | 'complex' {
  // In a real implementation, this would analyze pitch contours
  // For now, we'll estimate based on energy and valence
  
  const energy = analysis.energy;
  const valence = analysis.valence;
  
  if (energy > 0.7 && valence > 0.7) {
    return 'rising';
  } else if (energy < 0.3 && valence < 0.3) {
    return 'falling';
  } else if (Math.abs(energy - 0.5) < 0.2 && Math.abs(valence - 0.5) < 0.2) {
    return 'stable';
  } else {
    return 'complex';
  }
}

/**
 * Calculate harmonic complexity
 */
function calculateHarmonicComplexity(
  chordProgression: string[],
  modulationCount: number,
  harmonicRhythm: number
): 'simple' | 'moderate' | 'complex' {
  let complexityScore = 0;
  
  // Chord progression complexity
  if (chordProgression.length > 4) complexityScore += 1;
  if (chordProgression.length > 6) complexityScore += 1;
  
  // Modulation complexity
  complexityScore += modulationCount;
  
  // Harmonic rhythm complexity
  if (harmonicRhythm > 0.7) complexityScore += 1;
  
  if (complexityScore <= 2) return 'simple';
  if (complexityScore <= 4) return 'moderate';
  return 'complex';
}

/**
 * Calculate tonal stability
 */
function calculateTonalStability(
  tonalCenter: number,
  modulationCount: number,
  keyConfidence: number
): number {
  let stability = tonalCenter * 0.5;
  stability += (1 - modulationCount / 4) * 0.3; // Fewer modulations = more stable
  stability += keyConfidence * 0.2;
  
  return Math.max(0, Math.min(1, stability));
}

/**
 * Get harmonic mixing recommendations for a song
 */
export async function getHarmonicMixingRecommendations(
  currentSong: Song,
  candidateSongs: Song[],
  options: {
    preferredMode?: HarmonicMode;
    maxResults?: number;
    minCompatibility?: number;
    allowKeyChanges?: boolean;
    prioritizeEnergy?: boolean;
  } = {}
): Promise<HarmonicMixingRecommendation[]> {
  const {
    preferredMode,
    maxResults = 10,
    minCompatibility = 0.5,
    allowKeyChanges = true,
    prioritizeEnergy = false
  } = options;
  
  try {
    // Analyze current song
    const currentAnalysis = await analyzeKeyForHarmonicMixing(currentSong);
    
    // Analyze candidate songs
    const candidates = await Promise.all(
      candidateSongs.map(async (song) => {
        const analysis = await analyzeKeyForHarmonicMixing(song);
        
        // Get compatibility for all harmonic modes
        const modeCompatibilities = await Promise.all(
          (Object.keys(HARMONIC_RELATIONSHIPS) as HarmonicMode[]).map(async (mode) => {
            const compatibility = await calculateModeCompatibility(
              currentAnalysis,
              analysis,
              mode
            );
            
            return { mode, compatibility };
          })
        );
        
        // Find best mode
        const bestMode = modeCompatibilities.reduce((best, current) => 
          current.compatibility > best.compatibility ? current : best
        );
        
        // Use preferred mode if specified and compatible
        const selectedMode = preferredMode && allowKeyChanges
          ? modeCompatibilities.find(m => m.mode === preferredMode) || bestMode
          : bestMode;
        
        // Calculate energy change
        const energyChange: 'rising' | 'falling' | 'stable' =
          currentAnalysis.energy < analysis.energy ? 'rising' :
          currentAnalysis.energy > analysis.energy ? 'falling' : 'stable';
        
        // Determine transition difficulty
        const transitionDifficulty = determineTransitionDifficulty(
          selectedMode.compatibility,
          currentAnalysis.harmonicComplexity,
          analysis.harmonicComplexity
        );
        
        // Get recommended transition
        const recommendedTransition = getRecommendedTransition(
          selectedMode.mode,
          energyChange,
          transitionDifficulty
        );
        
        // Generate harmonic rationale
        const harmonicRationale = generateHarmonicRationale(
          currentAnalysis,
          analysis,
          selectedMode.mode
        );
        
        // Get alternative keys
        const alternativeKeys = modeCompatibilities
          .filter(m => m.mode !== selectedMode.mode && m.compatibility >= minCompatibility)
          .slice(0, 3)
          .map(m => ({
            key: analysis.key,
            mode: m.mode,
            compatibility: m.compatibility,
            reason: getModeReason(m.mode)
          }));
        
        return {
          targetKey: analysis.key,
          mode: selectedMode.mode,
          compatibility: selectedMode.compatibility,
          energyChange,
          transitionDifficulty,
          recommendedTransition,
          harmonicRationale,
          alternativeKeys
        };
      })
    );
    
    // Filter and sort candidates
    return candidates
      .filter(candidate => candidate.compatibility >= minCompatibility)
      .sort((a, b) => {
        // Prioritize by compatibility, then by energy if requested
        const scoreA = prioritizeEnergy 
          ? a.compatibility * 0.7 + (a.energyChange === 'rising' ? 0.3 : 0)
          : a.compatibility;
        const scoreB = prioritizeEnergy 
          ? b.compatibility * 0.7 + (b.energyChange === 'rising' ? 0.3 : 0)
          : b.compatibility;
        
        return scoreB - scoreA;
      })
      .slice(0, maxResults);
  } catch (error) {
    throw new ServiceError(
      'HARMONIC_RECOMMENDATION_ERROR',
      `Failed to get harmonic mixing recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate compatibility for a specific harmonic mode
 */
async function calculateModeCompatibility(
  currentAnalysis: EnhancedKeyAnalysis,
  targetAnalysis: EnhancedKeyAnalysis,
  mode: HarmonicMode
): Promise<number> {
  const currentKey = currentAnalysis.key;
  const targetKey = targetAnalysis.key;
  
  switch (mode) {
    case 'perfect_match':
      return currentKey === targetKey ? 1.0 : 0.0;
      
    case 'relative_minor':
      return currentAnalysis.relativeKey === targetKey ? 0.9 : 0.0;
      
    case 'dominant':
      return currentAnalysis.dominantKey === targetKey ? 0.8 : 0.0;
      
    case 'subdominant':
      return currentAnalysis.subdominantKey === targetKey ? 0.8 : 0.0;
      
    case 'parallel_minor':
      return currentAnalysis.parallelKey === targetKey ? 0.8 : 0.0;
      
    case 'energy_boost':
      // Up a semitone - check if target is one semitone up
      {
        const currentPos = CIRCLE_OF_FIFTHS_POSITIONS[currentKey];
        const targetPos = CIRCLE_OF_FIFTHS_POSITIONS[targetKey];
        return (targetPos - currentPos + 12) % 12 === 1 ? 0.7 : 0.0;
      }
      
    case 'energy_drop':
      // Down a semitone - check if target is one semitone down
      {
        const currentPos = CIRCLE_OF_FIFTHS_POSITIONS[currentKey];
        const targetPos = CIRCLE_OF_FIFTHS_POSITIONS[targetKey];
        return (currentPos - targetPos + 12) % 12 === 1 ? 0.7 : 0.0;
      }
      
    case 'circle_progression':
      // Move around Circle of Fifths (1-2 steps)
      {
        const currentPos = CIRCLE_OF_FIFTHS_POSITIONS[currentKey];
        const targetPos = CIRCLE_OF_FIFTHS_POSITIONS[targetKey];
        const circleDistance = Math.min(
          Math.abs(targetPos - currentPos),
          12 - Math.abs(targetPos - currentPos)
        );
        return circleDistance <= 2 ? 0.7 - (circleDistance * 0.1) : 0.0;
      }
      
    case 'diatonic_progression':
      // Move within diatonic scale
      {
        const currentPos = CIRCLE_OF_FIFTHS_POSITIONS[currentKey];
        const targetPos = CIRCLE_OF_FIFTHS_POSITIONS[targetKey];
        const diatonicDistance = Math.abs(targetPos - currentPos);
        return diatonicDistance <= 4 ? 0.6 : 0.0;
      }
      
    case 'chromatic_medley':
      // Any chromatic movement
      return 0.5; // Moderate compatibility for any chromatic movement
      
    case 'modal_interchange':
      // Borrow from parallel modes
      {
        const currentRoot = currentAnalysis.rootNote;
        const targetRoot = targetAnalysis.rootNote;
        return currentRoot === targetRoot && currentAnalysis.mode !== targetAnalysis.mode ? 0.6 : 0.0;
      }
      
    case 'key_change':
      // Any key change
      return currentKey !== targetKey ? 0.4 : 0.0;
      
    case 'compatible':
      // Any compatible key (use existing compatibility calculation)
      {
        const compatibility = calculateKeyCompatibility(currentKey, targetKey);
        return compatibility.compatibility;
      }
      
    default:
      return 0.0;
  }
}

/**
 * Determine transition difficulty
 */
function determineTransitionDifficulty(
  compatibility: number,
  currentComplexity: 'simple' | 'moderate' | 'complex',
  targetComplexity: 'simple' | 'moderate' | 'complex'
): 'easy' | 'medium' | 'hard' | 'expert' {
  let difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium';
  
  // Base difficulty on compatibility
  if (compatibility > 0.8) {
    difficulty = 'easy';
  } else if (compatibility < 0.5) {
    difficulty = 'hard';
  }
  
  // Adjust for complexity
  const complexityScore = (currentComplexity === 'simple' ? 1 : currentComplexity === 'moderate' ? 2 : 3) +
                         (targetComplexity === 'simple' ? 1 : targetComplexity === 'moderate' ? 2 : 3);
  
  if (complexityScore > 5) {
    if (difficulty === 'easy') difficulty = 'medium';
    else if (difficulty === 'medium') difficulty = 'hard';
    else if (difficulty === 'hard') difficulty = 'expert';
  }
  
  return difficulty;
}

/**
 * Get recommended transition type
 */
function getRecommendedTransition(
  mode: HarmonicMode,
  energyChange: 'rising' | 'falling' | 'stable',
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
): string {
  switch (mode) {
    case 'perfect_match':
      return energyChange === 'rising' ? 'filter_sweep' : 'crossfade';
    case 'relative_minor':
      return 'harmonic';
    case 'dominant':
      return 'beatmatch';
    case 'subdominant':
      return 'harmonic';
    case 'parallel_minor':
      return 'crossfade';
    case 'energy_boost':
      return 'filter_sweep';
    case 'energy_drop':
      return 'echo_out';
    case 'circle_progression':
      return 'beatmatch';
    case 'diatonic_progression':
      return 'harmonic';
    case 'chromatic_medley':
      return difficulty === 'expert' ? 'cut' : 'crossfade';
    case 'modal_interchange':
      return 'harmonic';
    case 'key_change':
      return difficulty === 'expert' ? 'brake' : 'crossfade';
    case 'compatible':
      return 'crossfade';
    default:
      return 'crossfade';
  }
}

/**
 * Generate harmonic rationale
 */
function generateHarmonicRationale(
  currentAnalysis: EnhancedKeyAnalysis,
  targetAnalysis: EnhancedKeyAnalysis,
  mode: HarmonicMode
): string {
  const currentKey = currentAnalysis.keySignature;
  const targetKey = targetAnalysis.keySignature;
  
  switch (mode) {
    case 'perfect_match':
      return `Same key (${currentKey}) provides perfect harmonic compatibility for seamless mixing.`;
    case 'relative_minor':
      return `${targetKey} is the relative ${targetAnalysis.mode} of ${currentKey}, creating emotional contrast while maintaining harmonic relationship.`;
    case 'dominant':
      return `${targetKey} is the dominant of ${currentKey}, creating natural tension and resolution.`;
    case 'subdominant':
      return `${targetKey} is the subdominant of ${currentKey}, providing a gentler harmonic movement.`;
    case 'parallel_minor':
      return `${targetKey} shares the same root as ${currentKey} but changes mode, creating mood variation.`;
    case 'energy_boost':
      return `Moving from ${currentKey} to ${targetKey} raises the energy by a semitone.`;
    case 'energy_drop':
      return `Moving from ${currentKey} to ${targetKey} lowers the energy by a semitone.`;
    case 'circle_progression':
      return `Progression from ${currentKey} to ${targetKey} follows the Circle of Fifths for natural harmonic flow.`;
    case 'diatonic_progression':
      return `Movement from ${currentKey} to ${targetKey} stays within the diatonic framework.`;
    case 'chromatic_medley':
      return `Chromatic movement from ${currentKey} to ${targetKey} creates dramatic effect.`;
    case 'modal_interchange':
      return `Modal interchange from ${currentKey} to ${targetKey} borrows from parallel tonality.`;
    case 'key_change':
      return `Key change from ${currentKey} to ${targetKey} creates significant harmonic shift.`;
    case 'compatible':
      return `${targetKey} is harmonically compatible with ${currentKey} for smooth mixing.`;
    default:
      return `${targetKey} provides harmonic compatibility with ${currentKey}.`;
  }
}

/**
 * Get reason for harmonic mode
 */
function getModeReason(mode: HarmonicMode): string {
  switch (mode) {
    case 'perfect_match':
      return 'Exact key match for maximum compatibility';
    case 'relative_minor':
      return 'Relative minor/major relationship';
    case 'dominant':
      return 'Perfect fifth relationship';
    case 'subdominant':
      return 'Perfect fourth relationship';
    case 'parallel_minor':
      return 'Same root, different mode';
    case 'energy_boost':
      return 'Upward semitone for energy boost';
    case 'energy_drop':
      return 'Downward semitone for energy drop';
    case 'circle_progression':
      return 'Circle of Fifths progression';
    case 'diatonic_progression':
      return 'Within-scale progression';
    case 'chromatic_medley':
      return 'Chromatic movement';
    case 'modal_interchange':
      return 'Borrowed from parallel mode';
    case 'key_change':
      return 'Any key change';
    case 'compatible':
      return 'Harmonically compatible';
    default:
      return 'Harmonic relationship';
  }
}

/**
 * Extract genre hints from analysis
 */
function extractGenreHints(analysis: AudioAnalysis): string[] {
  // This is a simplified implementation
  // In reality, this would analyze the audio or metadata
  const hints: string[] = [];
  
  if (analysis.acousticness > 0.7) hints.push('acoustic');
  if (analysis.instrumentalness > 0.7) hints.push('instrumental');
  if (analysis.energy > 0.8) hints.push('electronic');
  if (analysis.danceability > 0.8) hints.push('dance');
  if (analysis.valence > 0.8) hints.push('happy');
  if (analysis.valence < 0.2) hints.push('sad');
  
  return hints;
}

/**
 * Plan a harmonic DJ set
 */
export async function planHarmonicSet(
  songs: Song[],
  options: {
    startKey?: MusicalKey;
    preferredProgression?: HarmonicMode[];
    energyProfile?: 'rising' | 'falling' | 'wave' | 'stable';
    maxKeyChanges?: number;
  } = {}
): Promise<HarmonicSetPlan> {
  const {
    startKey,
    preferredProgression = ['perfect_match', 'relative_minor', 'dominant', 'circle_progression'],
    energyProfile = 'wave',
    maxKeyChanges = 5
  } = options;
  
  try {
    if (songs.length === 0) {
      throw new Error('No songs provided for harmonic set planning');
    }
    
    // Analyze all songs
    const analyzedSongs = await Promise.all(
      songs.map(async (song) => ({
        song,
        analysis: await analyzeKeyForHarmonicMixing(song)
      }))
    );
    
    // Select starting song
    const startIndex = startKey 
      ? analyzedSongs.findIndex(s => s.analysis.key === startKey)
      : Math.floor(Math.random() * analyzedSongs.length);
    
    if (startIndex === -1 && startKey) {
      throw new Error(`No song found with key ${startKey}`);
    }
    
    const selectedSongs: typeof analyzedSongs = [analyzedSongs[startIndex >= 0 ? startIndex : 0]];
    const remainingSongs = analyzedSongs.filter((_, index) => index !== (startIndex >= 0 ? startIndex : 0));
    
    // Build harmonic progression
    while (selectedSongs.length < Math.min(songs.length, 10) && remainingSongs.length > 0) {
      const currentSong = selectedSongs[selectedSongs.length - 1];
      
      // Find best harmonic match
      const recommendations = await getHarmonicMixingRecommendations(
        currentSong.song,
        remainingSongs.map(s => s.song),
        {
          preferredMode: preferredProgression[Math.floor(Math.random() * preferredProgression.length)],
          maxResults: 1,
          minCompatibility: 0.4
        }
      );
      
      if (recommendations.length === 0) break;
      
      // Add the best match
      const bestMatch = recommendations[0];
      const nextSong = remainingSongs.find(s => s.analysis.key === bestMatch.targetKey);
      
      if (nextSong) {
        selectedSongs.push(nextSong);
        remainingSongs.splice(remainingSongs.indexOf(nextSong), 1);
      } else {
        break;
      }
    }
    
    // Calculate set statistics
    const keyProgression = selectedSongs.map(s => s.analysis.key);
    const harmonicModes = selectedSongs.slice(1).map((s, i) => {
      const prevKey = selectedSongs[i].analysis.key;
      const currKey = s.analysis.key;
      
      // Determine the harmonic mode used
      if (prevKey === currKey) return 'perfect_match';
      if (selectedSongs[i].analysis.relativeKey === currKey) return 'relative_minor';
      if (selectedSongs[i].analysis.dominantKey === currKey) return 'dominant';
      if (selectedSongs[i].analysis.subdominantKey === currKey) return 'subdominant';
      if (selectedSongs[i].analysis.parallelKey === currKey) return 'parallel_minor';
      
      return 'compatible';
    });
    
    const energyFlow = selectedSongs.map(s => s.analysis.energy);
    const keyChanges = harmonicModes.filter(m => m !== 'perfect_match').length;
    
    // Calculate transitions
    const transitions = selectedSongs.slice(1).map((s, i) => {
      const prevSong = selectedSongs[i];
      const compatibility = calculateKeyCompatibility(prevSong.analysis.key, s.analysis.key);
      
      return {
        fromKey: prevSong.analysis.key,
        toKey: s.analysis.key,
        mode: harmonicModes[i] as HarmonicMode,
        compatibility: compatibility.compatibility,
        recommendedTransition: getRecommendedTransition(
          harmonicModes[i] as HarmonicMode,
          'stable',
          'medium'
        )
      };
    });
    
    // Calculate overall harmony
    const overallHarmony = transitions.reduce((sum, t) => sum + t.compatibility, 0) / transitions.length;
    
    // Determine harmonic complexity
    const harmonicComplexity = keyChanges <= 2 ? 'simple' :
                             keyChanges <= 4 ? 'moderate' : 'complex';
    
    return {
      keyProgression,
      harmonicModes,
      energyFlow,
      transitions,
      overallHarmony,
      keyChanges,
      harmonicComplexity
    };
  } catch (error) {
    throw new ServiceError(
      'HARMONIC_SET_PLANNING_ERROR',
      `Failed to plan harmonic set: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}