import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueuePanel } from '../queue-panel'

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
    url: 'http://example.com/song1.mp3',
    aiQueued: true,
    queuedBy: 'ai-dj' as const,
    queuedAt: Date.now()
  },
  {
    id: '2',
    name: 'Test Song 2',
    artist: 'Test Artist 2',
    album: 'Test Album 2',
    albumId: 'album-2',
    duration: 200,
    track: 2,
    url: 'http://example.com/song2.mp3',
    aiQueued: false,
    queuedBy: 'user' as const,
    queuedAt: Date.now() - 10000
  },
  {
    id: '3',
    name: 'Test Song 3',
    artist: 'Test Artist 3',
    album: 'Test Album 3',
    albumId: 'album-3',
    duration: 160,
    track: 3,
    url: 'http://example.com/song3.mp3',
    aiQueued: true,
    queuedBy: 'ai-dj' as const,
    queuedAt: Date.now() - 5000
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
  Promise.resolve(mockSongs.slice(0, 3))
)

describe('Queue Panel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Component Rendering', () => {
    it('should render queue panel with songs', () => {
      render(<QueuePanel />)
      
      expect(screen.getByText('Queue')).toBeInTheDocument()
      expect(screen.getByText('3 songs')).toBeInTheDocument()
    })

    it('should render empty queue state', () => {
      mockUseAudioStore.mockReturnValue({
        queue: [],
        currentSong: null,
        isPlaying: false,
        volume: 0.8,
        position: 0,
        duration: 0,
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
      } as any)

      render(<QueuePanel />)
      
      expect(screen.getByText('Queue')).toBeInTheDocument()
      expect(screen.getByText('No songs in queue')).toBeInTheDocument()
    })

    it('should render current song information', () => {
      render(<QueuePanel />)
      
      expect(screen.getByText('Test Song 1')).toBeInTheDocument()
      expect(screen.getByText('Test Artist 1')).toBeInTheDocument()
      expect(screen.getByText('Test Album 1')).toBeInTheDocument()
    })

    it('should render playback controls', () => {
      render(<QueuePanel />)
      
      expect(screen.getByLabelText('Play')).toBeInTheDocument()
      expect(screen.getByLabelText('Pause')).toBeInTheDocument()
      expect(screen.getByLabelText('Next')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous')).toBeInTheDocument()
      expect(screen.getByLabelText('Volume')).toBeInTheDocument()
    })

    it('should render queue management controls', () => {
      render(<QueuePanel />)
      
      expect(screen.getByLabelText('Clear Queue')).toBeInTheDocument()
      expect(screen.getByLabelText('Shuffle')).toBeInTheDocument()
      expect(screen.getByLabelText('Repeat')).toBeInTheDocument()
    })
  })

  describe('AI DJ Integration', () => {
    it('should show AI DJ controls when enabled', () => {
      render(<QueuePanel />)
      
      expect(screen.getByLabelText('AI DJ')).toBeInTheDocument()
      expect(screen.getByLabelText('Generate Recommendations')).toBeInTheDocument()
      expect(screen.getByLabelText('Auto-Mix Settings')).toBeInTheDocument()
    })

    it('should display AI queued indicators', () => {
      render(<QueuePanel />)
      
      // Check for AI queued indicators
      const aiQueuedSongs = screen.getAllByText('AI')
      expect(aiQueuedSongs.length).toBe(2) // Songs 1 and 3 are AI queued
    })

    it('should trigger AI recommendations when threshold reached', async () => {
      const mockAddToQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0], mockSongs[1]], // Only 2 songs, below threshold of 3
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

      render(<QueuePanel />)
      
      const generateButton = screen.getByLabelText('Generate Recommendations')
      await userEvent.click(generateButton)
      
      expect(mockGenerateContextualRecommendations).toHaveBeenCalled()
    })

    it('should respect AI DJ settings', async () => {
      render(<QueuePanel />)
      
      expect(screen.getByLabelText('AI DJ Threshold')).toBeInTheDocument()
      expect(screen.getByLabelText('AI DJ Batch Size')).toBeInTheDocument()
      expect(screen.getByLabelText('Use Current Context')).toBeInTheDocument()
    })

    it('should handle AI DJ errors gracefully', async () => {
      const mockGenerateContextualRecommendations = vi.fn(() => 
        Promise.reject(new Error('AI service unavailable'))
      )
      
      mockUseAudioStore.mockReturnValue({
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
        generateAIDJRecommendations: mockGenerateContextualRecommendations,
      })

      render(<QueuePanel />)
      
      const generateButton = screen.getByLabelText('Generate Recommendations')
      await userEvent.click(generateButton)
      
      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/AI service unavailable/)).toBeInTheDocument()
      })
    })
  })

  describe('Queue Operations', () => {
    it('should add songs to queue', async () => {
      const mockAddToQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        addToQueue: mockAddToQueue,
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      })

      render(<QueuePanel />)
      
      const addButton = screen.getByLabelText('Add to Queue')
      await userEvent.click(addButton)
      
      expect(mockAddToQueue).toHaveBeenCalled()
    })

    it('should remove songs from queue', async () => {
      const mockRemoveFromQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        removeFromQueue: mockRemoveFromQueue,
        clearQueue: vi.fn(),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      })

      render(<QueuePanel />)
      
      const removeButtons = screen.getAllByLabelText('Remove from Queue')
      await userEvent.click(removeButtons[0])
      
      expect(mockRemoveFromQueue).toHaveBeenCalledWith('1')
    })

    it('should clear entire queue', async () => {
      const mockClearQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        clearQueue: mockClearQueue,
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      })

      render(<QueuePanel />)
      
      const clearButton = screen.getByLabelText('Clear Queue')
      await userEvent.click(clearButton)
      
      expect(mockClearQueue).toHaveBeenCalled()
    })

    it('should shuffle queue', async () => {
      const mockShuffle = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        shuffle: mockShuffle,
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      })

      render(<QueuePanel />)
      
      const shuffleButton = screen.getByLabelText('Shuffle')
      await userEvent.click(shuffleButton)
      
      expect(mockShuffle).toHaveBeenCalled()
    })

    it('should toggle repeat mode', async () => {
      const mockSetRepeat = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        setRepeat: mockSetRepeat,
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      })

      render(<QueuePanel />)
      
      const repeatButton = screen.getByLabelText('Repeat')
      await userEvent.click(repeatButton)
      
      expect(mockSetRepeat).toHaveBeenCalled()
    })
  })

  describe('Playback Controls', () => {
    it('should play when play button is clicked', async () => {
      const mockPlay = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: false, // Not playing
        volume: 0.8,
        position: 30,
        duration: 180,
        play: mockPlay,
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
      })

      render(<QueuePanel />)
      
      const playButton = screen.getByLabelText('Play')
      await userEvent.click(playButton)
      
      expect(mockPlay).toHaveBeenCalled()
    })

    it('should pause when pause button is clicked', async () => {
      const mockPause = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: true, // Currently playing
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: mockPause,
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
      })

      render(<QueuePanel />)
      
      const pauseButton = screen.getByLabelText('Pause')
      await userEvent.click(pauseButton)
      
      expect(mockPause).toHaveBeenCalled()
    })

    it('should skip to next song', async () => {
      const mockNext = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: mockNext,
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
      })

      render(<QueuePanel />)
      
      const nextButton = screen.getByLabelText('Next')
      await userEvent.click(nextButton)
      
      expect(mockNext).toHaveBeenCalled()
    })

    it('should go to previous song', async () => {
      const mockPrevious = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: true,
        volume: 0.8,
        position: 30,
        duration: 180,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: mockPrevious,
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
      })

      render(<QueuePanel />)
      
      const previousButton = screen.getByLabelText('Previous')
      await userEvent.click(previousButton)
      
      expect(mockPrevious).toHaveBeenCalled()
    })

    it('should adjust volume', async () => {
      const mockSetVolume = vi.fn()
      mockUseAudioStore.mockReturnValue({
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
        setVolume: mockSetVolume,
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
      })

      render(<QueuePanel />)
      
      const volumeSlider = screen.getByLabelText('Volume')
      fireEvent.change(volumeSlider, { target: { value: '0.9' } })
      
      expect(mockSetVolume).toHaveBeenCalledWith(0.9)
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<QueuePanel />)
      
      expect(screen.getByLabelText('Play')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Pause')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Next')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Previous')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Volume')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Clear Queue')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Shuffle')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Repeat')).toHaveAttribute('aria-label')
    })

    it('should support keyboard navigation', () => {
      render(<QueuePanel />)
      
      const playButton = screen.getByLabelText('Play')
      playButton.focus()
      expect(document.activeElement).toBe(playButton)
    })

    it('should have proper roles for interactive elements', () => {
      render(<QueuePanel />)
      
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should render efficiently', () => {
      const startTime = performance.now()
      
      render(<QueuePanel />)
      
      const endTime = performance.now()
      const renderTime = endTime - startTime
      
      expect(renderTime).toBeLessThan(50) // Should render within 50ms
    })

    it('should handle rapid state changes', async () => {
      render(<QueuePanel />)
      
      const volumeSlider = screen.getByLabelText('Volume')
      const startTime = performance.now()
      
      // Rapid volume changes
      for (let i = 0; i < 20; i++) {
        fireEvent.change(volumeSlider, { target: { value: String(i * 0.05) } })
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      expect(totalTime).toBeLessThan(200) // Should handle 20 changes within 200ms
    })
  })
})