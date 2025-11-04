// Tests for DJ Mixer Service
// Tests BPM matching, harmonic mixing, and transition effects

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AudioBuffer for Node.js environment (not available in Node by default)
class MockAudioBuffer {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  private channelData: Map<number, Float32Array>;

  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.numberOfChannels = options.numberOfChannels;
    this.channelData = new Map();

    // Initialize empty channel data
    for (let i = 0; i < this.numberOfChannels; i++) {
      this.channelData.set(i, new Float32Array(this.length));
    }
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channelData.get(channel);
    if (!data) {
      throw new Error(`Channel ${channel} does not exist`);
    }
    return data;
  }
}

// Make AudioBuffer available globally for tests
(global as any).AudioBuffer = MockAudioBuffer;

import {
  analyzeSongForDJMixing,
  createTransitionPlan,
  planDJSet
} from '../dj-mixer';
import { calculateBPMCompatibility, calculateKeyCompatibility } from '../audio-analysis';
import {
  analyzeTransition,
  applyCrossfade,
  applyTransitionEffects,
  calculateTransitionCompatibility,
  getRecommendedTransition
} from '../transition-effects';
import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis } from '../audio-analysis';

// Mock song data
const mockSong1: Song = {
  id: 'test-song-1',
  name: 'Test Song 1',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 240,
  url: 'http://example.com/test1.mp3'
};

const mockSong2: Song = {
  id: 'test-song-2',
  name: 'Test Song 2',
  artist: 'Test Artist',
  album: 'Test Album 2',
  duration: 180,
  url: 'http://example.com/test2.mp3'
};

// Mock analysis data
const mockAnalysis1: AudioAnalysis = {
  id: 'test-analysis-1',
  bpm: 120,
  key: 'C',
  energy: 0.7,
  danceability: 0.8,
  valence: 0.6,
  acousticness: 0.3,
  instrumentalness: 0.2,
  loudness: -12,
  tempoConfidence: 0.8,
  keyConfidence: 0.7,
  analysisVersion: '1.0.0',
  analyzedAt: new Date()
};

const mockAnalysis2: AudioAnalysis = {
  id: 'test-analysis-2',
  bpm: 128,
  key: 'G',
  energy: 0.6,
  danceability: 0.7,
  valence: 0.5,
  acousticness: 0.4,
  instrumentalness: 0.3,
  loudness: -10,
  tempoConfidence: 0.7,
  keyConfidence: 0.8,
  analysisVersion: '1.0.0',
  analyzedAt: new Date()
};

