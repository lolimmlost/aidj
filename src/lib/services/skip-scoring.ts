/**
 * Skip-Based Song Scoring Service
 *
 * Phase 3.2 of the AIDJ Queue Improvement Plan.
 * Uses skip data to penalize frequently-skipped songs in recommendations.
 *
 * Key features:
 * - Calculate skip penalty for songs based on skip history
 * - Calculate skip penalty for artists
 * - Integrate with recommendation scoring
 *
 * Formula:
 * adjustedScore = baseScore * (1 - skipPenalty)
 *
 * skipPenalty = (songSkipRate * 0.5) + (artistSkipRate * 0.3) + (genreSkipRate * 0.2)
 */

import {
  getSkipRatesForSongs,
  getSkipRatesByArtist,
  getFrequentlySkippedSongs,
} from './listening-history';
import type { Song } from '@/lib/types/song';

// ============================================================================
// Constants
// ============================================================================

// Weight for different skip rate components
const SONG_SKIP_WEIGHT = 0.5;    // Direct song skip rate matters most
const ARTIST_SKIP_WEIGHT = 0.3;  // Artist-level skip pattern is important
const GENRE_SKIP_WEIGHT = 0.2;   // Genre-level is a weaker signal

// Skip rate thresholds
const HIGH_SKIP_RATE = 0.7;      // 70%+ skip rate = heavily penalize
const MIN_PLAYS_FOR_PENALTY = 2; // Need at least 2 plays to apply penalty

// ============================================================================
// Types
// ============================================================================

export interface SkipScore {
  songId: string;
  skipPenalty: number;         // 0.0 - 1.0 (how much to penalize)
  adjustedMultiplier: number;  // 1.0 - skipPenalty (multiply base score by this)
  components: {
    songSkipRate: number;
    artistSkipRate: number;
    genreSkipRate: number;
  };
}

export interface ScoringContext {
  userId: string;
  daysBack?: number;
  songSkipWeight?: number;
  artistSkipWeight?: number;
  genreSkipWeight?: number;
}

// ============================================================================
// Main Scoring Functions
// ============================================================================

/**
 * Calculate skip scores for a list of songs
 * Returns a map of songId -> SkipScore
 *
 * @param songs - Songs to score
 * @param context - User context for skip data
 */
export async function calculateSkipScores(
  songs: Song[],
  context: ScoringContext
): Promise<Map<string, SkipScore>> {
  const {
    userId,
    daysBack = 30,
    songSkipWeight = SONG_SKIP_WEIGHT,
    artistSkipWeight = ARTIST_SKIP_WEIGHT,
    genreSkipWeight = GENRE_SKIP_WEIGHT,
  } = context;

  if (songs.length === 0) {
    return new Map();
  }

  // Get skip rates for songs and artists in parallel
  const songIds = songs.map(s => s.id);
  const [songSkipRates, artistSkipRates] = await Promise.all([
    getSkipRatesForSongs(userId, songIds, daysBack),
    getSkipRatesByArtist(userId, daysBack),
  ]);

  // Calculate skip scores for each song
  const skipScores = new Map<string, SkipScore>();

  for (const song of songs) {
    const songStats = songSkipRates.get(song.id);
    const artistStats = artistSkipRates.get(song.artist?.toLowerCase() || '');

    // Get individual skip rates (0 if not enough data)
    const songSkipRate = (songStats && songStats.totalPlays >= MIN_PLAYS_FOR_PENALTY)
      ? songStats.skipRate
      : 0;

    const artistSkipRate = (artistStats && artistStats.totalPlays >= MIN_PLAYS_FOR_PENALTY)
      ? artistStats.skipRate
      : 0;

    // TODO: Add genre skip rate when we have genre-level tracking
    const genreSkipRate = 0;

    // Calculate weighted skip penalty
    const skipPenalty = Math.min(1.0,
      (songSkipRate * songSkipWeight) +
      (artistSkipRate * artistSkipWeight) +
      (genreSkipRate * genreSkipWeight)
    );

    skipScores.set(song.id, {
      songId: song.id,
      skipPenalty,
      adjustedMultiplier: 1.0 - skipPenalty,
      components: {
        songSkipRate,
        artistSkipRate,
        genreSkipRate,
      },
    });
  }

  console.log(`📊 [SkipScoring] Calculated skip scores for ${skipScores.size} songs`);

  // Log any heavily penalized songs
  const penalized = Array.from(skipScores.values()).filter(s => s.skipPenalty > 0.3);
  if (penalized.length > 0) {
    console.log(`⏭️ [SkipScoring] ${penalized.length} songs have significant skip penalty (>30%)`);
  }

  return skipScores;
}

