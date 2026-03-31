import { describe, it, expect, beforeEach } from 'vitest';
import { useAudioStore } from '../audio';
import type { Song } from '@/lib/types/song';

function createMockSong(id: string, artist: string, title: string): Song {
  return {
    id,
    title,
    artist,
    album: 'Test Album',
    duration: 180,
    path: `/music/${id}.mp3`,
  };
}

describe('Audio Store Shuffle', () => {
  beforeEach(() => {
    const store = useAudioStore.getState();
    store.clearPlaylist();
    useAudioStore.setState({ recentlyPlayedIds: [] });
  });

  describe('Fisher-Yates shuffle correctness', () => {
    it('should shuffle all songs (no song is lost)', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
        createMockSong('4', 'Artist D', 'Song 4'),
        createMockSong('5', 'Artist E', 'Song 5'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;
      expect(shuffled.length).toBe(songs.length);

      const originalIds = songs.map(s => s.id).sort();
      const shuffledIds = shuffled.map(s => s.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });

    it('should preserve current song at index 0 after shuffle', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      const currentSong = useAudioStore.getState().playlist[0];

      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;
      expect(shuffled[0].id).toBe(currentSong.id);
    });
  });

  describe('Artist separation', () => {
    it('should avoid back-to-back songs from same artist when possible', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song A1'),
        createMockSong('2', 'Artist A', 'Song A2'),
        createMockSong('3', 'Artist A', 'Song A3'),
        createMockSong('4', 'Artist B', 'Song B1'),
        createMockSong('5', 'Artist B', 'Song B2'),
        createMockSong('6', 'Artist B', 'Song B3'),
        createMockSong('7', 'Artist C', 'Song C1'),
        createMockSong('8', 'Artist C', 'Song C2'),
        createMockSong('9', 'Artist C', 'Song C3'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;

      let adjacentSameArtist = 0;
      for (let i = 0; i < shuffled.length - 1; i++) {
        if (shuffled[i].artist === shuffled[i + 1].artist) {
          adjacentSameArtist++;
        }
      }

      expect(adjacentSameArtist).toBeLessThanOrEqual(2);
    });

    it('should handle single-artist playlists gracefully', () => {
      const songs = [
        createMockSong('1', 'Same Artist', 'Song 1'),
        createMockSong('2', 'Same Artist', 'Song 2'),
        createMockSong('3', 'Same Artist', 'Song 3'),
        createMockSong('4', 'Same Artist', 'Song 4'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;
      expect(shuffled.length).toBe(songs.length);
      const originalIds = songs.map(s => s.id).sort();
      const shuffledIds = shuffled.map(s => s.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });
  });

  describe('Toggle shuffle', () => {
    it('should set isShuffled to true when toggling on', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
        createMockSong('4', 'Artist D', 'Song 4'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      expect(useAudioStore.getState().isShuffled).toBe(false);

      useAudioStore.getState().toggleShuffle();
      expect(useAudioStore.getState().isShuffled).toBe(true);
    });

    it('should set isShuffled to false when toggling off', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
        createMockSong('4', 'Artist D', 'Song 4'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().toggleShuffle();
      expect(useAudioStore.getState().isShuffled).toBe(true);

      useAudioStore.getState().toggleShuffle();
      expect(useAudioStore.getState().isShuffled).toBe(false);
    });

    it('should track recently played songs on nextSong', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().nextSong();

      const recentlyPlayed = useAudioStore.getState().recentlyPlayedIds;
      expect(recentlyPlayed).toContain('1');
    });
  });
});
