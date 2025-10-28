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
  // AI DJ state (Story 3.9)
  aiDJEnabled: boolean;
  aiDJLastQueueTime: number;
  aiQueuedSongIds: Set<string>;
  aiDJIsLoading: boolean;
  aiDJError: string | null;
  // DJ mixing state
  djSession: DJSession | null;
  djQueue: DJQueueItem[];
  isAutoMixing: boolean;
  isTransitioning: boolean;
  currentTransition: DJTransition | null;
  crossfadeEnabled: boolean;
  crossfadeDuration: number;

  setPlaylist: (songs: Song[]) => void;
  playSong: (songId: string, newPlaylist?: Song[]) => void;
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
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  // AI DJ actions (Story 3.9)
  setAIDJEnabled: (enabled: boolean) => void;
  monitorQueueForAIDJ: () => Promise<void>;
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
    // AI DJ initial state (Story 3.9)
    aiDJEnabled: false,
    aiDJLastQueueTime: 0,
    aiQueuedSongIds: new Set<string>(),
    aiDJIsLoading: false,
    aiDJError: null,
    // DJ mixing initial state
    djSession: null,
    djQueue: [],
    isAutoMixing: false,
    isTransitioning: false,
    currentTransition: null,
    crossfadeEnabled: true,
    crossfadeDuration: 8.0,

    setPlaylist: (songs: Song[]) => set({ playlist: songs, currentSongIndex: 0 }),

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

    setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

    setCurrentTime: (time: number) => set({ currentTime: time }),

    setDuration: (dur: number) => set({ duration: dur }),

    setVolume: (vol: number) => set({ volume: vol }),

    nextSong: () => {
      const state = get();
      if (state.playlist.length === 0) return;
      const newIndex = (state.currentSongIndex + 1) % state.playlist.length;
      set({ currentSongIndex: newIndex });

      // Trigger AI DJ monitoring when song changes
      if (state.aiDJEnabled) {
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

    clearPlaylist: () => set({ playlist: [], currentSongIndex: -1, isPlaying: false }),
    addPlaylist: (songs: Song[]) => {
      set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
    },
    addPlaylistToQueue: (songs: Song[], replaceQueue: boolean = false) => {
      const state = get();
      if (replaceQueue) {
        // Replace entire queue with new playlist
        set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
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
    },

    // Add songs to the end of the queue
    addToQueueEnd: (songs: Song[]) => {
      const state = get();
      if (state.playlist.length === 0 || state.currentSongIndex === -1) {
        // No playlist exists, just set it
        set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
      } else {
        // Append to end
        const newPlaylist = [...state.playlist, ...songs];
        set({ playlist: newPlaylist });
      }
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
      if (state.currentSongIndex === -1) {
        set({ playlist: [], currentSongIndex: -1, isPlaying: false });
      } else {
        const currentSong = state.playlist[state.currentSongIndex];
        set({ playlist: currentSong ? [currentSong] : [], currentSongIndex: currentSong ? 0 : -1 });
      }
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
            batchSize: recommendationSettings.aiDJBatchSize,
            useFeedbackForPersonalization: recommendationSettings.useFeedbackForPersonalization,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch AI DJ recommendations');
        }

        const { recommendations } = await response.json();

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
        recommendations.forEach((song: Song) => newQueuedIds.add(song.id));

        // Check if we need to start playback (empty queue case)
        const shouldStartPlayback = state.playlist.length === 0 || state.currentSongIndex === -1;

        set({
          playlist: newPlaylist,
          currentSongIndex: shouldStartPlayback ? 0 : state.currentSongIndex,
          isPlaying: shouldStartPlayback ? true : state.isPlaying,
          aiDJLastQueueTime: Date.now(),
          aiQueuedSongIds: newQueuedIds,
          aiDJIsLoading: false,
          aiDJError: null,
        });

        console.log(`✅ AI DJ: Added ${recommendations.length} songs to queue`);
        toast.success(`✨ AI DJ added ${recommendations.length} ${recommendations.length === 1 ? 'song' : 'songs'} to your queue`);
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