/**
 * Apply skip scoring to songs and return sorted by adjusted score
 *
 * @param songs - Songs to score and sort
 * @param userId - User ID for skip data
 * @param baseScores - Optional base scores to adjust (default: 1.0 for all)
 */
export async function applySortBySkipScore(
  songs: Song[],
  userId: string,
  baseScores?: Map<string, number>
): Promise<Song[]> {
  const skipScores = await calculateSkipScores(songs, { userId });

  // Create scored songs
  const scoredSongs = songs.map(song => {
    const skipScore = skipScores.get(song.id);
    const baseScore = baseScores?.get(song.id) ?? 1.0;
    const adjustedScore = baseScore * (skipScore?.adjustedMultiplier ?? 1.0);

    return { song, adjustedScore, skipPenalty: skipScore?.skipPenalty ?? 0 };
  });

  // Sort by adjusted score (descending)
  scoredSongs.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return scoredSongs.map(s => s.song);
}

/**
 * Filter out songs that are frequently skipped
 *
 * @param songs - Songs to filter
 * @param userId - User ID for skip data
 * @param maxSkipRate - Maximum skip rate to include (default 0.7)
 */
export async function filterFrequentlySkipped(
  songs: Song[],
  userId: string,
  maxSkipRate: number = HIGH_SKIP_RATE
): Promise<Song[]> {
  const skipScores = await calculateSkipScores(songs, { userId });

  return songs.filter(song => {
    const skipScore = skipScores.get(song.id);
    if (!skipScore) return true; // No data = include

    const songSkipRate = skipScore.components.songSkipRate;
    if (songSkipRate >= maxSkipRate) {
      console.log(`🚫 [SkipScoring] Filtering out "${song.artist} - ${song.title}" (skip rate: ${Math.round(songSkipRate * 100)}%)`);
      return false;
    }

    return true;
  });
}

/**
 * Get songs that should be avoided based on skip patterns
 * Returns song IDs that should be excluded from recommendations
 */
export async function getSongsToAvoid(
  userId: string,
  minSkipRate: number = 0.5,
  minPlays: number = 3,
  daysBack: number = 30
): Promise<Set<string>> {
  const frequentlySkipped = await getFrequentlySkippedSongs(
    userId,
    minSkipRate,
    minPlays,
    daysBack
  );

  const songsToAvoid = new Set<string>();
  for (const song of frequentlySkipped) {
    songsToAvoid.add(song.songId);
    console.log(`🚫 [SkipScoring] Avoiding "${song.artist} - ${song.title}" (skip rate: ${Math.round(song.skipRate * 100)}%)`);
  }

  return songsToAvoid;
}

/**
 * Get artists that should be deprioritized based on skip patterns
 * Returns artist names (lowercase) with high skip rates
 */
export async function getArtistsToDeprioritize(
  userId: string,
  minSkipRate: number = 0.5,
  minPlays: number = 5,
  daysBack: number = 30
): Promise<Map<string, number>> {
  const artistSkipRates = await getSkipRatesByArtist(userId, daysBack);

  const artistsToDeprioritize = new Map<string, number>();

  for (const [artist, stats] of artistSkipRates.entries()) {
    if (stats.totalPlays >= minPlays && stats.skipRate >= minSkipRate) {
      artistsToDeprioritize.set(artist, stats.skipRate);
      console.log(`⚠️ [SkipScoring] Deprioritizing artist "${artist}" (skip rate: ${Math.round(stats.skipRate * 100)}%)`);
    }
  }

  return artistsToDeprioritize;
}

// ============================================================================
// Exports
// ============================================================================

export {
  SONG_SKIP_WEIGHT,
  ARTIST_SKIP_WEIGHT,
  GENRE_SKIP_WEIGHT,
  HIGH_SKIP_RATE,
  MIN_PLAYS_FOR_PENALTY,
};
