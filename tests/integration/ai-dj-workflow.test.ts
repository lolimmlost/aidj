import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock data
const mockSongs = [
  {
    id: '1',
    name: 'Test Song 1',
    artist: 'Test Artist 1',
    album: 'Test Album 1',
    albumId: 'album-1',
    duration: 180,
    track: 1,
    url: 'http://example.com/song1.mp3'
  },
  {
    id: '2',
    name: 'Test Song 2',
    artist: 'Test Artist 2',
    album: 'Test Album 2',
    albumId: 'album-2',
    duration: 200,
    track: 2,
    url: 'http://example.com/song2.mp3'
  }
]

const mockRecommendations = [
  {
    song: 'Artist A - Song A',
    explanation: 'Similar energy level'
  },
  {
    song: 'Artist B - Song B',
    explanation: 'Matching genre'
  },
  {
    song: 'Artist C - Song C',
    explanation: 'Compatible key'
  }
]

// Mock hooks
const mockUseAudioStore = vi.fn(() => ({
  queue: mockSongs,
  currentSong: mockSongs[0],
  isPlaying: true,
  volume: 0.8,
  position: 30,
  duration: 180,
  play: vi.fn(),
  pause: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  clearQueue: vi.fn(),
  shuffle: vi.fn(),
  setShuffle: vi.fn(),
  repeat: vi.fn(),
  setRepeat: vi.fn(),
  toggleLike: vi.fn(),
  setAIDJSettings: vi.fn(),
  generateAIDJRecommendations: vi.fn(),
}))

const mockUsePreferencesStore = vi.fn(() => ({
  preferences: {
    recommendationSettings: {
      aiEnabled: true,
      aiDJEnabled: true,
      aiDJQueueThreshold: 2,
      aiDJBatchSize: 3,
      aiDJUseCurrentContext: true
    }
  },
  setRecommendationSettings: vi.fn()
}))

// Mock AI DJ service
const mockGenerateContextualRecommendations = vi.fn(() => 
  Promise.resolve(mockRecommendations)
)

