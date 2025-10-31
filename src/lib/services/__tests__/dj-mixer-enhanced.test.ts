import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  calculateEnhancedBPMCompatibility,
  calculateEnhancedKeyCompatibility,
  createEnhancedTransitionPlan
} from '../dj-mixer-enhanced'
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

describe('Enhanced DJ Mixer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('calculateEnhancedBPMCompatibility', () => {
    it('should calculate perfect compatibility for identical BPMs', () => {
      const result = calculateEnhancedBPMCompatibility(128, 128)
      
      expect(result.compatibility).toBeCloseTo(1.0, 2)
      expect(result.relationship).toBe('perfect')
      expect(result.difficulty).toBe('easy')
    })

    it('should handle compatible BPM ranges within 5%', () => {
      const result = calculateEnhancedBPMCompatibility(128, 133)
      
      expect(result.compatibility).toBeGreaterThan(0.9)
      expect(result.relationship).toBe('close_match')
      expect(result.harmonicRelationship).toBeDefined()
      expect(result.genreMatch).toBeDefined()
    })

    it('should detect incompatible BPM differences > 10%', () => {
      const result = calculateEnhancedBPMCompatibility(128, 145)
      
      expect(result.compatibility).toBeLessThan(0.8)
      expect(result.relationship).toBe('compatible')
    })

    it('should apply genre-specific BPM rules', () => {
      // Test with electronic genre (more flexible BPM)
      const electronicResult = calculateEnhancedBPMCompatibility(128, 140, {
        genre1: 'Electronic',
        genre2: 'Electronic'
      })
      
      // Test with classical genre (more strict BPM)
      const classicalResult = calculateEnhancedBPMCompatibility(128, 140, {
        genre1: 'Classical',
        genre2: 'Classical'
      })
      
      expect(electronicResult.genreMatch).toBe(true)
      expect(classicalResult.genreMatch).toBe(true)
    })

    it('should handle edge cases with zero BPM', () => {
      const result = calculateEnhancedBPMCompatibility(0, 128)
      
      expect(result.compatibility).toBeLessThan(0.5)
    })

    it('should handle negative BPM values gracefully', () => {
      const result = calculateEnhancedBPMCompatibility(-10, 128)
      
      expect(result.compatibility).toBeLessThan(0.5)
    })
  })

  describe('calculateEnhancedKeyCompatibility', () => {
    it('should identify perfect harmonic matches', () => {
      const result = calculateEnhancedKeyCompatibility('C major', 'C major')
      
      expect(result.compatibility).toBeCloseTo(1.0, 2)
      expect(result.relationship).toBe('perfect_match')
      expect(result.modulationPath).toEqual([])
      expect(result.modulationDifficulty).toBe('easy')
    })

    it('should calculate relative minor/major relationships', () => {
      const result = calculateEnhancedKeyCompatibility('C major', 'A minor')
      
      expect(result.compatibility).toBeGreaterThan(0.8)
      expect(result.modulationPath.length).toBeGreaterThan(0)
    })

    it('should calculate modulation paths for compatible keys', () => {
      const result = calculateEnhancedKeyCompatibility('C major', 'G major')
      
      expect(result.compatibility).toBeGreaterThan(0.7)
      expect(result.modulationPath.length).toBeGreaterThan(0)
    })

    it('should handle modulation options', () => {
      const result = calculateEnhancedKeyCompatibility('C major', 'G major', {
        allowModulation: true,
        modulationComplexity: 'moderate'
      })
      
      expect(result.modulationPath.length).toBeGreaterThan(0)
      expect(result.modulationDifficulty).toBeDefined()
    })

    it('should handle invalid key inputs gracefully', () => {
      const result = calculateEnhancedKeyCompatibility('invalid', 'C major')
      
      expect(result.compatibility).toBeLessThan(0.5)
    })
  })

  describe('createEnhancedTransitionPlan', () => {
    it('should create optimal transition plans', async () => {
      const result = await createEnhancedTransitionPlan(mockSong1, mockSong2)
      
      expect(result.fromSong).toBe(mockSong1)
      expect(result.toSong).toBe(mockSong2)
      expect(result.transitionType).toBeDefined()
      expect(result.compatibility).toBeGreaterThan(0)
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should generate appropriate transition parameters', async () => {
      const result = await createEnhancedTransitionPlan(mockSong1, mockSong2)
      
      expect(result.duration).toBeGreaterThan(0)
      expect(result.startTime).toBeGreaterThan(0)
      expect(result.energyCurve).toBeDefined()
      expect(result.volumeCurve).toBeDefined()
    })

    it('should handle analysis errors gracefully', async () => {
      // Mock a failed analysis
      vi.doMock('../audio-analysis', async () => ({
        analyzeAudioFeatures: vi.fn().mockRejectedValue(new Error('Analysis failed'))
      }))
      
      await expect(createEnhancedTransitionPlan(mockSong1, mockSong2)).rejects.toThrow('ENHANCED_TRANSITION_PLAN_ERROR')
    })
  })

  describe('Performance Tests', () => {
    it('should process transitions within performance budget', async () => {
      const startTime = performance.now()
      
      await createEnhancedTransitionPlan(mockSong1, mockSong2)
      
      const endTime = performance.now()
      const processingTime = endTime - startTime
      
      // Should process single transition within 50ms
      expect(processingTime).toBeLessThan(50)
    })
  })

  describe('Edge Cases', () => {
    it('should handle extreme BPM values', () => {
      const result1 = calculateEnhancedBPMCompatibility(300, 320) // Very high BPM
      const result2 = calculateEnhancedBPMCompatibility(40, 45)   // Very low BPM
      
      expect(result1.compatibility).toBeGreaterThan(0.5) // Should handle high BPM
      expect(result2.compatibility).toBeGreaterThan(0.5) // Should handle low BPM
    })

    it('should handle unusual key signatures', () => {
      const result = calculateEnhancedKeyCompatibility('C# major', 'F minor')
      
      expect(result.compatibility).toBeGreaterThanOrEqual(0)
      expect(result.relationship).toBeDefined()
    })
  })
})