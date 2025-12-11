// DJ Service for auto-mixing and queue management
// Integrates with audio store to provide professional DJ features

import type { Song } from '@/lib/types/song';
import type { DJTransition, DJSetPlan, DJMixerConfig } from './dj-mixer';
import type { AudioAnalysis } from './audio-analysis';
import { createTransitionPlan, DEFAULT_DJ_MIXER_CONFIG } from './dj-mixer';
import { analyzeAudioFeatures, calculateKeyCompatibility } from './audio-analysis';
import { ServiceError } from '../utils';

// DJ queue management
export interface DJQueueItem {
  song: Song;
  analysis?: AudioAnalysis;
  transition?: DJTransition;
  compatibility?: number;
  position: number;
  isAutoQueued: boolean;
  queuedAt: Date;
}

// DJ session state
export interface DJSession {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  config: DJMixerConfig;
  queue: DJQueueItem[];
  currentIndex: number;
  isAutoMixing: boolean;
  isTransitioning: boolean;
  currentTransition?: DJTransition;
  totalTransitions: number;
  averageCompatibility: number;
  energyHistory: number[];
  bpmHistory: number[];
  keyHistory: string[];
}

// DJ auto-mixing options
export interface DJAutoMixOptions {
  targetDuration?: number; // Target set duration in minutes
  energyCurve?: 'rising' | 'falling' | 'peak' | 'valley' | 'wave';
  startEnergy?: number; // 0.0-1.0
  endEnergy?: number; // 0.0-1.0
  genreFocus?: string[]; // Focus on specific genres
  excludeGenres?: string[]; // Exclude specific genres
  maxBPMRange?: { min: number; max: number }; // BPM range constraints
  keyProgression?: 'circle_of_fifths' | 'random' | 'harmonic' | 'energy_based';
}

// DJ recommendations
export interface DJRecommendation {
  song: Song;
  analysis: AudioAnalysis;
  compatibility: number;
  transitionType: string;
  notes: string[];
  priority: 'high' | 'medium' | 'low';
}

// Active DJ session
let activeSession: DJSession | null = null;
let sessionHistory: DJSession[] = [];

/**
 * Start a new DJ session
 */
export function startDJSession(
  name: string,
  config: DJMixerConfig = DEFAULT_DJ_MIXER_CONFIG
): DJSession {
  const session: DJSession = {
    id: crypto.randomUUID(),
    name,
    startTime: new Date(),
    config,
    queue: [],
    currentIndex: -1,
    isAutoMixing: false,
    isTransitioning: false,
    totalTransitions: 0,
    averageCompatibility: 0,
    energyHistory: [],
    bpmHistory: [],
    keyHistory: []
  };
  
  activeSession = session;
  sessionHistory.push(session);
  
  console.log(`🎧 DJ Session "${name}" started with config:`, config);
  return session;
}

/**
 * Get the current active DJ session
 */
export function getActiveDJSession(): DJSession | null {
  return activeSession;
}

/**
 * End the current DJ session
 */
export function endDJSession(): DJSession | null {
  if (!activeSession) return null;
  
  const session = { ...activeSession, endTime: new Date() };
  
  console.log(`🎧 DJ Session "${session.name}" ended`);
  
  activeSession = null;
  return session;
}

/**
 * Add a song to the DJ queue
 */
