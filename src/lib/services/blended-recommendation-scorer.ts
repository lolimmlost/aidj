/**
 * Blended Recommendation Scorer Service
 *
 * Multi-signal scoring for AI DJ recommendations.
 * Gathers candidates from ALL sources and scores each using ALL signals.
 *
 * This replaces the sequential fallback chain that caused single-artist loops.
 *
 * Scoring Weights:
 * - lastFm: 25% - Last.fm similarity (still valuable)
 * - compound: 20% - Listening history correlation
 * - dj: 20% - BPM/Energy/Key for smooth transitions
 * - feedback: 15% - User explicit preferences (thumbs)
 * - skip: 10% - Avoid frequently skipped
 * - temporal: 5% - Time-of-day bonus
 * - diversity: 5% - Artist variety bonus
 */

import { db } from '../db';
import { recommendationFeedback, trackSimilarities, compoundScores, listeningHistory } from '../db/schema';
import { eq, and, gte, desc, sql, inArray, or } from 'drizzle-orm';
import type { Song } from '@/lib/types/song';
// EnrichedTrack no longer needed - using raw Last.fm API with sequential lookups
import type { LastFmClient } from './lastfm';
import { getLastFmClient } from './lastfm';
import { getConfigAsync } from '@/lib/config/config';
import { search, getRandomSongs } from './navidrome';
import { getCompoundScoreBoosts } from './compound-scoring';
import { calculateSkipScores } from './skip-scoring';
import { calculateDJScore, enrichSongsWithDJMetadata, type SongWithDJMetadata } from './dj-match-scorer';
import { getTimeSlot, getCurrentTimeContext, type TimeContext } from './time-based-discovery';
import { getCurrentSeasonalPattern, type SeasonalPattern } from './seasonal-patterns';
import { normalizeGenre, getGenreSimilarity } from './genre-hierarchy';

// ============================================================================
// Constants
// ============================================================================

export const SCORE_WEIGHTS = {
  lastFm: 0.25,        // Last.fm similarity still valuable
  compound: 0.20,      // Listening history correlation
  dj: 0.20,            // BPM/Energy/Key for smooth transitions
  feedback: 0.15,      // User explicit preferences
  skip: 0.10,          // Avoid frequently skipped
  temporal: 0.05,      // Time-of-day bonus
  diversity: 0.05,     // Artist variety bonus
};

// Delay between searches to avoid rate limiting (ms)
const SEARCH_THROTTLE_MS = 100;

// Helper to throttle searches
async function throttledSearch(query: string, start: number, limit: number): Promise<Song[]> {
  await new Promise(resolve => setTimeout(resolve, SEARCH_THROTTLE_MS));
  return search(query, start, limit);
}

// Maximum candidates to gather from each source
const CANDIDATE_LIMITS = {
  lastfm: 20,
  sameArtist: 2,  // Reduced to prevent artist domination
  similarArtists: 10,
  genre: 10,
  compound: 10,
  liked: 5,
  temporal: 5,
};

// Diversity rules
const MAX_SONGS_PER_ARTIST = 1;  // Max songs from same artist in final results
const MIN_UNIQUE_ARTISTS = 2;   // Try to have at least this many different artists

// ============================================================================
// Types
// ============================================================================

export type CandidateSourceType = 'lastfm' | 'same_artist' | 'similar_artist' | 'genre' | 'compound' | 'liked' | 'temporal';

export interface CandidateSource {
  source: CandidateSourceType;
  weight: number;
  /** Match score from source (0-1), e.g., Last.fm match score */
  matchScore?: number;
}

export interface ScoredCandidate {
  song: Song;
  sources: CandidateSource[];
  scores: {
    lastFm: number;
    compound: number;
    dj: number;
    feedback: number;
    skip: number;
    temporal: number;
    diversity: number;
  };
  finalScore: number;
}

export interface GatherOptions {
  excludeSongIds?: string[];
  excludeArtists?: string[];
  queueContext?: {
    genres?: string[];
    artists?: string[];
    artistBatchCounts?: Record<string, number>;
  };
  djMatching?: {
    enabled: boolean;
    currentBpm?: number;
    currentKey?: string;
    currentEnergy?: number;
  };
}

