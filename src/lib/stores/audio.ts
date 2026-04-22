import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Song } from '@/lib/types/song';
import { fromSyncSong } from '@/lib/types/sync';
import type { PlaybackStateResponse } from '@/lib/types/sync';
import { getDeviceInfo } from '@/lib/utils/device';
import { usePreferencesStore } from './preferences';
import { toast } from '@/lib/toast';
import { shuffleSongs } from '@/lib/utils/shuffle-scoring';
import type { SeededRadioSeed, ArtistVariety } from '@/lib/services/seeded-radio';

// Any non-additive queue replacement clears radio-session state. Spread into
// the `set(...)` call of every action that swaps out the playlist wholesale.
const RADIO_RESET = {
  isRadioSession: false,
  radioSeed: null as SeededRadioSeed | null,
  radioVariety: 'medium' as ArtistVariety,
} as const;

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
  repeatMode: 'off' | 'all' | 'one';
  // AI DJ state (Story 3.9)
  aiDJEnabled: boolean;
  aiDJLastQueueTime: number;
  aiQueuedSongIds: Set<string>;
  aiDJIsLoading: boolean;
  aiDJError: string | null;
  // Track recently recommended songs for diversity
  aiDJRecentlyRecommended: Array<{songId: string; timestamp: number; artist?: string}>;
  // Phase 1.2: Track artist counts across batches to prevent exhaustion
  aiDJArtistBatchCounts: Map<string, {count: number; lastQueued: number}>;
  // Phase 4.1: Track artists on fatigue cooldown (artist -> cooldown end timestamp)
  aiDJArtistFatigueCooldowns: Map<string, number>;
  // Flag to prevent auto-refresh during user actions
  aiDJUserActionInProgress: boolean;
  // Drip-feed recommendation model: add 1 rec every N songs played
  songsPlayedSinceLastRec: number;
  // Crossfade settings
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
  // Undo state for clear queue
  lastClearedQueue: {
    songs: Song[];
    timestamp: number;
  } | null;
  // Queue panel visibility
  queuePanelOpen: boolean;
  // Recently played songs for "fewer repeats" shuffle mode (Spotify-style)
  recentlyPlayedIds: string[];
  // Skip counts for shuffle deprioritization (songId → count, persisted)
  skipCounts: Record<string, number>;
  // AI DJ adaptive state (transient — NOT persisted, reset on rehydrate)
  aiDJConsecutiveSkips: number;
  aiDJSessionGenreCounts: Record<string, number>;
  aiDJRecommendationReasons: Record<string, string>;
  // Autoplay queueing state
  autoplayEnabled: boolean;
  autoplayBlendMode: 'crossfade' | 'silence' | 'reverb_tail';
  autoplayTransitionDuration: number;
  autoplaySmartTransitions: boolean;
  autoplayIsLoading: boolean;
  autoplayTransitionActive: boolean;
  autoplayLastQueueTime: number;
  autoplayQueuedSongIds: Set<string>;
  // WiFi reconnect recovery state
  wasPlayingBeforeUnload: boolean; // Persisted - captures playback intent before page unload
  pendingPlaybackResume: boolean; // Transient - signals that playback should resume after rehydration
  // Cross-device sync timestamps (per-field conflict resolution)
  queueUpdatedAt: string;
  positionUpdatedAt: string;
  playStateUpdatedAt: string;
  // Remote device indicator (set when another device is active)
  remoteDevice: {
    deviceId: string | null;
    deviceName: string | null;
    isPlaying: boolean;
    songName?: string | null;
    artist?: string | null;
    currentPositionMs?: number;
    durationMs?: number;
    updatedAt?: number;
  } | null;
  // Last known playback position/duration — updated by setCurrentTime/setDuration,
  // read by nextSong for skip detection. Avoids reading stale state.currentTime
  // which may already be reset to 0 by loadSong on rapid skips.
  lastKnownPosition: number;
  lastKnownDuration: number;
  // Transient: timestamp of most recent user-initiated pause (self-expiring guard for stall recovery)
  _userPauseAt: number;
  // Transient: timestamp of most recent AudioContext interrupt (iOS state bounce guard)
  _lastAudioContextInterrupt: number;
  // Transient: snapshots persisted currentTime during rehydration before effects can overwrite it
  _rehydratedCurrentTime: number;
  // Transient: radio session play counter for profile refresh trigger (Story 9.3)
  radioSessionPlayCount: number;
  isRadioSession: boolean;
  // Seeded radio (non-persisted): the seed and variety used for the current session
  radioSeed: SeededRadioSeed | null;
  radioVariety: ArtistVariety;

  setPlaylist: (songs: Song[]) => void;
  playSong: (songId: string, newPlaylist?: Song[]) => void;
  playNow: (songId: string, song: Song) => void;
  markUserPause: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (dur: number) => void;
  setVolume: (vol: number) => void;
  nextSong: (userSkip?: boolean) => void;
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
  toggleRepeat: () => void;
  shufflePlaylist: () => void;
  // AI DJ actions (Story 3.9)
  setAIDJEnabled: (enabled: boolean) => void;
  monitorQueueForAIDJ: () => Promise<void>;
  setAIUserActionInProgress: (inProgress: boolean) => void;
  // Nudge mode - "more like this" for current song (Story 3.9 enhancement)
  nudgeMoreLikeThis: () => Promise<void>;
  // Queue seeding - inject recommendations throughout existing queue
  seedQueueWithRecommendations: () => Promise<void>;
  // Crossfade actions
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  toggleQueuePanel: () => void;
  // Autoplay queueing actions
  setAutoplayEnabled: (enabled: boolean) => void;
  setAutoplayBlendMode: (mode: 'crossfade' | 'silence' | 'reverb_tail') => void;
  setAutoplayTransitionDuration: (duration: number) => void;
  setAutoplaySmartTransitions: (enabled: boolean) => void;
  triggerAutoplayQueueing: () => Promise<void>;
  setAutoplayTransitionActive: (active: boolean) => void;
  skipAutoplayedSong: (songId: string) => void;
  // WiFi reconnect recovery actions
  setWasPlayingBeforeUnload: (value: boolean) => void;
  // Cross-device sync actions
  applyServerState: (server: PlaybackStateResponse) => void;
  setRemoteDevice: (device: AudioState['remoteDevice']) => void;
  // Radio session actions (Story 9.3)
  incrementRadioPlayCount: () => void;
  setIsRadioSession: (isRadio: boolean) => void;
  // Seeded radio
  startRadio: (seed: SeededRadioSeed, variety?: ArtistVariety) => Promise<void>;
  saveRadioAsPlaylist: (name: string) => Promise<{ playlistId: string; name: string } | null>;
}

