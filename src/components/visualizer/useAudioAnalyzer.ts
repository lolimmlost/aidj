import { useEffect, useRef, useCallback, useState } from 'react';
import type { AudioData } from './types';

interface UseAudioAnalyzerOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  sensitivity?: number;
}

interface UseAudioAnalyzerReturn {
  audioData: AudioData;
  isActive: boolean;
  connect: (audioElement: HTMLAudioElement) => void;
  disconnect: () => void;
}

const DEFAULT_AUDIO_DATA: AudioData = {
  frequencyData: new Uint8Array(0),
  waveformData: new Float32Array(0),
  bars: [],
  bass: 0,
  mid: 0,
  treble: 0,
  volume: 0,
  peak: 0,
  isBeat: false,
};

export function useAudioAnalyzer(options: UseAudioAnalyzerOptions = {}): UseAudioAnalyzerReturn {
  const {
    fftSize = 2048,
    smoothingTimeConstant = 0.8,
    sensitivity = 1.0,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [audioData, setAudioData] = useState<AudioData>(DEFAULT_AUDIO_DATA);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);

  // Beat detection state
  const lastPeakRef = useRef(0);
  const beatThresholdRef = useRef(0.15);
  const beatDecayRef = useRef(0.95);
  const beatCooldownRef = useRef(0);

  // Reusable buffers to avoid GC pressure
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const waveformDataRef = useRef<Float32Array | null>(null);
  const smoothedBarsRef = useRef<number[]>([]);
  const barsOutputRef = useRef<number[]>([]); // Reusable output array

  // Pre-calculated bin mappings (computed once per buffer size)
  const binMappingRef = useRef<{ start: number; end: number; count: number }[]>([]);
  const lastBufferLengthRef = useRef<number>(0);

  // Reusable audio data object to avoid object creation
  const audioDataObjRef = useRef<AudioData>({
    frequencyData: new Uint8Array(0),
    waveformData: new Float32Array(0),
    bars: [],
    bass: 0,
    mid: 0,
    treble: 0,
    volume: 0,
    peak: 0,
    isBeat: false,
  });

  const analyze = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;

    // Initialize or resize buffers if needed
    if (!frequencyDataRef.current || frequencyDataRef.current.length !== bufferLength) {
      frequencyDataRef.current = new Uint8Array(bufferLength);
      waveformDataRef.current = new Float32Array(bufferLength);
    }

    const frequencyData = frequencyDataRef.current;
    const waveformData = waveformDataRef.current!;

    analyser.getByteFrequencyData(frequencyData);
    analyser.getFloatTimeDomainData(waveformData);

    // Pre-calculate bin mappings if buffer size changed
    const numBars = 64;
    if (lastBufferLengthRef.current !== bufferLength) {
      binMappingRef.current = [];
      for (let i = 0; i < numBars; i++) {
        const lowFreq = Math.pow(i / numBars, 2) * bufferLength;
        const highFreq = Math.pow((i + 1) / numBars, 2) * bufferLength;
        const start = Math.floor(lowFreq);
        const end = Math.min(Math.floor(highFreq), bufferLength - 1);
        binMappingRef.current.push({ start, end, count: Math.max(1, end - start) });
      }
      smoothedBarsRef.current = new Array(numBars).fill(0);
      barsOutputRef.current = new Array(numBars).fill(0);
      lastBufferLengthRef.current = bufferLength;
    }

    const binMapping = binMappingRef.current;
    const smoothedBars = smoothedBarsRef.current;
    const barsOutput = barsOutputRef.current;

    // Calculate frequency bars using pre-computed mappings
    for (let i = 0; i < numBars; i++) {
      const { start, end, count } = binMapping[i];
      let sum = 0;
      for (let j = start; j <= end; j++) {
        sum += frequencyData[j];
      }

      const rawValue = Math.min(1, (sum / count / 255) * sensitivity * 1.5);
      const smoothing = rawValue > smoothedBars[i] ? 0.3 : 0.85;
      smoothedBars[i] = smoothedBars[i] * smoothing + rawValue * (1 - smoothing);
      barsOutput[i] = smoothedBars[i];
    }

    // Single pass: calculate bass, mid, treble, and volume together
    const bassEnd = Math.floor(bufferLength * 0.1);
    const midEnd = Math.floor(bufferLength * 0.5);

    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let sumSquares = 0;

    // Combine all frequency sums in one loop (sample every 2nd for waveform to save time)
    for (let i = 0; i < bufferLength; i++) {
      const freq = frequencyData[i];
      if (i < bassEnd) {
        bassSum += freq;
      } else if (i < midEnd) {
        midSum += freq;
      } else {
        trebleSum += freq;
      }

      // Sample waveform every other point for volume calculation
      if ((i & 1) === 0) {
        const w = waveformData[i];
        sumSquares += w * w;
      }
    }

    const bass = Math.min(1, (bassSum / bassEnd / 255) * sensitivity);
    const mid = Math.min(1, (midSum / (midEnd - bassEnd) / 255) * sensitivity);
    const treble = Math.min(1, (trebleSum / (bufferLength - midEnd) / 255) * sensitivity);
    const volume = Math.min(1, Math.sqrt(sumSquares / (bufferLength / 2)) * 2 * sensitivity);

    // Beat detection with cooldown
    const currentPeak = Math.max(bass * 1.5, volume);
    beatCooldownRef.current = Math.max(0, beatCooldownRef.current - 1);

    const isBeat =
      beatCooldownRef.current === 0 &&
      currentPeak > lastPeakRef.current + beatThresholdRef.current &&
      currentPeak > 0.2;

    if (isBeat) {
      beatCooldownRef.current = 8;
    }

    lastPeakRef.current = Math.max(currentPeak, lastPeakRef.current * beatDecayRef.current);

    // Update reusable object instead of creating new one
    const audioDataObj = audioDataObjRef.current;
    audioDataObj.frequencyData = frequencyData;
    audioDataObj.waveformData = waveformData;
    audioDataObj.bars = barsOutput;
    audioDataObj.bass = bass;
    audioDataObj.mid = mid;
    audioDataObj.treble = treble;
    audioDataObj.volume = volume;
    audioDataObj.peak = currentPeak;
    audioDataObj.isBeat = isBeat;

    setAudioData(audioDataObj);

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, [sensitivity]);

  const connect = useCallback((audioElement: HTMLAudioElement) => {
    // Clean up existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      // Create or resume audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;

      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create analyser node (always create fresh one)
      const newAnalyser = audioContext.createAnalyser();
      newAnalyser.fftSize = fftSize;
      newAnalyser.smoothingTimeConstant = smoothingTimeConstant;

      // If same element, reuse source but reconnect to new analyser
      if (connectedElementRef.current === audioElement && sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }

        // Reconnect existing source to new analyser
        sourceRef.current.connect(newAnalyser);
        newAnalyser.connect(audioContext.destination);
        analyserRef.current = newAnalyser;
      } else {
        // Different element or first connection
        if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
        }

        // Create new source
        try {
          if (!audioElement.crossOrigin) {
            console.warn('Audio element missing crossOrigin attribute - Firefox may not provide frequency data');
          }
          sourceRef.current = audioContext.createMediaElementSource(audioElement);
        } catch (e: any) {
          // Element already has a source - this happens when reconnecting
          // The source is still valid, just reuse it
          if (e.name === 'InvalidStateError' && sourceRef.current) {
            try {
              sourceRef.current.connect(newAnalyser);
              newAnalyser.connect(audioContext.destination);
              analyserRef.current = newAnalyser;
              connectedElementRef.current = audioElement;
              setIsActive(true);
              animationFrameRef.current = requestAnimationFrame(analyze);
              return;
            } catch (reconnectError) {
              console.error('Failed to reconnect existing source:', reconnectError);
            }
          }
          console.warn('Could not create media element source:', e?.message || e);
          setIsActive(false);
          return;
        }

        // Connect: source -> analyser -> destination
        sourceRef.current.connect(newAnalyser);
        newAnalyser.connect(audioContext.destination);
        analyserRef.current = newAnalyser;
      }

      connectedElementRef.current = audioElement;
      setIsActive(true);

      // Start analysis loop
      animationFrameRef.current = requestAnimationFrame(analyze);

    } catch (error) {
      console.error('Error connecting audio analyzer:', error);
      setIsActive(false);
    }
  }, [fftSize, smoothingTimeConstant, analyze]);

  const disconnect = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsActive(false);
    setAudioData(DEFAULT_AUDIO_DATA);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Ignore
        }
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  return {
    audioData,
    isActive,
    connect,
    disconnect,
  };
}