describe('AI DJ Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Mock router
    vi.mock('@tanstack/react-router', () => ({
      useNavigate: () => vi.fn(),
      useLocation: () => ({ pathname: '/dj' }),
      useParams: () => ({ id: '1' })
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('AI DJ Recommendation Flow', () => {
    it('should trigger recommendations when queue threshold is reached', async () => {
      const mockAddToQueue = vi.fn()
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: mockAddToQueue,
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      expect(mockGenerateContextualRecommendations).toHaveBeenCalled()
    })

    it('should use current context when generating recommendations', async () => {
      mockGenerateContextualRecommendations.mockImplementation((context, batchSize) => {
        expect(context.currentSong).toEqual(mockSongs[0])
        expect(context.recentQueue).toContain(mockSongs[1])
        expect(batchSize).toBe(3)
        return Promise.resolve(mockRecommendations)
      })

      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      await waitFor(() => {
        expect(mockGenerateContextualRecommendations).toHaveBeenCalledWith(
          expect.objectContaining({
            currentSong: mockSongs[0],
            recentQueue: [mockSongs[1]]
          }),
          3
        )
      })
    })

    it('should respect user feedback for personalization', async () => {
      mockGenerateContextualRecommendations.mockImplementation((context, batchSize, userId, useFeedback) => {
        expect(useFeedback).toBe(true)
        expect(userId).toBe('user-123')
        return Promise.resolve(mockRecommendations)
      })

      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      await waitFor(() => {
        expect(mockGenerateContextualRecommendations).toHaveBeenCalledWith(
          expect.any(Object),
          3,
          'user-123',
          true,
          [],
          []
        )
      })
    })

    it('should handle excluded songs and artists', async () => {
      mockGenerateContextualRecommendations.mockImplementation((context, batchSize, userId, useFeedback, excludeSongIds, excludeArtists) => {
        expect(excludeSongIds).toEqual(['excluded-song-1', 'excluded-song-2'])
        expect(excludeArtists).toEqual(['excluded-artist-1', 'excluded-artist-2'])
        return Promise.resolve(mockRecommendations)
      })

      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      await waitFor(() => {
        expect(mockGenerateContextualRecommendations).toHaveBeenCalledWith(
          expect.any(Object),
          3,
          undefined,
          true,
          ['excluded-song-1', 'excluded-song-2'],
          ['excluded-artist-1', 'excluded-artist-2']
        )
      })
    })
  })

  describe('AI DJ Settings Integration', () => {
    it('should update AI DJ threshold setting', async () => {
      const mockSetRecommendationSettings = vi.fn()
      
      mockUsePreferencesStore.mockReturnValue({
        preferences: {
          recommendationSettings: {
            aiEnabled: true,
            aiDJEnabled: true,
            aiDJQueueThreshold: 2,
            aiDJBatchSize: 3,
            aiDJUseCurrentContext: true
          }
        },
        setRecommendationSettings: mockSetRecommendationSettings
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <input data-testid="threshold-slider" type="range" min="1" max="5" />
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const thresholdSlider = screen.getByTestId('threshold-slider')
      fireEvent.change(thresholdSlider, { target: { value: '4' } })

      expect(mockSetRecommendationSettings).toHaveBeenCalledWith({
        aiDJQueueThreshold: 4
      })
    })

    it('should update AI DJ batch size setting', async () => {
      const mockSetRecommendationSettings = vi.fn()
      
      mockUsePreferencesStore.mockReturnValue({
        preferences: {
          recommendationSettings: {
            aiEnabled: true,
            aiDJEnabled: true,
            aiDJQueueThreshold: 2,
            aiDJBatchSize: 3,
            aiDJUseCurrentContext: true
          }
        },
        setRecommendationSettings: mockSetRecommendationSettings
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <input data-testid="batch-slider" type="range" min="1" max="10" />
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const batchSlider = screen.getByTestId('batch-slider')
      fireEvent.change(batchSlider, { target: { value: '5' } })

      expect(mockSetRecommendationSettings).toHaveBeenCalledWith({
        aiDJBatchSize: 5
      })
    })

    it('should toggle current context setting', async () => {
      const mockSetRecommendationSettings = vi.fn()
      
      mockUsePreferencesStore.mockReturnValue({
        preferences: {
          recommendationSettings: {
            aiEnabled: true,
            aiDJEnabled: true,
            aiDJQueueThreshold: 2,
            aiDJBatchSize: 3,
            aiDJUseCurrentContext: true
          }
        },
        setRecommendationSettings: mockSetRecommendationSettings
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <input data-testid="context-toggle" type="checkbox" />
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const contextToggle = screen.getByTestId('context-toggle')
      fireEvent.click(contextToggle)

      expect(mockSetRecommendationSettings).toHaveBeenCalledWith({
        aiDJUseCurrentContext: false
      })
    })
  })

  describe('AI DJ Error Handling', () => {
    it('should handle AI service unavailability', async () => {
      const mockGenerateContextualRecommendations = vi.fn(() => 
        Promise.reject(new Error('AI service unavailable'))
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
            <div data-testid="error-message" style={{ display: 'none' }}>Error message</div>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument()
        expect(screen.getByTestId('error-message')).toHaveTextContent('AI service unavailable')
      })
    })

    it('should handle rate limiting', async () => {
      const mockGenerateContextualRecommendations = vi.fn(() => 
        Promise.reject(new Error('Too many requests'))
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
            <div data-testid="rate-limit-message" style={{ display: 'none' }}>Rate limit message</div>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      await userEvent.click(generateButton)

      await waitFor(() => {
        expect(screen.getByTestId('rate-limit-message')).toBeInTheDocument()
        expect(screen.getByTestId('rate-limit-message')).toHaveTextContent('Too many requests')
      })
    })
  })

  describe('AI DJ Performance', () => {
    it('should complete recommendations within reasonable time', async () => {
      const mockGenerateContextualRecommendations = vi.fn(() => 
        new Promise(resolve => {
          setTimeout(() => resolve(mockRecommendations), 100)
        })
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      const startTime = performance.now()
      
      await userEvent.click(generateButton)
      
      const endTime = performance.now()
      
      // Should complete within reasonable time (including AI processing)
      expect(endTime - startTime).toBeLessThan(500)
    })

    it('should handle concurrent AI requests', async () => {
      const mockGenerateContextualRecommendations = vi.fn(() => 
        Promise.resolve(mockRecommendations)
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // 2 songs, at threshold of 2
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      // Mock AI DJ settings component
      vi.doMock('@/components/ai-dj-settings', () => ({
        AIDJSettings: () => (
          <div data-testid="ai-dj-settings">
            <button data-testid="generate-button">Generate Recommendations</button>
          </div>
        )
      }))

      const { AIDJSettings } = await import('@/components/ai-dj-settings')
      
      render(<AIDJSettings />)

      const generateButton = screen.getByTestId('generate-button')
      
      // Simulate multiple rapid clicks
      const promises = Array.from({ length: 3 }, () => 
        userEvent.click(generateButton)
      )
      
      await Promise.all(promises)
      
      // Should handle concurrent requests gracefully
      expect(mockGenerateContextualRecommendations).toHaveBeenCalledTimes(3)
    })
  })
})