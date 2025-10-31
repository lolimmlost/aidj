import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DJMixerInterface } from '../dj-mixer-interface'

// Mock Canvas API for visualization components
const mockCanvasContext = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  stroke: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  fill: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  transformOrigin: '',
  transform: '',
  height: 0,
  width: 0,
  getContext: vi.fn(() => mockCanvasContext),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

// Mock HTMLCanvasElement
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => mockCanvasContext),
})

// Mock Canvas size
Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
  value: 400,
  writable: true,
})

Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
  value: 100,
  writable: true,
})

describe('DJ Mixer Interface Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Component Rendering', () => {
    it('should render DJ mixer interface with all tabs', () => {
      render(<DJMixerInterface />)
      
      expect(screen.getByText('DJ Mixer')).toBeInTheDocument()
      expect(screen.getByText('Mixer')).toBeInTheDocument()
      expect(screen.getByText('Effects')).toBeInTheDocument()
      expect(screen.getByText('Auto-Mix')).toBeInTheDocument()
      expect(screen.getByText('Visualizer')).toBeInTheDocument()
    })

    it('should render both decks with initial state', () => {
      render(<DJMixerInterface />)
      
      expect(screen.getByText('Deck A')).toBeInTheDocument()
      expect(screen.getByText('Deck B')).toBeInTheDocument()
      expect(screen.getAllByText('STOPPED')).toHaveLength(2)
    })

    it('should render mixer controls section', () => {
      render(<DJMixerInterface />)
      
      expect(screen.getByText('Crossfader')).toBeInTheDocument()
      expect(screen.getByText('Master Volume')).toBeInTheDocument()
      expect(screen.getByText('Cue Mix')).toBeInTheDocument()
      expect(screen.getByText('Cue/Master')).toBeInTheDocument()
      expect(screen.getByText('Split Cue')).toBeInTheDocument()
    })

    it('should render deck controls', () => {
      render(<DJMixerInterface />)
      
      // Check for play/pause buttons
      expect(screen.getAllByLabelText('Play')).toHaveLength(2)
      expect(screen.getAllByLabelText('Pause')).toHaveLength(2)
      
      // Check for transport controls
      expect(screen.getAllByLabelText('Skip Back')).toHaveLength(2)
      expect(screen.getAllByLabelText('Skip Forward')).toHaveLength(2)
      
      // Check for volume and pitch controls
      expect(screen.getAllByLabelText('Volume')).toHaveLength(2)
      expect(screen.getAllByLabelText(/Crosshair/)).toHaveLength(2)
    })

    it('should render 3-band EQ controls for each deck', () => {
      render(<DJMixerInterface />)
      
      // Check for EQ labels
      expect(screen.getAllByText('3-Band EQ')).toHaveLength(2)
      expect(screen.getAllByText('low')).toHaveLength(2)
      expect(screen.getAllByText('mid')).toHaveLength(2)
      expect(screen.getAllByText('high')).toHaveLength(2)
    })
  })

  describe('Deck Controls', () => {
    it('should play deck when play button is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const playButtons = screen.getAllByLabelText('Play')
      await user.click(playButtons[0]) // Deck A play button
      
      expect(screen.getAllByText('PLAYING')[0]).toBeInTheDocument()
    })

    it('should pause deck when pause button is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // First play the deck
      const playButtons = screen.getAllByLabelText('Play')
      await user.click(playButtons[0])
      
      // Then pause it
      const pauseButtons = screen.getAllByLabelText('Pause')
      await user.click(pauseButtons[0])
      
      expect(screen.getAllByText('STOPPED')[0]).toBeInTheDocument()
    })

    it('should stop deck and reset position when stop button is clicked', async () => {
      render(<DJMixerInterface />)
      
      const stopButtons = screen.getAllByLabelText('Skip Back')
      fireEvent.click(stopButtons[0]) // Deck A stop button
      
      expect(screen.getAllByText('STOPPED')[0]).toBeInTheDocument()
    })

    it('should adjust deck volume when slider is changed', async () => {
      render(<DJMixerInterface />)
      
      const volumeSliders = screen.getAllByLabelText('Volume')
      const firstSlider = volumeSliders[0]
      
      // Simulate slider change
      fireEvent.change(firstSlider, { target: { value: '50' } })
      
      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument()
      })
    })

    it('should adjust deck pitch when slider is changed', async () => {
      render(<DJMixerInterface />)
      
      const pitchSliders = screen.getAllByLabelText(/Crosshair/)
      const firstSlider = pitchSliders[0]
      
      // Simulate slider change
      fireEvent.change(firstSlider, { target: { value: '2.5' } })
      
      await waitFor(() => {
        expect(screen.getByText('+2.5%')).toBeInTheDocument()
      })
    })

    it('should adjust EQ bands when sliders are changed', async () => {
      render(<DJMixerInterface />)
      
      // Find low EQ slider for Deck A
      const lowEQSliders = screen.getAllByDisplayValue('0')
      const lowEQSlider = lowEQSliders.find(slider =>
        slider.getAttribute('aria-label') === 'low'
      )
      
      if (lowEQSlider) {
        fireEvent.change(lowEQSlider, { target: { value: '6' } })
        
        await waitFor(() => {
          expect(screen.getByText('+6 dB')).toBeInTheDocument()
        })
      }
    })
  })

  describe('Mixer Controls', () => {
    it('should adjust crossfader when slider is changed', async () => {
      render(<DJMixerInterface />)
      
      const crossfader = screen.getByLabelText('Crossfader')
      fireEvent.change(crossfader, { target: { value: '75' } })
      
      await waitFor(() => {
        expect(crossfader).toHaveValue('75')
      })
    })

    it('should adjust master volume when slider is changed', async () => {
      render(<DJMixerInterface />)
      
      const masterVolume = screen.getByLabelText('Master Volume')
      fireEvent.change(masterVolume, { target: { value: '90' } })
      
      await waitFor(() => {
        expect(screen.getByText('90%')).toBeInTheDocument()
      })
    })

    it('should toggle cue/master switch when clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const cueMasterSwitch = screen.getByLabelText('Cue/Master')
      await user.click(cueMasterSwitch)
      
      expect(cueMasterSwitch).toBeChecked()
    })

    it('should toggle split cue switch when clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const splitCueSwitch = screen.getByLabelText('Split Cue')
      await user.click(splitCueSwitch)
      
      expect(splitCueSwitch).toBeChecked()
    })
  })

  describe('Effects Tab', () => {
    it('should render effects controls when effects tab is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const effectsTab = screen.getByText('Effects')
      await user.click(effectsTab)
      
      expect(screen.getByText('Deck Effects')).toBeInTheDocument()
      expect(screen.getByText('Deck A')).toBeInTheDocument()
      expect(screen.getByText('Deck B')).toBeInTheDocument()
      expect(screen.getAllByText('Filter')).toHaveLength(2)
      expect(screen.getAllByText('Reverb')).toHaveLength(2)
      expect(screen.getAllByText('Delay')).toHaveLength(2)
    })

    it('should toggle deck effects when switches are clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to effects tab
      const effectsTab = screen.getByText('Effects')
      await user.click(effectsTab)
      
      // Toggle first effect (Filter on Deck A)
      const filterSwitch = screen.getAllByRole('switch')[0]
      await user.click(filterSwitch)
      
      expect(filterSwitch).toBeChecked()
    })
  })

  describe('Auto-Mix Tab', () => {
    it('should render auto-mix controls when auto-mix tab is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const autoMixTab = screen.getByText('Auto-Mix')
      await user.click(autoMixTab)
      
      expect(screen.getByText('Auto-Mixing Settings')).toBeInTheDocument()
      expect(screen.getByText('Enable Auto-Mixing')).toBeInTheDocument()
      expect(screen.getByText('Mixing Strategy')).toBeInTheDocument()
      expect(screen.getByText('Transition Type')).toBeInTheDocument()
      expect(screen.getByText('Transition Duration')).toBeInTheDocument()
    })

    it('should toggle auto-mixing when switch is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to auto-mix tab
      const autoMixTab = screen.getByText('Auto-Mix')
      await user.click(autoMixTab)
      
      // Toggle auto-mixing
      const autoMixSwitch = screen.getByLabelText('Enable Auto-Mixing')
      await user.click(autoMixSwitch)
      
      expect(autoMixSwitch).toBeChecked()
    })

    it('should change mixing strategy when select is changed', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to auto-mix tab
      const autoMixTab = screen.getByText('Auto-Mix')
      await user.click(autoMixTab)
      
      // Change mixing strategy
      const strategySelect = screen.getByRole('combobox')
      await user.click(strategySelect)
      
      const harmonicOption = screen.getByText('Harmonic Mixing')
      await user.click(harmonicOption)
      
      expect(strategySelect).toHaveTextContent('Harmonic Mixing')
    })

    it('should adjust transition duration when slider is changed', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to auto-mix tab
      const autoMixTab = screen.getByText('Auto-Mix')
      await user.click(autoMixTab)
      
      // Find and adjust transition duration slider
      const durationSlider = screen.getByLabelText(/Transition Duration/)
      fireEvent.change(durationSlider, { target: { value: '6000' } })
      
      await waitFor(() => {
        expect(screen.getByText('Transition Duration: 6s')).toBeInTheDocument()
      })
    })
  })

  describe('Visualizer Tab', () => {
    it('should render visualizer controls when visualizer tab is clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const visualizerTab = screen.getByText('Visualizer')
      await user.click(visualizerTab)
      
      expect(screen.getByText('Audio Visualization')).toBeInTheDocument()
      expect(screen.getByText('Waveform')).toBeInTheDocument()
      expect(screen.getByText('Spectrum')).toBeInTheDocument()
      expect(screen.getByText('Phase Meter')).toBeInTheDocument()
    })

    it('should toggle visualization switches when clicked', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to visualizer tab
      const visualizerTab = screen.getByText('Visualizer')
      await user.click(visualizerTab)
      
      // Toggle waveform
      const waveformSwitch = screen.getByLabelText('Waveform')
      await user.click(waveformSwitch)
      
      expect(waveformSwitch).toBeChecked()
    })

    it('should display waveform when enabled', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to visualizer tab
      const visualizerTab = screen.getByText('Visualizer')
      await user.click(visualizerTab)
      
      // Enable waveform
      const waveformSwitch = screen.getByLabelText('Waveform')
      await user.click(waveformSwitch)
      
      // Check if waveform visualization is rendered
      expect(screen.getByText('Waveform')).toBeInTheDocument()
    })

    it('should display spectrum when enabled', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Switch to visualizer tab
      const visualizerTab = screen.getByText('Visualizer')
      await user.click(visualizerTab)
      
      // Enable spectrum
      const spectrumSwitch = screen.getByLabelText('Spectrum')
      await user.click(spectrumSwitch)
      
      // Check if spectrum visualization is rendered
      expect(screen.getByText('Frequency Spectrum')).toBeInTheDocument()
    })
  })

  describe('Audio Visualization', () => {
    it('should render waveform visualizer with mock data', () => {
      render(<DJMixerInterface />)
      
      // Check if canvas elements are rendered
      const canvasElements = document.querySelectorAll('canvas')
      expect(canvasElements.length).toBeGreaterThan(0)
    })

    it('should update visualization data periodically', () => {
      render(<DJMixerInterface />)
      
      // Fast forward time to trigger data updates
      vi.advanceTimersByTime(100)
      
      // Check if canvas context methods were called
      expect(mockCanvasContext.clearRect).toHaveBeenCalled()
      expect(mockCanvasContext.beginPath).toHaveBeenCalled()
      expect(mockCanvasContext.stroke).toHaveBeenCalled()
    })
  })

  describe('Keyboard Controls', () => {
    it('should handle keyboard shortcuts for deck controls', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      // Test spacebar for play/pause
      await user.keyboard('{ }')
      
      // Test arrow keys for seeking
      await user.keyboard('{ArrowRight}')
      await user.keyboard('{ArrowLeft}')
      
      // Test volume controls
      await user.keyboard('{ArrowUp}')
      await user.keyboard('{ArrowDown}')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels on all controls', () => {
      render(<DJMixerInterface />)
      
      // Check for ARIA labels on buttons
      expect(screen.getByLabelText('Play')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Pause')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Volume')).toHaveAttribute('aria-label')
      expect(screen.getByLabelText('Crossfader')).toHaveAttribute('aria-label')
    })

    it('should support keyboard navigation', () => {
      render(<DJMixerInterface />)
      
      const playButton = screen.getByLabelText('Play')
      playButton.focus()
      expect(document.activeElement).toBe(playButton)
    })

    it('should have proper roles for interactive elements', () => {
      render(<DJMixerInterface />)
      
      expect(screen.getByRole('tablist')).toBeInTheDocument()
      expect(screen.getAllByRole('tab')).toHaveLength(4)
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
    })
  })

  describe('Performance', () => {
    it('should render efficiently', () => {
      const startTime = performance.now()
      
      render(<DJMixerInterface />)
      
      const endTime = performance.now()
      const renderTime = endTime - startTime
      
      expect(renderTime).toBeLessThan(100) // Should render within 100ms
    })

    it('should handle rapid state changes', async () => {
      const user = userEvent.setup()
      render(<DJMixerInterface />)
      
      const playButton = screen.getByLabelText('Play')
      const startTime = performance.now()
      
      // Rapid state changes
      for (let i = 0; i < 50; i++) {
        await user.click(playButton)
        vi.advanceTimersByTime(10)
      }
      
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      expect(totalTime).toBeLessThan(1000) // Should handle 50 clicks within 1 second
    })
  })
})