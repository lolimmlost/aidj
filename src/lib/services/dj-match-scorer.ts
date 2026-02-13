/**
 * DJ Match Scorer Service
 *
 * Calculates compatibility scores between songs for DJ-style transitions.
 * Combines BPM, energy, and musical key into a single weighted score.
 *
 * Scoring weights (configurable):
 * - BPM: 40% - Most important for smooth beatmatching
 * - Energy: 35% - Second most important for flow
 * - Key: 25% - Nice-to-have for harmonic mixing
 */

import { getCamelotKey, areCamelotKeysCompatible, type CamelotKey } from '@/lib/types/song';
import type { Song } from '@/lib/types/song';
import { estimateEnergy, calculateEnergyCompatibility } from './energy-estimator';
import {
  getMetadata,
  getMetadataBatch,
  setMetadata,
  type AudioMetadataCache,
} from './audio-metadata-cache';

// Default scoring weights (from plan)
export const DJ_WEIGHTS = {
  bpm: 0.40,     // Most important for smooth transitions
  energy: 0.35,  // Second most important for flow
  key: 0.25,     // Nice-to-have for harmonic mixing
};

// BPM matching thresholds
export const BPM_THRESHOLDS = {
  PERFECT: 0.01,    // Within 1% = perfect match
  TIGHT: 0.03,      // Within 3% = tight (user requirement)
  GOOD: 0.05,       // Within 5% = good match
  ACCEPTABLE: 0.08, // Within 8% = acceptable with pitch adjustment
  HALFHALF: 0.03,   // Within 3% of half/double time
};

// Minimum DJ score threshold for recommendations
export const MIN_DJ_SCORE_THRESHOLD = 0.5;

/**
 * Song with DJ metadata for scoring
 */
export interface SongWithDJMetadata extends Song {
  bpm?: number;
  key?: string;
  energy?: number;
}

/**
 * Result of calculating DJ score between two songs
 */
export interface DJScoreResult {
  /** Overall weighted DJ score (0-1) */
  totalScore: number;

  /** Individual component scores */
  scores: {
    bpm: number;
    energy: number;
    key: number;
  };

  /** Detailed scoring information */
  details: {
    bpmDiff?: number;
    bpmDiffPercent?: number;
    bpmRelationship?: string;
    energyDiff?: number;
    energyRelationship?: string;
    keyRelationship?: string;
    camelotKeys?: { source: CamelotKey | null; target: CamelotKey | null };
  };

  /** Whether this is a recommended transition */
  isRecommended: boolean;

  /** Human-readable summary */
  summary: string;
}

/**
 * Calculate BPM match score between two songs
 *
 * @param bpm1 - First song BPM
 * @param bpm2 - Second song BPM
 * @param tolerance - BPM tolerance (default 3% as per user requirement)
 * @returns Score 0-1 and relationship info
 */
