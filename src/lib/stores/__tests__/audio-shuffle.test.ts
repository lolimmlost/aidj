import { describe, it, expect, beforeEach } from 'vitest';
import { useAudioStore } from '../audio';
import type { Song } from '@/lib/types/song';

// Helper to create mock songs
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
    // Reset the store before each test
    const store = useAudioStore.getState();
    store.clearPlaylist();
    // Also clear recently played
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

      // Should have same number of songs (minus current song at index 0)
      // After shuffle, current song stays at position 0, rest are shuffled
      expect(shuffled.length).toBe(songs.length);

      // All original song IDs should still be present
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
      // setPlaylist sets currentSongIndex to 0
      const currentSong = useAudioStore.getState().playlist[0];

      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;
      expect(shuffled[0].id).toBe(currentSong.id);
    });
  });

  describe('Artist separation', () => {
    it('should avoid back-to-back songs from same artist when possible', () => {
      // Create a playlist with multiple songs per artist
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

      // Count back-to-back same-artist occurrences
      let adjacentSameArtist = 0;
      for (let i = 0; i < shuffled.length - 1; i++) {
        if (shuffled[i].artist === shuffled[i + 1].artist) {
          adjacentSameArtist++;
        }
      }

      // With good artist separation, we should have very few (ideally 0) adjacent same-artist songs
      // For 9 songs with 3 artists (3 songs each), perfect separation would have 0 adjacent
      // Allow some tolerance since we add randomness
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

      // Should still work - all songs present
      expect(shuffled.length).toBe(songs.length);
      const originalIds = songs.map(s => s.id).sort();
      const shuffledIds = shuffled.map(s => s.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });
  });

  describe('Fewer Repeats (freshness scoring)', () => {
    it('should push recently played songs later in the queue', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
        createMockSong('4', 'Artist D', 'Song 4'),
        createMockSong('5', 'Artist E', 'Song 5'),
        createMockSong('6', 'Artist F', 'Song 6'),
        createMockSong('7', 'Artist G', 'Song 7'),
        createMockSong('8', 'Artist H', 'Song 8'),
      ];

      // Set some songs as recently played
      useAudioStore.setState({ recentlyPlayedIds: ['2', '3', '4'] });

      useAudioStore.getState().setPlaylist(songs);
      useAudioStore.getState().shufflePlaylist();

      const shuffled = useAudioStore.getState().playlist;

      // Get positions of recently played songs (excluding current song at index 0)
      const recentlyPlayedPositions = shuffled
        .slice(1) // Skip current song
        .map((s, i) => ({ id: s.id, position: i }))
        .filter(item => ['2', '3', '4'].includes(item.id))
        .map(item => item.position);

      // Calculate average position of recently played songs
      const avgPosition = recentlyPlayedPositions.reduce((a, b) => a + b, 0) / recentlyPlayedPositions.length;
      const midpoint = (shuffled.length - 2) / 2; // -2 because we skip first song

      // Recently played songs should tend to appear in the second half
      // This is probabilistic, so we just check they're not all at the front
      expect(avgPosition).toBeGreaterThanOrEqual(midpoint * 0.5); // At least past 25% mark on average
    });

    it('should track recently played songs on nextSong', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
      ];

      useAudioStore.getState().setPlaylist(songs);

      // Play first song, then go to next
      useAudioStore.getState().nextSong();

      const recentlyPlayed = useAudioStore.getState().recentlyPlayedIds;
      expect(recentlyPlayed).toContain('1');
    });
  });

  describe('Unshuffle', () => {
    it('should restore original order when unshuffling', () => {
      const songs = [
        createMockSong('1', 'Artist A', 'Song 1'),
        createMockSong('2', 'Artist B', 'Song 2'),
        createMockSong('3', 'Artist C', 'Song 3'),
        createMockSong('4', 'Artist D', 'Song 4'),
      ];

      useAudioStore.getState().setPlaylist(songs);
      const originalUpcoming = songs.slice(1).map(s => s.id);

      useAudioStore.getState().shufflePlaylist();
      expect(useAudioStore.getState().isShuffled).toBe(true);

      useAudioStore.getState().unshufflePlaylist();
      expect(useAudioStore.getState().isShuffled).toBe(false);

      // Check upcoming songs are back in original order
      const restored = useAudioStore.getState().playlist.slice(1).map(s => s.id);
      expect(restored).toEqual(originalUpcoming);
    });
  });
});
