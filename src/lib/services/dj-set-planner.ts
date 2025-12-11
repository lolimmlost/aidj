// DJ Set Planning Service
// Creates professional DJ sets with energy curves and BPM progression

import type { Song } from '@/lib/types/song';
import type { AudioAnalysis } from './audio-analysis';
import type { DJTransition, TransitionType } from './transition-effects';
import type { HarmonicMode, HarmonicSetPlan } from './harmonic-mixer';
import type { EnergyPattern } from './energy-flow-analyzer';
import { ServiceError } from '../utils';
import { analyzeAudioFeatures } from './audio-analysis';
import { analyzeTransition } from './transition-effects';
import { getHarmonicMixingRecommendations } from './harmonic-mixer';
import { analyzeEnergyFlow } from './energy-flow-analyzer';

// DJ set planning options
export interface DJSetPlanningOptions {
  duration: number; // Total set duration in minutes
  energyProfile: 'rising' | 'falling' | 'wave' | 'plateau' | 'custom';
  customEnergyCurve?: number[]; // Custom energy curve (0.0-1.0)
  bpmProfile: 'steady' | 'gradual_rise' | 'gradual_fall' | 'wave' | 'custom';
  customBPMCurve?: number[]; // Custom BPM progression
  startKey?: string; // Starting key
  endKey?: string; // Ending key
  harmonicMode: HarmonicMode; // Primary harmonic mixing strategy
  genreFocus?: string[]; // Genres to focus on
  genreAvoid?: string[]; // Genres to avoid
  artistFocus?: string[]; // Artists to feature
  artistAvoid?: string[]; // Artists to avoid
  era?: 'classic' | 'modern' | 'mixed'; // Era preference
  intensity: 'chill' | 'moderate' | 'high' | 'peak'; // Intensity level
  transitionStyle: 'smooth' | 'dramatic' | 'varied'; // Transition style
  maxKeyChanges: number; // Maximum key changes in set
  minTransitionDuration: number; // Minimum transition duration in seconds
  maxTransitionDuration: number; // Maximum transition duration in seconds
  includeIntro: boolean; // Include intro track
  includeOutro: boolean; // Include outro track
  diversity: number; // Genre diversity (0.0-1.0)
  repetition: number; // Allow artist repetition (0-3 songs apart)
}

// DJ set structure
export interface DJSet {
  id: string;
  name: string;
  description: string;
  duration: number;
  songs: DJSetSong[];
  transitions: DJTransition[];
  energyCurve: number[];
  bpmProgression: number[];
  keyProgression: string[];
  statistics: DJSetStatistics;
  notes: string[];
  createdAt: Date;
  plannedFor: string; // Venue, event, etc.
}

// Enhanced song in DJ set
export interface DJSetSong {
  song: Song;
  analysis: AudioAnalysis;
  position: number; // Position in set (0-based)
  estimatedStartTime: number; // Start time in minutes
  estimatedEndTime: number; // End time in minutes
  transitionIn?: DJTransition; // Transition into this song
  transitionOut?: DJTransition; // Transition out of this song
  notes: string;
  tags: string[];
}

// DJ set statistics
export interface DJSetStatistics {
  totalDuration: number;
  averageBPM: number;
  averageEnergy: number;
  bpmRange: { min: number; max: number };
  energyRange: { min: number; max: number };
  keyChanges: number;
  genreDistribution: Record<string, number>;
  artistDistribution: Record<string, number>;
  harmonicTransitions: number;
  energyTransitions: number;
  transitionDiversity: number;
  crowdEngagement: number; // Predicted crowd engagement (0-1)
  danceability: number; // Average danceability
  uniqueness: number; // Genre/artist uniqueness (0-1)
}

