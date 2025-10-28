// Audio Buffer Analysis Service
// Real-time BPM and key detection from audio buffers

import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis, MusicalKey } from './audio-analysis';
import { ServiceError } from '../utils';

// Audio analysis result from buffer
export interface BufferAnalysis {
  bpm: number;
  bpmConfidence: number;
  key: MusicalKey;
  keyConfidence: number;
  energy: number;
  danceability: number;
  valence: number;
  onsetPositions: number[]; // Beat positions in samples
  frequencyPeaks: number[]; // Frequency peaks in Hz
  spectralCentroid: number; // Spectral centroid
  spectralRolloff: number; // Spectral rolloff
  zeroCrossingRate: number; // Zero crossing rate
  tempo: number[]; // Tempo variations over time
  chroma: number[]; // Chroma features
  mfcc: number[][]; // MFCC coefficients
}

// Real-time analysis options
export interface RealTimeAnalysisOptions {
  windowSize: number; // Analysis window size in samples
  hopSize: number; // Hop size between windows
  sampleRate: number; // Audio sample rate
  minBPM: number; // Minimum BPM to detect
  maxBPM: number; // Maximum BPM to detect
  keyDetectionMethod: 'chroma' | 'profile' | 'hpcp' | 'kr';
  energySmoothing: number; // Energy smoothing factor (0-1)
  onsetThreshold: number; // Onset detection threshold
}

// Default analysis options
export const DEFAULT_ANALYSIS_OPTIONS: RealTimeAnalysisOptions = {
  windowSize: 2048, // ~46ms at 44.1kHz
  hopSize: 512, // ~11.6ms at 44.1kHz
  sampleRate: 44100,
  minBPM: 60,
  maxBPM: 200,
  keyDetectionMethod: 'chroma',
  energySmoothing: 0.8,
  onsetThreshold: 0.15
};

/**
 * Analyze audio buffer for real-time BPM and key detection
 */