export interface ScoringContext {
  seedSong: Song & { bpm?: number; key?: string; energy?: number };
  userId?: string;
  timeContext: TimeContext;
  seasonalPattern?: SeasonalPattern | null;
  /** Map of songId -> feedback score (-1 to 1) */
  feedbackScores: Map<string, number>;
  /** Map of songId -> skip penalty (0-1) */
  skipPenalties: Map<string, number>;
  /** Map of songId -> compound boost (0-1) */
  compoundBoosts: Map<string, number>;
  /** Artists already in queue for diversity calculation */
  queuedArtists: Set<string>;
}

export interface BlendedRecommendationOptions extends GatherOptions {
  userId?: string;
  limit?: number;
  /** Custom scoring weights */
  weights?: Partial<typeof SCORE_WEIGHTS>;
}

// ============================================================================
// Candidate Gathering
// ============================================================================

/**
 * Gather candidates from ALL sources in parallel
 * Returns a map of songId -> sources that recommended it
 */
export async function gatherCandidates(
  seedSong: { artist: string; title: string; genre?: string },
  options: GatherOptions
): Promise<Map<string, { song: Song; sources: CandidateSource[] }>> {
  const candidates = new Map<string, { song: Song; sources: CandidateSource[] }>();
  const { excludeSongIds = [], excludeArtists = [], queueContext } = options;

  const excludeSet = new Set(excludeSongIds.map(id => id.toLowerCase()));
  const excludeArtistsLower = new Set(excludeArtists.map(a => a.toLowerCase()));

  // Helper to add candidate with source tracking
  const addCandidate = (song: Song, source: CandidateSource) => {
    if (!song.id || excludeSet.has(song.id.toLowerCase())) return;
    if (song.artist && excludeArtistsLower.has(song.artist.toLowerCase())) return;

    const existing = candidates.get(song.id);
    if (existing) {
      existing.sources.push(source);
    } else {
      candidates.set(song.id, { song, sources: [source] });
    }
  };

  // Get Last.fm client
  const config = await getConfigAsync();
  const lastFm = config.lastfmApiKey ? getLastFmClient(config.lastfmApiKey) : null;

  // Run sources sequentially to avoid rate limiting
  // Priority order: Last.fm (best quality), Same artist, Similar artists, Genre

  // 1. Last.fm similar tracks (highest quality - already has library matching)
  if (lastFm) {
    await gatherLastFmSimilarTracks(lastFm, seedSong, addCandidate).catch(() => {});
  }

  // 2. Same artist songs (limited, single search)
  await gatherSameArtistSongs(seedSong, addCandidate, excludeSet).catch(() => {});

  // 3. Similar artists songs (sequential searches)
  if (lastFm) {
    await gatherSimilarArtistsSongs(lastFm, seedSong, addCandidate, excludeArtistsLower).catch(() => {});
  }

  // 4. Genre-based songs (single call to getRandomSongs)
  const targetGenres = buildTargetGenres(seedSong.genre, queueContext?.genres);
  if (targetGenres.length > 0) {
    await gatherGenreBasedSongs(targetGenres, addCandidate, excludeArtistsLower).catch(() => {});
  }

  console.log(`🎯 [BlendedScorer] Gathered ${candidates.size} unique candidates from multiple sources`);

  return candidates;
}

/**
 * Gather similar tracks from Last.fm
 * Uses raw API call + sequential library lookups to avoid rate limiting
 */
async function gatherLastFmSimilarTracks(
  lastFm: LastFmClient,
  seedSong: { artist: string; title: string },
  addCandidate: (song: Song, source: CandidateSource) => void
): Promise<void> {
  try {
    // Get similar tracks without library enrichment to avoid parallel searches
    const similar = await lastFm.getSimilarTracksRaw(
      seedSong.artist,
      seedSong.title,
      CANDIDATE_LIMITS.lastfm
    );

    // Search for library matches sequentially (max 5 searches to avoid rate limiting)
    let count = 0;
    for (const track of similar.slice(0, 5)) {
      if (count >= CANDIDATE_LIMITS.lastfm) break;

      try {
        const query = `${track.artist} ${track.name}`;
        const results = await throttledSearch(query, 0, 3);

        // Find a good match
        const match = results.find(song => {
          const artistLower = (song.artist || '').toLowerCase();
          const trackArtistLower = track.artist.toLowerCase();
          const titleLower = (song.title || song.name || '').toLowerCase();
          const trackNameLower = track.name.toLowerCase();

          const artistMatch = artistLower.includes(trackArtistLower) || trackArtistLower.includes(artistLower);
          const titleMatch = titleLower.includes(trackNameLower) || trackNameLower.includes(titleLower);

          return artistMatch && titleMatch;
        });

        if (match) {
          const songWithUrl: Song = {
            ...match,
            url: match.url || `/api/navidrome/stream/${match.id}`,
          };
          addCandidate(songWithUrl, {
            source: 'lastfm',
            weight: 1.0,
            matchScore: track.match || 0.5,
          });
          count++;
        }
      } catch {
        // Continue with next track
      }
    }
    console.log(`🎵 [BlendedScorer] Last.fm: ${count} library matches from ${similar.length} similar tracks`);
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Last.fm similar tracks failed:', error);
  }
}