// Energy curve templates
export const ENERGY_CURVE_TEMPLATES: Record<string, number[]> = {
  rising: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  falling: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2],
  wave: [0.4, 0.6, 0.8, 1.0, 0.8, 0.6, 0.4, 0.6, 0.8, 0.6, 0.4],
  plateau: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
  build_peak_release: [0.2, 0.3, 0.5, 0.7, 0.9, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2],
  peak_plateau_peak: [0.5, 0.7, 0.9, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
};

// BPM progression templates
export const BPM_PROGRESSION_TEMPLATES: Record<string, number[]> = {
  steady: [120, 120, 120, 120, 120, 120, 120, 120, 120],
  gradual_rise: [110, 115, 118, 120, 122, 124, 126, 128, 130, 132],
  gradual_fall: [132, 130, 128, 126, 124, 122, 120, 118, 116, 114, 112],
  wave: [115, 120, 125, 130, 125, 120, 115, 110, 115, 120, 125],
  classic_house: [120, 122, 124, 126, 128, 126, 124, 122, 120, 118, 120],
  progressive_trance: [128, 130, 132, 134, 136, 138, 140, 138, 136, 134, 132],
  techno: [125, 126, 127, 128, 128, 128, 128, 128, 128, 128, 128]
};

// Default planning options
export const DEFAULT_PLANNING_OPTIONS: DJSetPlanningOptions = {
  duration: 60, // 1 hour
  energyProfile: 'wave',
  bpmProfile: 'wave',
  harmonicMode: 'balanced',
  intensity: 'moderate',
  transitionStyle: 'smooth',
  maxKeyChanges: 3,
  minTransitionDuration: 8,
  maxTransitionDuration: 16,
  includeIntro: false,
  includeOutro: false,
  diversity: 0.7,
  repetition: 2
};

/**
 * Plan a complete DJ set with energy curves and BPM progression
 */
