/**
 * BPM Analyzer Service
 *
 * Detects BPM (beats per minute) from audio using Web Audio API.
 * Uses a combination of onset detection and autocorrelation.
 *
 * Based on the beat detection algorithm from:
 * - Joe Sullivan's beat detection tutorial
 * - Web Audio API beat detection patterns
 *
 * @see https://joesul.li/van/beat-detection-using-web-audio/
 */

import { setMetadata, getMetadata, type AudioMetadataCache } from './audio-metadata-cache';

// Analysis configuration
const ANALYSIS_CONFIG = {
  FFT_SIZE: 2048,
  SAMPLE_RATE: 44100,
  MIN_BPM: 60,
  MAX_BPM: 200,
  ANALYSIS_DURATION_MS: 30000, // Analyze first 30 seconds
  PEAK_THRESHOLD: 0.8, // Threshold for peak detection
  MIN_INTERVAL_MS: 250, // Minimum time between beats (240 BPM max)
};

// Store for active analyzers
const activeAnalyzers = new Map<string, {
  audioContext: AudioContext;
  analyzerNode: AnalyserNode;
  sourceNode: MediaElementAudioSourceNode;
}>();

/**
 * BPM detection result
 */
export interface BPMResult {
  bpm: number;
  confidence: number; // 0-1, how confident we are in the result
  method: string;
  analyzedDuration: number; // Duration analyzed in seconds
}

/**
 * Detect peaks in audio data for beat detection
 */
function detectPeaks(data: Float32Array, threshold: number = 0.5): number[] {
  const peaks: number[] = [];
  const windowSize = Math.floor(ANALYSIS_CONFIG.SAMPLE_RATE * 0.05); // 50ms window

  for (let i = windowSize; i < data.length - windowSize; i++) {
    const current = Math.abs(data[i]);

    // Check if this is a local maximum
    let isLocalMax = true;
    let localSum = 0;

    for (let j = i - windowSize; j < i + windowSize; j++) {
      localSum += Math.abs(data[j]);
      if (j !== i && Math.abs(data[j]) >= current) {
        isLocalMax = false;
      }
    }

    const localAvg = localSum / (windowSize * 2);

    // Peak must be local maximum and above threshold
    if (isLocalMax && current > threshold && current > localAvg * 1.5) {
      // Avoid detecting peaks too close together
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > ANALYSIS_CONFIG.MIN_INTERVAL_MS * ANALYSIS_CONFIG.SAMPLE_RATE / 1000) {
        peaks.push(i);
      }
    }
  }

  return peaks;
}

/**
 * Calculate BPM from peak intervals
 */
function calculateBPMFromPeaks(peaks: number[], sampleRate: number): { bpm: number; confidence: number } {
  if (peaks.length < 2) {
    return { bpm: 0, confidence: 0 };
  }

  // Calculate intervals between peaks
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const interval = (peaks[i] - peaks[i - 1]) / sampleRate;
    if (interval > 0) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    return { bpm: 0, confidence: 0 };
  }

  // Group similar intervals (within 5% tolerance)
  const groups: { interval: number; count: number }[] = [];

  for (const interval of intervals) {
    let foundGroup = false;
    for (const group of groups) {
      if (Math.abs(interval - group.interval) / group.interval < 0.05) {
        group.interval = (group.interval * group.count + interval) / (group.count + 1);
        group.count++;
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.push({ interval, count: 1 });
    }
  }

  // Find the most common interval
  groups.sort((a, b) => b.count - a.count);
  const bestGroup = groups[0];

  if (!bestGroup) {
    return { bpm: 0, confidence: 0 };
  }

  // Convert interval to BPM
  let bpm = 60 / bestGroup.interval;

  // Normalize BPM to reasonable range
  while (bpm < ANALYSIS_CONFIG.MIN_BPM) bpm *= 2;
  while (bpm > ANALYSIS_CONFIG.MAX_BPM) bpm /= 2;

  // Calculate confidence based on consistency of intervals
  const confidence = Math.min(1, bestGroup.count / (intervals.length * 0.5));

  return { bpm: Math.round(bpm), confidence };
}

/**
 * Analyze audio buffer and detect BPM using onset detection
 */
function analyzeAudioBuffer(audioBuffer: AudioBuffer): BPMResult {
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const sampleRate = audioBuffer.sampleRate;

  // Apply low-pass filter for bass frequencies (where beats are most prominent)
  // Simple moving average as approximation
  const windowSize = Math.floor(sampleRate / 200); // ~5ms window
  const filtered = new Float32Array(channelData.length);

  for (let i = 0; i < channelData.length; i++) {
    let sum = 0;
    const start = Math.max(0, i - windowSize);
    const end = Math.min(channelData.length, i + windowSize);
    for (let j = start; j < end; j++) {
      sum += Math.abs(channelData[j]);
    }
    filtered[i] = sum / (end - start);
  }

  // Detect peaks
  const peaks = detectPeaks(filtered, ANALYSIS_CONFIG.PEAK_THRESHOLD);

  // Calculate BPM from peaks
  const { bpm, confidence } = calculateBPMFromPeaks(peaks, sampleRate);

  return {
    bpm,
    confidence,
    method: 'onset-detection',
    analyzedDuration: audioBuffer.duration,
  };
}