/**
 * Gather songs from the same artist (limited to prevent domination)
 */
async function gatherSameArtistSongs(
  seedSong: { artist: string; title: string },
  addCandidate: (song: Song, source: CandidateSource) => void,
  excludeSet: Set<string>
): Promise<void> {
  try {
    const artistSongs = await throttledSearch(seedSong.artist, 0, 20);
    const artistLower = seedSong.artist.toLowerCase();
    const titleLower = seedSong.title.toLowerCase();

    let count = 0;
    for (const song of artistSongs) {
      if (count >= CANDIDATE_LIMITS.sameArtist) break;

      const songArtistLower = (song.artist || '').toLowerCase();
      const songTitleLower = (song.title || song.name || '').toLowerCase();

      // Must be same artist but different song
      if (
        songArtistLower === artistLower &&
        songTitleLower !== titleLower &&
        !excludeSet.has(song.id)
      ) {
        // search() already returns Song[], just add stream URL if missing
        const songWithUrl: Song = {
          ...song,
          url: song.url || `/api/navidrome/stream/${song.id}`,
        };
        addCandidate(songWithUrl, {
          source: 'same_artist',
          weight: 0.8,
          matchScore: 0.6,
        });
        count++;
      }
    }
    console.log(`🎤 [BlendedScorer] Same artist: ${count} songs`);
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Same artist search failed:', error);
  }
}

/**
 * Gather songs from similar artists via Last.fm
 * Note: This function is conservative with searches to avoid rate limiting
 */
async function gatherSimilarArtistsSongs(
  lastFm: LastFmClient,
  seedSong: { artist: string },
  addCandidate: (song: Song, source: CandidateSource) => void,
  excludeArtists: Set<string>
): Promise<void> {
  try {
    // Get similar artists WITHOUT searching Navidrome (just from Last.fm API)
    // This avoids the parallel search problem
    const similarArtists = await lastFm.getSimilarArtistsRaw(seedSong.artist, 10);

    // Filter to artists not excluded
    const candidateArtists = similarArtists
      .filter(a => !excludeArtists.has(a.name.toLowerCase()))
      .slice(0, 3); // Only search top 3 to avoid rate limits

    let totalCount = 0;
    for (const artist of candidateArtists) {
      if (totalCount >= CANDIDATE_LIMITS.similarArtists) break;

      try {
        // Search sequentially, not in parallel
        const artistSongs = await throttledSearch(artist.name, 0, 3);
        for (const song of artistSongs) {
          if (totalCount >= CANDIDATE_LIMITS.similarArtists) break;

          const songArtistLower = (song.artist || '').toLowerCase();
          const artistNameLower = artist.name.toLowerCase();
          // More strict matching - exact match or song artist starts with artist name
          if (songArtistLower === artistNameLower || songArtistLower.startsWith(artistNameLower)) {
            const songWithUrl: Song = {
              ...song,
              url: song.url || `/api/navidrome/stream/${song.id}`,
            };
            addCandidate(songWithUrl, {
              source: 'similar_artist',
              weight: 0.7,
              matchScore: artist.match || 0.5,
            });
            totalCount++;
          }
        }
      } catch {
        // Continue with next artist
      }
    }
    console.log(`🎭 [BlendedScorer] Similar artists: ${totalCount} songs from ${candidateArtists.length} artists`);
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Similar artists search failed:', error);
  }
}

/**
 * Gather genre-based songs using genre hierarchy
 */
