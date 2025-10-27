import { create } from 'zustand';
import type { Song } from '@/components/ui/audio-player';

interface AudioState {
  playlist: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
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
}

export const useAudioStore = create<AudioState>()(
  (set, get): AudioState => ({
    playlist: [],
    currentSongIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,

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
  })
);