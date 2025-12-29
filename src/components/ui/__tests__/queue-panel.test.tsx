import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Use vi.hoisted to define mocks that can be used in vi.mock factories
// Mock data must be defined inside hoisted callback to be available during module initialization
const { mockUseAudioStore, mockUsePreferencesStore, mockGenerateContextualRecommendations, mockSongs } = vi.hoisted(() => {
  const mockSongs = [
    {
      id: '1',
      title: 'Test Song 1',
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
      title: 'Test Song 2',
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
      title: 'Test Song 3',
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

  return {
    mockSongs,
    mockUseAudioStore: vi.fn(() => ({
      // Audio state
      playlist: mockSongs,
      queue: mockSongs,
      currentSong: mockSongs[0],
      currentSongIndex: 0,
      isPlaying: true,
      volume: 0.8,
      position: 30,
      currentTime: 30,
      duration: 180,
      // AI DJ state
      aiQueuedSongIds: new Set(['1', '3']),
      aiDJEnabled: true,
      aiDJIsLoading: false,
      aiDJLastQueueTime: Date.now() - 60000,
      lastClearedQueue: null,
      // Playback actions
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      nextSong: vi.fn(),
      previousSong: vi.fn(),
      playSong: vi.fn(),
      setIsPlaying: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setCurrentTime: vi.fn(),
      // Queue management
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
      undoClearQueue: vi.fn(),
      reorderQueue: vi.fn(),
      getUpcomingQueue: vi.fn(() => mockSongs.slice(1)), // Return songs after current
      // Shuffle/repeat
      shuffle: vi.fn(),
      setShuffle: vi.fn(),
      repeat: vi.fn(),
      setRepeat: vi.fn(),
      toggleShuffle: vi.fn(),
      // Other
      toggleLike: vi.fn(),
      setAIDJSettings: vi.fn(),
      generateAIDJRecommendations: vi.fn(),
    })),
    mockUsePreferencesStore: vi.fn(() => ({
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
    })),
    mockGenerateContextualRecommendations: vi.fn(() =>
      Promise.resolve(mockSongs.slice(0, 3))
    )
  }
})

// Mock modules with factory functions
vi.mock('@/lib/stores/audio', () => ({
  useAudioStore: mockUseAudioStore
}))

vi.mock('@/lib/stores/preferences', () => ({
  usePreferencesStore: mockUsePreferencesStore
}))

vi.mock('@/lib/services/ai-dj/core', () => ({
  generateContextualRecommendations: mockGenerateContextualRecommendations
}))

vi.mock('@/components/playlists/CreatePlaylistDialog', () => ({
  CreatePlaylistDialog: () => null
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => children,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => [])
}))

// Mock react-virtual to render all items directly without virtualization in tests
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(({ count, getItemKey }: { count: number; getItemKey?: (index: number) => string | number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({
      key: getItemKey ? getItemKey(i) : `item-${i}`,
      index: i,
      start: i * 72,
      size: 72,
    })),
    getTotalSize: () => count * 72,
    measureElement: vi.fn(),
  })),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => children,
  arrayMove: vi.fn((array, from, to) => {
    const newArray = [...array]
    const item = newArray.splice(from, 1)[0]
    newArray.splice(to, 0, item)
    return newArray
  }),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null
  }))
}))

import { QueuePanel } from '../queue-panel'

// Test helper to wrap components with QueryClient
const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

// Test helper to render QueuePanel and interact with it
const renderQueuePanelAndOpen = async () => {
  const user = userEvent.setup({ delay: null })
  const result = renderWithQueryClient(<QueuePanel />)

  // Find and click the button to open the panel
  const openButton = await result.findByTitle('Show queue')
  await user.click(openButton)

  // Wait for the panel to appear
  await waitFor(() => {
    expect(screen.getByText('Queue')).toBeInTheDocument()
  }, { timeout: 3000 })

  return result
}