export function scoreBPMMatch(
  bpm1?: number,
  bpm2?: number,
  _tolerance: number = BPM_THRESHOLDS.TIGHT
): { score: number; diff?: number; diffPercent?: number; relationship: string } {
  // If either BPM is missing, return neutral score
  if (!bpm1 || !bpm2 || bpm1 <= 0 || bpm2 <= 0) {
    return { score: 0.5, relationship: 'Unknown BPM' };
  }

  const diff = bpm2 - bpm1;
  const diffPercent = Math.abs(diff / bpm1);

  // Check for exact match
  if (Math.abs(diff) < 1) {
    return {
      score: 1.0,
      diff,
      diffPercent,
      relationship: 'Exact match',
    };
  }

  // Check for perfect match (within 1%)
  if (diffPercent <= BPM_THRESHOLDS.PERFECT) {
    return {
      score: 0.98,
      diff,
      diffPercent,
      relationship: 'Perfect match',
    };
  }

  // Check for tight match (within 3% - user requirement)
  if (diffPercent <= BPM_THRESHOLDS.TIGHT) {
    return {
      score: 0.90 + (1 - diffPercent / BPM_THRESHOLDS.TIGHT) * 0.08,
      diff,
      diffPercent,
      relationship: 'Seamless transition',
    };
  }

  // Check for good match (within 5%)
  if (diffPercent <= BPM_THRESHOLDS.GOOD) {
    return {
      score: 0.75 + (1 - diffPercent / BPM_THRESHOLDS.GOOD) * 0.15,
      diff,
      diffPercent,
      relationship: 'Good match',
    };
  }

  // Check for half-time relationship (target is ~50% of source)
  const halfTimeDiff = Math.abs(bpm2 - bpm1 / 2);
  const halfTimePercent = halfTimeDiff / (bpm1 / 2);
  if (halfTimePercent <= BPM_THRESHOLDS.HALFHALF) {
    return {
      score: 0.80,
      diff,
      diffPercent,
      relationship: 'Half-time match',
    };
  }

  // Check for double-time relationship (target is ~200% of source)
  const doubleTimeDiff = Math.abs(bpm2 - bpm1 * 2);
  const doubleTimePercent = doubleTimeDiff / (bpm1 * 2);
  if (doubleTimePercent <= BPM_THRESHOLDS.HALFHALF) {
    return {
      score: 0.80,
      diff,
      diffPercent,
      relationship: 'Double-time match',
    };
  }

  // Check for acceptable match (within 8%)
  if (diffPercent <= BPM_THRESHOLDS.ACCEPTABLE) {
    return {
      score: 0.50 + (1 - diffPercent / BPM_THRESHOLDS.ACCEPTABLE) * 0.25,
      diff,
      diffPercent,
      relationship: 'Requires tempo adjustment',
    };
  }

  // Poor match - calculate declining score based on difference
  const maxDiff = 0.20; // 20% is the worst we consider
  if (diffPercent <= maxDiff) {
    const score = 0.30 * (1 - (diffPercent - BPM_THRESHOLDS.ACCEPTABLE) / (maxDiff - BPM_THRESHOLDS.ACCEPTABLE));
    return {
      score: Math.max(0.1, score),
      diff,
      diffPercent,
      relationship: 'Difficult transition',
    };
  }

  // Very poor match
  return {
    score: 0.1,
    diff,
    diffPercent,
    relationship: 'BPM mismatch',
  };
}

/**
 * Calculate energy match score between two songs
 *
 * @param energy1 - First song energy (0-1)
 * @param energy2 - Second song energy (0-1)
 * @returns Score 0-1 and relationship info
 */
export function scoreEnergyMatch(
  energy1?: number,
  energy2?: number
): { score: number; diff?: number; relationship: string } {
  // If either energy is missing, return neutral score
  if (energy1 === undefined || energy2 === undefined) {
    return { score: 0.5, relationship: 'Unknown energy' };
  }

  const result = calculateEnergyCompatibility(energy1, energy2, 'any');
  const diff = energy2 - energy1;

  return {
    score: result.score,
    diff,
    relationship: result.relationship,
  };
}

/**
 * Calculate key match score using Camelot wheel compatibility
 *
 * @param key1 - First song key (e.g., "Am", "C", "F#m")
 * @param key2 - Second song key
 * @returns Score 0-1 and relationship info
 */
export function scoreKeyMatch(
  key1?: string,
  key2?: string
): { score: number; relationship: string; camelotKeys?: { source: CamelotKey | null; target: CamelotKey | null } } {
  // If either key is missing, return neutral score
  if (!key1 || !key2) {
    return { score: 0.5, relationship: 'Unknown key' };
  }

  const camelot1 = getCamelotKey(key1);
  const camelot2 = getCamelotKey(key2);

  // If we can't map to Camelot, return neutral
  if (!camelot1 || !camelot2) {
    return {
      score: 0.5,
      relationship: 'Key not recognized',
      camelotKeys: { source: camelot1, target: camelot2 },
    };
  }

  // Use existing Camelot compatibility function
  const compatibility = areCamelotKeysCompatible(camelot1, camelot2);

  return {
    score: compatibility.score,
    relationship: compatibility.relationship,
    camelotKeys: { source: camelot1, target: camelot2 },
  };
}

/**
 * Calculate overall DJ compatibility score between two songs
 * Combines BPM, energy, and key scores with configurable weights
 *
 * @param song1 - Source song (current playing)
 * @param song2 - Target song (candidate for next)
 * @param weights - Optional custom weights for scoring
 * @returns Complete DJ score result
 */
