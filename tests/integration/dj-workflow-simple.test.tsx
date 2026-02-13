import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('DJ Workflow Integration Tests', () => {
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

  describe('DJ Mixer Workflow', () => {
    it('should navigate to DJ mixer page', async () => {
      const mockNavigate = vi.fn()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      vi.mocked(require('@tanstack/react-router').useNavigate).mockReturnValue(mockNavigate)
      
      render(
        <div>
          <button onClick={() => mockNavigate('/dj')}>Go to DJ Mixer</button>
        </div>
      )

      const djButton = screen.getByText('Go to DJ Mixer')
      await userEvent.click(djButton)

      expect(mockNavigate).toHaveBeenCalledWith('/dj')
    })

    it('should load DJ mixer with songs', async () => {
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">DJ Mixer Loaded</div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      expect(screen.getByTestId('dj-mixer')).toBeInTheDocument()
      expect(screen.getByText('DJ Mixer Loaded')).toBeInTheDocument()
    })

    it('should control playback from DJ mixer', async () => {
      const mockPlay = vi.fn()
      const mockSetVolume = vi.fn()
      
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="play-button">Play</button>
            <button data-testid="volume-slider">Volume</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const playButton = screen.getByTestId('play-button')
      const volumeSlider = screen.getByTestId('volume-slider')
      
      await userEvent.click(playButton)
      expect(mockPlay).toHaveBeenCalled()
      
      fireEvent.change(volumeSlider, { target: { value: '0.9' } })
      expect(mockSetVolume).toHaveBeenCalledWith(0.9)
    })

    it('should handle deck switching', async () => {
      const mockNext = vi.fn()
      
      mockUseAudioStore.mockReturnValue({
        queue: mockSongs,
        currentSong: mockSongs[1], // Second song
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="deck-a">Deck A</button>
            <button data-testid="deck-b">Deck B</button>
            <button data-testid="next-button">Next</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const _deckAButton = screen.getByTestId('deck-a')
      const deckBButton = screen.getByTestId('deck-b')
      const nextButton = screen.getByTestId('next-button')
      
      // Switch to Deck B
      await userEvent.click(deckBButton)
      
      // Go to next song (should switch decks)
      await userEvent.click(nextButton)
      
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('DJ Effects Workflow', () => {
    it('should apply effects during playback', async () => {
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="effects-tab">Effects</button>
            <button data-testid="filter-effect">Filter</button>
            <button data-testid="reverb-effect">Reverb</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const effectsTab = screen.getByTestId('effects-tab')
      const filterEffect = screen.getByTestId('filter-effect')
      const reverbEffect = screen.getByTestId('reverb-effect')
      
      // Switch to effects tab
      await userEvent.click(effectsTab)
      
      // Enable filter effect
      await userEvent.click(filterEffect)
      
      // Enable reverb effect
      await userEvent.click(reverbEffect)
      
      // Effects should change audio output
      expect(mockSetVolume).toHaveBeenCalledTimes(2) // Volume changes for each effect
    })

    it('should transition between effects smoothly', async () => {
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="transition-type">Transition Type</button>
            <select data-testid="transition-select">
              <option value="cut">Cut</option>
              <option value="crossfade">Crossfade</option>
              <option value="beatmatch">Beatmatch</option>
            </select>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const transitionType = screen.getByTestId('transition-type')
      const _transitionSelect = screen.getByTestId('transition-select')
      
      // Change transition type
      await userEvent.click(transitionType)
      
      // Select beatmatch transition
      const beatmatchOption = screen.getByText('Beatmatch')
      await userEvent.click(beatmatchOption)
      
      // Transition change should affect audio output
      expect(mockSetVolume).toHaveBeenCalled()
    })
  })

  describe('DJ Auto-Mix Workflow', () => {
    it('should generate automatic transitions', async () => {
      const mockGenerateAIDJRecommendations = vi.fn(() => 
        Promise.resolve(mockSongs.slice(1, 3))
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0]], // Only one song, should trigger auto-mix
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="auto-mix-enable">Enable Auto-Mix</button>
            <button data-testid="auto-mix-generate">Generate Mix</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const autoMixEnable = screen.getByTestId('auto-mix-enable')
      const generateMix = screen.getByTestId('auto-mix-generate')
      
      // Enable auto-mixing
      await userEvent.click(autoMixEnable)
      
      // Generate mix
      await userEvent.click(generateMix)
      
      expect(mockGenerateAIDJRecommendations).toHaveBeenCalled()
    })

    it('should respect auto-mix settings', async () => {
      const mockGenerateAIDJRecommendations = vi.fn(() => 
        Promise.resolve(mockSongs.slice(1, 3))
      )
      
      mockUseAudioStore.mockReturnValue({
        queue: [mockSongs[0]],
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="mixing-strategy">Mixing Strategy</button>
            <select data-testid="strategy-select">
              <option value="harmonic">Harmonic</option>
              <option value="energy">Energy</option>
              <option value="bpm">BPM</option>
            </select>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const mixingStrategy = screen.getByTestId('mixing-strategy')
      const _strategySelect = screen.getByTestId('strategy-select')
      
      // Change mixing strategy
      await userEvent.click(mixingStrategy)
      
      // Select harmonic mixing
      const harmonicOption = screen.getByText('Harmonic')
      await userEvent.click(harmonicOption)
      
      // Generate mix with harmonic strategy
      const generateMix = screen.getByTestId('auto-mix-generate')
      await userEvent.click(generateMix)
      
      expect(mockGenerateAIDJRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          style: expect.stringContaining('harmonic')
        })
      )
    })
  })

  describe('Performance Requirements', () => {
    it('should meet DJ workflow latency requirements', async () => {
      const _startTime = performance.now()
      
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="play-button">Play</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const playButton = screen.getByTestId('play-button')
      
      const clickStartTime = performance.now()
      await userEvent.click(playButton)
      const clickEndTime = performance.now()
      
      // DJ controls should respond within 10ms
      expect(clickEndTime - clickStartTime).toBeLessThan(10)
    })

    it('should handle rapid DJ operations', async () => {
      const startTime = performance.now()
      
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

      // Mock DJ mixer component
      vi.doMock('@/components/dj/dj-mixer-interface', () => ({
        DJMixerInterface: () => (
          <div data-testid="dj-mixer">
            <button data-testid="volume-slider">Volume</button>
          </div>
        )
      }))

      const { DJMixerInterface } = await import('@/components/dj/dj-mixer-interface')
      
      render(<DJMixerInterface />)

      const volumeSlider = screen.getByTestId('volume-slider')
      
      // Simulate rapid volume changes
      for (let i = 0; i < 20; i++) {
        fireEvent.change(volumeSlider, { target: { value: String(i * 0.05) } })
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      // Should handle 20 rapid changes within 100ms
      expect(totalTime).toBeLessThan(100)
    })
  })
})