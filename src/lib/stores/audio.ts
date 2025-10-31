import { create } from 'zustand';
import type { Song } from '@/components/ui/audio-player';
import { usePreferencesStore } from './preferences';
import { toast } from 'sonner';
import type { DJSession, DJQueueItem, DJRecommendation } from '@/lib/services/dj-service';
import type { DJTransition, DJMixerConfig } from '@/lib/services/dj-mixer';
import { startDJSession, endDJSession, addToDJQueue, removeFromDJQueue, getDJRecommendations, setAutoMixing, autoMixNext, completeTransition } from '@/lib/services/dj-service';

// Client-side helper functions (moved from ai-dj.ts to avoid server imports)
function checkQueueThreshold(
  currentSongIndex: number,
  playlistLength: number,
  threshold: number
): boolean {
  const remainingSongs = playlistLength - currentSongIndex - 1;
  return remainingSongs <= threshold;
}

function checkCooldown(lastQueueTime: number, cooldownMs: number = 30000): boolean {
  return Date.now() - lastQueueTime >= cooldownMs;
}

interface AudioState {
  playlist: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffled: boolean;
  originalPlaylist: Song[]; // Store original playlist order when shuffling
  // AI DJ state (Story 3.9)
  aiDJEnabled: boolean;
  aiDJLastQueueTime: number;
  aiQueuedSongIds: Set<string>;
  aiDJIsLoading: boolean;
  aiDJError: string | null;
  // Track recently recommended songs for diversity
  aiDJRecentlyRecommended: Array<{songId: string; timestamp: number; artist?: string}>;
  // Flag to prevent auto-refresh during user actions
  aiDJUserActionInProgress: boolean;
  // DJ mixing state
  djSession: DJSession | null;
  djQueue: DJQueueItem[];
  isAutoMixing: boolean;
  isTransitioning: boolean;
  currentTransition: DJTransition | null;
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
  // Undo state for clear queue
  lastClearedQueue: {
    songs: Song[];
    timestamp: number;
  } | null;

  setPlaylist: (songs: Song[]) => void;
  playSong: (songId: string, newPlaylist?: Song[]) => void;
  playNow: (songId: string, song: Song) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (dur: number) => void;
  setVolume: (vol: number) => void;
  nextSong: () => void;
  previousSong: () => void;
  clearPlaylist: () => void;
  addPlaylist: (songs: Song[]) => void;
  addPlaylistToQueue: (songs: Song[], replaceQueue?: boolean) => void;
  addToQueueNext: (songs: Song[]) => void;
  addToQueueEnd: (songs: Song[]) => void;
  getUpcomingQueue: () => Song[];
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  undoClearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleShuffle: () => void;
  shufflePlaylist: () => void;
  unshufflePlaylist: () => void;
  // AI DJ actions (Story 3.9)
  setAIDJEnabled: (enabled: boolean) => void;
  monitorQueueForAIDJ: () => Promise<void>;
  setAIUserActionInProgress: (inProgress: boolean) => void;
  // DJ mixing actions
  startDJSession: (name: string, config?: DJMixerConfig) => DJSession;
  endDJSession: () => DJSession | null;
  addToDJQueue: (song: Song, position?: number, isAutoQueued?: boolean) => Promise<DJQueueItem>;
  removeFromDJQueue: (position: number) => DJQueueItem | null;
  getDJRecommendations: (candidateSongs: Song[], options?: {
    maxResults?: number;
    minCompatibility?: number;
  }) => Promise<DJRecommendation[]>;
  setAutoMixing: (enabled: boolean) => void;
  autoMixNext: () => Promise<DJTransition | null>;
  completeTransition: () => void;
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
}

