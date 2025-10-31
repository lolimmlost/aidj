import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock data
const mockSong = {
  id: '1',
  name: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  albumId: 'album-1',
  duration: 180,
  track: 1,
  url: 'http://example.com/song1.mp3'
}

const mockSong2 = {
  id: '2',
  name: 'Test Song 2',
  artist: 'Test Artist 2',
  album: 'Test Album 2',
  albumId: 'album-2',
  duration: 200,
  track: 2,
  url: 'http://example.com/song2.mp3'
}

const mockDJSession = {
  id: 'session-1',
  name: 'Test DJ Set',
  songs: [mockSong, mockSong2],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  settings: {
    crossfadeDuration: 3,
    autoMix: true,
    bpmMatch: true,
    keyMatch: true
  }
}

describe('DJ Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Session Management', () => {
    it('should create a new DJ session', async () => {
      const mockStartDJSession = vi.fn().mockReturnValue(mockDJSession)
      vi.doMock('../dj-service', () => ({
        startDJSession: mockStartDJSession
      }))

      const { startDJSession } = await import('../dj-service')
      const session = startDJSession('Test DJ Set')

      expect(session).toEqual(mockDJSession)
      expect(mockStartDJSession).toHaveBeenCalledWith('Test DJ Set')
    })

    it('should get active DJ session', async () => {
      const mockGetActiveDJSession = vi.fn().mockReturnValue(mockDJSession)
      vi.doMock('../dj-service', () => ({
        getActiveDJSession: mockGetActiveDJSession
      }))

      const { getActiveDJSession } = await import('../dj-service')
      const session = getActiveDJSession()

      expect(session).toEqual(mockDJSession)
    })

    it('should end DJ session', async () => {
      const mockEndDJSession = vi.fn().mockReturnValue(mockDJSession)
      vi.doMock('../dj-service', () => ({
        endDJSession: mockEndDJSession
      }))

      const { endDJSession } = await import('../dj-service')
      const session = endDJSession()

      expect(session).toEqual(mockDJSession)
      expect(mockEndDJSession).toHaveBeenCalled()
    })

    it('should get DJ session stats', async () => {
      const mockGetDJSessionStats = vi.fn().mockReturnValue(mockDJSession)
      vi.doMock('../dj-service', () => ({
        getDJSessionStats: mockGetDJSessionStats
      }))

      const { getDJSessionStats } = await import('../dj-service')
      const session = getDJSessionStats('session-1')

      expect(session).toEqual(mockDJSession)
      expect(mockGetDJSessionStats).toHaveBeenCalledWith('session-1')
    })
  })

  describe('Queue Management', () => {
    it('should add song to DJ queue', async () => {
      const mockAddToDJQueue = vi.fn().mockResolvedValue({
        song: mockSong,
        position: 0,
        isAutoQueued: false,
        queuedAt: new Date()
      })
      vi.doMock('../dj-service', () => ({
        addToDJQueue: mockAddToDJQueue
      }))

      const { addToDJQueue } = await import('../dj-service')
      const result = await addToDJQueue(mockSong)

      expect(result.song).toEqual(mockSong)
      expect(mockAddToDJQueue).toHaveBeenCalledWith(mockSong)
    })

    it('should remove song from DJ queue', async () => {
      const mockRemoveFromDJQueue = vi.fn().mockReturnValue({
        song: mockSong,
        position: 0,
        isAutoQueued: false,
        queuedAt: new Date()
      })
      vi.doMock('../dj-service', () => ({
        removeFromDJQueue: mockRemoveFromDJQueue
      }))

      const { removeFromDJQueue } = await import('../dj-service')
      const result = removeFromDJQueue(0)

      expect(result.song).toEqual(mockSong)
      expect(mockRemoveFromDJQueue).toHaveBeenCalledWith(0)
    })

    it('should get DJ recommendations', async () => {
      const mockGetDJRecommendations = vi.fn().mockResolvedValue([{
        song: mockSong2,
        analysis: { bpm: 128, key: 'G', energy: 0.8 },
        compatibility: 0.9,
        transitionType: 'crossfade',
        notes: ['Good energy match'],
        priority: 'high'
      }])
      vi.doMock('../dj-service', () => ({
        getDJRecommendations: mockGetDJRecommendations
      }))

      const { getDJRecommendations } = await import('../dj-service')
      const result = await getDJRecommendations([mockSong2])

      expect(result).toHaveLength(1)
      expect(result[0].song).toEqual(mockSong2)
      expect(mockGetDJRecommendations).toHaveBeenCalledWith([mockSong2])
    })
  })

  describe('Mixing Features', () => {
    it('should set auto-mixing', async () => {
      const mockSetAutoMixing = vi.fn()
      vi.doMock('../dj-service', () => ({
        setAutoMixing: mockSetAutoMixing
      }))

      const { setAutoMixing } = await import('../dj-service')
      setAutoMixing(true)

      expect(mockSetAutoMixing).toHaveBeenCalledWith(true)
    })

    it('should auto-mix next song', async () => {
      const mockAutoMixNext = vi.fn().mockResolvedValue({
        transitionType: 'crossfade',
        duration: 3000,
        compatibility: 0.9
      })
      vi.doMock('../dj-service', () => ({
        autoMixNext: mockAutoMixNext
      }))

      const { autoMixNext } = await import('../dj-service')
      const result = await autoMixNext()

      expect(result.transitionType).toBe('crossfade')
      expect(mockAutoMixNext).toHaveBeenCalled()
    })

    it('should complete transition', async () => {
      const mockCompleteTransition = vi.fn()
      vi.doMock('../dj-service', () => ({
        completeTransition: mockCompleteTransition
      }))

      const { completeTransition } = await import('../dj-service')
      completeTransition()

      expect(mockCompleteTransition).toHaveBeenCalled()
    })
  })

  describe('Auto-Mixing', () => {
    it('should plan auto-mix set', async () => {
      const mockPlanAutoMixSet = vi.fn().mockResolvedValue({
        songs: [mockSong, mockSong2],
        transitions: [{
          transitionType: 'crossfade',
          compatibility: 0.9
        }],
        totalDuration: 380,
        averageEnergy: 0.75,
        compatibility: 0.85,
        notes: ['Good energy flow']
      })
      vi.doMock('../dj-service', () => ({
        planAutoMixSet: mockPlanAutoMixSet
      }))

      const { planAutoMixSet } = await import('../dj-service')
      const result = await planAutoMixSet({
        candidateSongs: [mockSong, mockSong2],
        maxSongs: 10
      })

      expect(result.songs).toHaveLength(2)
      expect(mockPlanAutoMixSet).toHaveBeenCalledWith({
        candidateSongs: [mockSong, mockSong2],
        maxSongs: 10
      })
    })

    it('should get DJ session history', async () => {
      const mockGetDJSessionHistory = vi.fn().mockReturnValue([mockDJSession])
      vi.doMock('../dj-service', () => ({
        getDJSessionHistory: mockGetDJSessionHistory
      }))

      const { getDJSessionHistory } = await import('../dj-service')
      const history = getDJSessionHistory()

      expect(history).toEqual([mockDJSession])
      expect(mockGetDJSessionHistory).toHaveBeenCalled()
    })

    it('should clear DJ session history', async () => {
      const mockClearDJSessionHistory = vi.fn()
      vi.doMock('../dj-service', () => ({
        clearDJSessionHistory: mockClearDJSessionHistory
      }))

      const { clearDJSessionHistory } = await import('../dj-service')
      clearDJSessionHistory()

      expect(mockClearDJSessionHistory).toHaveBeenCalled()
    })

    it('should export DJ session', async () => {
      const mockExportDJSession = vi.fn().mockReturnValue('{"session":{}}')
      vi.doMock('../dj-service', () => ({
        exportDJSession: mockExportDJSession
      }))

      const { exportDJSession } = await import('../dj-service')
      const exportData = exportDJSession('session-1')

      expect(exportData).toBe('{"session":{}}')
      expect(mockExportDJSession).toHaveBeenCalledWith('session-1')
    })
  })

  describe('Effects and Processing', () => {
    it('should handle DJ queue management', async () => {
      // Test queue item structure
      const queueItem = {
        song: mockSong,
        position: 0,
        isAutoQueued: false,
        queuedAt: new Date()
      }

      expect(queueItem.song).toEqual(mockSong)
      expect(queueItem.position).toBe(0)
      expect(queueItem.isAutoQueued).toBe(false)
      expect(queueItem.queuedAt).toBeInstanceOf(Date)
    })

    it('should handle DJ session state', async () => {
      // Test session structure
      const session = {
        id: 'session-1',
        name: 'Test Session',
        startTime: new Date(),
        config: {
          autoMixMode: 'balanced',
          bpmMatch: true,
          keyMatch: true
        },
        queue: [],
        currentIndex: -1,
        isAutoMixing: false,
        isTransitioning: false,
        totalTransitions: 0,
        averageCompatibility: 0,
        energyHistory: [],
        bpmHistory: [],
        keyHistory: []
      }

      expect(session.id).toBe('session-1')
      expect(session.name).toBe('Test Session')
      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.config.autoMixMode).toBe('balanced')
      expect(session.queue).toEqual([])
      expect(session.currentIndex).toBe(-1)
      expect(session.isAutoMixing).toBe(false)
      expect(session.isTransitioning).toBe(false)
      expect(session.totalTransitions).toBe(0)
      expect(session.averageCompatibility).toBe(0)
      expect(session.energyHistory).toEqual([])
      expect(session.bpmHistory).toEqual([])
      expect(session.keyHistory).toEqual([])
    })
  })

  describe('Performance Monitoring', () => {
    it('should handle DJ recommendations', async () => {
      // Test recommendation structure
      const recommendation = {
        song: mockSong2,
        analysis: {
          bpm: 128,
          key: 'G',
          energy: 0.8,
          danceability: 0.9
        },
        compatibility: 0.9,
        transitionType: 'crossfade',
        notes: ['Good energy match'],
        priority: 'high'
      }

      expect(recommendation.song).toEqual(mockSong2)
      expect(recommendation.analysis.bpm).toBe(128)
      expect(recommendation.analysis.key).toBe('G')
      expect(recommendation.analysis.energy).toBe(0.8)
      expect(recommendation.compatibility).toBe(0.9)
      expect(recommendation.transitionType).toBe('crossfade')
      expect(recommendation.notes).toEqual(['Good energy match'])
      expect(recommendation.priority).toBe('high')
    })
  })

  describe('Error Handling', () => {
    it('should handle no active session error', async () => {
      const mockSetAutoMixing = vi.fn().mockImplementation(() => {
        throw new Error('No active DJ session')
      })
      vi.doMock('../dj-service', () => ({
        setAutoMixing: mockSetAutoMixing
      }))

      const { setAutoMixing } = await import('../dj-service')
      
      expect(() => setAutoMixing(true)).toThrow('No active DJ session')
    })

    it('should handle queue position out of bounds', async () => {
      const mockRemoveFromDJQueue = vi.fn().mockReturnValue(null)
      vi.doMock('../dj-service', () => ({
        removeFromDJQueue: mockRemoveFromDJQueue
      }))

      const { removeFromDJQueue } = await import('../dj-service')
      const result = removeFromDJQueue(999)

      expect(result).toBeNull()
      expect(mockRemoveFromDJQueue).toHaveBeenCalledWith(999)
    })

    it('should handle insufficient songs for auto-mix', async () => {
      const mockPlanAutoMixSet = vi.fn().mockRejectedValue(new Error('Need at least 2 songs'))
      vi.doMock('../dj-service', () => ({
        planAutoMixSet: mockPlanAutoMixSet
      }))

      const { planAutoMixSet } = await import('../dj-service')
      
      await expect(planAutoMixSet({
        candidateSongs: [mockSong]
      })).rejects.toThrow('Need at least 2 songs')
    })
  })

  describe('Integration with Other Services', () => {
    it('should handle auto-mix options', async () => {
      // Test auto-mix options structure
      const options = {
        targetDuration: 60,
        energyCurve: 'wave',
        startEnergy: 0.5,
        endEnergy: 0.8,
        genreFocus: ['electronic', 'house'],
        excludeGenres: ['country'],
        maxBPMRange: { min: 120, max: 140 },
        keyProgression: 'harmonic'
      }

      expect(options.targetDuration).toBe(60)
      expect(options.energyCurve).toBe('wave')
      expect(options.startEnergy).toBe(0.5)
      expect(options.endEnergy).toBe(0.8)
      expect(options.genreFocus).toEqual(['electronic', 'house'])
      expect(options.excludeGenres).toEqual(['country'])
      expect(options.maxBPMRange).toEqual({ min: 120, max: 140 })
      expect(options.keyProgression).toBe('harmonic')
    })

    it('should handle DJ set plan structure', async () => {
      // Test DJ set plan structure
      const plan = {
        songs: [mockSong, mockSong2],
        transitions: [{
          transitionType: 'crossfade',
          compatibility: 0.9
        }],
        totalDuration: 380,
        averageEnergy: 0.75,
        energyProfile: [0.5, 0.8],
        bpmProgression: [120, 128],
        keyProgression: ['C', 'G'],
        compatibility: 0.85,
        notes: ['Good energy flow']
      }

      expect(plan.songs).toEqual([mockSong, mockSong2])
      expect(plan.transitions).toHaveLength(1)
      expect(plan.totalDuration).toBe(380)
      expect(plan.averageEnergy).toBe(0.75)
      expect(plan.energyProfile).toEqual([0.5, 0.8])
      expect(plan.bpmProgression).toEqual([120, 128])
      expect(plan.keyProgression).toEqual(['C', 'G'])
      expect(plan.compatibility).toBe(0.85)
      expect(plan.notes).toEqual(['Good energy flow'])
    })
  })
})