async function gatherGenreBasedSongs(
  targetGenres: string[],
  addCandidate: (song: Song, source: CandidateSource) => void,
  excludeArtists: Set<string>
): Promise<void> {
  try {
    // Get random songs and filter by genre similarity
    const poolSize = Math.max(CANDIDATE_LIMITS.genre * 10, 100);
    // Add throttle before API call
    await new Promise(resolve => setTimeout(resolve, SEARCH_THROTTLE_MS));
    const songs = await getRandomSongs(poolSize);

    // Score each song by genre similarity
    // getRandomSongs returns Song[], not SubsonicSong
    const scoredSongs: Array<{ song: Song; score: number }> = [];
    for (const song of songs) {
      if (song.artist && excludeArtists.has(song.artist.toLowerCase())) continue;

      const songGenre = normalizeGenre(song.genre || '');
      if (!songGenre) continue;

      let bestScore = 0;
      for (const targetGenre of targetGenres) {
        const similarity = getGenreSimilarity(songGenre, targetGenre);
        if (similarity > bestScore) bestScore = similarity;
      }

      if (bestScore >= 0.3) {
        scoredSongs.push({ song, score: bestScore });
      }
    }

    // Sort by score and take top candidates
    scoredSongs.sort((a, b) => b.score - a.score);

    let count = 0;
    for (const { song, score } of scoredSongs.slice(0, CANDIDATE_LIMITS.genre)) {
      // getRandomSongs() already returns Song[], just ensure URL is set
      const songWithUrl: Song = {
        ...song,
        url: song.url || `/api/navidrome/stream/${song.id}`,
      };
      addCandidate(songWithUrl, {
        source: 'genre',
        weight: 0.6,
        matchScore: score,
      });
      count++;
    }
    console.log(`🎸 [BlendedScorer] Genre-based: ${count} songs matching genres: ${targetGenres.slice(0, 3).join(', ')}`);
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Genre-based search failed:', error);
  }
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Build scoring context with all pre-fetched data
 */
async function buildScoringContext(
  seedSong: Song & { bpm?: number; key?: string; energy?: number },
  songIds: string[],
  userId?: string,
  queuedArtists?: string[]
): Promise<ScoringContext> {
  const timeContext = getCurrentTimeContext();

  // Initialize maps
  let feedbackScores = new Map<string, number>();
  let skipPenalties = new Map<string, number>();
  let compoundBoosts = new Map<string, number>();
  let seasonalPattern: SeasonalPattern | null = null;

  if (userId && songIds.length > 0) {
    // Fetch all scoring data in parallel
    const [feedbackData, skipData, compoundData, seasonal] = await Promise.allSettled([
      getFeedbackScores(userId, songIds),
      getSkipPenalties(userId, songIds),
      getCompoundScoreBoosts(userId, songIds),
      getCurrentSeasonalPattern(userId),
    ]);

    if (feedbackData.status === 'fulfilled') feedbackScores = feedbackData.value;
    if (skipData.status === 'fulfilled') skipPenalties = skipData.value;
    if (compoundData.status === 'fulfilled') compoundBoosts = compoundData.value;
    if (seasonal.status === 'fulfilled') seasonalPattern = seasonal.value;
  }

  return {
    seedSong,
    userId,
    timeContext,
    seasonalPattern,
    feedbackScores,
    skipPenalties,
    compoundBoosts,
    queuedArtists: new Set((queuedArtists || []).map(a => a.toLowerCase())),
  };
}

/**
 * Get feedback scores for songs (thumbs up = 1, thumbs down = -1, no feedback = 0)
 */
async function getFeedbackScores(userId: string, songIds: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  try {
    const feedback = await db
      .select({
        songId: recommendationFeedback.songId,
        feedbackType: recommendationFeedback.feedbackType,
      })
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          inArray(recommendationFeedback.songId, songIds)
        )
      );

    // Aggregate feedback per song (most recent wins, or average)
    const feedbackMap = new Map<string, number[]>();
    for (const row of feedback) {
      if (!row.songId) continue;
      const value = row.feedbackType === 'thumbs_up' ? 1 : -1;
      const existing = feedbackMap.get(row.songId) || [];
      existing.push(value);
      feedbackMap.set(row.songId, existing);
    }

    // Calculate average feedback per song
    for (const [songId, values] of feedbackMap) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      scores.set(songId, avg);
    }
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Failed to fetch feedback scores:', error);
  }

  return scores;
}

/**
 * Get skip penalties for songs (0-1, higher = worse)
 */