export async function addToDJQueue(
  song: Song,
  position?: number,
  isAutoQueued: boolean = false
): Promise<DJQueueItem> {
  if (!activeSession) {
    throw new ServiceError('DJ_NO_SESSION', 'No active DJ session');
  }
  
  try {
    // Analyze song for DJ mixing
    const analysis = await analyzeAudioFeatures(song);
    
    // Calculate compatibility with previous song if applicable
    let compatibility = 1.0;
    let transition: DJTransition | undefined;
    
    if (activeSession.queue.length > 0) {
      const previousItem = activeSession.queue[activeSession.queue.length - 1];
      // const previousAnalysis = previousItem.analysis || await analyzeAudioFeatures(previousItem.song);
      
      transition = await createTransitionPlan(previousItem.song, song, activeSession.config);
      compatibility = transition.compatibility;
    }
    
    // Create queue item
    const queueItem: DJQueueItem = {
      song,
      analysis,
      transition,
      compatibility,
      position: position ?? activeSession.queue.length,
      isAutoQueued,
      queuedAt: new Date()
    };
    
    // Insert at specified position or append
    if (position !== undefined && position < activeSession.queue.length) {
      activeSession.queue.splice(position, 0, queueItem);
      // Update positions
      activeSession.queue.forEach((item, index) => {
        item.position = index;
      });
    } else {
      activeSession.queue.push(queueItem);
    }
    
    console.log(`🎵 Added to DJ queue: "${song.name}" (compatibility: ${compatibility.toFixed(2)})`);
    return queueItem;
  } catch (error) {
    throw new ServiceError(
      'DJ_QUEUE_ERROR',
      `Failed to add song to DJ queue: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Remove a song from the DJ queue
 */
export function removeFromDJQueue(position: number): DJQueueItem | null {
  if (!activeSession) {
    throw new ServiceError('DJ_NO_SESSION', 'No active DJ session');
  }
  
  if (position < 0 || position >= activeSession.queue.length) {
    return null;
  }
  
  const removedItem = activeSession.queue.splice(position, 1)[0];
  
  // Update positions
  activeSession.queue.forEach((item, index) => {
    item.position = index;
  });
  
  // Update current index if needed
  if (position < activeSession.currentIndex) {
    activeSession.currentIndex--;
  } else if (position === activeSession.currentIndex) {
    activeSession.currentIndex = Math.min(activeSession.currentIndex, activeSession.queue.length - 1);
  }
  
  console.log(`🗑️ Removed from DJ queue: "${removedItem.song.name}"`);
  return removedItem;
}

/**
 * Get DJ recommendations for the next song
 */
export async function getDJRecommendations(
  candidateSongs: Song[],
  options: {
    maxResults?: number;
    minCompatibility?: number;
    prioritizeEnergy?: boolean;
    prioritizeKey?: boolean;
    prioritizeBPM?: boolean;
  } = {}
): Promise<DJRecommendation[]> {
  if (!activeSession || activeSession.queue.length === 0) {
    throw new ServiceError('DJ_NO_CURRENT_SONG', 'No current song to base recommendations on');
  }
  
  const {
    maxResults = 10,
    minCompatibility = 0.5
  } = options;
  
  try {
    const currentItem = activeSession.queue[activeSession.currentIndex];
    if (!currentItem?.analysis) {
      throw new ServiceError('DJ_NO_ANALYSIS', 'Current song has not been analyzed');
    }
    
    // Analyze all candidate songs
    const recommendations: DJRecommendation[] = [];
    
    for (const song of candidateSongs) {
      // Skip if already in queue
      if (activeSession.queue.some(item => item.song.id === song.id)) {
        continue;
      }
      
      // Analyze candidate song
      const analysis = await analyzeAudioFeatures(song);
      
      // Create transition plan
      const transition = await createTransitionPlan(currentItem.song, song, activeSession.config);
      
      // Determine priority based on compatibility
      let priority: 'high' | 'medium' | 'low';
      if (transition.compatibility >= 0.8) {
        priority = 'high';
      } else if (transition.compatibility >= 0.6) {
        priority = 'medium';
      } else {
        priority = 'low';
      }
      
      // Skip if below minimum compatibility
      if (transition.compatibility < minCompatibility) {
        continue;
      }
      
      recommendations.push({
        song,
        analysis,
        compatibility: transition.compatibility,
        transitionType: transition.transitionType,
        notes: transition.notes.split('. ').filter(note => note.trim()),
        priority
      });
    }
    
    // Sort by compatibility and priority
    recommendations.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority];
      const bPriority = priorityWeight[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return b.compatibility - a.compatibility;
    });
    
    return recommendations.slice(0, maxResults);
  } catch (error) {
    throw new ServiceError(
      'DJ_RECOMMENDATIONS_ERROR',
      `Failed to get DJ recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Enable/disable auto-mixing
 */
export function setAutoMixing(enabled: boolean): void {
  if (!activeSession) {
    throw new ServiceError('DJ_NO_SESSION', 'No active DJ session');
  }
  
  activeSession.isAutoMixing = enabled;
  console.log(`🎛️ Auto-mixing ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Auto-mix the next song
 */
export async function autoMixNext(): Promise<DJTransition | null> {
  if (!activeSession || !activeSession.isAutoMixing) {
    return null;
  }
  
  if (activeSession.currentIndex >= activeSession.queue.length - 1) {
    // No more songs in queue
    return null;
  }
  
  try {
    const currentItem = activeSession.queue[activeSession.currentIndex];
    const nextItem = activeSession.queue[activeSession.currentIndex + 1];
    
    if (!currentItem || !nextItem) {
      return null;
    }
    
    // Create transition if not already planned
    let transition = nextItem.transition;
    if (!transition) {
      transition = await createTransitionPlan(currentItem.song, nextItem.song, activeSession.config);
      nextItem.transition = transition;
    }
    
    // Start transition
    activeSession.isTransitioning = true;
    activeSession.currentTransition = transition;
    activeSession.totalTransitions++;
    
    // Update session statistics
    updateSessionStatistics();
    
    console.log(`🎚️ Auto-mixing transition: "${currentItem.song.name}" → "${nextItem.song.name}" (${transition.transitionType})`);
    
    return transition;
  } catch (error) {
    throw new ServiceError(
      'DJ_AUTO_MIX_ERROR',
      `Failed to auto-mix next song: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Complete a transition
 */
export function completeTransition(): void {
  if (!activeSession) return;
  
  activeSession.isTransitioning = false;
  activeSession.currentTransition = undefined;
  activeSession.currentIndex++;
  
  // Update history
  const currentItem = activeSession.queue[activeSession.currentIndex];
  if (currentItem?.analysis) {
    activeSession.energyHistory.push(currentItem.analysis.energy);
    activeSession.bpmHistory.push(currentItem.analysis.bpm);
    activeSession.keyHistory.push(currentItem.analysis.key);
  }
  
  console.log(`✅ Transition completed, now playing: "${currentItem?.song.name}"`);
}

/**
 * Plan an entire DJ set with auto-mixing
 */
export async function planAutoMixSet(
  options: DJAutoMixOptions & {
    maxSongs?: number;
    config?: DJMixerConfig;
    candidateSongs?: Song[]; // Optional: provide specific songs to choose from
  } = {}
): Promise<DJSetPlan> {
  const {
    maxSongs = 20,
    config = DEFAULT_DJ_MIXER_CONFIG,
    candidateSongs,
    targetDuration,
    energyCurve = 'wave',
    startEnergy = 0.5,
    endEnergy = 0.7,
    genreFocus = [],
    excludeGenres = [],
    maxBPMRange,
    keyProgression = 'harmonic'
  } = options;
  
  try {
    // Get candidate songs if not provided
    const songs = candidateSongs;
    if (!songs) {
      // This would integrate with the library to get candidate songs
      // For now, we'll use a placeholder implementation
      console.log('No candidate songs provided, using library search');
      throw new ServiceError(
        'DJ_AUTO_MIX_NO_CANDIDATES',
        'No candidate songs provided for auto-mix set planning'
      );
    }

    if (songs.length < 2) {
      throw new ServiceError(
        'DJ_AUTO_MIX_INSUFFICIENT_SONGS',
        'Need at least 2 songs to plan a DJ set'
      );
    }

    console.log(`🎚️ Planning auto-mix set with ${songs.length} candidate songs`);

    // Analyze all songs for DJ mixing
    const analyzedSongs = await Promise.all(
      songs.map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        return { song, analysis };
      })
    );

    // Filter songs based on criteria
    let filteredSongs = analyzedSongs;
    
    // Filter by genre focus
    if (genreFocus.length > 0) {
      filteredSongs = filteredSongs.filter(({ song }) => {
        const songGenres = extractGenreHints(song);
        return genreFocus.some(focus =>
          songGenres.some(genre => genre.toLowerCase().includes(focus.toLowerCase()))
        );
      });
      console.log(`🎼 Genre filtering: ${filteredSongs.length}/${analyzedSongs.length} songs remain`);
    }

    // Exclude specific genres
    if (excludeGenres.length > 0) {
      filteredSongs = filteredSongs.filter(({ song }) => {
        const songGenres = extractGenreHints(song);
        return !excludeGenres.some(exclude =>
          songGenres.some(genre => genre.toLowerCase().includes(exclude.toLowerCase()))
        );
      });
      console.log(`🚫 Genre exclusion: ${filteredSongs.length}/${analyzedSongs.length} songs remain`);
    }

    // Filter by BPM range
    if (maxBPMRange) {
      filteredSongs = filteredSongs.filter(({ analysis }) =>
        analysis.bpm >= maxBPMRange.min && analysis.bpm <= maxBPMRange.max
      );
      console.log(`⏱️ BPM filtering: ${filteredSongs.length}/${analyzedSongs.length} songs remain`);
    }

    if (filteredSongs.length < 2) {
      throw new ServiceError(
        'DJ_AUTO_MIX_INSUFFICIENT_FILTERED',
        'Not enough songs pass the filtering criteria for a DJ set'
      );
    }

    // Plan the set progression based on energy curve
    const plannedSet = planEnergyProgression(filteredSongs, {
      energyCurve,
      startEnergy,
      endEnergy,
      maxSongs,
      targetDuration,
      keyProgression,
      config
    });

    console.log(`✅ Auto-mix set planned: ${plannedSet.songs.length} songs, ${Math.round(plannedSet.totalDuration / 60)} minutes`);
    return plannedSet;

  } catch (error) {
    throw new ServiceError(
      'DJ_AUTO_MIX_PLANNING_ERROR',
      `Failed to plan auto-mix set: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract genre hints from song metadata (reused from audio-analysis)
 */
function extractGenreHints(song: Song): string[] {
  const hints: string[] = [];
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  // Common genre keywords
  const genreKeywords = [
    'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'hip hop', 'rap',
    'country', 'blues', 'metal', 'punk', 'indie', 'alternative', 'folk', 'soul',
    'r&b', 'reggae', 'techno', 'house', 'ambient', 'experimental', 'psychedelic',
    'funk', 'disco', 'grunge', 'emo', 'ska', 'gospel', 'latin', 'world',
    'acoustic', 'instrumental', 'dubstep', 'drum', 'bass', 'trance', 'dub'
  ];
  
  for (const keyword of genreKeywords) {
    if (metadata.includes(keyword)) {
      hints.push(keyword);
    }
  }
  
  return hints;
}

/**
 * Plan energy progression for DJ set
 */
interface EnergyProgressionOptions {
  energyCurve: 'rising' | 'falling' | 'peak' | 'valley' | 'wave';
  startEnergy: number;
  endEnergy: number;
  maxSongs: number;
  targetDuration?: number;
  keyProgression: 'circle_of_fifths' | 'random' | 'harmonic' | 'energy_based';
  config: DJMixerConfig;
}

async function planEnergyProgression(
  analyzedSongs: Array<{ song: Song; analysis: AudioAnalysis }>,
  options: EnergyProgressionOptions
): Promise<DJSetPlan> {
  const { energyCurve, startEnergy, endEnergy, maxSongs, keyProgression, config } = options;
  
  // Calculate target energy for each position in the set
  const energyTargets: number[] = [];
  const songCount = Math.min(maxSongs, analyzedSongs.length);
  
  for (let i = 0; i < songCount; i++) {
    const progress = i / (songCount - 1);
    let targetEnergy: number;
    
    switch (energyCurve) {
      case 'rising':
        targetEnergy = startEnergy + (endEnergy - startEnergy) * progress;
        break;
      case 'falling':
        targetEnergy = startEnergy - (startEnergy - endEnergy) * progress;
        break;
      case 'peak':
        // Rise to peak in middle, then fall
        if (progress < 0.5) {
          targetEnergy = startEnergy + (1.0 - startEnergy) * (progress * 2);
        } else {
          targetEnergy = 1.0 - (1.0 - endEnergy) * ((progress - 0.5) * 2);
        }
        break;
      case 'valley':
        // Fall to valley in middle, then rise
        if (progress < 0.5) {
          targetEnergy = startEnergy - (startEnergy - 0.2) * (progress * 2);
        } else {
          targetEnergy = 0.2 + (endEnergy - 0.2) * ((progress - 0.5) * 2);
        }
        break;
      case 'wave':
      default:
        // Sinusoidal energy pattern
        targetEnergy = startEnergy + (endEnergy - startEnergy) * progress +
          0.2 * Math.sin(progress * Math.PI * 2);
        break;
    }
    
    energyTargets.push(Math.max(0.1, Math.min(1.0, targetEnergy)));
  }
  
  // Select songs that match energy targets
  const selectedSongs: Array<{ song: Song; analysis: AudioAnalysis }> = [];
  const usedSongs = new Set<string>();
  
  for (let i = 0; i < energyTargets.length; i++) {
    const targetEnergy = energyTargets[i];
    
    // Find best matching song that hasn't been used
    let bestMatch: { song: Song; analysis: AudioAnalysis } | null = null;
    let bestScore = -1;
    
    for (const candidate of analyzedSongs) {
      if (usedSongs.has(candidate.song.id)) continue;
      
      // Calculate energy match score
      const energyDiff = Math.abs(candidate.analysis.energy - targetEnergy);
      const energyScore = 1.0 - energyDiff;
      
      // Consider key progression if applicable
      let keyScore = 1.0;
      if (i > 0 && selectedSongs.length > 0) {
        const previousKey = selectedSongs[selectedSongs.length - 1].analysis.key;
        keyScore = calculateKeyCompatibilityScore(previousKey, candidate.analysis.key, keyProgression);
      }
      
      // Consider BPM compatibility
      let bpmScore = 1.0;
      if (i > 0 && selectedSongs.length > 0) {
        const previousBPM = selectedSongs[selectedSongs.length - 1].analysis.bpm;
        const bpmDiff = Math.abs(candidate.analysis.bpm - previousBPM);
        bpmScore = Math.max(0.1, 1.0 - (bpmDiff / 50)); // Normalize BPM difference
      }
      
      // Calculate overall score
      const overallScore = (energyScore * 0.5) + (keyScore * 0.3) + (bpmScore * 0.2);
      
      if (overallScore > bestScore) {
        bestScore = overallScore;
        bestMatch = candidate;
      }
    }
    
    if (bestMatch) {
      selectedSongs.push(bestMatch);
      usedSongs.add(bestMatch.song.id);
    } else {
      // Fallback: pick any unused song
      const unusedSong = analyzedSongs.find(s => !usedSongs.has(s.song.id));
      if (unusedSong) {
        selectedSongs.push(unusedSong);
        usedSongs.add(unusedSong.song.id);
      }
    }
  }
  
  // Create transitions between consecutive songs
  const transitions: DJTransition[] = [];
  for (let i = 0; i < selectedSongs.length - 1; i++) {
    // Create transition synchronously for planning
    const transition = await createTransitionPlan(
      selectedSongs[i].song,
      selectedSongs[i + 1].song,
      config
    );
    transitions.push(transition);
  }
  
  // Calculate set statistics
  const songs = selectedSongs.map(item => item.song);
  const analyses = selectedSongs.map(item => item.analysis);
  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0);
  const averageEnergy = analyses.reduce((sum, analysis) => sum + analysis.energy, 0) / analyses.length;
  
  // Generate energy profile
  const energyProfile = energyTargets.slice(0, selectedSongs.length);
  const bpmProgression = analyses.map(analysis => analysis.bpm);
  const keyProgressionList = analyses.map(analysis => analysis.key);
  
  // Calculate overall set compatibility
  const compatibility = transitions.length > 0
    ? transitions.reduce((sum, transition) => sum + transition.compatibility, 0) / transitions.length
    : 1.0;
  
  // Generate set notes
  const notes = generateAutoMixSetNotes(songs, analyses, transitions, config);
  
  return {
    songs,
    transitions,
    totalDuration,
    averageEnergy,
    energyProfile,
    bpmProgression,
    keyProgression: keyProgressionList,
    compatibility,
    notes
  };
}

/**
 * Calculate key compatibility score for progression planning
 */
function calculateKeyCompatibilityScore(
  fromKey: import('./audio-analysis').MusicalKey,
  toKey: import('./audio-analysis').MusicalKey,
  progressionType: 'circle_of_fifths' | 'random' | 'harmonic' | 'energy_based'
): number {
  if (progressionType === 'random') {
    return Math.random(); // Random selection
  }
  
  if (progressionType === 'energy_based') {
    return 0.8; // Don't prioritize key in energy-based mixing
  }
  
  // For harmonic and circle_of_fifths, use existing key compatibility
  const { calculateKeyCompatibility } = require('./audio-analysis');
  const compatibility = calculateKeyCompatibility(fromKey, toKey);
  return compatibility.compatibility;
}

/**
 * Generate notes about the auto-mix set
 */
function generateAutoMixSetNotes(
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

/**
 * Update session statistics
 */
function updateSessionStatistics(): void {
  if (!activeSession) return;
  
  const completedTransitions = activeSession.queue
    .slice(0, activeSession.currentIndex + 1)
    .filter(item => item.compatibility !== undefined);
  
  if (completedTransitions.length > 0) {
    const totalCompatibility = completedTransitions.reduce((sum, item) => sum + (item.compatibility || 0), 0);
    activeSession.averageCompatibility = totalCompatibility / completedTransitions.length;
  }
}

/**
 * Get DJ session statistics
 */
export function getDJSessionStats(sessionId?: string): DJSession | null {
  if (sessionId) {
    return sessionHistory.find(session => session.id === sessionId) || null;
  }
  return activeSession;
}

/**
 * Get all DJ session history
 */
export function getDJSessionHistory(): DJSession[] {
  return [...sessionHistory];
}

/**
 * Clear DJ session history
 */
export function clearDJSessionHistory(): void {
  sessionHistory = [];
  console.log('🗑️ DJ session history cleared');
}

/**
 * Export DJ session data
 */
export function exportDJSession(sessionId?: string): string {
  const session = sessionId ? getDJSessionStats(sessionId) : activeSession;
  
  if (!session) {
    throw new ServiceError('DJ_NO_SESSION', 'No DJ session to export');
  }
  
  const exportData = {
    session: {
      id: session.id,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      config: session.config,
      statistics: {
        totalTransitions: session.totalTransitions,
        averageCompatibility: session.averageCompatibility,
        energyHistory: session.energyHistory,
        bpmHistory: session.bpmHistory,
        keyHistory: session.keyHistory
      }
    },
    queue: session.queue.map(item => ({
      song: {
        id: item.song.id,
        name: item.song.name,
        artist: item.song.artist,
        duration: item.song.duration
      },
      analysis: item.analysis ? {
        bpm: item.analysis.bpm,
        key: item.analysis.key,
        energy: item.analysis.energy,
        danceability: item.analysis.danceability
      } : null,
      transition: item.transition ? {
        type: item.transition.transitionType,
        compatibility: item.transition.compatibility,
        notes: item.transition.notes
      } : null,
      compatibility: item.compatibility,
      isAutoQueued: item.isAutoQueued,
      queuedAt: item.queuedAt
    }))
  };
  
  return JSON.stringify(exportData, null, 2);
}