import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  analyzeTransition,
  calculateBPMCompatibility,
  calculateKeyCompatibility,
  getTransitionEffects,
  applyCrossfade,
  applyTransitionEffects
} from '../transition-effects'
import type { Song } from '@/components/ui/audio-player'
import type { AudioAnalysis } from '../audio-analysis'

// Mock data for testing
const mockSong1: Song = {
  id: '1',
  name: 'Test Song 1',
  artist: 'Test Artist',
  album: 'Test Album',
  albumId: 'album-1',
  duration: 180,
  track: 1,
  url: 'http://example.com/song1.mp3'
}

const mockSong2: Song = {
  id: '2',
  name: 'Test Song 2',
  artist: 'Test Artist',
  album: 'Test Album',
  albumId: 'album-1',
  duration: 200,
  track: 2,
  url: 'http://example.com/song2.mp3'
}

const mockAnalysis1: AudioAnalysis = {
  bpm: 128,
  key: 'C major',
  energy: 0.8,
  danceability: 0.9,
  valence: 0.7,
  acousticness: 0.1,
  instrumentalness: 0.2,
  liveness: 0.3,
  speechiness: 0.1
}

const mockAnalysis2: AudioAnalysis = {
  bpm: 130,
  key: 'G major',
  energy: 0.7,
  danceability: 0.8,
  valence: 0.6,
  acousticness: 0.2,
  instrumentalness: 0.3,
  liveness: 0.2,
  speechiness: 0.1
}

describe('Transition Effects Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Transition Analysis', () => {
    it('should analyze BPM compatibility', () => {
      const result = calculateBPMCompatibility(128, 130)
      
      expect(result).toBeDefined()
      expect(result.bpm).toBe(130)
      expect(result.compatibility).toBeGreaterThan(0.8)
      expect(result.relationship).toBeDefined()
    })

    it('should analyze key compatibility', () => {
      const result = calculateKeyCompatibility('C major', 'G major')
      
      expect(result).toBeDefined()
      expect(result.key).toBe('G major')
      expect(result.compatibility).toBeGreaterThan(0.7)
      expect(result.relationship).toBeDefined()
    })

    it('should analyze energy compatibility', () => {
      const result = analyzeTransition(mockAnalysis1, mockAnalysis2)
      
      expect(result).toBeDefined()
      expect(result.energyCompatibility).toBeGreaterThan(0.7)
      expect(result.recommendedTransitionType).toBeDefined()
    })

    it('should determine recommended transition type', () => {
      const result = analyzeTransition(mockAnalysis1, mockAnalysis2)
      
      expect(result.recommendedTransitionType).toBeDefined()
      expect(typeof result.recommendedTransitionType).toBe('string')
    })

    it('should handle edge cases', () => {
      const result = analyzeTransition(mockAnalysis1, mockAnalysis2)
      
      expect(result).toBeDefined()
      expect(result.energyCompatibility).toBeGreaterThanOrEqual(0)
      expect(result.energyCompatibility).toBeLessThanOrEqual(1)
    })
  })

  describe('Transition Effects', () => {
    it('should get available transition effects', () => {
      const effects = getTransitionEffects()
      
      expect(effects).toBeDefined()
      expect(Array.isArray(effects)).toBe(true)
      expect(effects.length).toBeGreaterThan(0)
    })

    it('should apply crossfade transition', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      const result = applyCrossfade(mockAudioBuffer, 0.5, 1000)
      
      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(AudioBuffer)
    })

    it('should apply filter sweep effect', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      const result = applyTransitionEffects(mockAudioBuffer, {
        type: 'filter_sweep',
        parameters: {
          frequency: 1000,
          resonance: 2,
          qFactor: 1
        }
      })
      
      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(AudioBuffer)
    })

    it('should apply echo out effect', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      const result = applyTransitionEffects(mockAudioBuffer, {
        type: 'echo_out',
        parameters: {
          delay: 0.3,
          feedback: 0.4,
          mix: 0.7
        }
      })
      
      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(AudioBuffer)
    })

    it('should handle invalid effect parameters', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      expect(() => {
        applyTransitionEffects(mockAudioBuffer, {
          type: 'invalid_effect',
          parameters: {}
        })
      }).toThrow()
    })
  })

  describe('Performance Tests', () => {
    it('should process transitions within performance budget', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      const startTime = performance.now()
      
      applyTransitionEffects(mockAudioBuffer, {
        type: 'crossfade',
        parameters: {
          duration: 1000
        }
      })
      
      const endTime = performance.now()
      const processingTime = endTime - startTime
      
      expect(processingTime).toBeLessThan(50) // Should process within 50ms
    })

    it('should handle large audio buffers efficiently', () => {
      const largeAudioBuffer = new AudioBuffer(1, 44100 * 10, false, [
        new Float32Array(44100 * 10),
        new Float32Array(44100 * 10)
      ])
      
      const startTime = performance.now()
      
      applyTransitionEffects(largeAudioBuffer, {
        type: 'crossfade',
        parameters: {
          duration: 1000
        }
      })
      
      const endTime = performance.now()
      const processingTime = endTime - startTime
      
      expect(processingTime).toBeLessThan(200) // Should handle large buffers efficiently
    })
  })

  describe('Error Handling', () => {
    it('should handle null audio buffer', () => {
      expect(() => {
        applyTransitionEffects(null, {
          type: 'crossfade',
          parameters: {}
        })
      }).toThrow()
    })

    it('should handle invalid audio buffer', () => {
      const invalidBuffer = {} as AudioBuffer
      
      expect(() => {
        applyTransitionEffects(invalidBuffer, {
          type: 'crossfade',
          parameters: {}
        })
      }).toThrow()
    })

    it('should handle missing parameters', () => {
      const mockAudioBuffer = new AudioBuffer(1, 44100, false, [
        new Float32Array(44100),
        new Float32Array(44100)
      ])
      
      // Missing required parameters
      expect(() => {
        applyTransitionEffects(mockAudioBuffer, {} as any)
      }).toThrow()
    })
  })
})