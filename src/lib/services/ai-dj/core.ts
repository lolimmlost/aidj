// AI DJ Service Core
// Phase 3: Updated to use unified recommendations service (Last.fm-based)

import type { Song } from '@/lib/types/song';
import { getRecommendations } from '../recommendations';
import { ServiceError } from '../../utils';

// AI DJ configuration
const AI_DJ_COOLDOWN_MS = 30000; // 30 seconds minimum between queue operations

export interface AIDJQueueMetadata {
  aiQueued: boolean;
  queuedAt: number;
  queuedBy: 'ai-dj';
}

/** Context for AI DJ recommendations */
export interface AIContext {
  currentSong: Song;
  recentQueue: Song[];
  fullPlaylist?: Song[];
  currentSongIndex?: number;
}

/**
 * Check if the queue needs refilling based on remaining songs
 */
export function checkQueueThreshold(
  currentIndex: number,
  playlistLength: number,
  threshold: number
): boolean {
  const remainingSongs = playlistLength - currentIndex - 1;
  return remainingSongs <= threshold;
}

/**
 * Generate contextual AI DJ recommendations based on current playback
 * Phase 3: Now uses Last.fm-based unified recommendations service for better accuracy and speed
 *
 * @param context - Current song and recent queue context
 * @param batchSize - Number of songs to recommend (1-10)
 * @param _userId - User ID (unused in new implementation)
 * @param _useFeedbackForPersonalization - Whether to use feedback (unused in new implementation)
 * @param excludeSongIds - Song IDs to exclude from recommendations
 * @param excludeArtists - Artists to exclude from recommendations
 * @returns Array of recommended songs
 */
export async function generateContextualRecommendations(
  context: AIContext,
  batchSize: number,
  _userId?: string,
  _useFeedbackForPersonalization: boolean = true,
  excludeSongIds: string[] = [],
  excludeArtists: string[] = []
): Promise<Song[]> {
  try {
    const { currentSong } = context;

    if (!currentSong) {
      throw new ServiceError('AI_DJ_NO_CURRENT_SONG', 'No current song to base recommendations on');
    }

    console.log(`🎵 AI DJ: Getting similar songs for "${currentSong.artist} - ${currentSong.title}"`);

    // Use the unified recommendations service with 'similar' mode
    // This now uses Last.fm for song similarity (much faster and more accurate)
    const result = await getRecommendations({
      mode: 'similar',
      currentSong: {
        artist: currentSong.artist,
        title: currentSong.title || currentSong.name
      },
      limit: batchSize,
      excludeSongIds,
      excludeArtists,
    });

    if (result.songs.length === 0) {
      throw new ServiceError('AI_DJ_NO_RECOMMENDATIONS', 'No similar songs found in your library');
    }

    console.log(`✅ AI DJ: Got ${result.songs.length} recommendations from ${result.source}`);
    return result.songs;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }

    throw new ServiceError(
      'AI_DJ_GENERATION_ERROR',
      `Failed to generate AI DJ recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if enough time has passed since last AI DJ queue operation
 * @param lastQueueTime - Timestamp of last queue operation
 * @param cooldownMs - Cooldown period in milliseconds
 * @returns true if cooldown has passed
 */
export function checkCooldown(lastQueueTime: number, cooldownMs: number = AI_DJ_COOLDOWN_MS): boolean {
  return Date.now() - lastQueueTime >= cooldownMs;
}

/**
 * Queue AI DJ recommendations to the audio store
 * This function should be called by the audio store to add songs
 * @param recommendations - Songs to add to queue
 * @returns Metadata for queued songs
 */
export function prepareAIDJQueueMetadata(recommendations: Song[]): AIDJQueueMetadata[] {
  const now = Date.now();
  return recommendations.map(() => ({
    aiQueued: true,
    queuedAt: now,
    queuedBy: 'ai-dj' as const,
  }));
}

