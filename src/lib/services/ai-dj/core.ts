// AI DJ Service Core
// Phase 3: Updated to use unified recommendations service (Last.fm-based)
// Phase 5: Added BPM/energy/key matching for smoother DJ transitions

import type { Song } from '@/lib/types/song';
import { getRecommendations, type DJMatchingOptions } from '../recommendations';
import { enrichSongWithDJMetadata } from '../dj-match-scorer';
import { ServiceError } from '../../utils';

// AI DJ configuration
const AI_DJ_COOLDOWN_MS = 30000; // 30 seconds minimum between queue operations

export interface AIDJQueueMetadata {
  aiQueued: boolean;
  queuedAt: number;
  queuedBy: 'ai-dj';
  /** DJ score for this recommendation (0-1) */
  djScore?: number;
}

/** DJ matching settings for AI DJ */
export interface AIDJMatchingSettings {
  /** Enable BPM/energy/key matching */
  enabled: boolean;
  /** BPM tolerance (0.03 = 3% for tight matching, as per user requirement) */
  bpmTolerance?: number;
  /** Minimum DJ score threshold (0-1, default 0.5) */
  minDJScore?: number;
  /** Custom weights for BPM/energy/key scoring */
  weights?: {
    bpm?: number;
    energy?: number;
    key?: number;
  };
}

/** Context for AI DJ recommendations */
export interface AIContext {
  currentSong: Song;
  recentQueue: Song[];
  fullPlaylist?: Song[];
  currentSongIndex?: number;
  /** DJ matching settings for BPM/energy/key-aware recommendations */
  djMatching?: AIDJMatchingSettings;
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
 * Phase 5: Added BPM/energy/key matching for smoother DJ-style transitions
 * Phase 6: Added userId for multi-signal blended scoring (compound, feedback, skip, temporal)
 *
 * @param context - Current song and recent queue context
 * @param batchSize - Number of songs to recommend (1-10)
 * @param userId - User ID for personalized blended scoring (compound, feedback, skip, temporal)
 * @param _useFeedbackForPersonalization - Whether to use feedback (unused, blended scoring handles this)
 * @param excludeSongIds - Song IDs to exclude from recommendations
 * @param excludeArtists - Artists to exclude from recommendations
 * @returns Array of recommended songs
 */
export async function generateContextualRecommendations(
  context: AIContext,
  batchSize: number,
  userId?: string,
  _useFeedbackForPersonalization: boolean = true,
  excludeSongIds: string[] = [],
  excludeArtists: string[] = []
): Promise<Song[]> {
  try {
    const { currentSong, djMatching } = context;

    if (!currentSong) {
      throw new ServiceError('AI_DJ_NO_CURRENT_SONG', 'No current song to base recommendations on');
    }

    console.log(`🎵 AI DJ: Getting similar songs for "${currentSong.artist} - ${currentSong.title}"`);

    // Phase 5: Enrich current song with BPM/key/energy metadata if DJ matching is enabled
    let enrichedCurrentSong = currentSong;
    let djMatchingOptions: DJMatchingOptions | undefined;

    if (djMatching?.enabled) {
      try {
        // Get BPM/key/energy for current song from cache or estimation
        enrichedCurrentSong = await enrichSongWithDJMetadata(currentSong);
        console.log(`🎧 AI DJ: Current song metadata - BPM: ${enrichedCurrentSong.bpm ?? 'unknown'}, Key: ${enrichedCurrentSong.key ?? 'unknown'}, Energy: ${enrichedCurrentSong.energy?.toFixed(2) ?? 'unknown'}`);

        // Build DJ matching options for recommendations
        djMatchingOptions = {
          enabled: true,
          currentBpm: enrichedCurrentSong.bpm,
          currentKey: enrichedCurrentSong.key,
          currentEnergy: enrichedCurrentSong.energy,
          minDJScore: djMatching.minDJScore ?? 0.5,
          weights: djMatching.weights,
        };
      } catch (error) {
        console.warn('⚠️ AI DJ: Failed to enrich current song metadata, continuing without DJ matching:', error);
        djMatchingOptions = undefined;
      }
    }

    // Use the unified recommendations service with 'similar' mode
    // This now uses Last.fm for song similarity (much faster and more accurate)
    // Phase 5: Pass DJ matching options for BPM/energy/key-aware filtering
    // Phase 6: Pass userId for multi-signal blended scoring
    const result = await getRecommendations({
      mode: 'similar',
      currentSong: {
        artist: currentSong.artist || 'Unknown',
        title: currentSong.title || currentSong.name || 'Unknown',
        genre: currentSong.genre,
        bpm: enrichedCurrentSong.bpm,
        key: enrichedCurrentSong.key,
        energy: enrichedCurrentSong.energy,
      },
      limit: batchSize,
      excludeSongIds,
      excludeArtists,
      djMatching: djMatchingOptions,
      userId, // Enable blended multi-signal scoring when userId is available
    });

    if (result.songs.length === 0) {
      throw new ServiceError('AI_DJ_NO_RECOMMENDATIONS', 'No similar songs found in your library');
    }

    // Log blended scoring results
    if (result.metadata?.blendedScoringApplied) {
      console.log(`🎯 AI DJ: Blended scoring applied - ${result.metadata.totalCandidates} candidates, ${result.metadata.uniqueArtists} unique artists`);
      if (result.metadata.blendedSourceCounts) {
        console.log(`📊 AI DJ: Sources - ${JSON.stringify(result.metadata.blendedSourceCounts)}`);
      }
    }

    // Log DJ matching results if enabled
    if (result.metadata?.djMatchingApplied) {
      console.log(`🎧 AI DJ: DJ matching applied - ${result.metadata.djScoredCount} songs scored, avg score ${((result.metadata.avgDJScore ?? 0) * 100).toFixed(1)}%`);
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