export function calculateDJScore(
  song1: SongWithDJMetadata,
  song2: SongWithDJMetadata,
  weights: typeof DJ_WEIGHTS = DJ_WEIGHTS
): DJScoreResult {
  // Calculate individual scores
  const bpmResult = scoreBPMMatch(song1.bpm, song2.bpm);
  const energyResult = scoreEnergyMatch(song1.energy, song2.energy);
  const keyResult = scoreKeyMatch(song1.key, song2.key);

  // Calculate weighted total score
  const totalScore =
    (bpmResult.score * weights.bpm) +
    (energyResult.score * weights.energy) +
    (keyResult.score * weights.key);

  // Determine if this is a recommended transition
  const isRecommended =
    totalScore >= MIN_DJ_SCORE_THRESHOLD &&
    bpmResult.score >= 0.5; // BPM is a hard requirement

  // Generate summary
  let summary = '';
  if (totalScore >= 0.85) {
    summary = 'Excellent DJ transition';
  } else if (totalScore >= 0.70) {
    summary = 'Good DJ transition';
  } else if (totalScore >= 0.55) {
    summary = 'Acceptable transition';
  } else if (totalScore >= 0.40) {
    summary = 'Challenging transition';
  } else {
    summary = 'Poor transition match';
  }

  return {
    totalScore,
    scores: {
      bpm: bpmResult.score,
      energy: energyResult.score,
      key: keyResult.score,
    },
    details: {
      bpmDiff: bpmResult.diff,
      bpmDiffPercent: bpmResult.diffPercent,
      bpmRelationship: bpmResult.relationship,
      energyDiff: energyResult.diff,
      energyRelationship: energyResult.relationship,
      keyRelationship: keyResult.relationship,
      camelotKeys: keyResult.camelotKeys,
    },
    isRecommended,
    summary,
  };
}

/**
 * Enrich a song with DJ metadata from cache or estimation
 *
 * @param song - Song to enrich
 * @returns Song with BPM, key, and energy populated
 */
