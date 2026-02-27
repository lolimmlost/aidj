import type { Song } from '@/lib/types/song';

/**
 * Fisher-Yates shuffle — unbiased O(n) permutation.
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
 * Shuffle songs with artist separation: avoids back-to-back songs from the
 * same artist when possible. Uses Fisher-Yates as the base, then does a
 * single repair pass to break up same-artist adjacencies.
 */
export function shuffleSongs(songs: Song[]): Song[] {
  if (songs.length <= 2) return fisherYatesShuffle(songs);

  const result = fisherYatesShuffle(songs);

  // Repair pass: break same-artist adjacencies by swapping with a later song
  for (let i = 0; i < result.length - 1; i++) {
    const curArtist = result[i].artist?.toLowerCase() || '';
    const nextArtist = result[i + 1].artist?.toLowerCase() || '';

    if (curArtist && curArtist === nextArtist) {
      // Find a swap candidate further ahead that won't create a new adjacency
      for (let j = i + 2; j < result.length; j++) {
        const swapArtist = result[j].artist?.toLowerCase() || '';
        if (swapArtist === curArtist) continue; // Same artist, skip

        // Check that swapping won't create adjacency at position j
        const beforeJ = j > 0 ? result[j - 1].artist?.toLowerCase() || '' : '';
        const afterJ = j + 1 < result.length ? result[j + 1].artist?.toLowerCase() || '' : '';
        const wouldBreakAtJ = (beforeJ === nextArtist) || (afterJ === nextArtist);

        if (!wouldBreakAtJ) {
          [result[i + 1], result[j]] = [result[j], result[i + 1]];
          break;
        }
      }
    }
  }

  return result;
}