export const useAudioStore = create<AudioState>()(
  (set, get): AudioState => ({
    playlist: [],
    currentSongIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    isShuffled: false,
    originalPlaylist: [],
    // AI DJ initial state (Story 3.9)
    aiDJEnabled: false,
    aiDJLastQueueTime: 0,
    aiQueuedSongIds: new Set<string>(),
    aiDJIsLoading: false,
    aiDJError: null,
    aiDJRecentlyRecommended: [],
    aiDJUserActionInProgress: false,
    // DJ mixing initial state
    djSession: null,
    djQueue: [],
    isAutoMixing: false,
    isTransitioning: false,
    currentTransition: null,
    crossfadeEnabled: true,
    crossfadeDuration: 8.0,
    lastClearedQueue: null,

    setAIUserActionInProgress: (inProgress: boolean) => set({ aiDJUserActionInProgress: inProgress }),

    setPlaylist: (songs: Song[]) => set({
      playlist: songs,
      currentSongIndex: 0,
      isShuffled: false,
      originalPlaylist: []
    }),

    playSong: (songId: string, newPlaylist?: Song[]) => {
      const state = get();
      let playlist: Song[] = newPlaylist || state.playlist;
      let index = playlist.findIndex((song: Song) => song.id === songId);

      if (index === -1) {
        // If newPlaylist provided, use it
        if (newPlaylist) {
          playlist = newPlaylist;
          index = playlist.findIndex((song: Song) => song.id === songId);
        }

        // If still not found, try to find in existing playlist
        if (index === -1) {
          const foundSong = state.playlist.find((s: Song) => s.id === songId);
          if (foundSong) {
            playlist = [foundSong];
            index = 0;
          } else {
            // Song not found anywhere, don't change state
            console.warn('Song not found:', songId);
            return;
          }
        }
      }

      set({
        playlist,
        currentSongIndex: index,
        isPlaying: true,
      });
    },

    playNow: (songId: string, song: Song) => {
      const state = get();
      // Set user action flag to prevent AI DJ auto-refresh
      set({ aiDJUserActionInProgress: true });
      
      if (state.playlist.length === 0 || state.currentSongIndex === -1) {
        // No existing playlist, just play the song
        set({ 
          playlist: [song], 
          currentSongIndex: 0, 
          isPlaying: true,
          isShuffled: false,
          originalPlaylist: []
        });
      } else {
        // Replace the currently playing song with the new song
        // but keep the entire rest of the queue intact
        const newPlaylist = [
          ...state.playlist.slice(0, state.currentSongIndex), // Keep songs before current
          song, // New song to play now
          ...state.playlist.slice(state.currentSongIndex + 1) // Keep songs after current
        ];
        
        // Preserve shuffle state - if playlist was shuffled, keep it shuffled
        // and update the original playlist to reflect the change
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          // Update original playlist to replace the current song there
          const updatedOriginalPlaylist = [...state.originalPlaylist];
          const originalCurrentSongIndex = updatedOriginalPlaylist.findIndex(s => s.id === state.playlist[state.currentSongIndex]?.id);
          if (originalCurrentSongIndex !== -1) {
            updatedOriginalPlaylist[originalCurrentSongIndex] = song;
          }
          
          set({ 
            playlist: newPlaylist, 
            currentSongIndex: state.currentSongIndex, // Stay at the same position
            isPlaying: true,
            isShuffled: true, // Keep shuffle enabled
            originalPlaylist: updatedOriginalPlaylist // Update original playlist
          });
        } else {
          // Not shuffled, just replace normally
          set({ 
            playlist: newPlaylist, 
            currentSongIndex: state.currentSongIndex, // Stay at the same position
            isPlaying: true,
            isShuffled: false,
            originalPlaylist: []
          });
        }
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        set({ aiDJUserActionInProgress: false });
      }, 2000);
    },

    setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

    setCurrentTime: (time: number) => set({ currentTime: time }),

    setDuration: (dur: number) => set({ duration: dur }),

    setVolume: (vol: number) => set({ volume: vol }),

    nextSong: () => {
      const state = get();
      if (state.playlist.length === 0) return;
      const newIndex = (state.currentSongIndex + 1) % state.playlist.length;
      set({ currentSongIndex: newIndex });

      // Trigger AI DJ monitoring when song changes (but not on initial load or manual skips)
      if (state.aiDJEnabled && state.currentSongIndex > 0) {
        // Use setTimeout to avoid blocking the song change
        setTimeout(() => {
          get().monitorQueueForAIDJ().catch(error => {
            console.error('AI DJ monitoring error after nextSong:', error);
          });
        }, 100);
      }
    },

    previousSong: () => {
      const state = get();
      if (state.playlist.length === 0) return;
      const newIndex = (state.currentSongIndex - 1 + state.playlist.length) % state.playlist.length;
      set({ currentSongIndex: newIndex });
    },

    clearPlaylist: () => set({
      playlist: [],
      currentSongIndex: -1,
      isPlaying: false,
      isShuffled: false,
      originalPlaylist: []
    }),
    addPlaylist: (songs: Song[]) => {
      set({
        playlist: songs,
        currentSongIndex: 0,
        isPlaying: true,
        isShuffled: false,
        originalPlaylist: []
      });
    },
    addPlaylistToQueue: (songs: Song[], replaceQueue: boolean = false) => {
      const state = get();
      if (replaceQueue) {
        // Replace entire queue with new playlist
        set({
          playlist: songs,
          currentSongIndex: 0,
          isPlaying: true,
          isShuffled: false,
          originalPlaylist: []
        });
      } else {
        // Append to existing queue
        const newPlaylist = [...state.playlist, ...songs];
        set({ playlist: newPlaylist });
        // If nothing was playing, start playing the first new song
        if (state.currentSongIndex === -1 && songs.length > 0) {
          set({ currentSongIndex: state.playlist.length, isPlaying: true });
        }
      }
    },

    // Add songs right after the currently playing song
    addToQueueNext: (songs: Song[]) => {
      const state = get();
      // Set user action flag to prevent AI DJ auto-refresh
      set({ aiDJUserActionInProgress: true });
      
      if (state.playlist.length === 0 || state.currentSongIndex === -1) {
        // No playlist exists, just set it
        set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
      } else {
        // Insert songs after current song
        const newPlaylist = [
          ...state.playlist.slice(0, state.currentSongIndex + 1),
          ...songs,
          ...state.playlist.slice(state.currentSongIndex + 1),
        ];
        set({ playlist: newPlaylist });
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        set({ aiDJUserActionInProgress: false });
      }, 2000);
    },

    // Add songs to the end of the queue
    addToQueueEnd: (songs: Song[]) => {
      const state = get();
      // Set user action flag to prevent AI DJ auto-refresh
      set({ aiDJUserActionInProgress: true });
      
      if (state.playlist.length === 0 || state.currentSongIndex === -1) {
        // No playlist exists, just set it
        set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
      } else {
        // Append to end
        const newPlaylist = [...state.playlist, ...songs];
        set({ playlist: newPlaylist });
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        set({ aiDJUserActionInProgress: false });
      }, 2000);
    },

    // Get the upcoming queue (songs after current)
    getUpcomingQueue: () => {
      const state = get();
      if (state.currentSongIndex === -1 || state.currentSongIndex >= state.playlist.length - 1) {
        return [];
      }
      return state.playlist.slice(state.currentSongIndex + 1);
    },

    // Remove a song from the queue by index
    removeFromQueue: (index: number) => {
      const state = get();
      if (index < 0 || index >= state.playlist.length) return;

      const newPlaylist = state.playlist.filter((_, i) => i !== index);
      let newIndex = state.currentSongIndex;

      // Adjust current index if needed
      if (index < state.currentSongIndex) {
        newIndex--;
      } else if (index === state.currentSongIndex) {
        // If removing current song, keep index but song will change
        newIndex = Math.min(newIndex, newPlaylist.length - 1);
      }

      set({
        playlist: newPlaylist,
        currentSongIndex: newPlaylist.length === 0 ? -1 : newIndex,
        isPlaying: newPlaylist.length === 0 ? false : state.isPlaying,
      });
    },

    // Clear everything after the current song
    clearQueue: () => {
      const state = get();
      const upcomingSongs = state.getUpcomingQueue();
      
      // Save the cleared queue for undo (only if there are songs to clear)
      if (upcomingSongs.length > 0) {
        set({
          lastClearedQueue: {
            songs: upcomingSongs,
            timestamp: Date.now(),
          }
        });
      }
      
      if (state.currentSongIndex === -1) {
        set({ playlist: [], currentSongIndex: -1, isPlaying: false });
      } else {
        const currentSong = state.playlist[state.currentSongIndex];
        set({ playlist: currentSong ? [currentSong] : [], currentSongIndex: currentSong ? 0 : -1 });
      }
    },

    // Undo the last clear queue operation
    undoClearQueue: () => {
      const state = get();
      
      if (!state.lastClearedQueue) {
        console.warn('No cleared queue to undo');
        return;
      }
      
      // Check if the undo is within 5 minutes (300 seconds)
      const timeSinceClear = (Date.now() - state.lastClearedQueue.timestamp) / 1000;
      if (timeSinceClear > 300) {
        console.warn('Undo window expired (5 minutes)');
        set({ lastClearedQueue: null });
        return;
      }
      
      // Restore the cleared songs to the queue
      const currentSong = state.currentSongIndex >= 0 ? state.playlist[state.currentSongIndex] : null;
      const newPlaylist = currentSong 
        ? [currentSong, ...state.lastClearedQueue.songs]
        : state.lastClearedQueue.songs;
      
      set({
        playlist: newPlaylist,
        currentSongIndex: currentSong ? 0 : -1,
        lastClearedQueue: null, // Clear the undo state after use
      });
      
      toast.success('Queue restored', {
        description: `Restored ${state.lastClearedQueue.songs.length} songs to your queue`,
      });
    },

    // Reorder songs in the queue
    reorderQueue: (fromIndex: number, toIndex: number) => {
      const state = get();

      if (fromIndex < 0 || fromIndex >= state.playlist.length || toIndex < 0 || toIndex >= state.playlist.length) {
        return;
      }

      if (fromIndex === toIndex) return;

      const newPlaylist = [...state.playlist];
      const [movedSong] = newPlaylist.splice(fromIndex, 1);
      newPlaylist.splice(toIndex, 0, movedSong);

      // Adjust current index if needed
      let newCurrentIndex = state.currentSongIndex;

      if (fromIndex === state.currentSongIndex) {
        // The current song is being moved
        newCurrentIndex = toIndex;
      } else if (fromIndex < state.currentSongIndex && toIndex >= state.currentSongIndex) {
        // A song before current was moved to after current
        newCurrentIndex--;
      } else if (fromIndex > state.currentSongIndex && toIndex <= state.currentSongIndex) {
        // A song after current was moved to before current
        newCurrentIndex++;
      }

      set({ playlist: newPlaylist, currentSongIndex: newCurrentIndex });
    },

    // Shuffle functionality
    toggleShuffle: () => {
      const state = get();
      if (state.isShuffled) {
        get().unshufflePlaylist();
      } else {
        get().shufflePlaylist();
      }
    },

    shufflePlaylist: () => {
      const state = get();
      if (state.playlist.length <= 1) return;

      // Store current song and original playlist if not already stored
      const currentSong = state.playlist[state.currentSongIndex];
      const originalPlaylist = state.originalPlaylist.length > 0 ? state.originalPlaylist : [...state.playlist];

      // Create a shuffled copy of the playlist (excluding current song)
      const otherSongs = state.playlist.filter((_, index) => index !== state.currentSongIndex);
      const shuffledOthers = [...otherSongs].sort(() => Math.random() - 0.5);

      // Create new playlist with current song at the beginning
      const newPlaylist = currentSong ? [currentSong, ...shuffledOthers] : shuffledOthers;

      set({
        playlist: newPlaylist,
        currentSongIndex: currentSong ? 0 : -1,
        isShuffled: true,
        originalPlaylist: originalPlaylist
      });
    },

    unshufflePlaylist: () => {
      const state = get();
      if (state.originalPlaylist.length === 0) return;

      // Find the current song in the original playlist
      const currentSong = state.playlist[state.currentSongIndex];
      const currentSongIndexInOriginal = state.originalPlaylist.findIndex(song => song.id === currentSong?.id);

      set({
        playlist: state.originalPlaylist,
        currentSongIndex: currentSongIndexInOriginal,
        isShuffled: false,
        originalPlaylist: []
      });
    },

    // AI DJ actions (Story 3.9)
    setAIDJEnabled: (enabled: boolean) => {
      set({ aiDJEnabled: enabled, aiDJError: null });

      // Also update preferences to keep them in sync
      usePreferencesStore.getState().setRecommendationSettings({ aiDJEnabled: enabled })
        .catch(error => {
          console.error('Failed to sync AI DJ setting to preferences:', error);
        });

      // If enabled, trigger monitoring
      if (enabled) {
        const state = get();
        state.monitorQueueForAIDJ().catch(error => {
          console.error('AI DJ monitoring error:', error);
        });
      }
    },

    monitorQueueForAIDJ: async () => {
      const state = get();

      // Safety checks
      if (!state.aiDJEnabled) {
        console.log('🎵 AI DJ: Disabled, skipping monitoring');
        return;
      }

      if (state.aiDJIsLoading) {
        console.log('🎵 AI DJ: Already loading recommendations, skipping');
        return;
      }

      // Skip if user is manually adding songs or giving feedback
      if (state.aiDJUserActionInProgress) {
        console.log('🎵 AI DJ: User action in progress, skipping monitoring');
        return;
      }

      // Get preferences
      const preferencesState = usePreferencesStore.getState();
      const { recommendationSettings } = preferencesState.preferences;

      // Check if AI is globally disabled
      if (!recommendationSettings.aiEnabled) {
        console.log('🎵 AI DJ: Global AI disabled, skipping');
        return;
      }

      // Check if AI DJ is enabled in preferences
      if (!recommendationSettings.aiDJEnabled) {
        console.log('🎵 AI DJ: AI DJ disabled in preferences, skipping');
        return;
      }

      // Check queue threshold - provide fallback if undefined
      const threshold = recommendationSettings.aiDJQueueThreshold ?? 2;
      const needsRefill = checkQueueThreshold(
        state.currentSongIndex,
        state.playlist.length,
        threshold
      );

      if (!needsRefill) {
        // Removed console.log to prevent visual flashing during state changes
        return;
      }

      // Check cooldown
      if (!checkCooldown(state.aiDJLastQueueTime)) {
        const remaining = Math.ceil((30000 - (Date.now() - state.aiDJLastQueueTime)) / 1000);
        console.log(`🎵 AI DJ: Cooldown active, ${remaining}s remaining`);
        return;
      }

      // All checks passed, fetch recommendations
      console.log('🎵 AI DJ: Queue needs refill, fetching recommendations...');
      set({ aiDJIsLoading: true, aiDJError: null });

      try {
        const currentSong = state.playlist[state.currentSongIndex];
        if (!currentSong) {
          console.warn('🎵 AI DJ: No current song, skipping');
          set({ aiDJIsLoading: false });
          return;
        }

        // Build context from current song and recent queue
        const recentQueue = state.playlist.slice(
          Math.max(0, state.currentSongIndex - 5),
          state.currentSongIndex
        );

        // Get recently recommended songs to avoid duplicates
        const recentlyRecommended = state.aiDJRecentlyRecommended
          .filter(rec => Date.now() - rec.timestamp < 14400000) // Increased from 2 hours to 4 hours
          .map(rec => rec.songId);
        
        // Also exclude recently played songs for more variety
        const recentlyPlayed = state.playlist.slice(
          Math.max(0, state.currentSongIndex - 20), // Increased from 15 to 20
          state.currentSongIndex + 5 // Include upcoming songs too
        ).map(song => song.id);

        // Get recently recommended artists to avoid for diversity
        const recentlyRecommendedArtists = new Set(
          state.aiDJRecentlyRecommended
            .filter(rec => Date.now() - rec.timestamp < 28800000) // Increased from 4 hours to 8 hours
            .map(rec => rec.artist?.toLowerCase())
            .filter(Boolean)
        );
        
        // Add specific problematic artists to exclusion list
        const problemArtists = ['earl sweatshirt', 'ghb'];
        problemArtists.forEach(artist => {
          recentlyRecommendedArtists.add(artist);
        });

        // Combine all exclusions
        const allExclusions = [...new Set([...recentlyRecommended, ...recentlyPlayed])];

        // Call API endpoint to generate recommendations (server-side only)
        const response = await fetch('/api/ai-dj/recommendations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            currentSong,
            recentQueue,
            fullPlaylist: state.playlist,
            currentSongIndex: state.currentSongIndex,
            batchSize: recommendationSettings.aiDJBatchSize,
            useFeedbackForPersonalization: recommendationSettings.useFeedbackForPersonalization,
            excludeSongIds: allExclusions,
            excludeArtists: Array.from(recentlyRecommendedArtists), // Pass excluded artists to API
            skipAutoRefresh: true, // Add flag to prevent auto-refresh loops
          }),
        });

        if (!response.ok) {
          // Handle 409 Conflict (duplicate feedback) gracefully
          if (response.status === 409) {
            await response.json(); // Consume the response body
            console.log('✓ Feedback already exists, continuing with recommendations');
            // Don't throw an error for 409, just log and continue
          } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch AI DJ recommendations');
          }
        }

        const { recommendations, skipAutoRefresh } = await response.json();

        if (recommendations.length === 0) {
          console.warn('🎵 AI DJ: No recommendations generated');
          const errorMsg = 'No recommendations available';
          set({
            aiDJIsLoading: false,
            aiDJError: errorMsg,
          });
          toast.error('AI DJ Error', {
            description: errorMsg,
          });
          return;
        }

        // Add recommendations to queue
        const newPlaylist = [...state.playlist, ...recommendations];
        const newQueuedIds = new Set(state.aiQueuedSongIds);
        const now = Date.now();
        
        // Track newly recommended songs with artist info
        const newRecentlyRecommended = [...state.aiDJRecentlyRecommended];
        recommendations.forEach((song: Song) => {
          newQueuedIds.add(song.id);
          newRecentlyRecommended.push({
            songId: song.id,
            timestamp: now,
            artist: song.artist // Track artist for diversity enforcement
          });
        });

        // Clean up old recommendations (older than 8 hours)
        const cleanedRecentlyRecommended = newRecentlyRecommended.filter(
          rec => now - rec.timestamp < 28800000
        );

        // Check if we need to start playback (empty queue case)
        const shouldStartPlayback = state.playlist.length === 0 || state.currentSongIndex === -1;

        set({
          playlist: newPlaylist,
          currentSongIndex: shouldStartPlayback ? 0 : state.currentSongIndex,
          isPlaying: shouldStartPlayback ? true : state.isPlaying,
          aiDJLastQueueTime: now,
          aiQueuedSongIds: newQueuedIds,
          aiDJRecentlyRecommended: cleanedRecentlyRecommended,
          aiDJIsLoading: false,
          aiDJError: null,
        });

        // Only show toast if this wasn't an auto-refresh that should be silent
        if (!skipAutoRefresh) {
          console.log(`✅ AI DJ: Added ${recommendations.length} songs to queue`);
          toast.success(`✨ AI DJ added ${recommendations.length} ${recommendations.length === 1 ? 'song' : 'songs'} to your queue`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'AI DJ failed to generate recommendations';
        console.error('🎵 AI DJ Error:', errorMessage);
        set({
          aiDJIsLoading: false,
          aiDJError: errorMessage,
        });
        toast.error('AI DJ Error', {
          description: errorMessage,
          action: {
            label: 'Retry',
            onClick: () => {
              // Reset error and retry
              set({ aiDJError: null });
              get().monitorQueueForAIDJ().catch(err => {
                console.error('AI DJ retry failed:', err);
              });
            },
          },
        });
      }
    },

    // DJ mixing actions
    startDJSession: (name: string, config?: DJMixerConfig) => {
      const session = startDJSession(name, config);
      set({ djSession: session, djQueue: [] });
      console.log(`🎧 DJ Session "${name}" started`);
      return session;
    },

    endDJSession: () => {
      const session = endDJSession();
      set({ djSession: null, djQueue: [], isAutoMixing: false, isTransitioning: false, currentTransition: null });
      console.log(`🎧 DJ Session ended`);
      return session;
    },

    addToDJQueue: async (song: Song, position?: number, isAutoQueued: boolean = false) => {
      const state = get();
      if (!state.djSession) {
        throw new Error('No active DJ session');
      }
      
      const queueItem = await addToDJQueue(song, position, isAutoQueued);
      set({ djQueue: [...state.djQueue, queueItem] });
      return queueItem;
    },

    removeFromDJQueue: (position: number) => {
      const state = get();
      if (!state.djSession) return null;
      
      const removedItem = removeFromDJQueue(position);
      if (removedItem) {
        set({ djQueue: state.djQueue.filter((_, index) => index !== position) });
      }
      return removedItem;
    },

    getDJRecommendations: async (candidateSongs: Song[], options?: {
      maxResults?: number;
      minCompatibility?: number;
    }) => {
      const state = get();
      if (!state.djSession) {
        throw new Error('No active DJ session');
      }
      
      return await getDJRecommendations(candidateSongs, options);
    },

    setAutoMixing: (enabled: boolean) => {
      setAutoMixing(enabled);
      set({ isAutoMixing: enabled });
    },

    autoMixNext: async () => {
      const state = get();
      if (!state.isAutoMixing || !state.djSession) return null;
      
      const transition = await autoMixNext();
      if (transition) {
        set({ isTransitioning: true, currentTransition: transition });
      }
      return transition;
    },

    completeTransition: () => {
      completeTransition();
      set({ isTransitioning: false, currentTransition: null });
    },

    setCrossfadeEnabled: (enabled: boolean) => {
      set({ crossfadeEnabled: enabled });
    },

    setCrossfadeDuration: (duration: number) => {
      set({ crossfadeDuration: duration });
    },
  })
);