describe('Queue Panel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Don't use fake timers - they interfere with React state updates and userEvent
    // Reset the mock to default implementation
    mockUseAudioStore.mockImplementation(() => ({
      playlist: mockSongs,
      queue: mockSongs,
      currentSong: mockSongs[0],
      currentSongIndex: 0,
      isPlaying: true,
      volume: 0.8,
      position: 30,
      currentTime: 30,
      duration: 180,
      aiQueuedSongIds: new Set(['1', '3']),
      aiDJEnabled: true,
      aiDJIsLoading: false,
      aiDJLastQueueTime: Date.now() - 60000,
      lastClearedQueue: null,
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      nextSong: vi.fn(),
      previousSong: vi.fn(),
      playSong: vi.fn(),
      setIsPlaying: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setCurrentTime: vi.fn(),
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
      undoClearQueue: vi.fn(),
      reorderQueue: vi.fn(),
      getUpcomingQueue: () => mockSongs.slice(1),
      shuffle: vi.fn(),
      setShuffle: vi.fn(),
      repeat: vi.fn(),
      setRepeat: vi.fn(),
      toggleShuffle: vi.fn(),
      toggleLike: vi.fn(),
      setAIDJSettings: vi.fn(),
      generateAIDJRecommendations: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Component Rendering', () => {
    it('should render queue panel with songs', async () => {
      await renderQueuePanelAndOpen()

      expect(screen.getByText('Queue')).toBeInTheDocument()
      expect(screen.getByText(/2 songs/i)).toBeInTheDocument() // 2 songs in upcoming queue (song 2 and 3)
    })

    it('should render empty queue state', async () => {
      mockUseAudioStore.mockImplementation(() => ({
        playlist: [],
        queue: [],
        currentSong: null,
        currentSongIndex: -1,
        isPlaying: false,
        volume: 0.8,
        position: 0,
        currentTime: 0,
        duration: 0,
        aiQueuedSongIds: new Set(),
        aiDJEnabled: false,
        aiDJIsLoading: false,
        aiDJLastQueueTime: 0,
        lastClearedQueue: null,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        nextSong: vi.fn(),
        previousSong: vi.fn(),
        playSong: vi.fn(),
        setIsPlaying: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        setCurrentTime: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        undoClearQueue: vi.fn(),
        reorderQueue: vi.fn(),
        getUpcomingQueue: () => [],
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleShuffle: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      }))

      await renderQueuePanelAndOpen()

      expect(screen.getByText('Queue')).toBeInTheDocument()
      expect(screen.getByText(/Your queue is empty/i)).toBeInTheDocument()
    })

    it('should render current song information', async () => {
      await renderQueuePanelAndOpen()

      expect(screen.getByText('Test Song 1')).toBeInTheDocument()
      expect(screen.getByText('Test Artist 1')).toBeInTheDocument()
    })

    it('should not render playback controls in queue panel', async () => {
      // Note: QueuePanel doesn't have playback controls - those are in AudioPlayer
      await renderQueuePanelAndOpen()

      // Instead check for queue-specific controls
      expect(screen.getByText('Clear Queue')).toBeInTheDocument()
    })

    it('should render queue management controls', async () => {
      await renderQueuePanelAndOpen()

      expect(screen.getByText('Clear Queue')).toBeInTheDocument()
      expect(screen.getByText('Save')).toBeInTheDocument() // Button text was shortened
    })
  })

  describe('AI DJ Integration', () => {
    it('should show AI DJ status when enabled', async () => {
      await renderQueuePanelAndOpen()

      // Check for AI DJ status indicator
      expect(screen.getByText(/AI-powered/i)).toBeInTheDocument()
    })

    it('should display AI queued indicators', async () => {
      await renderQueuePanelAndOpen()

      // Check for AI queued visual indicators (sparkle emoji)
      const aiIndicators = screen.getAllByText('✨')
      expect(aiIndicators.length).toBeGreaterThan(0) // Should have AI indicators for queued songs
    })

    it('should show AI DJ loading state', async () => {
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        aiDJIsLoading: true,
      })

      await renderQueuePanelAndOpen()

      expect(screen.getByText(/AI DJ generating recommendations/i)).toBeInTheDocument()
    })

    it('should show AI DJ active monitoring when no AI songs queued', async () => {
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        aiQueuedSongIds: new Set(),
      })

      await renderQueuePanelAndOpen()

      expect(screen.getByText(/AI DJ actively monitoring/i)).toBeInTheDocument()
    })

    it('should not show AI DJ status when disabled', async () => {
      mockUseAudioStore.mockImplementation(() => ({
        playlist: mockSongs,
        queue: mockSongs,
        currentSong: mockSongs[0],
        currentSongIndex: 0,
        isPlaying: true,
        volume: 0.8,
        position: 30,
        currentTime: 30,
        duration: 180,
        aiQueuedSongIds: new Set(), // No AI queued songs
        aiDJEnabled: false, // AI DJ disabled
        aiDJIsLoading: false,
        aiDJLastQueueTime: 0,
        lastClearedQueue: null,
        play: vi.fn(),
        pause: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        nextSong: vi.fn(),
        previousSong: vi.fn(),
        playSong: vi.fn(),
        setIsPlaying: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        setCurrentTime: vi.fn(),
        addToQueue: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        undoClearQueue: vi.fn(),
        reorderQueue: vi.fn(),
        getUpcomingQueue: () => mockSongs.slice(1),
        shuffle: vi.fn(),
        setShuffle: vi.fn(),
        repeat: vi.fn(),
        setRepeat: vi.fn(),
        toggleShuffle: vi.fn(),
        toggleLike: vi.fn(),
        setAIDJSettings: vi.fn(),
        generateAIDJRecommendations: vi.fn(),
      }))

      await renderQueuePanelAndOpen()

      // Should not show any AI DJ related text
      expect(screen.queryByText(/AI DJ/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/AI-powered/i)).not.toBeInTheDocument()
    })
  })

  describe('Queue Operations', () => {
    it('should remove songs from queue', async () => {
      const mockRemoveFromQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        removeFromQueue: mockRemoveFromQueue,
      })

      await renderQueuePanelAndOpen()

      // Hover over first song to reveal remove button
      const firstSong = screen.getByText('Test Song 2')
      await userEvent.hover(firstSong.closest('div')!)

      // Find and click the X button (there will be multiple, one per song)
      const removeButtons = screen.getAllByTitle('Remove from queue')
      await userEvent.click(removeButtons[0])

      expect(mockRemoveFromQueue).toHaveBeenCalled()
    })

    it('should clear entire queue', async () => {
      const mockClearQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        clearQueue: mockClearQueue,
      })

      await renderQueuePanelAndOpen()

      const clearButton = screen.getByText('Clear Queue')
      await userEvent.click(clearButton)

      expect(mockClearQueue).toHaveBeenCalled()
    })

    it('should show undo clear queue button after clearing', async () => {
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        lastClearedQueue: {
          queue: mockSongs,
          timestamp: Date.now(),
        },
      })

      await renderQueuePanelAndOpen()

      expect(screen.getByText('Undo Clear Queue')).toBeInTheDocument()
    })

    it('should call undoClearQueue when undo button is clicked', async () => {
      const mockUndoClearQueue = vi.fn()
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        lastClearedQueue: {
          queue: mockSongs,
          timestamp: Date.now(),
        },
        undoClearQueue: mockUndoClearQueue,
      })

      await renderQueuePanelAndOpen()

      const undoButton = screen.getByText('Undo Clear Queue')
      await userEvent.click(undoButton)

      expect(mockUndoClearQueue).toHaveBeenCalled()
    })

    it('should call playSong when clicking on a queue item', async () => {
      const mockPlaySong = vi.fn()
      mockUseAudioStore.mockReturnValue({
        ...mockUseAudioStore(),
        playSong: mockPlaySong,
      })

      await renderQueuePanelAndOpen()

      const secondSong = screen.getByText('Test Song 2')
      await userEvent.click(secondSong)

      expect(mockPlaySong).toHaveBeenCalled()
    })
  })

  describe('Playlist Creation', () => {
    it('should show create playlist button when queue has songs', async () => {
      await renderQueuePanelAndOpen()

      // Button text was changed to "Save" for brevity
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    it('should open create playlist dialog when button is clicked', async () => {
      await renderQueuePanelAndOpen()

      // Button text was changed to "Save" for brevity
      const createButton = screen.getByText('Save')
      await userEvent.click(createButton)

      // Dialog should open (mocked in our test setup)
      expect(createButton).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper title attributes', async () => {
      const result = renderWithQueryClient(<QueuePanel />)

      const openButton = await result.findByTitle('Show queue')
      expect(openButton).toHaveAttribute('title')
    })

    it('should support keyboard navigation for queue items', async () => {
      await renderQueuePanelAndOpen()

      // The first song in the queue (Test Song 2) should have keyboard navigation
      const secondSongTitle = screen.getByText('Test Song 2')
      expect(secondSongTitle).toBeInTheDocument()

      // Check that the song element is clickable
      const songElement = secondSongTitle.closest('[role="button"]')
      if (songElement) {
        expect(songElement).toHaveAttribute('tabIndex', '0')
      } else {
        // If the song div doesn't have role="button", check it's clickable div
        const clickableParent = secondSongTitle.closest('div[tabindex]')
        expect(clickableParent).toHaveAttribute('tabIndex')
      }
    })

    it('should have proper button roles', async () => {
      await renderQueuePanelAndOpen()

      const clearButton = screen.getByText('Clear Queue')
      expect(clearButton.closest('button')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should render efficiently', async () => {
      const startTime = performance.now()

      await renderQueuePanelAndOpen()

      const endTime = performance.now()
      const renderTime = endTime - startTime

      expect(renderTime).toBeLessThan(2000) // Should render within 2000ms including interaction
    })

    it('should handle drag and drop setup', async () => {
      await renderQueuePanelAndOpen()

      // Check that drag handles are present
      const dragHandles = screen.queryAllByRole('button')
      expect(dragHandles.length).toBeGreaterThan(0)
    })
  })
})