async function getSkipPenalties(userId: string, songIds: string[]): Promise<Map<string, number>> {
  const penalties = new Map<string, number>();

  try {
    // Create minimal Song objects for skip scoring
    const songs: Song[] = songIds.map(id => ({
      id,
      name: '',
      title: '',
      artist: '',
      albumId: '',
      duration: 0,
      track: 0,
      url: '',
    }));

    const skipScores = await calculateSkipScores(songs, { userId });

    for (const [songId, score] of skipScores) {
      penalties.set(songId, score.skipPenalty);
    }
  } catch (error) {
    console.warn('⚠️ [BlendedScorer] Failed to fetch skip penalties:', error);
  }

  return penalties;
}

/**
 * Score a single candidate using all signals
 */
function scoreCandidate(
  candidate: { song: Song; sources: CandidateSource[] },
  context: ScoringContext,
  enrichedSong?: SongWithDJMetadata,
  weights: typeof SCORE_WEIGHTS = SCORE_WEIGHTS
): ScoredCandidate {
  const { song, sources } = candidate;
  const {
    seedSong,
    timeContext,
    seasonalPattern,
    feedbackScores,
    skipPenalties,
    compoundBoosts,
    queuedArtists,
  } = context;

  // 1. Last.fm score - from sources
  const lastFmSource = sources.find(s => s.source === 'lastfm');
  const lastFmScore = lastFmSource?.matchScore ?? 0.5;

  // 2. Compound score - from pre-fetched data
  const compoundScore = compoundBoosts.get(song.id) ?? 0;

  // 3. DJ score - BPM/Energy/Key compatibility
  let djScore = 0.5; // Default neutral
  if (enrichedSong && (seedSong.bpm || seedSong.energy || seedSong.key)) {
    const djResult = calculateDJScore(
      seedSong as SongWithDJMetadata,
      enrichedSong
    );
    djScore = djResult.totalScore;
  }

  // 4. Feedback score (-1 to 1 -> 0 to 1)
  const rawFeedback = feedbackScores.get(song.id) ?? 0;
  const feedbackScore = (rawFeedback + 1) / 2;

  // 5. Skip penalty (0-1, inverted for score)
  const skipPenalty = skipPenalties.get(song.id) ?? 0;
  const skipScore = 1 - skipPenalty;

  // 6. Temporal score - boost songs from current time slot
  let temporalScore = 0.5; // Default neutral
  if (seasonalPattern) {
    // Check if this song's genre matches seasonal preferences
    const songGenre = normalizeGenre(song.genre || '');
    if (songGenre && seasonalPattern.preferredGenres?.length > 0) {
      for (const prefGenre of seasonalPattern.preferredGenres) {
        const similarity = getGenreSimilarity(songGenre, normalizeGenre(prefGenre));
        if (similarity > 0.5) {
          temporalScore = Math.min(1, 0.5 + similarity * 0.5);
          break;
        }
      }
    }
    // Also check preferred artists
    if (song.artist && seasonalPattern.preferredArtists?.includes(song.artist)) {
      temporalScore = Math.max(temporalScore, 0.8);
    }
  }

  // 7. Diversity score - penalize artists already in queue
  const artistLower = song.artist?.toLowerCase() || '';
  const diversityScore = queuedArtists.has(artistLower) ? 0.3 : 1.0;

  // Calculate final weighted score
  const finalScore =
    (lastFmScore * weights.lastFm) +
    (compoundScore * weights.compound) +
    (djScore * weights.dj) +
    (feedbackScore * weights.feedback) +
    (skipScore * weights.skip) +
    (temporalScore * weights.temporal) +
    (diversityScore * weights.diversity);

  return {
    song,
    sources,
    scores: {
      lastFm: lastFmScore,
      compound: compoundScore,
      dj: djScore,
      feedback: feedbackScore,
      skip: skipScore,
      temporal: temporalScore,
      diversity: diversityScore,
    },
    finalScore,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Get blended recommendations using multi-signal scoring
 *
 * This is the main entry point that:
 * 1. Gathers candidates from ALL sources (parallel)
 * 2. Scores each candidate using ALL signals
 * 3. Applies diversity rules
 * 4. Returns top recommendations
 */
export async function getBlendedRecommendations(
  seedSong: { artist: string; title: string; genre?: string; bpm?: number; key?: string; energy?: number },
  options: BlendedRecommendationOptions = {}
): Promise<{ songs: Song[]; metadata: BlendedMetadata }> {
  const {
    userId,
    limit = 10,
    excludeSongIds = [],
    excludeArtists = [],
    queueContext,
    djMatching,
    weights = SCORE_WEIGHTS,
  } = options;

  console.log(`🎯 [BlendedScorer] Starting blended recommendations for "${seedSong.artist} - ${seedSong.title}"`);

  // 1. Gather candidates from all sources
  const candidates = await gatherCandidates(seedSong, {
    excludeSongIds,
    excludeArtists,
    queueContext,
    djMatching,
  });

  if (candidates.size === 0) {
    console.log('⚠️ [BlendedScorer] No candidates found from any source');
    return { songs: [], metadata: { totalCandidates: 0, sourceCounts: {} } };
  }

  // 2. Build scoring context (pre-fetch all scoring data)
  const songIds = Array.from(candidates.keys());
  const songs = Array.from(candidates.values()).map(c => c.song);

  // Create seed song object with all metadata
  const seedSongFull: Song & { bpm?: number; key?: string; energy?: number } = {
    id: 'seed',
    name: seedSong.title,
    title: seedSong.title,
    artist: seedSong.artist,
    genre: seedSong.genre,
    albumId: '',
    duration: 0,
    track: 0,
    url: '',
    bpm: djMatching?.currentBpm || seedSong.bpm,
    key: djMatching?.currentKey || seedSong.key,
    energy: djMatching?.currentEnergy || seedSong.energy,
  };

  const scoringContext = await buildScoringContext(
    seedSongFull,
    songIds,
    userId,
    queueContext?.artists
  );

  // 3. Enrich songs with DJ metadata if DJ matching is enabled
  // Note: This may fail on server-side due to IndexedDB not being available
  let enrichedSongs: Map<string, SongWithDJMetadata> = new Map();
  if (djMatching?.enabled) {
    try {
      const enriched = await enrichSongsWithDJMetadata(songs);
      for (const song of enriched) {
        enrichedSongs.set(song.id, song);
      }
    } catch (error) {
      // IndexedDB not available on server-side, continue without DJ metadata
      // DJ scoring will use neutral 0.5 scores
    }
  }

  // 4. Score all candidates
  const mergedWeights = { ...SCORE_WEIGHTS, ...weights };
  const scoredCandidates: ScoredCandidate[] = [];

  for (const [songId, candidate] of candidates) {
    const enriched = enrichedSongs.get(songId);
    const scored = scoreCandidate(candidate, scoringContext, enriched, mergedWeights);
    scoredCandidates.push(scored);
  }

  // 5. Sort by final score
  scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

  // 6. Apply diversity rules
  const finalResults = applyDiversityRules(scoredCandidates, limit);

  // 7. Build metadata
  const sourceCounts: Record<string, number> = {};
  for (const [, candidate] of candidates) {
    for (const source of candidate.sources) {
      sourceCounts[source.source] = (sourceCounts[source.source] || 0) + 1;
    }
  }

  const avgScores = calculateAverageScores(finalResults);

  console.log(`✅ [BlendedScorer] Returning ${finalResults.length} recommendations from ${candidates.size} candidates`);
  console.log(`📊 [BlendedScorer] Source distribution: ${JSON.stringify(sourceCounts)}`);
  console.log(`📊 [BlendedScorer] Avg scores - lastFm: ${avgScores.lastFm.toFixed(2)}, compound: ${avgScores.compound.toFixed(2)}, dj: ${avgScores.dj.toFixed(2)}, feedback: ${avgScores.feedback.toFixed(2)}`);

  return {
    songs: finalResults.map(r => r.song),
    metadata: {
      totalCandidates: candidates.size,
      sourceCounts,
      avgScores,
      uniqueArtists: new Set(finalResults.map(r => r.song.artist?.toLowerCase())).size,
    },
  };
}

// ============================================================================
// Diversity Rules
// ============================================================================

/**
 * Apply diversity rules to avoid artist domination
 *
 * Rules:
 * 1. Max 1 song per artist in final results
 * 2. Ensure at least 2 different artists if possible
 * 3. Slight randomization in top candidates for variety
 */
function applyDiversityRules(
  scoredCandidates: ScoredCandidate[],
  limit: number
): ScoredCandidate[] {
  const results: ScoredCandidate[] = [];
  const artistsUsed = new Set<string>();

  // Debug: log unique artists in candidates
  const uniqueArtists = new Set(scoredCandidates.map(c => c.song.artist?.toLowerCase() || 'unknown'));
  console.log(`🎯 [BlendedScorer] Diversity check: ${scoredCandidates.length} candidates, ${uniqueArtists.size} unique artists, limit=${limit}`);

  // First pass: add best song from each artist
  for (const candidate of scoredCandidates) {
    if (results.length >= limit) break;

    const artistLower = candidate.song.artist?.toLowerCase() || '';
    const artistCount = artistsUsed.has(artistLower) ? 1 : 0;

    if (artistCount < MAX_SONGS_PER_ARTIST) {
      results.push(candidate);
      artistsUsed.add(artistLower);
    }
  }

  // Check if we need more diversity
  if (results.length >= MIN_UNIQUE_ARTISTS && artistsUsed.size < MIN_UNIQUE_ARTISTS) {
    // We have enough songs but not enough artists
    // Try to swap some songs for different artists
    const candidates2ndPass = scoredCandidates.filter(c =>
      !results.includes(c) && !artistsUsed.has(c.song.artist?.toLowerCase() || '')
    );

    // Replace lowest-scored same-artist songs with different artists
    for (const newCandidate of candidates2ndPass.slice(0, 3)) {
      const replaceIdx = results.findIndex((r, idx) => {
        // Find a duplicate artist to replace (prefer lower scored ones)
        const rArtist = r.song.artist?.toLowerCase();
        const duplicateCount = results.filter(x => x.song.artist?.toLowerCase() === rArtist).length;
        return duplicateCount > 1 && idx > results.length / 2;
      });

      if (replaceIdx >= 0) {
        results[replaceIdx] = newCandidate;
        artistsUsed.add(newCandidate.song.artist?.toLowerCase() || '');
      }
    }
  }

  // Add slight randomization in top 20% to avoid staleness
  const top20Percent = Math.ceil(results.length * 0.2);
  if (top20Percent > 1) {
    const topSection = results.slice(0, top20Percent);
    // Fisher-Yates shuffle for top section
    for (let i = topSection.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [topSection[i], topSection[j]] = [topSection[j], topSection[i]];
    }
    results.splice(0, top20Percent, ...topSection);
  }

  return results;
}

// ============================================================================
// Helpers
// ============================================================================

function buildTargetGenres(seedGenre?: string, queueGenres?: string[]): string[] {
  const genres: string[] = [];

  if (queueGenres && queueGenres.length > 0) {
    genres.push(...queueGenres.slice(0, 5).map(g => normalizeGenre(g)));
  }

  if (seedGenre) {
    const normalized = normalizeGenre(seedGenre);
    if (!genres.includes(normalized)) {
      genres.push(normalized);
    }
  }

  return genres.filter(Boolean);
}

function calculateAverageScores(results: ScoredCandidate[]): Record<string, number> {
  if (results.length === 0) {
    return { lastFm: 0, compound: 0, dj: 0, feedback: 0, skip: 0, temporal: 0, diversity: 0 };
  }

  const totals = { lastFm: 0, compound: 0, dj: 0, feedback: 0, skip: 0, temporal: 0, diversity: 0 };

  for (const r of results) {
    totals.lastFm += r.scores.lastFm;
    totals.compound += r.scores.compound;
    totals.dj += r.scores.dj;
    totals.feedback += r.scores.feedback;
    totals.skip += r.scores.skip;
    totals.temporal += r.scores.temporal;
    totals.diversity += r.scores.diversity;
  }

  const count = results.length;
  return {
    lastFm: totals.lastFm / count,
    compound: totals.compound / count,
    dj: totals.dj / count,
    feedback: totals.feedback / count,
    skip: totals.skip / count,
    temporal: totals.temporal / count,
    diversity: totals.diversity / count,
  };
}

// ============================================================================
// Types for Metadata
// ============================================================================

export interface BlendedMetadata {
  totalCandidates: number;
  sourceCounts: Record<string, number>;
  avgScores?: Record<string, number>;
  uniqueArtists?: number;
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  CANDIDATE_LIMITS,
  MAX_SONGS_PER_ARTIST,
  MIN_UNIQUE_ARTISTS,
};