/**
 * Analyze BPM from an audio file URL
 *
 * @param audioUrl - URL of the audio file to analyze
 * @param songId - Song ID for caching
 * @returns BPM detection result
 */
export async function analyzeBPMFromUrl(audioUrl: string, songId?: string): Promise<BPMResult> {
  // Check cache first
  if (songId) {
    const cached = await getMetadata(songId);
    if (cached?.bpm && cached.confidence > 0.5) {
      return {
        bpm: cached.bpm,
        confidence: cached.confidence,
        method: 'cached',
        analyzedDuration: 0,
      };
    }
  }

  try {
    // Create audio context
    const audioContext = new AudioContext({ sampleRate: ANALYSIS_CONFIG.SAMPLE_RATE });

    // Fetch audio data
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Decode audio
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Limit analysis to first N seconds
    const maxSamples = Math.min(
      audioBuffer.length,
      ANALYSIS_CONFIG.ANALYSIS_DURATION_MS * ANALYSIS_CONFIG.SAMPLE_RATE / 1000
    );

    // Create a trimmed buffer if needed
    let bufferToAnalyze = audioBuffer;
    if (audioBuffer.length > maxSamples) {
      const trimmedBuffer = audioContext.createBuffer(
        1,
        maxSamples,
        audioBuffer.sampleRate
      );
      trimmedBuffer.copyToChannel(
        audioBuffer.getChannelData(0).slice(0, maxSamples),
        0
      );
      bufferToAnalyze = trimmedBuffer;
    }

    // Analyze
    const result = analyzeAudioBuffer(bufferToAnalyze);

    // Close audio context
    await audioContext.close();

    // Cache result if valid
    if (songId && result.bpm > 0 && result.confidence > 0.3) {
      const existingMetadata = await getMetadata(songId);
      const metadata: AudioMetadataCache = {
        id: songId,
        bpm: result.bpm,
        key: existingMetadata?.key,
        energy: existingMetadata?.energy,
        source: 'estimated',
        confidence: result.confidence,
        fetchedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setMetadata(metadata);
      console.log(`🎵 [BPM Analyzer] Analyzed ${songId}: ${result.bpm} BPM (${(result.confidence * 100).toFixed(0)}% confidence)`);
    }

    return result;
  } catch (error) {
    console.error('[BPM Analyzer] Analysis failed:', error);
    return {
      bpm: 0,
      confidence: 0,
      method: 'error',
      analyzedDuration: 0,
    };
  }
}

/**
 * Real-time BPM analysis from a playing audio element
 * Analyzes in the background while music plays
 *
 * @param audioElement - The HTML audio element
 * @param songId - Song ID for caching
 * @param onResult - Callback when BPM is detected
 */
export function startRealtimeBPMAnalysis(
  audioElement: HTMLAudioElement,
  songId: string,
  onResult?: (result: BPMResult) => void
): () => void {
  // Check if already analyzing this song
  if (activeAnalyzers.has(songId)) {
    console.log(`[BPM Analyzer] Already analyzing ${songId}`);
    return () => {};
  }

  // Check cache first
  getMetadata(songId).then(cached => {
    if (cached?.bpm && cached.confidence > 0.5) {
      console.log(`[BPM Analyzer] Using cached BPM for ${songId}: ${cached.bpm}`);
      onResult?.({
        bpm: cached.bpm,
        confidence: cached.confidence,
        method: 'cached',
        analyzedDuration: 0,
      });
      return;
    }
  });

  try {
    const audioContext = new AudioContext();
    const analyzerNode = audioContext.createAnalyser();
    analyzerNode.fftSize = ANALYSIS_CONFIG.FFT_SIZE;

    const sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(analyzerNode);
    analyzerNode.connect(audioContext.destination);

    activeAnalyzers.set(songId, { audioContext, analyzerNode, sourceNode });

    // Collect samples over time
    const samples: number[] = [];
    const startTime = Date.now();
    const dataArray = new Float32Array(analyzerNode.fftSize);

    const collectSample = () => {
      if (!activeAnalyzers.has(songId)) return;

      const elapsed = Date.now() - startTime;
      if (elapsed >= ANALYSIS_CONFIG.ANALYSIS_DURATION_MS) {
        // Enough samples collected, analyze
        const result = analyzeCollectedSamples(samples, audioContext.sampleRate);

        // Cache result
        if (result.bpm > 0 && result.confidence > 0.3) {
          getMetadata(songId).then(existingMetadata => {
            const metadata: AudioMetadataCache = {
              id: songId,
              bpm: result.bpm,
              key: existingMetadata?.key,
              energy: existingMetadata?.energy,
              source: 'estimated',
              confidence: result.confidence,
              fetchedAt: Date.now(),
              updatedAt: Date.now(),
            };
            setMetadata(metadata);
          });

          console.log(`🎵 [BPM Analyzer] Real-time analysis ${songId}: ${result.bpm} BPM (${(result.confidence * 100).toFixed(0)}% confidence)`);
          onResult?.(result);
        }

        // Stop analyzing
        stopRealtimeBPMAnalysis(songId);
        return;
      }

      // Collect current energy level
      analyzerNode.getFloatTimeDomainData(dataArray);
      let energy = 0;
      for (let i = 0; i < dataArray.length; i++) {
        energy += dataArray[i] * dataArray[i];
      }
      samples.push(Math.sqrt(energy / dataArray.length));

      // Continue collecting
      requestAnimationFrame(collectSample);
    };

    // Start collecting after a short delay to allow audio to start
    setTimeout(() => {
      requestAnimationFrame(collectSample);
    }, 500);

    // Return cleanup function
    return () => stopRealtimeBPMAnalysis(songId);
  } catch (error) {
    console.error('[BPM Analyzer] Failed to start real-time analysis:', error);
    return () => {};
  }
}

/**
 * Analyze collected energy samples for BPM
 */
function analyzeCollectedSamples(samples: number[], _sampleRate: number): BPMResult {
  if (samples.length < 100) {
    return { bpm: 0, confidence: 0, method: 'insufficient-data', analyzedDuration: 0 };
  }

  // Find peaks in energy samples (collected at ~60fps)
  const peaks: number[] = [];
  const threshold = Math.max(...samples) * 0.5;

  for (let i = 2; i < samples.length - 2; i++) {
    if (
      samples[i] > threshold &&
      samples[i] > samples[i - 1] &&
      samples[i] > samples[i - 2] &&
      samples[i] > samples[i + 1] &&
      samples[i] > samples[i + 2]
    ) {
      // Minimum 250ms between peaks
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > 15) { // ~250ms at 60fps
        peaks.push(i);
      }
    }
  }

  if (peaks.length < 2) {
    return { bpm: 0, confidence: 0, method: 'no-peaks', analyzedDuration: samples.length / 60 };
  }

  // Calculate intervals (in frames at ~60fps)
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  // Find most common interval
  const groups: { interval: number; count: number }[] = [];
  for (const interval of intervals) {
    let found = false;
    for (const group of groups) {
      if (Math.abs(interval - group.interval) / group.interval < 0.1) {
        group.interval = (group.interval * group.count + interval) / (group.count + 1);
        group.count++;
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({ interval, count: 1 });
    }
  }

  groups.sort((a, b) => b.count - a.count);
  const bestGroup = groups[0];

  if (!bestGroup) {
    return { bpm: 0, confidence: 0, method: 'no-groups', analyzedDuration: samples.length / 60 };
  }

  // Convert interval (in frames at 60fps) to BPM
  let bpm = 60 / (bestGroup.interval / 60); // frames -> seconds -> BPM

  // Normalize to reasonable range
  while (bpm < ANALYSIS_CONFIG.MIN_BPM) bpm *= 2;
  while (bpm > ANALYSIS_CONFIG.MAX_BPM) bpm /= 2;

  const confidence = Math.min(1, bestGroup.count / (intervals.length * 0.4));

  return {
    bpm: Math.round(bpm),
    confidence,
    method: 'realtime-energy',
    analyzedDuration: samples.length / 60,
  };
}

/**
 * Stop real-time BPM analysis for a song
 */
export function stopRealtimeBPMAnalysis(songId: string): void {
  const analyzer = activeAnalyzers.get(songId);
  if (analyzer) {
    try {
      analyzer.sourceNode.disconnect();
      analyzer.analyzerNode.disconnect();
      analyzer.audioContext.close();
    } catch {
      // Ignore errors during cleanup
    }
    activeAnalyzers.delete(songId);
    console.log(`[BPM Analyzer] Stopped analysis for ${songId}`);
  }
}

/**
 * Stop all active BPM analyses
 */
export function stopAllBPMAnalysis(): void {
  for (const songId of activeAnalyzers.keys()) {
    stopRealtimeBPMAnalysis(songId);
  }
}

/**
 * Check if BPM analysis is currently active for a song
 */
export function isAnalyzing(songId: string): boolean {
  return activeAnalyzers.has(songId);
}

/**
 * Get the number of active analyzers
 */
export function getActiveAnalyzerCount(): number {
  return activeAnalyzers.size;
}
