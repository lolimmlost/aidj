// Tests for Audio Analysis Service
// Tests BPM detection, key detection, and energy analysis

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  analyzeAudioFeatures,
  calculateBPMCompatibility,
  calculateKeyCompatibility,
  analyzeEnergyFlow,
  getDJCompatibleSongs,
  detectBPM,
  detectKey,
  detectEnergy,
  detectDanceability
} from '../audio-analysis';
import type { Song } from '@/lib/types/song';
import type { AudioAnalysis } from '../audio-analysis';

// Mock song data
const mockSong: Song = {
  id: 'test-song-1',
  name: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 240,
  url: 'http://example.com/test.mp3'
};

const mockSongs: Song[] = [
  mockSong,
  {
    id: 'test-song-2',
    name: 'Another Test Song',
    artist: 'Test Artist',
    album: 'Test Album 2',
    duration: 180,
    url: 'http://example.com/test2.mp3'
  },
  {
    id: 'test-song-3',
    name: 'Third Test Song',
    artist: 'Different Artist',
    album: 'Test Album 3',
    duration: 200,
    url: 'http://example.com/test3.mp3'
  }
];

describe('Audio Analysis Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeAudioFeatures', () => {
    it('should return audio analysis for a song', async () => {
      const analysis = await analyzeAudioFeatures(mockSong);
      
      expect(analysis).toBeDefined();
      expect(analysis.id).toBe(mockSong.id);
      expect(analysis.bpm).toBeGreaterThan(0);
      expect(analysis.bpm).toBeLessThan(200);
      expect(analysis.key).toBeDefined();
      expect(analysis.energy).toBeGreaterThanOrEqual(0);
      expect(analysis.energy).toBeLessThanOrEqual(1);
      expect(analysis.danceability).toBeGreaterThanOrEqual(0);
      expect(analysis.danceability).toBeLessThanOrEqual(1);
      expect(analysis.valence).toBeGreaterThanOrEqual(0);
      expect(analysis.valence).toBeLessThanOrEqual(1);
      expect(analysis.acousticness).toBeGreaterThanOrEqual(0);
      expect(analysis.acousticness).toBeLessThanOrEqual(1);
      expect(analysis.instrumentalness).toBeGreaterThanOrEqual(0);
      expect(analysis.instrumentalness).toBeLessThanOrEqual(1);
      expect(analysis.loudness).toBeLessThan(0);
      expect(analysis.tempoConfidence).toBeGreaterThanOrEqual(0);
      expect(analysis.tempoConfidence).toBeLessThanOrEqual(1);
      expect(analysis.keyConfidence).toBeGreaterThanOrEqual(0);
      expect(analysis.keyConfidence).toBeLessThanOrEqual(1);
      expect(analysis.analysisVersion).toBeDefined();
      expect(analysis.analyzedAt).toBeInstanceOf(Date);
    });

    it('should return cached analysis for same song', async () => {
      const analysis1 = await analyzeAudioFeatures(mockSong);
      const analysis2 = await analyzeAudioFeatures(mockSong);
      
      expect(analysis1).toEqual(analysis2);
    });

    it('should generate different analysis for different songs', async () => {
      const analysis1 = await analyzeAudioFeatures(mockSong);
      const analysis2 = await analyzeAudioFeatures(mockSongs[1]);
      
      expect(analysis1.id).not.toBe(analysis2.id);
      expect(analysis1.bpm).not.toBe(analysis2.bpm);
    });
  });

  describe('calculateBPMCompatibility', () => {
    it('should return perfect compatibility for exact BPM match', () => {
      const result = calculateBPMCompatibility(120, 120);
      
      expect(result.bpm).toBe(120);
      expect(result.compatibility).toBe(1.0);
      expect(result.relationship).toBe('exact_match');
    });

    it('should return high compatibility for double time relationship', () => {
      const result = calculateBPMCompatibility(120, 240);
      
      expect(result.compatibility).toBe(0.9);
      expect(result.relationship).toBe('double_time');
    });

    it('should return high compatibility for half time relationship', () => {
      const result = calculateBPMCompatibility(120, 60);
      
      expect(result.compatibility).toBe(0.9);
      expect(result.relationship).toBe('half_time');
    });

    it('should return moderate compatibility for close match', () => {
      const result = calculateBPMCompatibility(120, 125);
      
      expect(result.compatibility).toBe(0.8);
      expect(result.relationship).toBe('close_match');
    });

    it('should return low compatibility for large difference', () => {
      const result = calculateBPMCompatibility(120, 180);
      
      expect(result.compatibility).toBeLessThan(0.5);
      expect(result.relationship).toBe('needs_adjustment');
    });
  });

  describe('calculateKeyCompatibility', () => {
    it('should return perfect compatibility for exact key match', () => {
      const result = calculateKeyCompatibility('C', 'C');
      
      expect(result.key).toBe('C');
      expect(result.compatibility).toBe(1.0);
      expect(result.relationship).toBe('perfect_match');
    });

    it('should return high compatibility for relative minor relationship', () => {
      const result = calculateKeyCompatibility('C', 'Am');
      
      expect(result.compatibility).toBe(0.9);
      expect(result.relationship).toBe('relative_minor');
    });

    it('should return high compatibility for dominant relationship', () => {
      const result = calculateKeyCompatibility('C', 'G');
      
      expect(result.compatibility).toBe(0.8);
      expect(result.relationship).toBe('dominant');
    });

    it('should return moderate compatibility for subdominant relationship', () => {
      const result = calculateKeyCompatibility('C', 'F');
      
      expect(result.compatibility).toBe(0.7);
      expect(result.relationship).toBe('subdominant');
    });

    it('should return low compatibility for incompatible keys', () => {
      const result = calculateKeyCompatibility('C', 'F#');
      
      expect(result.compatibility).toBeLessThan(0.5);
      expect(result.relationship).toBe('incompatible');
    });
  });

  describe('analyzeEnergyFlow', () => {
    it('should return rising energy flow for increasing energy', () => {
      const currentAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.3
      };
      const targetAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.8
      };
      
      const result = analyzeEnergyFlow(currentAnalysis, targetAnalysis);
      
      expect(result.currentEnergy).toBe(0.3);
      expect(result.targetEnergy).toBe(0.8);
      expect(result.energyDirection).toBe('rising');
      expect(result.transitionType).toBe('buildup');
    });

    it('should return falling energy flow for decreasing energy', () => {
      const currentAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.8
      };
      const targetAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.2
      };
      
      const result = analyzeEnergyFlow(currentAnalysis, targetAnalysis);
      
      expect(result.currentEnergy).toBe(0.8);
      expect(result.targetEnergy).toBe(0.2);
      expect(result.energyDirection).toBe('falling');
      expect(result.transitionType).toBe('breakdown');
    });

    it('should return steady energy flow for similar energy', () => {
      const currentAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.5
      };
      const targetAnalysis: AudioAnalysis = {
        ...mockAnalysis,
        energy: 0.55
      };
      
      const result = analyzeEnergyFlow(currentAnalysis, targetAnalysis);
      
      expect(result.energyDirection).toBe('steady');
    });
  });

  describe('getDJCompatibleSongs', () => {
    it('should return compatible songs sorted by compatibility', async () => {
      const results = await getDJCompatibleSongs(mockSong, mockSongs);
      
      expect(results).toHaveLength(2);
      expect(results[0].compatibility).toBeGreaterThanOrEqual(results[1].compatibility);
      expect(results[0].song.id).not.toBe(mockSong.id);
    });

    it('should prioritize BPM when requested', async () => {
      const results = await getDJCompatibleSongs(mockSong, mockSongs, {
        prioritizeBPM: true
      });
      
      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted with BPM compatibility weighted more heavily
    });

    it('should prioritize key when requested', async () => {
      const results = await getDJCompatibleSongs(mockSong, mockSongs, {
        prioritizeKey: true
      });
      
      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted with key compatibility weighted more heavily
    });

    it('should filter by minimum compatibility', async () => {
      const results = await getDJCompatibleSongs(mockSong, mockSongs, {
        minCompatibility: 0.8
      });
      
      results.forEach(result => {
        expect(result.compatibility).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should limit results by maxResults', async () => {
      const results = await getDJCompatibleSongs(mockSong, mockSongs, {
        maxResults: 1
      });
      
      expect(results).toHaveLength(1);
    });
  });

  describe('detectBPM', () => {
    it('should detect BPM from audio buffer', async () => {
      // Create mock audio buffer
      const audioBuffer = new AudioBuffer({
        length: 44100 * 10, // 10 seconds at 44.1kHz
        sampleRate: 44100,
        numberOfChannels: 1
      });
      
      const bpm = await detectBPM(audioBuffer);
      
      expect(bpm).toBeGreaterThan(60);
      expect(bpm).toBeLessThan(200);
    });

    it('should return default BPM for empty buffer', async () => {
      const emptyBuffer = new AudioBuffer({
        length: 0,
        sampleRate: 44100,
        numberOfChannels: 1
      });
      
      const bpm = await detectBPM(emptyBuffer);
      
      expect(bpm).toBe(120); // Default BPM
    });
  });

  describe('detectKey', () => {
    it('should detect musical key from audio buffer', async () => {
      const audioBuffer = new AudioBuffer({
        length: 44100 * 10,
        sampleRate: 44100,
        numberOfChannels: 1
      });
      
      const key = await detectKey(audioBuffer);
      
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('detectEnergy', () => {
    it('should detect energy level from audio buffer', async () => {
      const audioBuffer = new AudioBuffer({
        length: 44100 * 10,
        sampleRate: 44100,
        numberOfChannels: 1
      });
      
      const energy = await detectEnergy(audioBuffer);
      
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
    });
  });

  describe('detectDanceability', () => {
    it('should detect danceability from audio buffer', async () => {
      const audioBuffer = new AudioBuffer({
        length: 44100 * 10,
        sampleRate: 44100,
        numberOfChannels: 1
      });
      
      const danceability = await detectDanceability(audioBuffer);
      
      expect(danceability).toBeGreaterThanOrEqual(0);
      expect(danceability).toBeLessThanOrEqual(1);
    });
  });
});

// Mock analysis data
const mockAnalysis: AudioAnalysis = {
  id: 'test-analysis',
  bpm: 120,
  key: 'C',
  energy: 0.5,
  danceability: 0.7,
  valence: 0.6,
  acousticness: 0.3,
  instrumentalness: 0.2,
  loudness: -12,
  tempoConfidence: 0.8,
  keyConfidence: 0.7,
  analysisVersion: '1.0.0',
  analyzedAt: new Date()
};