export async function planDJSet(
  songs: Song[],
  options: Partial<DJSetPlanningOptions> = {}
): Promise<DJSet> {
  const opts = { ...DEFAULT_PLANNING_OPTIONS, ...options };
  
  try {
    // Validate inputs
    if (songs.length < 2) {
      throw new ServiceError(
        'INSUFFICIENT_SONGS',
        'Need at least 2 songs to plan a DJ set'
      );
    }
    
    if (opts.duration < 10) {
      throw new ServiceError(
        'INVALID_DURATION',
        'DJ set must be at least 10 minutes long'
      );
    }
    
    // Analyze all songs
    const analyzedSongs = await Promise.all(
      songs.map(async song => ({
        song,
        analysis: await analyzeAudioFeatures(song)
      }))
    );
    
    // Calculate target song count based on duration
    const targetSongCount = Math.floor(opts.duration / 4); // Average 4 minutes per song
    
    // Generate energy curve
    const energyCurve = opts.customEnergyCurve || 
                      ENERGY_CURVE_TEMPLATES[opts.energyProfile] ||
                      generateEnergyCurve(opts.energyProfile, targetSongCount);
    
    // Generate BPM progression
    const bpmProgression = opts.customBPMCurve || 
                        BPM_PROGRESSION_TEMPLATES[opts.bpmProfile] ||
                        generateBPMProgression(opts.bpmProfile, targetSongCount);
    
    // Select and arrange songs
    const selectedSongs = await selectAndArrangeSongs(
      analyzedSongs,
      energyCurve,
      bpmProgression,
      opts
    );
    
    // Plan transitions
    const transitions = await planTransitions(selectedSongs, opts);
    
    // Calculate statistics
    const statistics = calculateSetStatistics(selectedSongs, transitions);
    
    // Generate set notes
    const notes = generateSetNotes(selectedSongs, transitions, opts);
    
    // Create DJ set
    const djSet: DJSet = {
      id: generateSetId(),
      name: generateSetName(selectedSongs, opts),
      description: generateSetDescription(selectedSongs, opts),
      duration: opts.duration,
      songs: selectedSongs,
      transitions,
      energyCurve,
      bpmProgression,
      keyProgression: selectedSongs.map(s => s.analysis.key),
      statistics,
      notes,
      createdAt: new Date(),
      plannedFor: opts.plannedFor || 'General DJ Set'
    };
    
    return djSet;
  } catch (error) {
    throw new ServiceError(
      'DJ_SET_PLANNING_ERROR',
      `Failed to plan DJ set: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate energy curve based on profile
 */
function generateEnergyCurve(
  profile: DJSetPlanningOptions['energyProfile'],
  songCount: number
): number[] {
  const curve: number[] = [];
  
  switch (profile) {
    case 'rising':
      for (let i = 0; i < songCount; i++) {
        curve.push(0.3 + (0.7 * i / (songCount - 1)));
      }
      break;
    case 'falling':
      for (let i = 0; i < songCount; i++) {
        curve.push(1.0 - (0.7 * i / (songCount - 1)));
      }
      break;
    case 'wave':
      for (let i = 0; i < songCount; i++) {
        const position = i / (songCount - 1);
        curve.push(0.5 + 0.4 * Math.sin(position * Math.PI * 2));
      }
      break;
    case 'plateau':
      for (let i = 0; i < songCount; i++) {
        curve.push(0.6 + 0.1 * Math.sin(position * Math.PI));
      }
      break;
    default:
      // Default to moderate wave
      return generateEnergyCurve('wave', songCount);
  }
  
  return curve;
}

/**
 * Generate BPM progression based on profile
 */
function generateBPMProgression(
  profile: DJSetPlanningOptions['bpmProfile'],
  songCount: number
): number[] {
  const progression: number[] = [];
  
  switch (profile) {
    case 'steady':
      for (let i = 0; i < songCount; i++) {
        progression.push(120);
      }
      break;
    case 'gradual_rise':
      for (let i = 0; i < songCount; i++) {
        progression.push(110 + (20 * i / (songCount - 1)));
      }
      break;
    case 'gradual_fall':
      for (let i = 0; i < songCount; i++) {
        progression.push(130 - (20 * i / (songCount - 1)));
      }
      break;
    case 'wave':
      for (let i = 0; i < songCount; i++) {
        const position = i / (songCount - 1);
        progression.push(120 + 10 * Math.sin(position * Math.PI * 2));
      }
      break;
    default:
      // Default to steady
      return generateBPMProgression('steady', songCount);
  }
  
  return progression;
}

/**
 * Select and arrange songs based on criteria
 */
async function selectAndArrangeSongs(
  analyzedSongs: Array<{ song: Song; analysis: AudioAnalysis }>,
  energyCurve: number[],
  bpmProgression: number[],
  options: DJSetPlanningOptions
): Promise<DJSetSong[]> {
  const targetSongCount = Math.floor(options.duration / 4);
  const selectedSongs: DJSetSong[] = [];
  
  // Sort songs by compatibility with first song
  let availableSongs = [...analyzedSongs];
  
  for (let i = 0; i < targetSongCount && availableSongs.length > 0; i++) {
    const targetEnergy = energyCurve[i];
    const targetBPM = bpmProgression[i];
    
    // Find best matching song
    let bestSong: { song: Song; analysis: AudioAnalysis } | null = null;
    let bestScore = -1;
    
    for (const candidate of availableSongs) {
      // Calculate compatibility score
      let score = 0;
      
      // Energy compatibility (40%)
      const energyDiff = Math.abs(candidate.analysis.energy - targetEnergy);
      score += Math.max(0, 1 - energyDiff) * 0.4;
      
      // BPM compatibility (30%)
      const bpmDiff = Math.abs(candidate.analysis.bpm - targetBPM);
      score += Math.max(0, 1 - (bpmDiff / 50)) * 0.3;
      
      // Key compatibility (20%)
      if (i > 0) {
        const prevSong = selectedSongs[i - 1];
        if (prevSong) {
          const keyCompatibility = calculateKeyCompatibility(
            prevSong.analysis.key,
            candidate.analysis.key
          );
          score += keyCompatibility.compatibility * 0.2;
        }
      }
      
      // Genre preference (10%)
      if (options.genreFocus && options.genreFocus.length > 0) {
        const songGenre = extractGenre(candidate.song);
        const genreMatch = options.genreFocus.some(genre => 
          songGenre.toLowerCase().includes(genre.toLowerCase())
        );
        score += genreMatch ? 0.1 : 0;
      }
      
      // Artist preference (5%)
      if (options.artistFocus && options.artistFocus.length > 0) {
        const artistMatch = options.artistFocus.some(artist => 
          candidate.song.artist?.toLowerCase().includes(artist.toLowerCase())
        );
        score += artistMatch ? 0.05 : 0;
      }
      
      // Diversity bonus (5%)
      const recentArtists = selectedSongs.slice(-3).map(s => s.song.artist);
      const artistRepetition = recentArtists.includes(candidate.song.artist);
      score += artistRepetition ? 0 : 0.05;
      
      if (score > bestScore) {
        bestScore = score;
        bestSong = candidate;
      }
    }
    
    if (bestSong) {
      selectedSongs.push({
        song: bestSong.song,
        analysis: bestSong.analysis,
        position: i,
        estimatedStartTime: i * 4, // 4 minutes per song
        estimatedEndTime: (i + 1) * 4,
        notes: `Selected for energy ${targetEnergy.toFixed(2)} and BPM ${targetBPM}`,
        tags: generateSongTags(bestSong, targetEnergy, targetBPM)
      });
      
      // Remove selected song from available songs
      availableSongs = availableSongs.filter(s => s.song.id !== bestSong.song.id);
    } else {
      // No suitable song found, pick randomly
      const randomSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
      selectedSongs.push({
        song: randomSong.song,
        analysis: randomSong.analysis,
        position: i,
        estimatedStartTime: i * 4,
        estimatedEndTime: (i + 1) * 4,
        notes: 'Randomly selected - no suitable match found',
        tags: generateSongTags(randomSong, targetEnergy, targetBPM)
      });
      
      availableSongs = availableSongs.filter(s => s.song.id !== randomSong.song.id);
    }
  }
  
  return selectedSongs;
}

/**
 * Plan transitions between songs
 */
async function planTransitions(
  songs: DJSetSong[],
  options: DJSetPlanningOptions
): Promise<DJTransition[]> {
  const transitions: DJTransition[] = [];
  
  for (let i = 0; i < songs.length - 1; i++) {
    const fromSong = songs[i];
    const toSong = songs[i + 1];
    
    try {
      const transitionAnalysis = await analyzeTransition(
        fromSong.song,
        toSong.song,
        fromSong.analysis,
        toSong.analysis
      );
      
      const transition: DJTransition = {
        fromSong: fromSong.song,
        toSong: toSong.song,
        fromAnalysis: fromSong.analysis,
        toAnalysis: toSong.analysis,
        type: determineTransitionType(transitionAnalysis, options),
        startTime: fromSong.estimatedEndTime - (options.minTransitionDuration || 8),
        duration: Math.min(
          Math.max(options.minTransitionDuration || 8, options.maxTransitionDuration || 16),
          Math.max(options.minTransitionDuration || 8, options.maxTransitionDuration || 16)
        ),
        bpmAdjustment: calculateBPMAdjustment(fromSong.analysis.bpm, toSong.analysis.bpm),
        energyChange: toSong.analysis.energy - fromSong.analysis.energy,
        notes: generateTransitionNotes(fromSong, toSong, transitionAnalysis)
      };
      
      transitions.push(transition);
      
      // Update song objects with transition references
      fromSong.transitionOut = transition;
      toSong.transitionIn = transition;
      
    } catch (error) {
      console.warn(`Failed to plan transition from ${fromSong.song.name} to ${toSong.song.name}:`, error);
      
      // Create fallback transition
      const fallbackTransition: DJTransition = {
        fromSong: fromSong.song,
        toSong: toSong.song,
        fromAnalysis: fromSong.analysis,
        toAnalysis: toSong.analysis,
        type: 'crossfade',
        startTime: fromSong.estimatedEndTime - 8,
        duration: 8,
        bpmAdjustment: 0,
        energyChange: toSong.analysis.energy - fromSong.analysis.energy,
        notes: 'Fallback transition - analysis failed'
      };
      
      transitions.push(fallbackTransition);
      fromSong.transitionOut = fallbackTransition;
      toSong.transitionIn = fallbackTransition;
    }
  }
  
  return transitions;
}

/**
 * Determine transition type based on analysis and options
 */
function determineTransitionType(
  analysis: any, // TransitionAnalysis type
  options: DJSetPlanningOptions
): TransitionType {
  switch (options.transitionStyle) {
    case 'smooth':
      return analysis.recommendedType || 'crossfade';
    case 'dramatic':
      return analysis.recommendedType === 'cut' ? 'cut' : 'filter_sweep';
    case 'varied':
      // Vary transitions based on energy change
      if (analysis.energyChange > 0.2) return 'energy_buildup';
      if (analysis.energyChange < -0.2) return 'breakdown';
      return 'harmonic';
    default:
      return analysis.recommendedType || 'crossfade';
  }
}

/**
 * Calculate BPM adjustment needed
 */
function calculateBPMAdjustment(fromBPM: number, toBPM: number): number {
  return (toBPM / fromBPM) - 1;
}

/**
 * Calculate set statistics
 */
function calculateSetStatistics(
  songs: DJSetSong[],
  transitions: DJTransition[]
): DJSetStatistics {
  const totalDuration = songs.length * 4; // 4 minutes per song average
  
  const bpms = songs.map(s => s.analysis.bpm);
  const averageBPM = bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length;
  const bpmRange = {
    min: Math.min(...bpms),
    max: Math.max(...bpms)
  };
  
  const energies = songs.map(s => s.analysis.energy);
  const averageEnergy = energies.reduce((sum, energy) => sum + energy, 0) / energies.length;
  const energyRange = {
    min: Math.min(...energies),
    max: Math.max(...energies)
  };
  
  const keyChanges = transitions.filter(t => 
    t.fromAnalysis.key !== t.toAnalysis.key
  ).length;
  
  const genreDistribution: Record<string, number> = {};
  const artistDistribution: Record<string, number> = {};
  
  songs.forEach(s => {
    const genre = extractGenre(s.song);
    genreDistribution[genre] = (genreDistribution[genre] || 0) + 1;
    
    const artist = s.song.artist || 'Unknown';
    artistDistribution[artist] = (artistDistribution[artist] || 0) + 1;
  });
  
  const harmonicTransitions = transitions.filter(t => 
    ['harmonic', 'beatmatch'].includes(t.type)
  ).length;
  
  const energyTransitions = transitions.filter(t => 
    ['energy_buildup', 'breakdown'].includes(t.type)
  ).length;
  
  const transitionTypes = transitions.map(t => t.type);
  const uniqueTypes = new Set(transitionTypes);
  const transitionDiversity = uniqueTypes.size / transitionTypes.length;
  
  const danceability = songs.reduce((sum, s) => sum + s.analysis.danceability, 0) / songs.length;
  
  // Calculate uniqueness (inverse of genre/artist concentration)
  const maxGenreCount = Math.max(...Object.values(genreDistribution));
  const maxArtistCount = Math.max(...Object.values(artistDistribution));
  const genreUniqueness = 1 - (maxGenreCount / songs.length);
  const artistUniqueness = 1 - (maxArtistCount / songs.length);
  const uniqueness = (genreUniqueness + artistUniqueness) / 2;
  
  // Predict crowd engagement based on energy and danceability
  const crowdEngagement = (averageEnergy * 0.6) + (danceability * 0.4);
  
  return {
    totalDuration,
    averageBPM,
    averageEnergy,
    bpmRange,
    energyRange,
    keyChanges,
    genreDistribution,
    artistDistribution,
    harmonicTransitions,
    energyTransitions,
    transitionDiversity,
    crowdEngagement,
    danceability,
    uniqueness
  };
}

/**
 * Generate set notes
 */
function generateSetNotes(
  songs: DJSetSong[],
  transitions: DJTransition[],
  options: DJSetPlanningOptions
): string[] {
  const notes: string[] = [];
  
  // Overall set notes
  notes.push(`DJ set planned with ${songs.length} songs for ${options.duration} minutes`);
  notes.push(`Energy profile: ${options.energyProfile}`);
  notes.push(`BPM profile: ${options.bpmProfile}`);
  notes.push(`Harmonic mode: ${options.harmonicMode}`);
  
  // Transition notes
  const keyChanges = transitions.filter(t => 
    t.fromAnalysis.key !== t.toAnalysis.key
  ).length;
  
  if (keyChanges > 0) {
    notes.push(`${keyChanges} key changes planned`);
  }
  
  // Energy notes
  const energyRange = Math.max(...songs.map(s => s.analysis.energy)) - 
                   Math.min(...songs.map(s => s.analysis.energy));
  
  if (energyRange > 0.6) {
    notes.push('High energy set with dynamic progression');
  } else if (energyRange < 0.3) {
    notes.push('Low energy chill set');
  }
  
  return notes;
}

/**
 * Generate transition notes
 */
function generateTransitionNotes(
  fromSong: DJSetSong,
  toSong: DJSetSong,
  analysis: any // TransitionAnalysis type
): string {
  const notes: string[] = [];
  
  const energyChange = toSong.analysis.energy - fromSong.analysis.energy;
  const bpmChange = toSong.analysis.bpm - fromSong.analysis.bpm;
  
  if (Math.abs(energyChange) > 0.3) {
    notes.push(`Significant energy change: ${energyChange > 0 ? '+' : ''}${energyChange.toFixed(2)}`);
  }
  
  if (Math.abs(bpmChange) > 10) {
    notes.push(`BPM adjustment: ${bpmChange > 0 ? '+' : ''}${bpmChange} BPM`);
  }
  
  if (fromSong.analysis.key !== toSong.analysis.key) {
    notes.push(`Key change: ${fromSong.analysis.key} → ${toSong.analysis.key}`);
  }
  
  return notes.join('. ');
}

/**
 * Generate song tags
 */
function generateSongTags(
  songData: { song: Song; analysis: AudioAnalysis },
  targetEnergy: number,
  targetBPM: number
): string[] {
  const tags: string[] = [];
  
  if (songData.analysis.energy > 0.8) {
    tags.push('high-energy');
  } else if (songData.analysis.energy < 0.3) {
    tags.push('low-energy');
  }
  
  if (songData.analysis.danceability > 0.8) {
    tags.push('danceable');
  }
  
  if (Math.abs(songData.analysis.bpm - targetBPM) < 2) {
    tags.push('BPM-matched');
  }
  
  const genre = extractGenre(songData.song);
  if (genre) {
    tags.push(genre.toLowerCase());
  }
  
  return tags;
}

/**
 * Extract genre from song metadata
 */
function extractGenre(song: Song): string {
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  const genreKeywords = [
    'house', 'techno', 'trance', 'drum & bass', 'dubstep',
    'electronic', 'edm', 'progressive', 'minimal',
    'rock', 'pop', 'indie', 'alternative', 'punk', 'metal',
    'hip-hop', 'rap', 'r&b', 'soul', 'funk', 'disco',
    'jazz', 'blues', 'classical', 'ambient', 'experimental'
  ];
  
  for (const keyword of genreKeywords) {
    if (metadata.includes(keyword)) {
      return keyword;
    }
  }
  
  return 'unknown';
}

/**
 * Generate unique set ID
 */
function generateSetId(): string {
  return 'set_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate set name
 */
function generateSetName(songs: DJSetSong[], options: DJSetPlanningOptions): string {
  const genres = [...new Set(songs.map(s => extractGenre(s.song)))];
  const primaryGenre = genres[0] || 'Mixed';
  
  const templates = [
    `${primaryGenre} DJ Set`,
    `${options.intensity} ${primaryGenre} Mix`,
    `${options.energyProfile} Energy ${primaryGenre} Set`,
    `${options.duration}min ${primaryGenre} Journey`,
    `Professional ${primaryGenre} DJ Set`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate set description
 */
function generateSetDescription(songs: DJSetSong[], options: DJSetPlanningOptions): string {
  const avgBPM = songs.reduce((sum, s) => sum + s.analysis.bpm, 0) / songs.length;
  const avgEnergy = songs.reduce((sum, s) => sum + s.analysis.energy, 0) / songs.length;
  
  return `A ${options.intensity} ${options.duration}-minute DJ set with ${songs.length} tracks. ` +
         `Average BPM: ${Math.round(avgBPM)}, ` +
         `Average energy: ${(avgEnergy * 100).toFixed(0)}%. ` +
         `Features ${options.energyProfile} energy progression and ${options.bpmProfile} BPM variation.`;
}

/**
 * Calculate key compatibility (simplified version)
 */
function calculateKeyCompatibility(fromKey: string, toKey: string): { compatibility: number; relationship: string } {
  if (fromKey === toKey) {
    return { compatibility: 1.0, relationship: 'perfect_match' };
  }
  
  // Circle of fifths compatibility
  const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  const fromIndex = circleOfFifths.indexOf(fromKey.replace('m', ''));
  const toIndex = circleOfFifths.indexOf(toKey.replace('m', ''));
  
  const distance = Math.min(
    Math.abs(toIndex - fromIndex),
    12 - Math.abs(toIndex - fromIndex)
  );
  
  if (distance <= 1) {
    return { compatibility: 0.9, relationship: 'compatible' };
  } else if (distance <= 2) {
    return { compatibility: 0.7, relationship: 'compatible' };
  } else if (distance <= 3) {
    return { compatibility: 0.5, relationship: 'acceptable' };
  } else {
    return { compatibility: 0.2, relationship: 'incompatible' };
  }
}

/**
 * Export planning templates
 */
export const PLANNING_TEMPLATES: Record<string, Partial<DJSetPlanningOptions>> = {
  'club_energy': {
    energyProfile: 'rising',
    bpmProfile: 'gradual_rise',
    intensity: 'high',
    transitionStyle: 'dramatic',
    harmonicMode: 'energy',
    genreFocus: ['house', 'techno', 'trance'],
    duration: 90
  },
  'festival_chill': {
    energyProfile: 'wave',
    bpmProfile: 'steady',
    intensity: 'moderate',
    transitionStyle: 'smooth',
    harmonicMode: 'balanced',
    genreFocus: ['progressive', 'ambient', 'downtempo'],
    duration: 120
  },
  'radio_friendly': {
    energyProfile: 'plateau',
    bpmProfile: 'steady',
    intensity: 'moderate',
    transitionStyle: 'smooth',
    harmonicMode: 'perfect_match',
    genreFocus: ['pop', 'indie', 'rock'],
    maxKeyChanges: 1,
    duration: 60
  },
  'underground_experimental': {
    energyProfile: 'custom',
    customEnergyCurve: [0.2, 0.8, 0.4, 0.9, 0.3, 0.7, 0.5, 0.6, 0.8],
    bpmProfile: 'wave',
    intensity: 'moderate',
    transitionStyle: 'varied',
    harmonicMode: 'experimental',
    genreFocus: ['experimental', 'ambient', 'minimal'],
    diversity: 0.9,
    duration: 90
  }
};