export function analyzeAudioBuffer(
  buffer: AudioBuffer,
  options: RealTimeAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS
): BufferAnalysis {
  try {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    // Extract time-domain features
    const onsets = detectOnsets(channelData, options);
    const bpm = estimateBPM(onsets, sampleRate, options);
    const energy = calculateEnergy(channelData);
    const danceability = estimateDanceability(onsets, energy);
    const valence = estimateValence(channelData);
    
    // Extract frequency-domain features
    const frequencyData = computeFrequencyDomain(channelData);
    const key = detectKeyFromFrequency(frequencyData, options);
    const keyConfidence = calculateKeyConfidence(frequencyData, key);
    
    // Calculate spectral features
    const spectralCentroid = calculateSpectralCentroid(frequencyData);
    const spectralRolloff = calculateSpectralRolloff(frequencyData);
    const zeroCrossingRate = calculateZeroCrossingRate(channelData);
    
    // Calculate tempo variations
    const tempo = calculateTempoVariations(onsets, sampleRate);
    
    // Extract chroma features
    const chroma = extractChromaFeatures(channelData);
    
    // Calculate MFCC
    const mfcc = calculateMFCC(channelData);
    
    return {
      bpm,
      bpmConfidence: calculateBPMConfidence(onsets, bpm),
      key,
      keyConfidence,
      energy,
      danceability,
      valence,
      onsetPositions: onsets,
      frequencyPeaks: frequencyData.peaks,
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate,
      tempo,
      chroma,
      mfcc
    };
  } catch (error) {
    throw new ServiceError(
      'BUFFER_ANALYSIS_ERROR',
      `Failed to analyze audio buffer: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Detect onsets in audio signal
 */
function detectOnsets(
  channelData: Float32Array,
  options: RealTimeAnalysisOptions
): number[] {
  const onsets: number[] = [];
  const windowSize = options.windowSize;
  const hopSize = options.hopSize;
  const threshold = options.onsetThreshold;
  
  // Calculate spectral flux
  for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
    const window = channelData.slice(i, i + windowSize);
    const flux = calculateSpectralFlux(window);
    
    // Simple onset detection
    if (flux > threshold) {
      onsets.push(i + windowSize / 2);
    }
  }
  
  return onsets;
}

/**
 * Estimate BPM from onset positions
 */
function estimateBPM(
  onsets: number[],
  sampleRate: number,
  options: RealTimeAnalysisOptions
): number {
  if (onsets.length < 2) {
    return options.minBPM;
  }
  
  // Calculate inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1];
    intervals.push(interval);
  }
  
  // Convert intervals to BPM
  const intervalSamples = intervals.map(interval => 
    interval * sampleRate / 60
  );
  
  // Find most common interval
  const intervalCounts = new Map<number, number>();
  intervalSamples.forEach(interval => {
    const rounded = Math.round(interval);
    const count = intervalCounts.get(rounded) || 0;
    intervalCounts.set(rounded, count + 1);
  });
  
  // Find most common interval
  let mostCommonInterval = 0;
  let maxCount = 0;
  intervalCounts.forEach((count, interval) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonInterval = interval;
    }
  });
  
  // Convert to BPM
  const bpm = Math.round(60 * sampleRate / mostCommonInterval);
  
  // Clamp to valid range
  return Math.max(options.minBPM, Math.min(options.maxBPM, bpm));
}

/**
 * Calculate energy level from audio data
 */
function calculateEnergy(channelData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += Math.abs(channelData[i]);
  }
  
  return Math.min(1, sum / channelData.length);
}

/**
 * Estimate danceability from onsets and energy
 */
function estimateDanceability(onsets: number[], energy: number): number {
  // Regular onset spacing suggests good danceability
  if (onsets.length < 2) return 0.5;
  
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }
  
  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const intervalVariance = intervals.reduce((sum, interval) => {
    const diff = interval - avgInterval;
    return sum + diff * diff;
  }, 0) / intervals.length;
  
  // Regular intervals and high energy suggest good danceability
  const regularity = 1 / (1 + intervalVariance);
  const energyScore = energy;
  
  return Math.min(1, (regularity * 0.6) + (energyScore * 0.4));
}

/**
 * Estimate valence (musical positiveness) from audio
 */
function estimateValence(channelData: Float32Array): number {
  // Simple valence estimation based on spectral content
  // In a real implementation, this would use more sophisticated analysis
  
  // Calculate spectral centroid (higher = brighter)
  const frequencyData = computeFrequencyDomain(channelData);
  const centroid = calculateSpectralCentroid(frequencyData);
  
  // Calculate zero crossing rate (more = more complex)
  const zeroCrossings = calculateZeroCrossingRate(channelData);
  
  // Normalize and combine
  const normalizedCentroid = Math.min(1, centroid / 1000); // Assuming max ~1000Hz
  const normalizedZeroCrossings = Math.min(1, zeroCrossings / 100); // Assuming max ~100/s
  
  // Higher centroid and more zero crossings suggest positive valence
  return (normalizedCentroid * 0.6) + (normalizedZeroCrossings * 0.4);
}

/**
 * Compute frequency domain features
 */
function computeFrequencyDomain(channelData: Float32Array): {
  magnitude: number[];
  peaks: number[];
  phase: number[];
} {
  const fftSize = 2048;
  const magnitude: number[] = new Array(fftSize / 2);
  const phase: number[] = new Array(fftSize / 2);
  const peaks: number[] = [];
  
  // Apply window function (Hann window)
  for (let i = 0; i < channelData.length; i += fftSize / 2) {
    const window = channelData.slice(i, i + fftSize / 2);
    const windowed = applyWindow(window, 'hann');
    
    // Simple FFT (in real implementation, use FFT library)
    const fftResult = simpleFFT(windowed);
    
    for (let j = 0; j < fftSize / 2; j++) {
      magnitude[j] = Math.sqrt(fftResult[j].real * fftResult[j].real + fftResult[j].imag * fftResult[j].imag);
      phase[j] = Math.atan2(fftResult[j].imag, fftResult[j].real);
    }
  }
  
  // Find peaks in magnitude spectrum
  for (let i = 1; i < magnitude.length - 1; i++) {
    if (magnitude[i] > magnitude[i - 1] && magnitude[i] > magnitude[i + 1]) {
      peaks.push(i * channelData.sampleRate / fftSize);
    }
  }
  
  return { magnitude, peaks, phase };
}

/**
 * Apply window function to data
 */
function applyWindow(data: Float32Array, windowType: string): Float32Array {
  const windowed = new Float32Array(data.length);
  const n = data.length;
  
  for (let i = 0; i < n; i++) {
    let windowValue = 1;
    
    switch (windowType) {
      case 'hann':
        windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        break;
      case 'hamming':
        windowValue = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
        break;
      default:
        windowValue = 1;
    }
    
    windowed[i] = data[i] * windowValue;
  }
  
  return windowed;
}

/**
 * Simple FFT implementation (placeholder)
 */
function simpleFFT(data: Float32Array): { real: number[]; imag: number[] } {
  // This is a very simplified FFT implementation
  // In a real implementation, use a proper FFT library
  
  const N = data.length;
  const real: number[] = new Array(N / 2);
  const imag: number[] = new Array(N / 2);
  
  // Simplified DFT calculation
  for (let k = 0; k < N / 2; k++) {
    real[k] = 0;
    imag[k] = 0;
    
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * k * n / N;
      real[k] += data[n] * Math.cos(angle);
      imag[k] += data[n] * Math.sin(angle);
    }
  }
  
  return { real, imag };
}

/**
 * Calculate spectral flux
 */
function calculateSpectralFlux(window: Float32Array): number {
  const fftResult = simpleFFT(window);
  const magnitude = fftResult.real.map((r, i) => 
    Math.sqrt(r * r + fftResult.imag[i] * fftResult.imag[i])
  );
  
  // Calculate flux as sum of positive differences
  let flux = 0;
  for (let i = 1; i < magnitude.length; i++) {
    const diff = magnitude[i] - magnitude[i - 1];
    if (diff > 0) {
      flux += diff;
    }
  }
  
  return flux;
}

/**
 * Calculate spectral centroid
 */
function calculateSpectralCentroid(frequencyData: { magnitude: number[] }): number {
  let weightedSum = 0;
  let totalMagnitude = 0;
  
  for (let i = 0; i < frequencyData.magnitude.length; i++) {
    const frequency = (i * frequencyData.phase.length) / frequencyData.magnitude.length;
    weightedSum += frequency * frequencyData.magnitude[i];
    totalMagnitude += frequencyData.magnitude[i];
  }
  
  return totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
}

/**
 * Calculate spectral rolloff
 */
function calculateSpectralRolloff(frequencyData: { magnitude: number[] }): number {
  let totalMagnitude = 0;
  let weightedSum = 0;
  
  for (let i = 0; i < frequencyData.magnitude.length; i++) {
    const frequency = (i * frequencyData.phase.length) / frequencyData.magnitude.length;
    weightedSum += frequency * frequencyData.magnitude[i];
    totalMagnitude += frequencyData.magnitude[i];
  }
  
  const centroid = totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
  
  // Calculate rolloff (frequency below which 85% of energy is contained)
  let cumulativeMagnitude = 0;
  const threshold = totalMagnitude * 0.85;
  
  for (let i = 0; i < frequencyData.magnitude.length; i++) {
    cumulativeMagnitude += frequencyData.magnitude[i];
    if (cumulativeMagnitude >= threshold) {
      return (i * frequencyData.phase.length) / frequencyData.magnitude.length;
    }
  }
  
  return centroid;
}

/**
 * Calculate zero crossing rate
 */
function calculateZeroCrossingRate(channelData: Float32Array): number {
  let crossings = 0;
  
  for (let i = 1; i < channelData.length; i++) {
    if ((channelData[i - 1] < 0 && channelData[i] >= 0) ||
        (channelData[i - 1] >= 0 && channelData[i] < 0)) {
      crossings++;
    }
  }
  
  return crossings / channelData.length;
}

/**
 * Detect musical key from frequency data
 */
function detectKeyFromFrequency(
  frequencyData: { magnitude: number[]; peaks: number[] },
  options: RealTimeAnalysisOptions
): MusicalKey {
  switch (options.keyDetectionMethod) {
    case 'chroma':
      return detectKeyFromChroma(frequencyData);
    case 'profile':
      return detectKeyFromProfile(frequencyData);
    case 'hpcp':
      return detectKeyFromHPCP(frequencyData);
    case 'kr':
      return detectKeyFromKR(frequencyData);
    default:
      return 'C'; // Default fallback
  }
}

/**
 * Detect key using chroma features
 */
function detectKeyFromChroma(frequencyData: { magnitude: number[] }): MusicalKey {
  // Simplified chroma analysis
  // In a real implementation, this would use proper chroma analysis
  
  const chroma = extractChromaVector(frequencyData);
  const keyProfiles = getKeyProfiles();
  
  let bestMatch = 'C';
  let bestScore = 0;
  
  for (const [key, profile] of Object.entries(keyProfiles)) {
    const score = calculateChromaSimilarity(chroma, profile);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = key as MusicalKey;
    }
  }
  
  return bestMatch;
}

/**
 * Extract chroma vector from frequency data
 */
function extractChromaVector(frequencyData: { magnitude: number[] }): number[] {
  // Simplified chroma extraction
  // In a real implementation, this would use proper chroma analysis
  
  const chroma = new Array(12).fill(0);
  
  // Map frequency bins to chroma
  for (let i = 0; i < frequencyData.magnitude.length; i++) {
    const frequency = (i * frequencyData.phase.length) / frequencyData.magnitude.length;
    const chromaIndex = Math.floor(frequency / 100) % 12;
    chroma[chromaIndex] += frequencyData.magnitude[i];
  }
  
  // Normalize chroma vector
  const maxChroma = Math.max(...chroma);
  return chroma.map(c => c / maxChroma);
}

/**
 * Get key profiles for comparison
 */
function getKeyProfiles(): Record<string, number[]> {
  return {
    'C': [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'C#': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    'D': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    'D#': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    'E': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    'F': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    'F#': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'G': [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    'G#': [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    'A': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    'A#': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    'B': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'B#': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
  };
}

/**
 * Calculate chroma similarity
 */
function calculateChromaSimilarity(chroma: number[], profile: number[]): number {
  let similarity = 0;
  
  for (let i = 0; i < 12; i++) {
    similarity += 1 - Math.abs(chroma[i] - profile[i]);
  }
  
  return similarity / 12;
}

/**
 * Detect key using profile matching
 */
function detectKeyFromProfile(frequencyData: { magnitude: number[] }): MusicalKey {
  // Simplified profile matching
  // In a real implementation, this would use more sophisticated analysis
  
  const peaks = frequencyData.peaks.slice(0, 12);
  const keyProfiles = getKeyProfiles();
  
  let bestMatch = 'C';
  let bestScore = 0;
  
  for (const [key, profile] of Object.entries(keyProfiles)) {
    let score = 0;
    for (let i = 0; i < Math.min(peaks.length, profile.length); i++) {
      const peakFreq = peaks[i] || 0;
      const profileFreq = profile[i];
      
      // Simple frequency matching
      if (Math.abs(peakFreq - profileFreq) < 50) {
        score += 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = key as MusicalKey;
    }
  }
  
  return bestMatch;
}

/**
 * Detect key using HPCP algorithm
 */
function detectKeyFromHPCP(frequencyData: { magnitude: number[] }): MusicalKey {
  // Simplified HPCP implementation
  // In a real implementation, this would use proper HPCP algorithm
  
  const keyProfiles = getKeyProfiles();
  const chroma = extractChromaVector(frequencyData);
  
  // Find best HPCP match
  let bestKey = 'C';
  let bestScore = 0;
  
  for (const [key, profile] of Object.entries(keyProfiles)) {
    let score = 0;
    for (let i = 0; i < 12; i++) {
      if (profile[i] === 1 && chroma[i] > 0.5) {
        score += 2;
      } else if (profile[i] === 0.5 && chroma[i] > 0.3) {
        score += 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestKey = key as MusicalKey;
    }
  }
  
  return bestKey;
}

/**
 * Detect key using Krumhansl algorithm
 */
function detectKeyFromKR(frequencyData: { magnitude: number[] }): MusicalKey {
  // Simplified KR implementation
  // In a real implementation, this would use proper KR algorithm
  
  const keyProfiles = getKeyProfiles();
  const peaks = frequencyData.peaks.slice(0, 12);
  
  let bestKey = 'C';
  let bestScore = 0;
  
  for (const [key, profile] of Object.entries(keyProfiles)) {
    let score = 0;
    for (let i = 0; i < Math.min(peaks.length, profile.length); i++) {
      const peakFreq = peaks[i] || 0;
      const profileFreq = profile[i];
      
      // KR algorithm scoring
      if (Math.abs(peakFreq - profileFreq) < 30) {
        score += 3;
      } else if (Math.abs(peakFreq - profileFreq) < 50) {
        score += 2;
      } else if (Math.abs(peakFreq - profileFreq) < 70) {
        score += 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestKey = key as MusicalKey;
    }
  }
  
  return bestKey;
}

/**
 * Calculate BPM confidence
 */
function calculateBPMConfidence(onsets: number[], bpm: number): number {
  if (onsets.length < 2) return 0.5;
  
  // Calculate regularity of intervals
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }
  
  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => {
    const diff = interval - avgInterval;
    return sum + diff * diff;
  }, 0) / intervals.length;
  
  // Higher regularity = higher confidence
  const regularity = 1 / (1 + variance / (avgInterval * avgInterval));
  
  return Math.min(1, regularity * 0.8 + 0.2);
}

/**
 * Calculate key confidence
 */
function calculateKeyConfidence(
  frequencyData: { magnitude: number[] },
  key: MusicalKey
): number {
  // Simplified key confidence calculation
  // In a real implementation, this would be more sophisticated
  
  const keyProfiles = getKeyProfiles();
  const profile = keyProfiles[key];
  
  if (!profile) return 0.5;
  
  // Calculate how well the frequency data matches the key profile
  let matchScore = 0;
  let totalScore = 0;
  
  for (let i = 0; i < 12; i++) {
    if (profile[i] > 0) {
      matchScore += profile[i];
      totalScore += profile[i];
    }
  }
  
  return totalScore > 0 ? matchScore / totalScore : 0.5;
}

/**
 * Calculate tempo variations over time
 */
function calculateTempoVariations(
  onsets: number[],
  sampleRate: number
): number[] {
  const tempo: number[] = [];
  const windowSize = 10; // Analyze last 10 onsets
  
  for (let i = windowSize; i < onsets.length; i++) {
    const windowOnsets = onsets.slice(i - windowSize, i);
    
    if (windowOnsets.length < 2) {
      tempo.push(120); // Default
      continue;
    }
    
    const intervals: number[] = [];
    for (let j = 1; j < windowOnsets.length; j++) {
      intervals.push(windowOnsets[j] - windowOnsets[j - 1]);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const windowTempo = Math.round(60 * sampleRate / avgInterval);
    
    tempo.push(windowTempo);
  }
  
  return tempo;
}

/**
 * Extract chroma features
 */
function extractChromaFeatures(channelData: Float32Array): number[] {
  // Simplified chroma extraction
  // In a real implementation, this would use proper chroma analysis
  
  const chroma = new Array(12).fill(0);
  const sampleRate = 44100;
  const frameSize = 2048;
  const hopSize = 512;
  
  for (let i = 0; i < channelData.length; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    
    // Simple chroma calculation
    for (let j = 0; j < frameSize; j++) {
      const frequency = (j * sampleRate) / frameSize;
      const chromaIndex = Math.floor(frequency / 100) % 12;
      chroma[chromaIndex] += Math.abs(frame[j]);
    }
  }
  
  // Normalize chroma
  const maxChroma = Math.max(...chroma);
  return chroma.map(c => c / maxChroma);
}

/**
 * Calculate MFCC coefficients
 */
function calculateMFCC(channelData: Float32Array): number[][] {
  // Simplified MFCC calculation
  // In a real implementation, this would use proper MFCC algorithm
  
  const mfcc: number[][] = [];
  const frameSize = 1024;
  const hopSize = 512;
  const numCoefficients = 13;
  
  for (let i = 0; i < channelData.length; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    
    // Apply window function
    const windowed = applyWindow(frame, 'hann');
    
    // Simple MFCC calculation (first 13 coefficients)
    const coefficients: number[] = [];
    for (let j = 0; j < numCoefficients; j++) {
      let sum = 0;
      for (let k = 0; k < frameSize; k++) {
        sum += windowed[k] * Math.cos(Math.PI * j * k / frameSize);
      }
      
      coefficients.push(sum * 2 / frameSize);
    }
    
    mfcc.push(coefficients);
  }
  
  return mfcc;
}