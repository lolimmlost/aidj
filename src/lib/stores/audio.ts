import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Song } from '@/lib/types/song';
import { usePreferencesStore } from './preferences';
import { toast } from 'sonner';

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

/**
 * Fisher-Yates shuffle algorithm - produces unbiased permutations in O(n) time
 * This is the industry-standard shuffle algorithm used by Spotify and other music players
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Calculate freshness score for a shuffle sequence
 * Lower score = better (songs played recently appear later in the sequence)
 * Based on Spotify's "Fewer Repeats" algorithm
 */
function calculateFreshnessScore(songs: Song[], recentlyPlayedIds: string[]): number {
  let score = 0;
  for (let i = 0; i < songs.length; i++) {
    const recencyIndex = recentlyPlayedIds.indexOf(songs[i].id);
    if (recencyIndex !== -1) {
      // Penalize recently played songs appearing early in queue
      // Higher penalty for more recently played songs appearing earlier
      const recencyWeight = 1 - (recencyIndex / recentlyPlayedIds.length); // 1.0 for most recent, 0.0 for oldest
      const positionWeight = 1 - (i / songs.length); // 1.0 for first position, 0.0 for last
      score += recencyWeight * positionWeight * 10;
    }
  }
  return score;
}

/**
 * Shuffle with artist separation - spaces out songs from the same artist
 * This addresses the "random doesn't feel random" problem where back-to-back
 * songs from the same artist make users think shuffle is broken
 *
 * Algorithm:
 * 1. Group songs by artist
 * 2. Shuffle each artist's songs independently
 * 3. Interleave songs to maximize artist separation
 * 4. Apply light Fisher-Yates passes to maintain some randomness
 * 5. Use freshness scoring to push recently played songs later (Spotify's "Fewer Repeats")
 */