describe('DJ Mixer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBPMCompatibility', () => {
    it('should return perfect compatibility for exact BPM match', () => {
      const result = calculateBPMCompatibility(120, 120);
      
      expect(result.compatibility).toBe(1.0);
      expect(result.relationship).toBe('exact_match');
      expect(result.recommendedTechnique).toBe('direct_mix');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should return high compatibility for harmonic BPM relationships', () => {
      const doubleTime = calculateBPMCompatibility(120, 240);
      const halfTime = calculateBPMCompatibility(120, 60);
      const onePointFive = calculateBPMCompatibility(120, 180);
      
      expect(doubleTime.compatibility).toBe(0.9);
      expect(doubleTime.relationship).toBe('double_time');
      expect(doubleTime.recommendedTechnique).toBe('tempo_match');
      
      expect(halfTime.compatibility).toBe(0.9);
      expect(halfTime.relationship).toBe('half_time');
      expect(halfTime.recommendedTechnique).toBe('tempo_match');
      
      expect(onePointFive.compatibility).toBe(0.85);
      expect(onePointFive.relationship).toBe('one_point_five');
      expect(onePointFive.recommendedTechnique).toBe('tempo_adjust');
    });

    it('should return moderate compatibility for close BPM match', () => {
      const result = calculateBPMCompatibility(120, 125);
      
      expect(result.compatibility).toBe(0.8);
      expect(result.relationship).toBe('close_match');
      expect(result.recommendedTechnique).toBe('slight_adjust');
    });

    it('should return low compatibility for incompatible BPM', () => {
      const result = calculateBPMCompatibility(120, 90);
      
      expect(result.compatibility).toBeLessThan(0.5);
      expect(result.relationship).toBe('incompatible');
      expect(result.recommendedTechnique).toBe('major_adjust');
    });

    it('should consider genre in BPM compatibility', () => {
      const electronic = calculateBPMCompatibility(120, 125, 'electronic');
      const acoustic = calculateBPMCompatibility(120, 125, 'acoustic');
      
      expect(electronic.compatibility).toBeGreaterThan(acoustic.compatibility);
    });
  });

  describe('calculateKeyCompatibility', () => {
    it('should return perfect compatibility for exact key match', () => {
      const result = calculateKeyCompatibility('C', 'C');
      
      expect(result.compatibility).toBe(1.0);
      expect(result.relationship).toBe('perfect_match');
      expect(result.harmonicFunction).toBe('tonic');
    });

    it('should return high compatibility for relative minor/major', () => {
      const majorToMinor = calculateKeyCompatibility('C', 'Am');
      const minorToMajor = calculateKeyCompatibility('Am', 'C');
      
      expect(majorToMinor.compatibility).toBe(0.9);
      expect(majorToMinor.relationship).toBe('relative_minor');
      expect(majorToMinor.harmonicFunction).toBe('subdominant');
      
      expect(minorToMajor.compatibility).toBe(0.9);
      expect(minorToMajor.relationship).toBe('relative_major');
      expect(minorToMajor.harmonicFunction).toBe('tonic');
    });

    it('should return high compatibility for circle of fifths relationships', () => {
      const dominant = calculateKeyCompatibility('C', 'G');
      const subdominant = calculateKeyCompatibility('C', 'F');
      
      expect(dominant.compatibility).toBe(0.8);
      expect(dominant.relationship).toBe('dominant');
      expect(dominant.harmonicFunction).toBe('dominant');
      
      expect(subdominant.compatibility).toBe(0.8);
      expect(subdominant.relationship).toBe('subdominant');
      expect(subdominant.harmonicFunction).toBe('subdominant');
    });

    it('should return moderate compatibility for compatible keys', () => {
      const result = calculateKeyCompatibility('C', 'D');
      
      expect(result.compatibility).toBe(0.6);
      expect(result.relationship).toBe('compatible');
    });

    it('should return low compatibility for incompatible keys', () => {
      const result = calculateKeyCompatibility('C', 'F#');
      
      expect(result.compatibility).toBeLessThan(0.5);
      expect(result.relationship).toBe('incompatible');
    });
  });

  describe('calculateTransitionCompatibility', () => {
    it('should calculate overall compatibility from multiple factors', () => {
      const bpmComp = { compatibility: 0.8, relationship: 'close_match' as const };
      const keyComp = { compatibility: 0.7, relationship: 'compatible' as const };
      const energyComp = 0.9;
      
      const result = calculateTransitionCompatibility(bpmComp, keyComp, energyComp);
      
      expect(result.overall).toBeGreaterThan(0.7);
      expect(result.overall).toBeLessThan(0.8);
      expect(result.bpmScore).toBe(0.8);
      expect(result.keyScore).toBe(0.7);
      expect(result.energyScore).toBe(0.9);
      expect(result.difficulty).toBeDefined();
    });

    it('should weight factors appropriately', () => {
      const bpmComp = { compatibility: 1.0, relationship: 'exact_match' as const };
      const keyComp = { compatibility: 1.0, relationship: 'perfect_match' as const };
      const energyComp = 1.0;
      
      const result = calculateTransitionCompatibility(bpmComp, keyComp, energyComp);
      
      expect(result.overall).toBeCloseTo(1.0, 1);
      expect(result.difficulty).toBe('easy');
    });

    it('should identify difficult transitions', () => {
      const bpmComp = { compatibility: 0.3, relationship: 'incompatible' as const };
      const keyComp = { compatibility: 0.2, relationship: 'incompatible' as const };
      const energyComp = 0.1;
      
      const result = calculateTransitionCompatibility(bpmComp, keyComp, energyComp);
      
      expect(result.overall).toBeLessThan(0.3);
      expect(result.difficulty).toBe('expert');
    });
  });

  describe('getRecommendedTransition', () => {
    it('should recommend harmonic transition for high compatibility', () => {
      const result = getRecommendedTransition(0.9, 0.8, 0.7);
      
      expect(result.type).toBe('harmonic');
      expect(result.duration).toBeGreaterThan(4000);
      expect(result.curve).toBe('sine');
      expect(result.effects).toContain('filter');
    });

    it('should recommend beatmatch for high BPM compatibility', () => {
      const result = getRecommendedTransition(0.8, 0.9, 0.6);
      
      expect(result.type).toBe('beatmatch');
      expect(result.duration).toBeGreaterThan(3000);
      expect(result.effects).toContain('delay');
    });

    it('should recommend crossfade for moderate compatibility', () => {
      const result = getRecommendedTransition(0.6, 0.5, 0.7);
      
      expect(result.type).toBe('crossfade');
      expect(result.duration).toBeCloseTo(4000, 500);
    });

    it('should recommend cut for low compatibility', () => {
      const result = getRecommendedTransition(0.3, 0.2, 0.1);
      
      expect(result.type).toBe('cut');
      expect(result.duration).toBeLessThan(2000);
    });
  });

  describe('analyzeTransition', () => {
    it('should analyze transition between two songs', async () => {
      const result = await analyzeTransition(mockSong1, mockSong2, mockAnalysis1, mockAnalysis2);
      
      expect(result.recommendedType).toBeDefined();
      expect(result.recommendedParameters).toBeDefined();
      expect(result.compatibility).toBeGreaterThan(0);
      expect(result.compatibility).toBeLessThanOrEqual(1);
      expect(result.difficulty).toBeDefined();
      expect(result.energyFlow).toBeDefined();
      expect(result.harmonicRelationship).toBeDefined();
      expect(result.beatAlignment).toBeGreaterThan(0);
      expect(result.beatAlignment).toBeLessThanOrEqual(1);
      expect(result.transitionPoints).toBeDefined();
      expect(result.transitionPoints.length).toBeGreaterThan(0);
    });

    it('should handle missing analysis gracefully', async () => {
      const result = await analyzeTransition(mockSong1, mockSong2);
      
      expect(result).toBeDefined();
      expect(result.compatibility).toBeGreaterThan(0);
    });

    it('should recommend appropriate transition type', async () => {
      const result = await analyzeTransition(mockSong1, mockSong2, mockAnalysis1, mockAnalysis2);
      
      // Based on the mock data, should recommend a reasonable transition
      expect(['crossfade', 'beatmatch', 'harmonic', 'filter_sweep']).toContain(result.recommendedType);
    });
  });

  describe('applyCrossfade', () => {
    it('should apply equal power crossfade', () => {
      const currentBuffer = createMockAudioBuffer();
      const nextBuffer = createMockAudioBuffer();
      
      const result = applyCrossfade(currentBuffer, nextBuffer, {
        type: 'equal_power',
        duration: 4000
      });
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(currentBuffer.length);
      expect(result.numberOfChannels).toBe(currentBuffer.numberOfChannels);
      expect(result.sampleRate).toBe(currentBuffer.sampleRate);
    });

    it('should apply linear crossfade', () => {
      const currentBuffer = createMockAudioBuffer();
      const nextBuffer = createMockAudioBuffer();
      
      const result = applyCrossfade(currentBuffer, nextBuffer, {
        type: 'linear',
        duration: 2000
      });
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(currentBuffer.length);
    });

    it('should apply custom crossfade curve', () => {
      const currentBuffer = createMockAudioBuffer();
      const nextBuffer = createMockAudioBuffer();
      const customCurve = [0, 0.1, 0.3, 0.6, 1];
      
      const result = applyCrossfade(currentBuffer, nextBuffer, {
        type: 'custom',
        curve: customCurve,
        duration: 3000
      });
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(currentBuffer.length);
    });
  });

  describe('applyTransitionEffects', () => {
    it('should apply filter effect', () => {
      const buffer = createMockAudioBuffer();
      const effects = [{
        type: 'filter' as const,
        parameters: {
          frequency: 1000,
          resonance: 1,
          filterType: 'lowpass' as const
        },
        timing: {
          start: 0,
          duration: 1
        }
      }];
      
      const result = applyTransitionEffects(buffer, effects);
      
      expect(result).toBeDefined();
      expect(result.length).toBe(buffer.length);
    });

    it('should apply delay effect', () => {
      const buffer = createMockAudioBuffer();
      const effects = [{
        type: 'delay' as const,
        parameters: {
          delayTime: 0.25,
          feedback: 0.5,
          wetLevel: 0.3
        },
        timing: {
          start: 0.2,
          duration: 0.8
        }
      }];
      
      const result = applyTransitionEffects(buffer, effects);
      
      expect(result).toBeDefined();
      expect(result.length).toBe(buffer.length);
    });

    it('should apply reverb effect', () => {
      const buffer = createMockAudioBuffer();
      const effects = [{
        type: 'reverb' as const,
        parameters: {
          roomSize: 0.7,
          damping: 0.5,
          wetLevel: 0.4
        },
        timing: {
          start: 0.5,
          duration: 0.5
        }
      }];
      
      const result = applyTransitionEffects(buffer, effects);
      
      expect(result).toBeDefined();
      expect(result.length).toBe(buffer.length);
    });

    it('should apply multiple effects', () => {
      const buffer = createMockAudioBuffer();
      const effects = [
        {
          type: 'filter' as const,
          parameters: {
            frequency: 2000,
            resonance: 0.8,
            filterType: 'lowpass' as const
          },
          timing: {
            start: 0,
            duration: 0.5
          }
        },
        {
          type: 'delay' as const,
          parameters: {
            delayTime: 0.2,
            feedback: 0.4,
            wetLevel: 0.3
          },
          timing: {
            start: 0.5,
            duration: 0.5
          }
        }
      ];
      
      const result = applyTransitionEffects(buffer, effects);
      
      expect(result).toBeDefined();
      expect(result.length).toBe(buffer.length);
    });
  });
});

// Helper function to create mock audio buffer
function createMockAudioBuffer(): AudioBuffer {
  const length = 44100 * 2; // 2 seconds
  const sampleRate = 44100;
  const numberOfChannels = 2;
  
  const buffer = new AudioBuffer({
    length,
    sampleRate,
    numberOfChannels
  });
  
  // Fill with mock audio data
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      channelData[i] = Math.sin(i * 0.01) * 0.5;
    }
  }
  
  return buffer;
}