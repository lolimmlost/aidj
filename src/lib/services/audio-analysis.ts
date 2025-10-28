// Audio Analysis Service for DJ features
// Implements BPM detection, key detection, and energy level analysis

import type { Song } from '@/components/ui/audio-player';
import { ServiceError } from '../utils';

// Audio analysis metadata for a song
export interface AudioAnalysis {
  id: string; // Song ID
  bpm: number; // Beats per minute
  key: MusicalKey; // Musical key (C, C#, etc.)
  energy: number; // Energy level (0.0-1.0)
  danceability: number; // Danceability (0.0-1.0)
  valence: number; // Musical positiveness/valence (0.0-1.0)
  acousticness: number; // Acoustic confidence (0.0-1.0)
  instrumentalness: number; // Instrumental confidence (0.0-1.0)
  loudness: number; // Overall loudness in dB
  tempoConfidence: number; // Confidence of BPM detection (0.0-1.0)
  keyConfidence: number; // Confidence of key detection (0.0-1.0)
  analysisVersion: string; // Version of the analysis algorithm
  analyzedAt: Date; // When the analysis was performed
}

// Musical keys with their corresponding numbers for the Circle of Fifths
export type MusicalKey = 
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' 
  | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
  | 'Cm' | 'C#m' | 'Dm' | 'D#m' | 'Em' | 'Fm'
  | 'F#m' | 'Gm' | 'G#m' | 'Am' | 'A#m' | 'Bm';

// Key compatibility for harmonic mixing
export interface KeyCompatibility {
  key: MusicalKey;
  compatibility: number; // 0.0-1.0, higher means better harmonic match
  relationship: 'perfect_match' | 'relative_minor' | 'dominant' | 'subdominant' | 'parallel_minor' | 'compatible' | 'incompatible';
}

// BPM compatibility for smooth transitions
export interface BPMCompatibility {
  bpm: number;
  compatibility: number; // 0.0-1.0, higher means better BPM match
  relationship: 'exact_match' | 'close_match' | 'double_time' | 'half_time' | 'compatible' | 'needs_adjustment';
}

// Energy flow analysis for DJ sets
export interface EnergyFlow {
  currentEnergy: number;
  targetEnergy: number;
  energyDirection: 'rising' | 'falling' | 'steady';
  transitionType: 'buildup' | 'breakdown' | 'peak' | 'cooldown';
}

// Cache for audio analysis results
const analysisCache = new Map<string, AudioAnalysis>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Musical key positions in the Circle of Fifths (for harmonic compatibility)
const CIRCLE_OF_FIFTHS: Record<MusicalKey, number> = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5,
  'F#': 6, 'C#': 7, 'G#': 8, 'D#': 9, 'A#': 10, 'F': 11,
  'Cm': 0, 'Gm': 1, 'Dm': 2, 'Am': 3, 'Em': 4, 'Bm': 5,
  'F#m': 6, 'C#m': 7, 'G#m': 8, 'D#m': 9, 'A#m': 10, 'Fm': 11
};

/**
 * Get cached analysis or return null if not cached/expired
 */
function getCachedAnalysis(songId: string): AudioAnalysis | null {
  const cached = analysisCache.get(songId);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.analyzedAt.getTime() > CACHE_TTL) {
    analysisCache.delete(songId);
    return null;
  }
  
  return cached;
}

/**
 * Cache analysis results
 */
function setCachedAnalysis(analysis: AudioAnalysis): void {
  analysisCache.set(analysis.id, analysis);
}

/**
 * Analyze audio features from a song URL
 * This is a simplified implementation that would use Web Audio API in a real scenario
 * For production, this would integrate with services like Spotify API, Echo Nest, or offline analysis
 */