export const useAudioStore = create<AudioState>()(
  persist(
  (set, get): AudioState => ({
    playlist: [],
    currentSongIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    isShuffled: false,
    repeatMode: 'off',
    // AI DJ initial state (Story 3.9)
    aiDJEnabled: false,
    aiDJLastQueueTime: 0,
    aiQueuedSongIds: new Set<string>(),
    aiDJIsLoading: false,
    aiDJError: null,
    aiDJRecentlyRecommended: [],
    aiDJArtistBatchCounts: new Map<string, {count: number; lastQueued: number}>(),
    aiDJArtistFatigueCooldowns: new Map<string, number>(),
    aiDJUserActionInProgress: false,
    // Drip-feed recommendation model
    songsPlayedSinceLastRec: 0,
    // Crossfade initial state (default 0 = opt-in, user sets via Settings > Playback)
    crossfadeEnabled: true,
    crossfadeDuration: 0,
    lastClearedQueue: null,
    queuePanelOpen: false,
    recentlyPlayedIds: [],
    skipCounts: {},
    aiDJConsecutiveSkips: 0,
    aiDJSessionGenreCounts: {},
    aiDJRecommendationReasons: {},
    // Autoplay queueing initial state
    autoplayEnabled: false,
    autoplayBlendMode: 'crossfade',
    autoplayTransitionDuration: 4,
    autoplaySmartTransitions: true,
    autoplayIsLoading: false,
    autoplayTransitionActive: false,
    autoplayLastQueueTime: 0,
    autoplayQueuedSongIds: new Set<string>(),
    // WiFi reconnect recovery initial state
    wasPlayingBeforeUnload: false,
    pendingPlaybackResume: false,
    // Cross-device sync initial state — empty strings so server state always
    // wins on fresh load (these are not persisted to localStorage)
    queueUpdatedAt: '',
    positionUpdatedAt: '',
    playStateUpdatedAt: '',
    remoteDevice: null,
    lastKnownPosition: 0,
    lastKnownDuration: 0,
    _userPauseAt: 0,
    _lastAudioContextInterrupt: 0,
    _rehydratedCurrentTime: 0,
    radioSessionPlayCount: 0,
    isRadioSession: false,
    radioSeed: null,
    radioVariety: 'medium',

    setAIUserActionInProgress: (inProgress: boolean) => set({ aiDJUserActionInProgress: inProgress }),

    setPlaylist: (songs: Song[]) => set({
      playlist: songs,
      currentSongIndex: 0,
      isShuffled: false,
      ...RADIO_RESET,
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

      // playSong may be handed a fresh playlist (full replacement) or a
      // single-song fallback — both cases wipe radio state. If the existing
      // queue is kept, radio continues (handled implicitly: state.playlist is
      // reused and RADIO_RESET is not applied).
      const replacing = playlist !== state.playlist;
      set({
        playlist,
        currentSongIndex: index,
        isPlaying: true,
        ...(replacing ? RADIO_RESET : {}),
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
          ...RADIO_RESET,
        });
      } else {
        // Replace the currently playing song with the new song
        // but keep the entire rest of the queue intact
        const newPlaylist = [
          ...state.playlist.slice(0, state.currentSongIndex),
          song,
          ...state.playlist.slice(state.currentSongIndex + 1)
        ];

        set({
          playlist: newPlaylist,
          currentSongIndex: state.currentSongIndex,
          isPlaying: true,
        });
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        set({ aiDJUserActionInProgress: false });
      }, 2000);
    },

    markUserPause: () => set({ _userPauseAt: Date.now() }),

    setIsPlaying: (playing: boolean) => set({ isPlaying: playing, wasPlayingBeforeUnload: playing }),

    setCurrentTime: (time: number) => set({ currentTime: time, lastKnownPosition: time }),

    setDuration: (dur: number) => set({ duration: dur, lastKnownDuration: dur }),

    setVolume: (vol: number) => set({ volume: vol }),

    nextSong: (userSkip?: boolean) => {
      const state = get();
      if (state.playlist.length === 0) return;

      // Track the current song as recently played (for "fewer repeats" shuffle)
      const currentSong = state.playlist[state.currentSongIndex];
      const updates: Partial<AudioState> = {};

      if (currentSong) {
        const MAX_RECENT = 200;
        updates.recentlyPlayedIds = [
          currentSong.id,
          ...state.recentlyPlayedIds.filter(id => id !== currentSong.id)
        ].slice(0, MAX_RECENT);

        // --- Skip detection ---
        // Use lastKnownPosition/Duration instead of state.currentTime/duration
        // because loadSong may have already reset currentTime to 0 on rapid skips.
        const pos = state.lastKnownPosition;
        const dur = state.lastKnownDuration;
        // A skip = user listened >5s but <30% of song duration
        const isSkip = pos > 5 && dur > 0 && pos / dur < 0.3;
        // A listen-through = user heard ≥80% of the song
        const isListenThrough = dur > 0 && pos / dur >= 0.8;

        if (isSkip) {
          // Increment global skip count (persisted)
          const newSkipCounts = { ...state.skipCounts };
          newSkipCounts[currentSong.id] = (newSkipCounts[currentSong.id] || 0) + 1;
          updates.skipCounts = newSkipCounts;

          // AI DJ adaptive feedback: track consecutive skips of AI recs
          if (state.aiQueuedSongIds.has(currentSong.id)) {
            updates.aiDJConsecutiveSkips = state.aiDJConsecutiveSkips + 1;
            // Fire-and-forget negative feedback
            fetch('/api/recommendations/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                songId: currentSong.id,
                songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
                feedbackType: 'thumbs_down',
                source: 'ai_dj_skip',
              }),
            }).catch(() => {});
          }
        }

        if (isListenThrough && state.aiQueuedSongIds.has(currentSong.id)) {
          // Reset consecutive skip counter — user liked this rec
          updates.aiDJConsecutiveSkips = 0;
          // Fire-and-forget positive feedback
          fetch('/api/recommendations/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              songId: currentSong.id,
              songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
              feedbackType: 'thumbs_up',
              source: 'ai_dj_listen_through',
            }),
          }).catch(() => {});

          // Track genre for session genre counts
          if (currentSong.genre) {
            const genre = currentSong.genre.toLowerCase();
            const newGenreCounts = { ...state.aiDJSessionGenreCounts };
            newGenreCounts[genre] = (newGenreCounts[genre] || 0) + 1;
            updates.aiDJSessionGenreCounts = newGenreCounts;
          }
        }
      }

      // Repeat-one: stay on the same song (reset position to retrigger playback)
      // But allow user-initiated skips to advance normally
      if (state.repeatMode === 'one' && !userSkip) {
        set({
          ...updates,
          currentTime: 0,
          lastKnownPosition: 0,
          lastKnownDuration: 0,
        });
        return;
      }

      const nextIndex = state.currentSongIndex + 1;

      // Drip-feed model: increment songs played counter when AI DJ is enabled
      updates.songsPlayedSinceLastRec = state.aiDJEnabled ? state.songsPlayedSinceLastRec + 1 : state.songsPlayedSinceLastRec;

      // Radio session: increment play counter for profile refresh trigger (Story 9.3)
      if (state.isRadioSession) {
        updates.radioSessionPlayCount = state.radioSessionPlayCount + 1;
      }

      // Reset last-known position/duration so the next song starts fresh
      updates.lastKnownPosition = 0;
      updates.lastKnownDuration = 0;

      // End of queue
      if (nextIndex >= state.playlist.length) {
        if (state.repeatMode === 'all' || state.isShuffled) {
          // Repeat-all or shuffle: wrap around (reshuffle if needed)
          if (state.isShuffled) {
            const reshuffled = shuffleSongs([...state.playlist]);
            set({
              ...updates,
              playlist: reshuffled,
              currentSongIndex: 0,
              isPlaying: true,
            });
          } else {
            set({
              ...updates,
              currentSongIndex: 0,
              isPlaying: true,
            });
          }
        } else {
          // No repeat: stop at end
          set({
            ...updates,
            currentSongIndex: 0,
            isPlaying: false,
          });
        }
      } else {
        set({
          ...updates,
          currentSongIndex: nextIndex,
        });
      }

      // Trigger AI DJ monitoring when song changes (but not on initial load or manual skips)
      if (state.aiDJEnabled && state.currentSongIndex > 0) {
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

    }),
    addPlaylist: (songs: Song[]) => {
      set({
        playlist: songs,
        currentSongIndex: 0,
        isPlaying: true,
        isShuffled: false,
        ...RADIO_RESET,
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
          ...RADIO_RESET,
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

    // Get the upcoming queue (songs after current, or all songs if nothing playing)
    getUpcomingQueue: () => {
      const state = get();
      // If nothing is playing, show entire playlist as upcoming
      if (state.currentSongIndex === -1) {
        return state.playlist;
      }
      // If on last song, no upcoming songs
      if (state.currentSongIndex >= state.playlist.length - 1) {
        return [];
      }
      return state.playlist.slice(state.currentSongIndex + 1);
    },

    // Remove a song from the queue by index
    removeFromQueue: (index: number) => {
      const state = get();
      if (index < 0 || index >= state.playlist.length) return;

      // Clean up recommendation reasons for the removed song
      const removedSong = state.playlist[index];
      let newReasons = state.aiDJRecommendationReasons;
      if (removedSong && removedSong.id in state.aiDJRecommendationReasons) {
        newReasons = { ...state.aiDJRecommendationReasons };
        delete newReasons[removedSong.id];
      }

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
        aiDJRecommendationReasons: newReasons,
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
        // Turn off shuffle — keep current order, just clear the flag
        set({ isShuffled: false });
      } else {
        get().shufflePlaylist();
      }
    },

    toggleRepeat: () => {
      const state = get();
      const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
      const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
      set({ repeatMode: modes[nextIndex] });
    },

    shufflePlaylist: () => {
      const state = get();
      const upcomingCount = state.playlist.length - state.currentSongIndex - 1;
      if (upcomingCount <= 1) return;

      const currentSong = state.playlist[state.currentSongIndex];
      const upcomingSongs = state.playlist.slice(state.currentSongIndex + 1);
      const shuffledUpcoming = shuffleSongs([...upcomingSongs]);
      const newPlaylist = currentSong ? [currentSong, ...shuffledUpcoming] : shuffledUpcoming;

      set({
        playlist: newPlaylist,
        currentSongIndex: currentSong ? 0 : -1,
        isShuffled: true,
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

      // If enabled, trigger monitoring and potentially seeding
      if (enabled) {
        const state = get();

        // Check if queue seeding is enabled
        const { recommendationSettings } = usePreferencesStore.getState().preferences;
        if (recommendationSettings.aiDJSeedQueueEnabled) {
          // Seed the queue with recommendations throughout
          console.log('🌱 AI DJ enabled with seeding - seeding queue');
          state.seedQueueWithRecommendations().catch(error => {
            console.error('Queue seeding error:', error);
          });
        }

        // Also run normal monitoring
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

      // Drip-feed model: add 1 recommendation every N songs played
      // Dynamic interval based on consecutive AI rec skips
      const baseDripInterval = recommendationSettings.aiDJDripInterval ?? 3;
      let dripInterval = baseDripInterval;
      const consecutiveSkips = state.aiDJConsecutiveSkips;
      if (consecutiveSkips >= 5) {
        dripInterval = baseDripInterval * 3;
        // Only toast once when reaching this threshold
        if (consecutiveSkips === 5) {
          toast.info('AI DJ is backing off', {
            description: 'Try adjusting your preferences in Settings',
          });
        }
      } else if (consecutiveSkips >= 3) {
        dripInterval = baseDripInterval * 2;
      }

      // Check if we've played enough songs to add a recommendation
      // Also check if queue is nearly empty (fallback to old threshold behavior)
      const threshold = recommendationSettings.aiDJQueueThreshold ?? 2;
      const needsRefillByThreshold = checkQueueThreshold(
        state.currentSongIndex,
        state.playlist.length,
        threshold
      );
      const needsRefillByDrip = state.songsPlayedSinceLastRec >= dripInterval;

      if (!needsRefillByThreshold && !needsRefillByDrip) {
        // Neither drip interval reached nor queue low
        return;
      }

      // Check cooldown (reduced from 30s to 10s for drip-feed model)
      if (!checkCooldown(state.aiDJLastQueueTime, 10000)) {
        const remaining = Math.ceil((10000 - (Date.now() - state.aiDJLastQueueTime)) / 1000);
        console.log(`🎵 AI DJ: Cooldown active, ${remaining}s remaining`);
        return;
      }

      // Determine if this is a drip-feed trigger or threshold trigger
      const isDripTrigger = needsRefillByDrip && !needsRefillByThreshold;

      // All checks passed, fetch recommendations
      console.log(`🎵 AI DJ: ${isDripTrigger ? 'Drip interval reached' : 'Queue needs refill'}, fetching recommendation...`);
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
            .filter(rec => Date.now() - rec.timestamp < 28800000) // 8 hour cooldown
            .map(rec => rec.artist?.toLowerCase())
            .filter(Boolean)
        );
        // Note: User-specific artist blocklist is loaded server-side in the recommendations API
        // using the artist-blocklist service for consistent filtering

        // Get artists already in the upcoming queue to prevent concentration
        // Look ahead at the next N songs to avoid recommending artists already queued
        const upcomingSlice = state.playlist.slice(
          state.currentSongIndex + 1,
          state.currentSongIndex + 11 // Next 10 songs
        );
        const upcomingArtistCounts = new Map<string, number>();
        for (const song of upcomingSlice) {
          if (song.artist) {
            const key = song.artist.toLowerCase();
            upcomingArtistCounts.set(key, (upcomingArtistCounts.get(key) || 0) + 1);
          }
        }
        // Exclude artists that already appear in upcoming queue
        const upcomingArtists = Array.from(upcomingArtistCounts.keys());

        // Combine all exclusions
        const allExclusions = [...new Set([...recentlyRecommended, ...recentlyPlayed])];

        // Phase 1.2: Convert artist batch counts to plain object for JSON serialization
        const artistBatchCounts: Record<string, number> = {};
        for (const [artist, data] of state.aiDJArtistBatchCounts.entries()) {
          artistBatchCounts[artist] = data.count;
        }

        // Phase 4.1: Clean up expired fatigue cooldowns and build exclude list
        const now = Date.now();
        const cleanedFatigueCooldowns = new Map(state.aiDJArtistFatigueCooldowns);
        const fatigueExcludedArtists: string[] = [];

        for (const [artist, cooldownEnd] of cleanedFatigueCooldowns.entries()) {
          if (cooldownEnd <= now) {
            // Cooldown expired, remove it
            cleanedFatigueCooldowns.delete(artist);
          } else {
            // Still on cooldown, exclude from recommendations
            fatigueExcludedArtists.push(artist);
          }
        }

        // Update state with cleaned cooldowns
        if (cleanedFatigueCooldowns.size !== state.aiDJArtistFatigueCooldowns.size) {
          set({ aiDJArtistFatigueCooldowns: cleanedFatigueCooldowns });
        }

        // Combine fatigue-excluded artists with recently recommended artists and upcoming queue artists
        const allExcludedArtists = Array.from(new Set([
          ...recentlyRecommendedArtists,
          ...fatigueExcludedArtists,
          ...upcomingArtists,
        ]));

        // Drip-feed model: request 1 song for drip triggers, batch size for threshold triggers
        const requestBatchSize = isDripTrigger ? 1 : (recommendationSettings.aiDJBatchSize ?? 3);

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
            batchSize: requestBatchSize,
            useFeedbackForPersonalization: recommendationSettings.useFeedbackForPersonalization,
            excludeSongIds: allExclusions,
            excludeArtists: allExcludedArtists, // Phase 4.1: Include fatigue-excluded artists
            artistBatchCounts, // Phase 1.2: Pass artist counts for cross-batch diversity
            genreExploration: recommendationSettings.aiDJGenreExploration ?? 50, // Phase 4.2: Genre exploration level
            skipAutoRefresh: isDripTrigger, // Silent for drip-feed, show toast for threshold
            // DJ matching settings for BPM/energy/key scoring
            djMatchingEnabled: recommendationSettings.djMatchingEnabled ?? true,
            djMatchingMinScore: recommendationSettings.djMatchingMinScore ?? 0.5,
            // Use profile-based recommendations for drip-feed
            useProfileBased: isDripTrigger,
            // Session genre counts for adaptive recommendations
            sessionGenreCounts: state.aiDJSessionGenreCounts,
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

        const { recommendations, skipAutoRefresh, artistFatigueCooldowns } = await response.json();

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

        // Re-read current state for playlist mutation — the user may have
        // skipped songs while the API call was in flight, so using the stale
        // `state` captured at the start would reset currentSongIndex and
        // insert at the wrong position.
        const freshState = get();

        // Add recommendations to queue
        // For drip-feed: insert RIGHT AFTER current song (plays next)
        // For threshold refill: append to end of queue
        let newPlaylist: Song[];
        if (isDripTrigger) {
          // Insert after current song position
          const insertIndex = freshState.currentSongIndex + 1;
          newPlaylist = [
            ...freshState.playlist.slice(0, insertIndex),
            ...recommendations,
            ...freshState.playlist.slice(insertIndex),
          ];
          console.log(`🎵 AI DJ: Drip recommendation inserted at position ${insertIndex} (plays next)`);
        } else {
          // Threshold refill - append to end
          newPlaylist = [...freshState.playlist, ...recommendations];
        }
        const newQueuedIds = new Set(freshState.aiQueuedSongIds);

        // Track newly recommended songs with artist info
        const newRecentlyRecommended = [...freshState.aiDJRecentlyRecommended];

        // Phase 1.2: Update artist batch counts to prevent exhaustion
        const newArtistBatchCounts = new Map(freshState.aiDJArtistBatchCounts);

        // Store recommendation reasons per song
        const newReasons = { ...freshState.aiDJRecommendationReasons };

        recommendations.forEach((song: Song & { reason?: string }) => {
          newQueuedIds.add(song.id);
          newRecentlyRecommended.push({
            songId: song.id,
            timestamp: now,
            artist: song.artist // Track artist for diversity enforcement
          });

          // Store reason for "Why this song?" tooltip (server provides reason strings)
          if (song.reason) {
            newReasons[song.id] = song.reason;
          } else {
            newReasons[song.id] = 'AI DJ recommendation';
          }

          // Phase 1.2: Track how many songs queued per artist
          if (song.artist) {
            const artistKey = song.artist.toLowerCase();
            const existing = newArtistBatchCounts.get(artistKey);
            newArtistBatchCounts.set(artistKey, {
              count: (existing?.count || 0) + 1,
              lastQueued: now
            });
          }
        });

        // Clean up old recommendations (older than 8 hours)
        const cleanedRecentlyRecommended = newRecentlyRecommended.filter(
          rec => now - rec.timestamp < 28800000
        );

        // Phase 1.2: Clean up artist counts older than 2 hours
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        for (const [artist, data] of newArtistBatchCounts.entries()) {
          if (now - data.lastQueued > TWO_HOURS_MS) {
            newArtistBatchCounts.delete(artist);
          }
        }

        // Phase 4.1: Update artist fatigue cooldowns from API response
        const newFatigueCooldowns = new Map(cleanedFatigueCooldowns);

        if (artistFatigueCooldowns) {
          // Merge new fatigue cooldowns from server
          for (const [artist, cooldownEnd] of Object.entries(artistFatigueCooldowns)) {
            if (typeof cooldownEnd === 'number' && cooldownEnd > now) {
              newFatigueCooldowns.set(artist.toLowerCase(), cooldownEnd);
            }
          }

          // Log any new artists added to cooldown
          const addedToCooldown = Object.keys(artistFatigueCooldowns).filter(
            artist => !cleanedFatigueCooldowns.has(artist.toLowerCase())
          );
          if (addedToCooldown.length > 0) {
            console.log(`⚠️ Artists added to fatigue cooldown: ${addedToCooldown.join(', ')}`);
          }
        }

        // Check if we need to start playback (empty queue case)
        const shouldStartPlayback = freshState.playlist.length === 0 || freshState.currentSongIndex === -1;

        set({
          playlist: newPlaylist,
          currentSongIndex: shouldStartPlayback ? 0 : freshState.currentSongIndex,
          isPlaying: shouldStartPlayback ? true : freshState.isPlaying,
          aiDJLastQueueTime: now,
          aiQueuedSongIds: newQueuedIds,
          aiDJRecentlyRecommended: cleanedRecentlyRecommended,
          aiDJArtistBatchCounts: newArtistBatchCounts, // Phase 1.2: Track artist diversity
          aiDJArtistFatigueCooldowns: newFatigueCooldowns, // Phase 4.1: Track artist fatigue
          aiDJRecommendationReasons: newReasons,
          aiDJIsLoading: false,
          aiDJError: null,
          songsPlayedSinceLastRec: 0, // Reset drip-feed counter after adding recommendations
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

    /**
     * Nudge Mode - "More like this" for current song
     *
     * This is the primary way users can steer the AI DJ's direction.
     * When a user nudges, it means "I like this - give me more similar songs!"
     *
     * Behavior:
     * 1. Records a "thumbs_up" feedback for the current song (learns preferences)
     * 2. Fetches similar songs using that song as the seed
     * 3. Inserts songs at RANDOM positions in the upcoming queue (not just at end)
     *    This creates a more natural "DJ" feel where recommendations blend in
     * 4. Bypasses normal AI DJ cooldown for instant response
     */
    nudgeMoreLikeThis: async () => {
      const state = get();

      if (state.aiDJIsLoading) {
        console.log('🎵 Nudge: Already loading, skipping');
        return;
      }

      const currentSong = state.playlist[state.currentSongIndex];
      if (!currentSong) {
        console.warn('🎵 Nudge: No current song');
        toast.error('No song playing', { description: 'Play a song first to get similar recommendations' });
        return;
      }

      console.log(`🎵 Nudge: Getting more songs like "${currentSong.artist} - ${currentSong.title || currentSong.name}"`);
      set({ aiDJIsLoading: true, aiDJError: null });

      try {
        // 1. Record the nudge as positive feedback to learn user preferences
        // This helps the AI DJ understand what the user likes
        try {
          await fetch('/api/recommendations/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              songId: currentSong.id,
              songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
              feedbackType: 'thumbs_up',
              source: 'nudge', // Special source to track nudge-based feedback
            }),
          });
          console.log('🎵 Nudge: Recorded positive feedback for learning');
        } catch (feedbackError) {
          // Don't fail the nudge if feedback recording fails
          console.warn('🎵 Nudge: Failed to record feedback (non-critical):', feedbackError);
        }

        // 2. Get preferences for batch size
        const preferencesState = usePreferencesStore.getState();
        const { recommendationSettings } = preferencesState.preferences;

        // Build exclusions list - ALL songs in queue (prevent duplicates)
        // This fixes the "duplicate key" React errors when same song is added twice
        const allPlaylistSongIds = state.playlist.map(song => song.id);

        const recentlyRecommended = state.aiDJRecentlyRecommended
          .filter(rec => Date.now() - rec.timestamp < 7200000) // 2 hour window
          .map(rec => rec.songId);

        const allExclusions = [...new Set([...recentlyRecommended, ...allPlaylistSongIds])];

        // Call API - use larger batch for nudge mode
        const batchSize = Math.max(recommendationSettings.aiDJBatchSize || 3, 5);

        const response = await fetch('/api/ai-dj/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            currentSong,
            batchSize,
            excludeSongIds: allExclusions,
            skipAutoRefresh: true, // User-initiated, show toast
            // DJ matching settings for BPM/energy/key scoring
            djMatchingEnabled: recommendationSettings.djMatchingEnabled ?? true,
            djMatchingMinScore: recommendationSettings.djMatchingMinScore ?? 0.5,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to get similar songs');
        }

        const { recommendations } = await response.json();

        if (recommendations.length === 0) {
          set({ aiDJIsLoading: false, aiDJError: 'No similar songs found' });
          toast.info('No similar songs found', {
            description: `Couldn't find more songs like "${currentSong.artist}"`
          });
          return;
        }

        // 3. Insert songs at RANDOM positions in the upcoming queue
        // This creates a more natural DJ feel where recommendations blend in
        const upcomingStart = state.currentSongIndex + 1;
        const upcomingLength = state.playlist.length - upcomingStart;

        // Create new playlist with songs inserted at random positions
        let newPlaylist = [...state.playlist];
        const newQueuedIds = new Set(state.aiQueuedSongIds);
        const now = Date.now();
        const newRecentlyRecommended = [...state.aiDJRecentlyRecommended];

        // Shuffle recommendations first for variety
        const shuffledRecs = [...recommendations].sort(() => Math.random() - 0.5);

        shuffledRecs.forEach((song: Song, i: number) => {
          // Calculate insertion position:
          // - First song: insert 1-3 positions after current (play soon)
          // - Other songs: spread randomly throughout upcoming queue
          let insertPos: number;

          if (i === 0 && upcomingLength > 0) {
            // First recommendation plays soon (within next 1-3 songs)
            insertPos = upcomingStart + Math.floor(Math.random() * Math.min(3, upcomingLength + 1));
          } else if (upcomingLength === 0) {
            // No upcoming songs, just append
            insertPos = newPlaylist.length;
          } else {
            // Spread other songs randomly in the upcoming queue
            const maxPos = newPlaylist.length;
            insertPos = upcomingStart + Math.floor(Math.random() * (maxPos - upcomingStart + 1));
          }

          // Insert song at calculated position
          newPlaylist = [
            ...newPlaylist.slice(0, insertPos),
            song,
            ...newPlaylist.slice(insertPos),
          ];

          // Track the song
          newQueuedIds.add(song.id);
          newRecentlyRecommended.push({
            songId: song.id,
            timestamp: now,
            artist: song.artist,
          });
        });

        // Clean up old recommendations
        const cleanedRecentlyRecommended = newRecentlyRecommended.filter(
          rec => now - rec.timestamp < 28800000 // 8 hours
        );

        set({
          playlist: newPlaylist,
          aiDJLastQueueTime: now,
          aiQueuedSongIds: newQueuedIds,
          aiDJRecentlyRecommended: cleanedRecentlyRecommended,
          aiDJIsLoading: false,
          aiDJError: null,
        });

        toast.success(`✨ Added ${recommendations.length} similar songs`, {
          description: `Blended into queue based on "${currentSong.artist}"`,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get similar songs';
        console.error('🎵 Nudge Error:', errorMessage);
        set({ aiDJIsLoading: false, aiDJError: errorMessage });
        toast.error('Nudge failed', { description: errorMessage });
      }
    },

    /**
     * Seed Queue with Recommendations
     *
     * Injects AI recommendations throughout the existing queue immediately.
     * Uses seed density setting to determine how many recommendations to add.
     * Applies DJ matching to find optimal insertion points.
     */
    seedQueueWithRecommendations: async () => {
      const state = get();

      if (state.aiDJIsLoading) {
        console.log('🌱 Seed Queue: Already loading, skipping');
        return;
      }

      const { recommendationSettings } = usePreferencesStore.getState().preferences;

      // Check if seeding is enabled
      if (!recommendationSettings.aiDJSeedQueueEnabled) {
        console.log('🌱 Seed Queue: Seeding disabled, skipping');
        return;
      }

      // Need at least a few songs in queue to seed
      const upcomingStart = state.currentSongIndex + 1;
      const upcomingSongs = state.playlist.slice(upcomingStart);

      if (upcomingSongs.length < 3) {
        console.log('🌱 Seed Queue: Not enough songs in queue to seed');
        toast.info('Queue too short', { description: 'Add more songs to enable queue seeding' });
        return;
      }

      console.log(`🌱 Seed Queue: Starting to seed ${upcomingSongs.length} upcoming songs`);
      set({ aiDJIsLoading: true, aiDJError: null });

      try {
        const density = recommendationSettings.aiDJSeedDensity ?? 2;
        const songsPerRecommendation = Math.floor(10 / density); // e.g., density 2 = every 5 songs

        // Collect seed points - songs we'll base recommendations on
        const seedPoints: { song: Song; insertAfterIndex: number }[] = [];

        for (let i = 0; i < upcomingSongs.length; i += songsPerRecommendation) {
          const song = upcomingSongs[i];
          if (song && !state.aiQueuedSongIds.has(song.id)) {
            seedPoints.push({
              song,
              insertAfterIndex: upcomingStart + i,
            });
          }
        }

        if (seedPoints.length === 0) {
          console.log('🌱 Seed Queue: No valid seed points found');
          set({ aiDJIsLoading: false });
          return;
        }

        console.log(`🌱 Seed Queue: Found ${seedPoints.length} seed points`);

        // Get exclusions
        const recentlyPlayed = state.playlist.slice(
          Math.max(0, state.currentSongIndex - 10),
          state.currentSongIndex + upcomingSongs.length
        ).map(s => s.id);

        const recentlyRecommended = state.aiDJRecentlyRecommended
          .filter(rec => Date.now() - rec.timestamp < 7200000)
          .map(rec => rec.songId);

        const allExclusions = [...new Set([...recentlyRecommended, ...recentlyPlayed])];

        // Fetch one recommendation per seed point
        const allRecommendations: { song: Song; insertAfterIndex: number }[] = [];

        for (const seedPoint of seedPoints) {
          try {
            const response = await fetch('/api/ai-dj/recommendations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                currentSong: seedPoint.song,
                batchSize: 1, // One recommendation per seed
                excludeSongIds: [...allExclusions, ...allRecommendations.map(r => r.song.id)],
                skipAutoRefresh: true,
                djMatchingEnabled: recommendationSettings.djMatchingEnabled ?? true,
                djMatchingMinScore: recommendationSettings.djMatchingMinScore ?? 0.5,
              }),
            });

            if (response.ok) {
              const { recommendations } = await response.json();
              if (recommendations && recommendations.length > 0) {
                allRecommendations.push({
                  song: recommendations[0],
                  insertAfterIndex: seedPoint.insertAfterIndex,
                });
              }
            }
          } catch (error) {
            console.warn(`🌱 Seed Queue: Failed to get recommendation for "${seedPoint.song.title}":`, error);
          }
        }

        if (allRecommendations.length === 0) {
          console.log('🌱 Seed Queue: No recommendations found');
          set({ aiDJIsLoading: false });
          toast.info('No recommendations found', { description: 'Try adding different songs to your queue' });
          return;
        }

        // Sort by insert index descending so we can insert without shifting issues
        allRecommendations.sort((a, b) => b.insertAfterIndex - a.insertAfterIndex);

        // Build new playlist with recommendations inserted
        const newPlaylist = [...state.playlist];
        const newQueuedIds = new Set(state.aiQueuedSongIds);
        const now = Date.now();
        const newRecentlyRecommended = [...state.aiDJRecentlyRecommended];

        for (const rec of allRecommendations) {
          // Account for previous insertions
          const adjustedIndex = rec.insertAfterIndex + 1;
          newPlaylist.splice(adjustedIndex, 0, rec.song);
          newQueuedIds.add(rec.song.id);
          newRecentlyRecommended.push({
            songId: rec.song.id,
            timestamp: now,
            artist: rec.song.artist,
          });
        }

        // Update original playlist if shuffled
        set({
          playlist: newPlaylist,
          aiDJLastQueueTime: now,
          aiQueuedSongIds: newQueuedIds,
          aiDJRecentlyRecommended: newRecentlyRecommended,
          aiDJIsLoading: false,
          aiDJError: null,
        });

        console.log(`🌱 Seed Queue: Successfully seeded ${allRecommendations.length} recommendations`);
        toast.success(`🌱 Seeded ${allRecommendations.length} AI recommendations`, {
          description: 'Recommendations have been scattered throughout your queue',
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to seed queue';
        console.error('🌱 Seed Queue Error:', errorMessage);
        set({ aiDJIsLoading: false, aiDJError: errorMessage });
        toast.error('Queue seeding failed', { description: errorMessage });
      }
    },

    setCrossfadeEnabled: (enabled: boolean) => {
      set({ crossfadeEnabled: enabled });
    },

    setCrossfadeDuration: (duration: number) => {
      set({ crossfadeDuration: duration });
    },

    toggleQueuePanel: () => {
      set(state => ({ queuePanelOpen: !state.queuePanelOpen }));
    },

    // Autoplay queueing actions
    setAutoplayEnabled: (enabled: boolean) => {
      set({ autoplayEnabled: enabled });

      // Sync to preferences store
      usePreferencesStore.getState().setRecommendationSettings({ autoplayEnabled: enabled })
        .catch(error => {
          console.error('Failed to sync autoplay setting to preferences:', error);
        });
    },

    setAutoplayBlendMode: (mode: 'crossfade' | 'silence' | 'reverb_tail') => {
      set({ autoplayBlendMode: mode });

      usePreferencesStore.getState().setRecommendationSettings({ autoplayBlendMode: mode })
        .catch(error => {
          console.error('Failed to sync autoplay blend mode to preferences:', error);
        });
    },

    setAutoplayTransitionDuration: (duration: number) => {
      set({ autoplayTransitionDuration: duration });

      usePreferencesStore.getState().setRecommendationSettings({ autoplayTransitionDuration: duration })
        .catch(error => {
          console.error('Failed to sync autoplay transition duration to preferences:', error);
        });
    },

    setAutoplaySmartTransitions: (enabled: boolean) => {
      set({ autoplaySmartTransitions: enabled });

      usePreferencesStore.getState().setRecommendationSettings({ autoplaySmartTransitions: enabled })
        .catch(error => {
          console.error('Failed to sync autoplay smart transitions to preferences:', error);
        });
    },

    setAutoplayTransitionActive: (active: boolean) => {
      set({ autoplayTransitionActive: active });
    },

    /**
     * Trigger autoplay queueing when playlist ends
     * Fetches recommended songs and adds them to the queue with smart transitions
     */
    triggerAutoplayQueueing: async () => {
      const state = get();

      // Safety checks
      if (!state.autoplayEnabled) {
        console.log('🎶 Autoplay: Disabled, skipping');
        return;
      }

      if (state.autoplayIsLoading) {
        console.log('🎶 Autoplay: Already loading, skipping');
        return;
      }

      // Check if we're on the last song
      const isLastSong = state.currentSongIndex === state.playlist.length - 1;
      if (!isLastSong) {
        console.log('🎶 Autoplay: Not on last song, skipping');
        return;
      }

      // Check cooldown (30 seconds)
      if (Date.now() - state.autoplayLastQueueTime < 30000) {
        console.log('🎶 Autoplay: Cooldown active, skipping');
        return;
      }

      const currentSong = state.playlist[state.currentSongIndex];
      if (!currentSong) {
        console.log('🎶 Autoplay: No current song, skipping');
        return;
      }

      console.log('🎶 Autoplay: Triggering queue refill...');
      set({ autoplayIsLoading: true });

      try {
        // Get preferences
        const preferencesState = usePreferencesStore.getState();
        const { recommendationSettings } = preferencesState.preferences;

        // Build exclusions list
        const recentlyPlayed = state.playlist.slice(
          Math.max(0, state.currentSongIndex - 20),
          state.currentSongIndex + 5
        ).map(song => song.id);

        const autoplayedRecently = Array.from(state.autoplayQueuedSongIds);
        const allExclusions = [...new Set([...recentlyPlayed, ...autoplayedRecently])];

        // Call AI DJ API for recommendations
        const batchSize = recommendationSettings.aiDJBatchSize || 5;
        const response = await fetch('/api/ai-dj/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            currentSong,
            batchSize,
            excludeSongIds: allExclusions,
            skipAutoRefresh: false,
            // DJ matching settings for BPM/energy/key scoring
            djMatchingEnabled: usePreferencesStore.getState().preferences.recommendationSettings.djMatchingEnabled ?? true,
            djMatchingMinScore: usePreferencesStore.getState().preferences.recommendationSettings.djMatchingMinScore ?? 0.5,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch autoplay recommendations');
        }

        const { recommendations } = await response.json();

        if (recommendations.length === 0) {
          console.log('🎶 Autoplay: No recommendations available');
          set({ autoplayIsLoading: false });
          return;
        }

        // Add recommendations to queue
        const newPlaylist = [...state.playlist, ...recommendations];
        const newQueuedIds = new Set(state.autoplayQueuedSongIds);
        const now = Date.now();

        recommendations.forEach((song: Song) => {
          newQueuedIds.add(song.id);
        });

        set({
          playlist: newPlaylist,
          autoplayLastQueueTime: now,
          autoplayQueuedSongIds: newQueuedIds,
          autoplayIsLoading: false,
        });

        console.log(`🎶 Autoplay: Added ${recommendations.length} songs to queue`);
        toast.success(`🎶 Autoplay added ${recommendations.length} ${recommendations.length === 1 ? 'song' : 'songs'}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Autoplay failed';
        console.error('🎶 Autoplay Error:', errorMessage);
        set({ autoplayIsLoading: false });
        toast.error('Autoplay Error', { description: errorMessage });
      }
    },

    /**
     * Skip (remove) an autoplayed song from the queue
     * Provides feedback that the user didn't want this recommendation
     */
    skipAutoplayedSong: (songId: string) => {
      const state = get();
      const songIndex = state.playlist.findIndex(s => s.id === songId);

      if (songIndex === -1) {
        console.warn('🎶 Autoplay: Song not found in playlist');
        return;
      }

      // Don't allow skipping the current song
      if (songIndex === state.currentSongIndex) {
        console.warn('🎶 Autoplay: Cannot skip current song');
        return;
      }

      // Remove the song from playlist
      const newPlaylist = state.playlist.filter((_, i) => i !== songIndex);
      let newIndex = state.currentSongIndex;

      // Adjust current index if needed
      if (songIndex < state.currentSongIndex) {
        newIndex--;
      }

      // Record negative feedback for the skipped song
      const skippedSong = state.playlist[songIndex];
      if (skippedSong) {
        fetch('/api/recommendations/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            songId: skippedSong.id,
            songArtistTitle: `${skippedSong.artist || 'Unknown'} - ${skippedSong.title || skippedSong.name}`,
            feedbackType: 'thumbs_down',
            source: 'autoplay_skip',
          }),
        }).catch(err => console.warn('Failed to record skip feedback:', err));
      }

      set({
        playlist: newPlaylist,
        currentSongIndex: newPlaylist.length === 0 ? -1 : newIndex,
      });

      toast.success('Song removed from queue', {
        description: `"${skippedSong?.title || skippedSong?.name}" skipped`,
      });
    },

    // WiFi reconnect recovery action
    setWasPlayingBeforeUnload: (value: boolean) => set({ wasPlayingBeforeUnload: value }),

    // Cross-device sync actions
    applyServerState: (server) => {
      const local = get();
      const merged: Partial<AudioState> = {};
      let changed = false;

      const localIsPlaying = local.isPlaying;

      // Queue fields (playlist, currentIndex, shuffle):
      //   - If local is NOT playing: accept if server timestamp >= local (standard merge).
      //   - If local IS playing: only accept if server timestamp is STRICTLY newer.
      //     This allows a remote device's explicit skip/next to propagate to the
      //     active player, while preventing equal-timestamp echoes from overwriting
      //     the playing device's own queue state. (Fix for: phone skip not affecting
      //     desktop playback — the old code blocked ALL queue updates when playing.)
      const acceptQueue = localIsPlaying
        ? server.queueUpdatedAt > (local.queueUpdatedAt ?? '')
        : server.queueUpdatedAt >= (local.queueUpdatedAt ?? '');

      if (acceptQueue) {
        merged.playlist = server.queue.map(fromSyncSong);
        merged.currentSongIndex = server.currentIndex;
        merged.isShuffled = server.isShuffled;
        merged.queueUpdatedAt = server.queueUpdatedAt;
        changed = true;
      }

      // Position (currentTime):
      //   - Same logic: non-playing devices accept >= (catch up to active player),
      //     playing devices only accept strictly newer (remote seek override).
      const acceptPosition = localIsPlaying
        ? server.positionUpdatedAt > (local.positionUpdatedAt ?? '')
        : server.positionUpdatedAt >= (local.positionUpdatedAt ?? '');

      if (acceptPosition) {
        merged.currentTime = server.currentPositionMs / 1000;
        merged.positionUpdatedAt = server.positionUpdatedAt;
        changed = true;
      }

      // Volume: always accept from server if different
      if (server.volume !== local.volume) {
        merged.volume = server.volume;
        changed = true;
      }

      // Never auto-set isPlaying to true (browser autoplay policy)
      // Track the remote device state — show indicator if another device
      // is (or was recently) the active player
      if (server.activeDevice?.id) {
        const localDevice = typeof window !== 'undefined' ? getDeviceInfo() : null;
        if (localDevice && server.activeDevice.id !== localDevice.deviceId) {
          const currentSong = server.queue?.[server.currentIndex];
          merged.remoteDevice = {
            deviceId: server.activeDevice.id,
            deviceName: server.activeDevice.name,
            isPlaying: server.isPlaying,
            songName: currentSong?.title || currentSong?.name || null,
            artist: currentSong?.artist || null,
            currentPositionMs: server.currentPositionMs ?? undefined,
            durationMs: currentSong?.duration ? currentSong.duration * 1000 : undefined,
            updatedAt: Date.now(),
          };
          changed = true;
        } else if (local.remoteDevice) {
          // Active device is this device — clear stale remote indicator
          merged.remoteDevice = null;
          changed = true;
        }
      } else if (local.remoteDevice) {
        // No active device on server — clear stale remote indicator
        merged.remoteDevice = null;
        changed = true;
      }

      if (changed) {
        set(merged);
      }
    },

    setRemoteDevice: (device) => set({ remoteDevice: device }),

    incrementRadioPlayCount: () => set((state) => ({
      radioSessionPlayCount: state.radioSessionPlayCount + 1,
    })),

    setIsRadioSession: (isRadio: boolean) => set({ isRadioSession: isRadio }),

    startRadio: async (seed: SeededRadioSeed, variety: ArtistVariety = 'medium') => {
      // Gate AI DJ auto-refresh while the queue is being replaced. Released
      // 2s after we finish — same cadence as playNow / addToQueue actions —
      // so the monitor can't fire against a half-settled queue.
      set({ aiDJUserActionInProgress: true });
      try {
        const res = await fetch('/api/radio/seeded', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seed, variety }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || `Failed to start radio (${res.status})`);
        }
        const json = await res.json();
        const songs: Song[] = json?.data?.songs ?? [];
        const label: string = json?.data?.seedInfo?.label ?? 'Radio';
        if (songs.length === 0) {
          toast.warning('No songs found for this radio seed');
          return;
        }
        get().setPlaylist(songs);
        set({
          isPlaying: true,
          isRadioSession: true,
          radioSeed: seed,
          radioVariety: variety,
          radioSessionPlayCount: 0,
        });
        toast.success(`Radio started — ${label}`);
      } catch (err) {
        console.error('[startRadio] failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to start radio');
      } finally {
        setTimeout(() => set({ aiDJUserActionInProgress: false }), 2000);
      }
    },

    saveRadioAsPlaylist: async (name: string) => {
      const state = get();
      const songIds = state.playlist.map((s) => s.id).filter(Boolean);
      if (songIds.length === 0) {
        toast.warning('Queue is empty — nothing to save');
        return null;
      }
      try {
        const res = await fetch('/api/playlists/create-from-ids', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, songIds }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || `Failed to save playlist (${res.status})`);
        }
        const json = await res.json();
        const playlistId: string | undefined = json?.data?.playlistId;
        const savedName: string = json?.data?.name ?? name;
        toast.success(`Saved as "${savedName}"`);
        return playlistId ? { playlistId, name: savedName } : null;
      } catch (err) {
        console.error('[saveRadioAsPlaylist] failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to save playlist');
        return null;
      }
    },
  }),
  {
    name: 'audio-player-storage',
    storage: createJSONStorage(() => localStorage),
    // Only persist essential playback state, not transient state
    partialize: (state) => ({
      // Per-device user preferences only — server owns queue/position/timestamps
      volume: state.volume,
      aiDJEnabled: state.aiDJEnabled,
      aiDJRecentlyRecommended: state.aiDJRecentlyRecommended,
      crossfadeEnabled: state.crossfadeEnabled,
      crossfadeDuration: state.crossfadeDuration,
      autoplayEnabled: state.autoplayEnabled,
      autoplayBlendMode: state.autoplayBlendMode,
      autoplayTransitionDuration: state.autoplayTransitionDuration,
      autoplaySmartTransitions: state.autoplaySmartTransitions,
      recentlyPlayedIds: state.recentlyPlayedIds,
      skipCounts: state.skipCounts,
    }),
    // Only preferences are persisted — queue/position come from server on mount
    onRehydrateStorage: () => (state) => {
      if (state) {
        // Reset transient state
        state.aiDJIsLoading = false;
        state.aiDJError = null;
        state.aiDJUserActionInProgress = false;
        state._userPauseAt = 0;
        state.songsPlayedSinceLastRec = 0;
        state.radioSessionPlayCount = 0;
        state.isRadioSession = false;
        state.radioSeed = null;
        state.radioVariety = 'medium';
        state.aiQueuedSongIds = new Set<string>();
        state.autoplayIsLoading = false;
        state.autoplayTransitionActive = false;
        state.autoplayQueuedSongIds = new Set<string>();
        state.aiDJConsecutiveSkips = 0;
        state.aiDJSessionGenreCounts = {};
        state.aiDJRecommendationReasons = {};
        state.lastKnownPosition = 0;
        state.lastKnownDuration = 0;
        // Clean up expired AI DJ recommendations
        const now = Date.now();
        if (state.aiDJRecentlyRecommended?.length) {
          state.aiDJRecentlyRecommended = state.aiDJRecentlyRecommended.filter(
            rec => now - rec.timestamp < 28800000
          );
        }
        // LRU eviction for skipCounts: keep top 500
        if (state.skipCounts && Object.keys(state.skipCounts).length > 500) {
          const sorted = Object.entries(state.skipCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 500);
          state.skipCounts = Object.fromEntries(sorted);
        }
      }
    },
  }
  )
);