export async function enrichSongWithDJMetadata(song: Song): Promise<SongWithDJMetadata> {
  // Check if song already has metadata
  if (song.bpm !== undefined && song.energy !== undefined) {
    return song as SongWithDJMetadata;
  }

  // Try to get from cache
  const cached = await getMetadata(song.id);
  if (cached && cached.bpm !== undefined && cached.energy !== undefined) {
    return {
      ...song,
      bpm: cached.bpm,
      key: cached.key || song.key,
      energy: cached.energy,
    };
  }

  // Estimate energy if not available
  const energyEstimate = estimateEnergy({
    genre: song.genre,
    bpm: song.bpm || cached?.bpm,
    title: song.title || song.name,
    artist: song.artist,
  });

  const enriched: SongWithDJMetadata = {
    ...song,
    bpm: song.bpm || cached?.bpm,
    key: song.key || cached?.key,
    energy: song.energy ?? cached?.energy ?? energyEstimate.energy,
  };

  // Cache the enriched data
  const metadataToCache: AudioMetadataCache = {
    id: song.id,
    bpm: enriched.bpm,
    key: enriched.key,
    energy: enriched.energy,
    source: enriched.bpm ? 'navidrome' : 'estimated',
    confidence: energyEstimate.confidence,
    fetchedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await setMetadata(metadataToCache);

  return enriched;
}

/**
 * Enrich multiple songs with DJ metadata efficiently
 *
 * @param songs - Songs to enrich
 * @returns Songs with BPM, key, and energy populated
 */
export async function enrichSongsWithDJMetadata(songs: Song[]): Promise<SongWithDJMetadata[]> {
  if (songs.length === 0) return [];

  // Get cached metadata for all songs
  const songIds = songs.map(s => s.id);
  const cachedMetadata = await getMetadataBatch(songIds);

  // Enrich each song
  const enrichedSongs: SongWithDJMetadata[] = [];

  for (const song of songs) {
    const cached = cachedMetadata.get(song.id);

    // Use cached values if available
    const bpm = song.bpm || cached?.bpm;
    const key = song.key || cached?.key;
    let energy = song.energy ?? cached?.energy;

    // Estimate energy if not available
    if (energy === undefined) {
      const estimate = estimateEnergy({
        genre: song.genre,
        bpm,
        title: song.title || song.name,
        artist: song.artist,
      });
      energy = estimate.energy;
    }

    enrichedSongs.push({
      ...song,
      bpm,
      key,
      energy,
    });
  }

  return enrichedSongs;
}

/**
 * Score and rank songs for DJ compatibility with a source song
 *
 * @param sourceSong - The current/source song
 * @param candidateSongs - Songs to score and rank
 * @param options - Scoring options
 * @returns Sorted array of candidates with DJ scores
 */
export async function scoreAndRankForDJ(
  sourceSong: Song,
  candidateSongs: Song[],
  options: {
    minScore?: number;
    maxResults?: number;
    weights?: typeof DJ_WEIGHTS;
    enrichMetadata?: boolean;
  } = {}
): Promise<Array<{ song: SongWithDJMetadata; djScore: DJScoreResult }>> {
  const {
    minScore = MIN_DJ_SCORE_THRESHOLD,
    maxResults = 50,
    weights = DJ_WEIGHTS,
    enrichMetadata = true,
  } = options;

  // Enrich songs with metadata
  let enrichedSource: SongWithDJMetadata;
  let enrichedCandidates: SongWithDJMetadata[];

  if (enrichMetadata) {
    enrichedSource = await enrichSongWithDJMetadata(sourceSong);
    enrichedCandidates = await enrichSongsWithDJMetadata(candidateSongs);
  } else {
    enrichedSource = sourceSong as SongWithDJMetadata;
    enrichedCandidates = candidateSongs as SongWithDJMetadata[];
  }

  // Calculate DJ scores for all candidates
  const scoredCandidates = enrichedCandidates.map(candidate => ({
    song: candidate,
    djScore: calculateDJScore(enrichedSource, candidate, weights),
  }));

  // Filter by minimum score and sort by total score descending
  const filteredAndSorted = scoredCandidates
    .filter(c => c.djScore.totalScore >= minScore)
    .sort((a, b) => b.djScore.totalScore - a.djScore.totalScore)
    .slice(0, maxResults);

  console.log(`🎧 [DJ Scorer] Scored ${candidateSongs.length} candidates, ${filteredAndSorted.length} above threshold (${minScore})`);

  return filteredAndSorted;
}

/**
 * Find the best DJ transition candidates from a pool of songs
 * Optimized for quick filtering when BPM is known
 *
 * @param sourceSong - The current song
 * @param candidateSongs - Pool of candidate songs
 * @param bpmTolerance - BPM tolerance (default 3%)
 * @returns Top candidates sorted by DJ score
 */
export async function findBestDJTransitions(
  sourceSong: SongWithDJMetadata,
  candidateSongs: SongWithDJMetadata[],
  bpmTolerance: number = BPM_THRESHOLDS.TIGHT
): Promise<Array<{ song: SongWithDJMetadata; djScore: DJScoreResult }>> {
  // If source has BPM, pre-filter candidates for efficiency
  let filteredCandidates = candidateSongs;

  if (sourceSong.bpm && sourceSong.bpm > 0) {
    const minBpm = sourceSong.bpm * (1 - bpmTolerance * 2); // Double tolerance for initial filter
    const maxBpm = sourceSong.bpm * (1 + bpmTolerance * 2);

    // Also include half-time and double-time ranges
    const halfTimeBpm = sourceSong.bpm / 2;
    const doubleTimeBpm = sourceSong.bpm * 2;

    filteredCandidates = candidateSongs.filter(c => {
      if (!c.bpm || c.bpm <= 0) return true; // Include songs without BPM data

      // Check main BPM range
      if (c.bpm >= minBpm && c.bpm <= maxBpm) return true;

      // Check half-time range
      if (Math.abs(c.bpm - halfTimeBpm) / halfTimeBpm <= bpmTolerance * 2) return true;

      // Check double-time range
      if (Math.abs(c.bpm - doubleTimeBpm) / doubleTimeBpm <= bpmTolerance * 2) return true;

      return false;
    });

    console.log(`🎧 [DJ Scorer] BPM pre-filter: ${candidateSongs.length} → ${filteredCandidates.length} candidates`);
  }

  // Score and rank filtered candidates
  return scoreAndRankForDJ(sourceSong, filteredCandidates, {
    enrichMetadata: false, // Already enriched
    minScore: 0.4, // Lower threshold to return more options
    maxResults: 20,
  });
}
