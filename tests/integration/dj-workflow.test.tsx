import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DJMixerInterface } from '@/components/dj/dj-mixer-interface'
import { AudioPlayer } from '@/components/ui/audio-player'
import { QueuePanel } from '@/components/ui/queue-panel'

// Mock Web Audio API
import { setupWebAudioMocks } from '@/test/mocks/web-audio-api'

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
  },
  {
    id: '3',
    name: 'Test Song 3',
    artist: 'Test Artist 3',
    album: 'Test Album 3',
    albumId: 'album-3',
    duration: 160,
    track: 3,
    url: 'http://example.com/song3.mp3'
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

// Mock router
const mockNavigate = vi.fn()

describe('DJ Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setupWebAudioMocks()
    
    // Mock router
    vi.mock('@tanstack/react-router', () => ({
      useNavigate: () => mockNavigate,
      useLocation: () => ({ pathname: '/dj' }),
      useParams: () => ({ id: '1' }),
      Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('DJ Mixer to Audio Player Integration', () => {
    it('should sync playback state between components', async () => {
      const mockPlay = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: true,
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

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Simulate play action from DJ mixer
      const playButton = screen.getByLabelText('Play')
      await userEvent.click(playButton)

      // Check if audio player state updates
      await waitFor(() => {
        expect(mockPlay).toHaveBeenCalled()
      })
    })

    it('should sync volume controls between components', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Simulate volume change from DJ mixer
      const volumeSlider = screen.getByLabelText('Volume')
      fireEvent.change(volumeSlider, { target: { value: '0.9' } })

      // Check if audio player volume updates
      await waitFor(() => {
        expect(mockSetVolume).toHaveBeenCalledWith(0.9)
      })
    })

    it('should sync EQ settings between components', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Simulate EQ change from DJ mixer
      const eqSlider = screen.getByLabelText('low')
      fireEvent.change(eqSlider, { target: { value: '6' } })

      // Check if audio player EQ updates
      await waitFor(() => {
        expect(mockSetVolume).toHaveBeenCalled() // EQ changes often affect volume
      })
    })
  })

  describe('DJ Mixer to Queue Integration', () => {
    it('should add songs from DJ mixer to queue', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <QueuePanel />
        </div>
      )

      // Simulate adding song from DJ mixer
      const addButton = screen.getByLabelText('Add to Queue')
      await userEvent.click(addButton)

      // Check if queue updates
      await waitFor(() => {
        expect(mockAddToQueue).toHaveBeenCalled()
      })
    })

    it('should sync crossfader state with queue balance', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <QueuePanel />
        </div>
      )

      // Simulate crossfader change
      const crossfader = screen.getByLabelText('Crossfader')
      fireEvent.change(crossfader, { target: { value: '75' } })

      // Check if queue balance updates
      await waitFor(() => {
        expect(mockSetVolume).toHaveBeenCalled() // Crossfader affects volume balance
      })
    })
  })

  describe('DJ Effects Integration', () => {
    it('should apply effects to audio output', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Switch to effects tab
      const effectsTab = screen.getByText('Effects')
      await userEvent.click(effectsTab)

      // Enable filter effect
      const filterSwitch = screen.getByText('Filter')
      await userEvent.click(filterSwitch)

      // Check if audio output changes
      await waitFor(() => {
        expect(mockSetVolume).toHaveBeenCalled() // Effects affect audio output
      })
    })

    it('should sync transition effects with queue changes', async () => {
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

      render(
        <div>
          <DJMixerInterface />
          <QueuePanel />
        </div>
      )

      // Switch to effects tab
      const effectsTab = screen.getByText('Effects')
      await userEvent.click(effectsTab)

      // Enable transition effect
      const transitionSwitch = screen.getByText('Delay')
      await userEvent.click(transitionSwitch)

      // Trigger next song
      const nextButton = screen.getByLabelText('Next')
      await userEvent.click(nextButton)

      // Check if transition is applied
      await waitFor(() => {
        expect(mockNext).toHaveBeenCalled()
      })
    })
  })

  describe('DJ Auto-Mix Integration', () => {
    it('should generate playlists based on current song', async () => {
      const mockGenerateAIDJRecommendations = vi.fn(() => 
        Promise.resolve(mockSongs.slice(1, 3))
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
        generateAIDJRecommendations: mockGenerateAIDJRecommendations,
      })

      render(
        <div>
          <DJMixerInterface />
          <QueuePanel />
        </div>
      )

      // Switch to auto-mix tab
      const autoMixTab = screen.getByText('Auto-Mix')
      await userEvent.click(autoMixTab)

      // Enable auto-mixing
      const autoMixSwitch = screen.getByLabelText('Enable Auto-Mixing')
      await userEvent.click(autoMixSwitch)

      // Check if AI recommendations are generated
      await waitFor(() => {
        expect(mockGenerateAIDJRecommendations).toHaveBeenCalled()
      })
    })

    it('should respect harmonic mixing settings', async () => {
      const mockGenerateAIDJRecommendations = vi.fn(() => 
        Promise.resolve(mockSongs.slice(1, 3))
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
        generateAIDJRecommendations: mockGenerateAIDJRecommendations,
      })

      render(
        <div>
          <DJMixerInterface />
          <QueuePanel />
        </div>
      )

      // Switch to auto-mix tab
      const autoMixTab = screen.getByText('Auto-Mix')
      await userEvent.click(autoMixTab)

      // Change mixing strategy to harmonic
      const strategySelect = screen.getByRole('combobox')
      await userEvent.click(strategySelect)
      const harmonicOption = screen.getByText('Harmonic Mixing')
      await userEvent.click(harmonicOption)

      // Enable auto-mixing
      const autoMixSwitch = screen.getByLabelText('Enable Auto-Mixing')
      await userEvent.click(autoMixSwitch)

      // Check if harmonic mixing is used
      await waitFor(() => {
        expect(mockGenerateAIDJRecommendations).toHaveBeenCalledWith(
          expect.objectContaining({
            style: expect.stringContaining('harmonic')
          })
        )
      })
    })
  })

  describe('DJ Visualization Integration', () => {
    it('should sync waveform data with audio playback', async () => {
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
        generateAIDJRecommendations: vi.fn(),
      })

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Switch to visualizer tab
      const visualizerTab = screen.getByText('Visualizer')
      await userEvent.click(visualizerTab)

      // Enable waveform
      const waveformSwitch = screen.getByLabelText('Waveform')
      await userEvent.click(waveformSwitch)

      // Start playback to trigger visualization
      const playButton = screen.getByLabelText('Play')
      await userEvent.click(playButton)

      // Check if visualization is active
      await waitFor(() => {
        expect(screen.getByText('Waveform')).toBeInTheDocument()
      })
    })

    it('should sync spectrum analyzer with frequency data', async () => {
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
        generateAIDJRecommendations: vi.fn(),
      })

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
        </div>
      )

      // Switch to visualizer tab
      const visualizerTab = screen.getByText('Visualizer')
      await userEvent.click(visualizerTab)

      // Enable spectrum
      const spectrumSwitch = screen.getByLabelText('Spectrum')
      await userEvent.click(spectrumSwitch)

      // Start playback to trigger visualization
      const playButton = screen.getByLabelText('Play')
      await userEvent.click(playButton)

      // Check if spectrum analyzer is active
      await waitFor(() => {
        expect(screen.getByText('Frequency Spectrum')).toBeInTheDocument()
      })
    })
  })

  describe('Performance Requirements', () => {
    it('should meet DJ latency requirements', async () => {
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
        generateAIDJRecommendations: vi.fn(),
      })

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
          <QueuePanel />
        </div>
      )

      // Test rapid DJ control changes
      const playButton = screen.getByLabelText('Play')
      const startTime = performance.now()
      
      for (let i = 0; i < 10; i++) {
        await userEvent.click(playButton)
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      // Should handle 10 rapid clicks within 100ms
      expect(totalTime).toBeLessThan(100)
    })

    it('should handle concurrent DJ operations', async () => {
      const mockPlay = vi.fn()
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[0],
        isPlaying: true,
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

      render(
        <div>
          <DJMixerInterface />
          <AudioPlayer />
          <QueuePanel />
        </div>
      )

      // Simulate concurrent operations
      const playButton = screen.getByLabelText('Play')
      const volumeSlider = screen.getByLabelText('Volume')
      const nextButton = screen.getByLabelText('Next')
      
      const operations = [
        () => userEvent.click(playButton),
        () => userEvent.change(volumeSlider, { target: { value: '0.9' } }),
        () => userEvent.click(nextButton)
      ]
      
      const startTime = performance.now()
      await Promise.all(operations.map(op => op()))
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(50) // Should complete within 50ms
    })
  })
})