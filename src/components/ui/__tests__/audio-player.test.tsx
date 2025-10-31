import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AudioPlayer } from '../audio-player'

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

// Mock audio element
const createMockAudio = () => {
  const audio = {
    play: vi.fn(),
    pause: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    src: '',
    currentTime: 0,
    duration: 0,
    volume: 1,
    paused: true,
    ended: false,
    error: null
  } as any
  
  // Mock HTMLAudioElement constructor
  global.Audio = vi.fn(() => audio) as any
  
  return audio
}

describe('Audio Player Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock audio element
    createMockAudio()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Component Rendering', () => {
    it('should render audio player with song loaded', () => {
      render(<AudioPlayer />)
      
      expect(screen.getByText('Test Song')).toBeInTheDocument()
      expect(screen.getByText('Test Artist')).toBeInTheDocument()
      expect(screen.getByText('Test Album')).toBeInTheDocument()
    })

    it('should render controls when song is loaded', () => {
      render(<AudioPlayer />)
      
      expect(screen.getByLabelText('Play')).toBeInTheDocument()
      expect(screen.getByLabelText('Pause')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous')).toBeInTheDocument()
      expect(screen.getByLabelText('Next')).toBeInTheDocument()
      expect(screen.getByLabelText('Volume')).toBeInTheDocument()
      expect(screen.getByLabelText('Shuffle')).toBeInTheDocument()
    })

    it('should render loading state', () => {
      render(<AudioPlayer />)
      
      // Mock loading state
      const audio = global.Audio as any
      audio.readyState = 1 // HAVE_CURRENT_DATA
      
      expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    })

    it('should render error state', () => {
      render(<AudioPlayer />)
      
      // Mock error state
      const audio = global.Audio as any
      audio.error = new Error('Audio loading failed')
      
      expect(screen.getByText(/Audio Error/)).toBeInTheDocument()
    })

    it('should render empty playlist state', () => {
      render(<AudioPlayer />)
      
      expect(screen.getByText('No songs in playlist')).toBeInTheDocument()
    })
  })

  describe('Playback Controls', () => {
    it('should play when play button is clicked', async () => {
      render(<AudioPlayer />)
      
      const playButton = screen.getByLabelText('Play')
      const audio = global.Audio as any
      
      fireEvent.click(playButton)
      
      await waitFor(() => {
        expect(audio.play).toHaveBeenCalled()
        expect(audio.paused).toBe(false)
      })
    })

    it('should pause when pause button is clicked', async () => {
      render(<AudioPlayer />)
      
      const pauseButton = screen.getByLabelText('Pause')
      const audio = global.Audio as any
      
      // Start with playing state
      audio.paused = false
      
      fireEvent.click(pauseButton)
      
      await waitFor(() => {
        expect(audio.pause).toHaveBeenCalled()
        expect(audio.paused).toBe(true)
      })
    })

    it('should seek when slider is changed', async () => {
      render(<AudioPlayer />)
      
      const seekSlider = screen.getByLabelText('Seek')
      const audio = global.Audio as any
      
      fireEvent.change(seekSlider, { target: { value: 60 } })
      
      await waitFor(() => {
        expect(audio.currentTime).toBe(60)
      })
    })

    it('should change volume when volume slider is adjusted', async () => {
      render(<AudioPlayer />)
      
      const volumeSlider = screen.getByLabelText('Volume')
      const audio = global.Audio as any
      
      fireEvent.change(volumeSlider, { target: { value: 0.5 } })
      
      await waitFor(() => {
        expect(audio.volume).toBe(0.5)
      })
    })

    it('should skip to next song', async () => {
      render(<AudioPlayer />)
      
      const nextButton = screen.getByLabelText('Next')
      const audio = global.Audio as any
      
      fireEvent.click(nextButton)
      
      await waitFor(() => {
        expect(audio.currentTime).toBe(0) // Should reset to beginning of next song
      })
    })

    it('should go to previous song', async () => {
      render(<AudioPlayer />)
      
      const prevButton = screen.getByLabelText('Previous')
      const audio = global.Audio as any
      
      fireEvent.click(prevButton)
      
      await waitFor(() => {
        expect(audio.currentTime).toBe(0) // Should reset to beginning of previous song
      })
    })
  })

  describe('Keyboard Controls', () => {
    it('should play/pause with spacebar', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      
      fireEvent.keyDown(document.body, { key: ' ' })
      
      await waitFor(() => {
        expect(audio.play).toHaveBeenCalled()
      })
    })

    it('should seek with arrow keys', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      
      fireEvent.keyDown(document.body, { key: 'ArrowRight' })
      
      await waitFor(() => {
        expect(audio.currentTime).toBeGreaterThan(0)
      })
    })

    it('should adjust volume with arrow keys', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      
      fireEvent.keyDown(document.body, { key: 'ArrowUp' })
      
      await waitFor(() => {
        expect(audio.volume).toBeGreaterThan(0.5)
      })
    })

    it('should toggle shuffle with S key', async () => {
      render(<AudioPlayer />)
      
      const shuffleButton = screen.getByLabelText('Shuffle')
      
      fireEvent.keyDown(document.body, { key: 's' })
      
      await waitFor(() => {
        expect(shuffleButton).toHaveAttribute('aria-pressed', 'true')
      })
    })

    it('should like song with L key', async () => {
      render(<AudioPlayer />)
      
      const likeButton = screen.getByLabelText('Like Song')
      
      fireEvent.keyDown(document.body, { key: 'l' })
      
      await waitFor(() => {
        expect(likeButton).toHaveAttribute('aria-pressed', 'true')
      })
    })
  })

  describe('Progress Bar', () => {
    it('should update progress as song plays', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      
      // Mock time progression
      let currentTime = 0
      const interval = setInterval(() => {
        currentTime += 1
        audio.currentTime = currentTime
      }, 100)
      
      // Start playback
      fireEvent.click(screen.getByLabelText('Play'))
      
      await waitFor(() => {
        const progressText = screen.getByText(/0:1[0-9]/)
        expect(progressText).toBeInTheDocument()
      }, { timeout: 2000 })
      
      clearInterval(interval)
    })

    it('should show total duration', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      audio.duration = 180
      
      await waitFor(() => {
        const durationText = screen.getByText(/3:00/)
        expect(durationText).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle audio loading errors', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      audio.error = new Error('Network error')
      
      // Trigger error event
      const errorEvent = new Event('error')
      audio.dispatchEvent(errorEvent)
      
      await waitFor(() => {
        expect(screen.getByText(/Audio Error/)).toBeInTheDocument()
      })
    })

    it('should handle unsupported audio formats', async () => {
      render(<AudioPlayer />)
      
      const audio = global.Audio as any
      
      // Mock unsupported format
      audio.canPlayType = vi.fn().mockReturnValue(false)
      
      // Try to load song
      const playButton = screen.getByLabelText('Play')
      fireEvent.click(playButton)
      
      await waitFor(() => {
        expect(screen.getByText(/Unsupported format/)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<AudioPlayer />)
      
      expect(screen.getByLabelText('Play')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Pause')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Previous')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Next')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Volume')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Shuffle')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Like Song')).toHaveAttribute('aria-label')
    })

    it('should support screen readers', () => {
      render(<AudioPlayer />)
      
      const playButton = screen.getByLabelText('Play')
      
      expect(playButton).toHaveAttribute('role', 'button')
      expect(playButton).toHaveAttribute('aria-pressed', 'false')
    })

    it('should have proper focus management', () => {
      render(<AudioPlayer />)
      
      const playButton = screen.getByLabelText('Play')
      
      playButton.focus()
      expect(document.activeElement).toBe(playButton)
    })
  })

  describe('Responsive Design', () => {
    it('should adapt to mobile layout', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      
      render(<AudioPlayer />)
      
      // Should hide desktop controls
      expect(screen.queryByLabelText('Advanced Controls')).not.toBeInTheDocument()
      
      // Should show mobile controls
      expect(screen.getByLabelText('Mobile Controls')).toBeInTheDocument()
    })

    it('should adapt to tablet layout', () => {
      // Mock tablet viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768
      })
      
      render(<AudioPlayer />)
      
      // Should show tablet layout
      expect(screen.getByLabelText('Tablet Controls')).toBeInTheDocument()
    })
  
    describe('DJ Features Integration', () => {
      it('should handle DJ mixer integration', async () => {
        render(<AudioPlayer />)
        
        // Check if DJ mixer controls are available
        expect(screen.queryByLabelText('Crossfader')).toBeInTheDocument()
        expect(screen.queryByLabelText('DJ Mixer')).toBeInTheDocument()
      })
  
      it('should support beat matching visualization', async () => {
        render(<AudioPlayer />)
        
        // Check for beat sync indicators
        expect(screen.queryByLabelText('BPM')).toBeInTheDocument()
        expect(screen.queryByLabelText('Beat Sync')).toBeInTheDocument()
      })
  
      it('should display harmonic mixing information', async () => {
        render(<AudioPlayer />)
        
        // Check for key detection
        expect(screen.queryByLabelText('Musical Key')).toBeInTheDocument()
        expect(screen.queryByLabelText('Harmonic Compatibility')).toBeInTheDocument()
      })
  
      it('should handle transition effects', async () => {
        render(<AudioPlayer />)
        
        // Check for transition controls
        expect(screen.queryByLabelText('Transition Type')).toBeInTheDocument()
        expect(screen.queryByLabelText('Transition Duration')).toBeInTheDocument()
      })
  
      it('should integrate with AI DJ recommendations', async () => {
        render(<AudioPlayer />)
        
        // Check for AI DJ controls
        expect(screen.queryByLabelText('AI DJ')).toBeInTheDocument()
        expect(screen.queryByLabelText('Auto-Mix')).toBeInTheDocument()
      })
  
      it('should handle energy flow analysis', async () => {
        render(<AudioPlayer />)
        
        // Check for energy analysis
        expect(screen.queryByLabelText('Energy Level')).toBeInTheDocument()
        expect(screen.queryByLabelText('Energy Flow')).toBeInTheDocument()
      })
  
      it('should support waveform visualization', async () => {
        render(<AudioPlayer />)
        
        // Check for waveform display
        expect(screen.queryByLabelText('Waveform')).toBeInTheDocument()
        expect(screen.queryByLabelText('Audio Visualization')).toBeInTheDocument()
      })
  
      it('should handle playlist generation for DJ sets', async () => {
        render(<AudioPlayer />)
        
        // Check for playlist generation controls
        expect(screen.queryByLabelText('Generate Playlist')).toBeInTheDocument()
        expect(screen.queryByLabelText('Smart Playlist')).toBeInTheDocument()
      })
    })
  
    describe('DJ Performance Requirements', () => {
      it('should meet DJ latency requirements', async () => {
        render(<AudioPlayer />)
        
        const playButton = screen.getByLabelText('Play')
        const startTime = performance.now()
        
        fireEvent.click(playButton)
        
        const endTime = performance.now()
        const responseTime = endTime - startTime
        
        // DJ controls should respond within 10ms
        expect(responseTime).toBeLessThan(10)
      })
  
      it('should handle rapid DJ control changes', async () => {
        render(<AudioPlayer />)
        
        const volumeSlider = screen.getByLabelText('Volume')
        const startTime = performance.now()
        
        // Simulate rapid volume changes (DJ use case)
        for (let i = 0; i < 20; i++) {
          fireEvent.change(volumeSlider, { target: { value: String(i * 5) } })
          await new Promise(resolve => setTimeout(resolve, 1))
        }
        
        const endTime = performance.now()
        const totalTime = endTime - startTime
        
        // Should handle 20 rapid changes within 100ms
        expect(totalTime).toBeLessThan(100)
      })
  
      it('should maintain audio quality during DJ operations', async () => {
        render(<AudioPlayer />)
        
        const audio = global.Audio as any
        
        // Simulate DJ operations
        fireEvent.click(screen.getByLabelText('Play'))
        fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '80' } })
        
        // Audio quality should remain stable
        expect(audio.volume).toBeCloseTo(0.8, 1)
      })
    })
  })

  describe('Performance', () => {
    it('should render efficiently', () => {
      const startTime = performance.now()
      
      render(<AudioPlayer />)
      
      const endTime = performance.now()
      const renderTime = endTime - startTime
      
      expect(renderTime).toBeLessThan(50) // Should render within 50ms
    })

    it('should handle rapid state changes', async () => {
      render(<AudioPlayer />)
      
      const playButton = screen.getByLabelText('Play')
      const startTime = performance.now()
      
      // Rapid state changes
      for (let i = 0; i < 100; i++) {
        fireEvent.click(playButton)
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      
      // Should handle rapid changes without performance degradation
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      expect(totalTime).toBeLessThan(500) // Should handle 100 clicks within 500ms
    })
  })
})