export async function analyzeAudioFeatures(song: Song): Promise<AudioAnalysis> {
  // Check cache first
  const cached = getCachedAnalysis(song.id);
  if (cached) {
    return cached;
  }

  try {
    // In a real implementation, this would:
    // 1. Fetch the audio file
    // 2. Use Web Audio API to analyze the audio
    // 3. Extract BPM, key, energy, etc.
    
    // For now, we'll simulate analysis with mock data based on song metadata
    const mockAnalysis = generateMockAnalysis(song);
    
    // Cache the results
    setCachedAnalysis(mockAnalysis);
    
    return mockAnalysis;
  } catch (error) {
    throw new ServiceError(
      'AUDIO_ANALYSIS_ERROR',
      `Failed to analyze audio features for "${song.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate mock analysis data based on song metadata
 * This simulates what a real audio analysis would return
 */
function generateMockAnalysis(song: Song): AudioAnalysis {
  const seed = hashString(`${song.artist}-${song.name}-${song.album}`);
  const random = seededRandom(seed);
  
  // Generate realistic BPM based on genre hints
  let bpm = 120; // Default
  const genreHints = extractGenreHints(song);
  
  if (genreHints.includes('electronic') || genreHints.includes('techno') || genreHints.includes('house')) {
    bpm = 120 + Math.floor(random() * 40); // 120-160 for electronic
  } else if (genreHints.includes('dubstep') || genreHints.includes('drum')) {
    bpm = 70 + Math.floor(random() * 30); // 70-100 for dubstep
  } else if (genreHints.includes('rock') || genreHints.includes('punk')) {
    bpm = 120 + Math.floor(random() * 60); // 120-180 for rock
  } else if (genreHints.includes('hip-hop') || genreHints.includes('rap')) {
    bpm = 80 + Math.floor(random() * 40); // 80-120 for hip-hop
  } else if (genreHints.includes('jazz') || genreHints.includes('blues')) {
    bpm = 60 + Math.floor(random() * 80); // 60-140 for jazz/blues
  } else if (genreHints.includes('classical')) {
    bpm = 60 + Math.floor(random() * 40); // 60-100 for classical
  }
  
  // Generate musical key
  const keys: MusicalKey[] = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
  ];
  const key = keys[Math.floor(random() * keys.length)];
  
  // Generate other features
  const energy = random(); // 0.0-1.0
  const danceability = 0.3 + (random() * 0.7); // 0.3-1.0 (most music is somewhat danceable)
  const valence = random(); // 0.0-1.0
  const acousticness = genreHints.includes('acoustic') || genreHints.includes('folk') || genreHints.includes('classical') 
    ? 0.6 + (random() * 0.4) 
    : random() * 0.5; // Higher acousticness for acoustic genres
  const instrumentalness = (song.artist?.toLowerCase().includes('instrumental') || genreHints.includes('ambient'))
    ? 0.7 + (random() * 0.3)
    : random() * 0.3; // Higher instrumentalness for ambient/instrumental
  const loudness = -20 + (random() * 15); // -20 to -5 dB (typical range)
  
  return {
    id: song.id,
    bpm: Math.round(bpm),
    key,
    energy,
    danceability,
    valence,
    acousticness,
    instrumentalness,
    loudness,
    tempoConfidence: 0.7 + (random() * 0.3), // 0.7-1.0
    keyConfidence: 0.6 + (random() * 0.4), // 0.6-1.0
    analysisVersion: '1.0.0',
    analyzedAt: new Date(),
  };
}

/**
 * Extract genre hints from song metadata
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
 * Simple hash function for seeded random numbers
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

/**
 * Calculate BPM compatibility between two songs
 */
export function calculateBPMCompatibility(bpm1: number, bpm2: number): BPMCompatibility {
  const ratio = bpm2 / bpm1;
  const diff = Math.abs(bpm1 - bpm2);
  
  // Exact match
  if (diff < 1) {
    return {
      bpm: bpm2,
      compatibility: 1.0,
      relationship: 'exact_match'
    };
  }
  
  // Double time (2x)
  if (Math.abs(ratio - 2) < 0.05) {
    return {
      bpm: bpm2,
      compatibility: 0.9,
      relationship: 'double_time'
    };
  }
  
  // Half time (0.5x)
  if (Math.abs(ratio - 0.5) < 0.05) {
    return {
      bpm: bpm2,
      compatibility: 0.9,
      relationship: 'half_time'
    };
  }
  
  // Close match (within 5 BPM)
  if (diff <= 5) {
    return {
      bpm: bpm2,
      compatibility: 0.8,
      relationship: 'close_match'
    };
  }
  
  // Compatible (within 10 BPM)
  if (diff <= 10) {
    return {
      bpm: bpm2,
      compatibility: 0.6,
      relationship: 'compatible'
    };
  }
  
  // Needs adjustment
  return {
    bpm: bpm2,
    compatibility: Math.max(0.1, 1.0 - (diff / 50)),
    relationship: 'needs_adjustment'
  };
}

/**
 * Calculate key compatibility for harmonic mixing
 */
export function calculateKeyCompatibility(key1: MusicalKey, key2: MusicalKey): KeyCompatibility {
  // Exact match
  if (key1 === key2) {
    return {
      key: key2,
      compatibility: 1.0,
      relationship: 'perfect_match'
    };
  }
  
  const pos1 = CIRCLE_OF_FIFTHS[key1];
  const pos2 = CIRCLE_OF_FIFTHS[key2];
  
  // Check for relative minor/major relationship
  if (key1.endsWith('m') && !key2.endsWith('m')) {
    const majorKey = key2 as MusicalKey;
    const relativeMinor = `${majorKey}m` as MusicalKey;
    if (key1 === relativeMinor) {
      return {
        key: key2,
        compatibility: 0.9,
        relationship: 'relative_minor'
      };
    }
  } else if (!key1.endsWith('m') && key2.endsWith('m')) {
    const majorKey = key1 as MusicalKey;
    const relativeMinor = `${majorKey}m` as MusicalKey;
    if (key2 === relativeMinor) {
      return {
        key: key2,
        compatibility: 0.9,
        relationship: 'relative_minor'
      };
    }
  }
  
  // Check for parallel minor/major
  if (key1.replace('m', '') === key2.replace('m', '')) {
    return {
      key: key2,
      compatibility: 0.8,
      relationship: 'parallel_minor'
    };
  }
  
  // Check Circle of Fifths relationships
  const circleDistance = Math.abs(pos1 - pos2);
  const circleDistanceReversed = 12 - circleDistance;
  const minDistance = Math.min(circleDistance, circleDistanceReversed);
  
  // Dominant (5th) relationship
  if (minDistance === 1) {
    return {
      key: key2,
      compatibility: 0.8,
      relationship: 'dominant'
    };
  }
  
  // Subdominant (4th) relationship
  if (minDistance === 5) {
    return {
      key: key2,
      compatibility: 0.7,
      relationship: 'subdominant'
    };
  }
  
  // Compatible (close in Circle of Fifths)
  if (minDistance <= 2) {
    return {
      key: key2,
      compatibility: 0.6,
      relationship: 'compatible'
    };
  }
  
  // Incompatible
  return {
    key: key2,
    compatibility: 0.2,
    relationship: 'incompatible'
  };
}

/**
 * Analyze energy flow between songs for DJ set planning
 */
export function analyzeEnergyFlow(currentAnalysis: AudioAnalysis, targetAnalysis: AudioAnalysis): EnergyFlow {
  const currentEnergy = currentAnalysis.energy;
  const targetEnergy = targetAnalysis.energy;
  const energyDiff = targetEnergy - currentEnergy;
  
  let energyDirection: 'rising' | 'falling' | 'steady';
  let transitionType: 'buildup' | 'breakdown' | 'peak' | 'cooldown';
  
  if (Math.abs(energyDiff) < 0.1) {
    energyDirection = 'steady';
    transitionType = currentEnergy > 0.7 ? 'peak' : 'cooldown';
  } else if (energyDiff > 0) {
    energyDirection = 'rising';
    if (currentEnergy < 0.3 && targetEnergy > 0.7) {
      transitionType = 'buildup';
    } else {
      transitionType = 'buildup';
    }
  } else {
    energyDirection = 'falling';
    if (currentEnergy > 0.7 && targetEnergy < 0.3) {
      transitionType = 'breakdown';
    } else {
      transitionType = 'cooldown';
    }
  }
  
  return {
    currentEnergy,
    targetEnergy,
    energyDirection,
    transitionType
  };
}

/**
 * Get DJ-compatible songs from a list based on current song
 */
export async function getDJCompatibleSongs(
  currentSong: Song,
  candidateSongs: Song[],
  options: {
    maxResults?: number;
    minCompatibility?: number;
    prioritizeBPM?: boolean;
    prioritizeKey?: boolean;
    prioritizeEnergy?: boolean;
  } = {}
): Promise<Array<{ song: Song; analysis: AudioAnalysis; compatibility: number }>> {
  const {
    maxResults = 10,
    minCompatibility = 0.5,
    prioritizeBPM = true,
    prioritizeKey = true,
    prioritizeEnergy = false
  } = options;
  
  // Analyze current song
  const currentAnalysis = await analyzeAudioFeatures(currentSong);
  
  // Analyze candidate songs
  const candidates = await Promise.all(
    candidateSongs.map(async (song) => {
      const analysis = await analyzeAudioFeatures(song);
      
      // Calculate compatibility scores
      const bpmComp = calculateBPMCompatibility(currentAnalysis.bpm, analysis.bpm);
      const keyComp = calculateKeyCompatibility(currentAnalysis.key, analysis.key);
      const energyFlow = analyzeEnergyFlow(currentAnalysis, analysis);
      
      // Calculate overall compatibility score
      let compatibility = 0;
      const weights = {
        bpm: prioritizeBPM ? 0.4 : 0.2,
        key: prioritizeKey ? 0.4 : 0.2,
        energy: prioritizeEnergy ? 0.2 : 0.1
      };
      
      compatibility += (bpmComp.compatibility * weights.bpm);
      compatibility += (keyComp.compatibility * weights.key);
      compatibility += (Math.abs(1 - Math.abs(energyFlow.currentEnergy - energyFlow.targetEnergy)) * weights.energy);
      
      return {
        song,
        analysis,
        compatibility,
        bpmCompatibility: bpmComp,
        keyCompatibility: keyComp,
        energyFlow
      };
    })
  );
  
  // Filter by minimum compatibility and sort by score
  return candidates
    .filter(candidate => candidate.compatibility >= minCompatibility)
    .sort((a, b) => b.compatibility - a.compatibility)
    .slice(0, maxResults)
    .map(({ song, analysis, compatibility }) => ({ song, analysis, compatibility }));
}

/**
 * Clear analysis cache
 */
export function clearAnalysisCache(): void {
  analysisCache.clear();
}

/**
 * Get cache statistics
 */
export function getAnalysisCacheStats(): { size: number; keys: string[] } {
  return {
    size: analysisCache.size,
    keys: Array.from(analysisCache.keys())
  };
}

/**
 * Analyze BPM from audio data using Web Audio API
 * This is a simplified implementation for demonstration
 */
export async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  // In a real implementation, this would:
  // 1. Extract audio data from the buffer
  // 2. Apply onset detection algorithm
  // 3. Calculate inter-onset intervals
  // 4. Find the most common interval (tempo)
  
  // For now, return a simulated BPM based on audio characteristics
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  // Simple energy-based onset detection (simplified)
  const energy: number[] = [];
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
  
  for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += channelData[i + j] * channelData[i + j];
    }
    energy.push(Math.sqrt(sum / windowSize));
  }
  
  // Find peaks (onsets)
  const peaks: number[] = [];
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > energy[i - 1] * 1.3 && energy[i] > energy[i + 1] * 1.3) {
      peaks.push(i);
    }
  }
  
  // Calculate intervals between peaks
  if (peaks.length < 2) {
    return 120; // Default BPM
  }
  
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Find most common interval
  const intervalCounts = new Map<number, number>();
  intervals.forEach(interval => {
    const count = intervalCounts.get(interval) || 0;
    intervalCounts.set(interval, count + 1);
  });
  
  let mostCommonInterval = 0;
  let maxCount = 0;
  intervalCounts.forEach((count, interval) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonInterval = interval;
    }
  });
  
  // Convert interval to BPM
  const windowDuration = windowSize / sampleRate; // Duration of each window in seconds
  const beatDuration = mostCommonInterval * windowDuration;
  const bpm = Math.round(60 / beatDuration);
  
  // Clamp to reasonable range
  return Math.max(60, Math.min(200, bpm));
}

/**
 * Analyze key from audio data using Web Audio API
 * This is a simplified implementation for demonstration
 */
export async function detectKey(audioBuffer: AudioBuffer): Promise<MusicalKey> {
  // In a real implementation, this would:
  // 1. Use FFT to extract frequency spectrum
  // 2. Identify pitch classes and their strengths
  // 3. Determine the most likely key based on harmonic relationships
  
  // For now, return a simulated key based on audio characteristics
  const keys: MusicalKey[] = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
  ];
  
  // Simulate key detection based on audio buffer characteristics
  const channelData = audioBuffer.getChannelData(0);
  const hash = channelData.reduce((sum, val, idx) => sum + val * idx, 0);
  const keyIndex = Math.abs(hash) % keys.length;
  
  return keys[keyIndex];
}

/**
 * Analyze energy level from audio data
 */
export async function detectEnergy(audioBuffer: AudioBuffer): Promise<number> {
  const channelData = audioBuffer.getChannelData(0);
  
  // Calculate RMS energy
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i];
  }
  const rms = Math.sqrt(sum / channelData.length);
  
  // Normalize to 0-1 range (typical RMS values are 0.01-0.5)
  const normalizedEnergy = Math.min(1, Math.max(0, rms * 2));
  
  return normalizedEnergy;
}

/**
 * Analyze danceability from audio data
 */
export async function detectDanceability(audioBuffer: AudioBuffer): Promise<number> {
  // In a real implementation, this would analyze:
  // 1. Rhythm regularity
  // 2. Tempo stability
  // 3. Beat strength
  
  // For now, return a simulated value based on BPM and energy
  const bpm = await detectBPM(audioBuffer);
  const energy = await detectEnergy(audioBuffer);
  
  // Higher danceability for moderate BPM (100-140) with good energy
  const bpmScore = bpm >= 100 && bpm <= 140 ? 0.8 : 0.5;
  const energyScore = energy > 0.3 ? 0.7 : 0.3;
  
  return (bpmScore + energyScore) / 2;
}

/**
 * Load audio from URL and create AudioBuffer
 */
export async function loadAudioBuffer(url: string): Promise<AudioBuffer> {
  try {
    // In a browser environment, we'd use the Web Audio API
    if (typeof window !== 'undefined' && window.AudioContext) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      return await audioContext.decodeAudioData(arrayBuffer);
    }
    
    // For server-side or fallback, return a mock buffer
    throw new Error('AudioContext not available');
  } catch (error) {
    throw new ServiceError(
      'AUDIO_LOAD_ERROR',
      `Failed to load audio from "${url}": ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Analyze entire library for audio features
 */
export async function analyzeLibrary(songs: Song[], options: {
  batchSize?: number;
  onProgress?: (processed: number, total: number) => void;
} = {}): Promise<{ analyzed: Song[]; failed: Song[]; errors: string[] }> {
  const { batchSize = 10, onProgress } = options;
  const results = {
    analyzed: [] as Song[],
    failed: [] as Song[],
    errors: [] as string[]
  };
  
  console.log(`🎵 Starting library analysis for ${songs.length} songs`);
  
  // Process songs in batches
  for (let i = 0; i < songs.length; i += batchSize) {
    const batch = songs.slice(i, i + batchSize);
    
    try {
      // Analyze each song in the batch
      const batchPromises = batch.map(async (song) => {
        try {
          await analyzeAudioFeatures(song);
          return { success: true, song };
        } catch (error) {
          console.error(`Failed to analyze song "${song.name}":`, error);
          return { success: false, song, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Separate successful and failed analyses
      batchResults.forEach(result => {
        if (result.success) {
          results.analyzed.push(result.song);
        } else {
          results.failed.push(result.song);
          if (result.error) {
            results.errors.push(result.error);
          }
        }
      });
      
      // Report progress
      if (onProgress) {
        onProgress(Math.min(i + batchSize, songs.length), songs.length);
      }
      
      // Small delay between batches to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      const errorMessage = `Batch ${Math.floor(i / batchSize) + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMessage);
      console.error(errorMessage);
      
      // Mark all songs in this batch as failed
      results.failed.push(...batch);
    }
  }
  
  console.log(`🎵 Library analysis complete: ${results.analyzed.length} analyzed, ${results.failed.length} failed`);
  return results;
}