function shuffleWithArtistSeparation(songs: Song[], recentlyPlayedIds: string[] = []): Song[] {
  if (songs.length <= 2) return fisherYatesShuffle(songs);

  // Group songs by artist
  const artistGroups = new Map<string, Song[]>();
  for (const song of songs) {
    const artist = song.artist?.toLowerCase() || 'unknown';
    if (!artistGroups.has(artist)) {
      artistGroups.set(artist, []);
    }
    artistGroups.get(artist)!.push(song);
  }

  // If all songs are from one artist, just do Fisher-Yates
  if (artistGroups.size === 1) {
    return fisherYatesShuffle(songs);
  }

  // Shuffle each artist's songs
  for (const [artist, artistSongs] of artistGroups) {
    artistGroups.set(artist, fisherYatesShuffle(artistSongs));
  }

  // Sort artists by song count (descending) for better interleaving
  const sortedArtists = Array.from(artistGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  // Interleave songs: place each artist's songs at regular intervals
  const result: Song[] = new Array(songs.length);
  const filled: boolean[] = new Array(songs.length).fill(false);

  for (const [, artistSongs] of sortedArtists) {
    const interval = songs.length / artistSongs.length;
    let offset = Math.random() * interval; // Random starting offset

    for (const song of artistSongs) {
      // Find the nearest unfilled slot
      let targetIndex = Math.floor(offset) % songs.length;
      let attempts = 0;
      while (filled[targetIndex] && attempts < songs.length) {
        targetIndex = (targetIndex + 1) % songs.length;
        attempts++;
      }

      if (!filled[targetIndex]) {
        result[targetIndex] = song;
        filled[targetIndex] = true;
      }
      offset += interval;
    }
  }

  // Fill any remaining gaps (shouldn't happen, but safety check)
  const remainingSongs = songs.filter((_, i) => !filled[i]);
  let remainingIndex = 0;
  for (let i = 0; i < result.length; i++) {
    if (!filled[i] && remainingIndex < remainingSongs.length) {
      result[i] = remainingSongs[remainingIndex++];
    }
  }

  // Light shuffle pass to add some randomness while mostly preserving separation
  // Swap adjacent pairs with 20% probability
  for (let i = 0; i < result.length - 1; i++) {
    if (Math.random() < 0.2) {
      // Only swap if it doesn't create same-artist adjacency
      const current = result[i];
      const next = result[i + 1];
      const prev = i > 0 ? result[i - 1] : null;
      const afterNext = i + 2 < result.length ? result[i + 2] : null;

      const currentArtist = current?.artist?.toLowerCase();
      const nextArtist = next?.artist?.toLowerCase();
      const prevArtist = prev?.artist?.toLowerCase();
      const afterNextArtist = afterNext?.artist?.toLowerCase();

      // Check if swap would create adjacency
      const swapCreatesAdjacency =
        (prevArtist && prevArtist === nextArtist) ||
        (afterNextArtist && afterNextArtist === currentArtist);

      if (!swapCreatesAdjacency) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
      }
    }
  }

  // "Fewer Repeats" mode: Generate multiple candidates and pick the one with best freshness
  // This pushes recently played songs further down in the queue
  if (recentlyPlayedIds.length > 0) {
    const NUM_CANDIDATES = 5;
    let bestResult = result;
    let bestScore = calculateFreshnessScore(result, recentlyPlayedIds);

    for (let i = 0; i < NUM_CANDIDATES - 1; i++) {
      // Generate another candidate by doing additional swaps
      const candidate = [...result];
      // Do 3-5 random swaps that don't break artist separation
      const numSwaps = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < numSwaps; s++) {
        const idx1 = Math.floor(Math.random() * candidate.length);
        const idx2 = Math.floor(Math.random() * candidate.length);
        if (idx1 !== idx2) {
          // Check if swap would create same-artist adjacency
          const wouldCreateAdjacency = (idx: number, song: Song) => {
            const prevSong = idx > 0 ? candidate[idx - 1] : null;
            const nextSong = idx < candidate.length - 1 ? candidate[idx + 1] : null;
            const artist = song?.artist?.toLowerCase();
            return (prevSong?.artist?.toLowerCase() === artist) ||
                   (nextSong?.artist?.toLowerCase() === artist);
          };
          if (!wouldCreateAdjacency(idx1, candidate[idx2]) &&
              !wouldCreateAdjacency(idx2, candidate[idx1])) {
            [candidate[idx1], candidate[idx2]] = [candidate[idx2], candidate[idx1]];
          }
        }
      }

      const score = calculateFreshnessScore(candidate, recentlyPlayedIds);
      if (score < bestScore) {
        bestScore = score;
        bestResult = candidate;
      }
    }

    return bestResult;
  }

  return result;
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
  // Autoplay queueing state
  autoplayEnabled: boolean;
  autoplayBlendMode: 'crossfade' | 'silence' | 'reverb_tail';
  autoplayTransitionDuration: number;
  autoplaySmartTransitions: boolean;
  autoplayIsLoading: boolean;
  autoplayTransitionActive: boolean;
  autoplayLastQueueTime: number;
  autoplayQueuedSongIds: Set<string>;

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
    originalPlaylist: [],
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
    // Autoplay queueing initial state
    autoplayEnabled: false,
    autoplayBlendMode: 'crossfade',
    autoplayTransitionDuration: 4,
    autoplaySmartTransitions: true,
    autoplayIsLoading: false,
    autoplayTransitionActive: false,
    autoplayLastQueueTime: 0,
    autoplayQueuedSongIds: new Set<string>(),

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

      // Track the current song as recently played (for "fewer repeats" shuffle)
      const currentSong = state.playlist[state.currentSongIndex];
      if (currentSong) {
        const MAX_RECENT = 50; // Keep track of last 50 songs
        const newRecentlyPlayed = [
          currentSong.id,
          ...state.recentlyPlayedIds.filter(id => id !== currentSong.id)
        ].slice(0, MAX_RECENT);
        set({ recentlyPlayedIds: newRecentlyPlayed });
      }

      const newIndex = (state.currentSongIndex + 1) % state.playlist.length;

      // Drip-feed model: increment songs played counter when AI DJ is enabled
      const newSongsPlayed = state.aiDJEnabled ? state.songsPlayedSinceLastRec + 1 : state.songsPlayedSinceLastRec;

      set({
        currentSongIndex: newIndex,
        songsPlayedSinceLastRec: newSongsPlayed,
      });

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

        // If shuffled, also add to originalPlaylist so unshuffle preserves them
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...songs];
        }

        set({ playlist: newPlaylist, originalPlaylist: newOriginalPlaylist });
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

        // If shuffled, also add to originalPlaylist so unshuffle preserves them
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...songs];
        }

        set({ playlist: newPlaylist, originalPlaylist: newOriginalPlaylist });
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
      const upcomingCount = state.playlist.length - state.currentSongIndex - 1;
      if (upcomingCount <= 1) return; // Nothing to shuffle

      const currentSong = state.playlist[state.currentSongIndex];

      // Only get UPCOMING songs (after current), not already played ones
      const upcomingSongs = state.playlist.slice(state.currentSongIndex + 1);

      // Store the original upcoming order (only if not already stored)
      const originalUpcoming = state.originalPlaylist.length > 0
        ? state.originalPlaylist
        : [...upcomingSongs];

      // Fisher-Yates shuffle with artist separation and fewer repeats
      const shuffledUpcoming = shuffleWithArtistSeparation([...upcomingSongs], state.recentlyPlayedIds);

      // New playlist: just current song + shuffled upcoming (discard played songs)
      const newPlaylist = currentSong ? [currentSong, ...shuffledUpcoming] : shuffledUpcoming;

      set({
        playlist: newPlaylist,
        currentSongIndex: currentSong ? 0 : -1,
        isShuffled: true,
        originalPlaylist: originalUpcoming // Store original upcoming order for unshuffle
      });
    },

    unshufflePlaylist: () => {
      const state = get();
      if (state.originalPlaylist.length === 0) return;

      const currentSong = state.playlist[state.currentSongIndex];

      // Restore original upcoming order (current song + original upcoming)
      const newPlaylist = currentSong
        ? [currentSong, ...state.originalPlaylist]
        : state.originalPlaylist;

      set({
        playlist: newPlaylist,
        currentSongIndex: currentSong ? 0 : -1,
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
      // Get interval from preferences (fallback to 3 if not set)
      const dripInterval = recommendationSettings.aiDJDripInterval ?? 3;

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

        // Combine fatigue-excluded artists with recently recommended artists
        const allExcludedArtists = Array.from(new Set([
          ...recentlyRecommendedArtists,
          ...fatigueExcludedArtists
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

        // Add recommendations to queue
        const newPlaylist = [...state.playlist, ...recommendations];
        const newQueuedIds = new Set(state.aiQueuedSongIds);

        // Track newly recommended songs with artist info
        const newRecentlyRecommended = [...state.aiDJRecentlyRecommended];

        // Phase 1.2: Update artist batch counts to prevent exhaustion
        const newArtistBatchCounts = new Map(state.aiDJArtistBatchCounts);

        recommendations.forEach((song: Song) => {
          newQueuedIds.add(song.id);
          newRecentlyRecommended.push({
            songId: song.id,
            timestamp: now,
            artist: song.artist // Track artist for diversity enforcement
          });

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
        const shouldStartPlayback = state.playlist.length === 0 || state.currentSongIndex === -1;

        // If shuffled, also add to originalPlaylist so unshuffle preserves them
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...recommendations];
        }

        set({
          playlist: newPlaylist,
          originalPlaylist: newOriginalPlaylist,
          currentSongIndex: shouldStartPlayback ? 0 : state.currentSongIndex,
          isPlaying: shouldStartPlayback ? true : state.isPlaying,
          aiDJLastQueueTime: now,
          aiQueuedSongIds: newQueuedIds,
          aiDJRecentlyRecommended: cleanedRecentlyRecommended,
          aiDJArtistBatchCounts: newArtistBatchCounts, // Phase 1.2: Track artist diversity
          aiDJArtistFatigueCooldowns: newFatigueCooldowns, // Phase 4.1: Track artist fatigue
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

        // If shuffled, also add to originalPlaylist so unshuffle preserves them
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...recommendations];
        }

        set({
          playlist: newPlaylist,
          originalPlaylist: newOriginalPlaylist,
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
        let newPlaylist = [...state.playlist];
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
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...allRecommendations.map(r => r.song)];
        }

        set({
          playlist: newPlaylist,
          originalPlaylist: newOriginalPlaylist,
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

        // If shuffled, also add to originalPlaylist
        let newOriginalPlaylist = state.originalPlaylist;
        if (state.isShuffled && state.originalPlaylist.length > 0) {
          newOriginalPlaylist = [...state.originalPlaylist, ...recommendations];
        }

        set({
          playlist: newPlaylist,
          originalPlaylist: newOriginalPlaylist,
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
  }),
  {
    name: 'audio-player-storage',
    storage: createJSONStorage(() => localStorage),
    // Only persist essential playback state, not transient state
    partialize: (state) => ({
      playlist: state.playlist,
      currentSongIndex: state.currentSongIndex,
      currentTime: state.currentTime,
      volume: state.volume,
      isShuffled: state.isShuffled,
      originalPlaylist: state.originalPlaylist,
      aiDJEnabled: state.aiDJEnabled,
      crossfadeEnabled: state.crossfadeEnabled,
      crossfadeDuration: state.crossfadeDuration,
      // Autoplay settings
      autoplayEnabled: state.autoplayEnabled,
      autoplayBlendMode: state.autoplayBlendMode,
      autoplayTransitionDuration: state.autoplayTransitionDuration,
      autoplaySmartTransitions: state.autoplaySmartTransitions,
    }),
    // Don't restore isPlaying - let user manually resume
    onRehydrateStorage: () => (state) => {
      if (state) {
        // Reset transient state on rehydration
        state.isPlaying = false;
        state.aiDJIsLoading = false;
        state.aiDJError = null;
        state.aiDJUserActionInProgress = false;
        state.songsPlayedSinceLastRec = 0; // Reset drip-feed counter
        // Reinitialize Set (can't be serialized in JSON)
        state.aiQueuedSongIds = new Set<string>();
        // Reset autoplay transient state
        state.autoplayIsLoading = false;
        state.autoplayTransitionActive = false;
        state.autoplayQueuedSongIds = new Set<string>();
        console.log('🎵 Audio state restored from storage');
      }
    },
  }
  )
);
