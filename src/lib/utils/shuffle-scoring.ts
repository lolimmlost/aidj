import type { Song } from '@/lib/types/song';

export interface ShuffleOptions {
  recentlyPlayedIds: string[];
  skipCounts: Record<string, number>;
}

/**
 * Fisher-Yates shuffle algorithm — produces unbiased permutations in O(n) time.
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
 * Generate a single candidate shuffle with artist-separation hard constraint.
 * Groups songs by artist, shuffles each group, then interleaves to maximize
 * distance between same-artist songs. A light random-swap pass adds variety
 * without breaking the separation.
 */
export function generateCandidate(songs: Song[], _options: ShuffleOptions): Song[] {
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

  // Single artist → Fisher-Yates is sufficient
  if (artistGroups.size === 1) {
    return fisherYatesShuffle(songs);
  }

  // Shuffle each artist's songs independently
  for (const [artist, artistSongs] of artistGroups) {
    artistGroups.set(artist, fisherYatesShuffle(artistSongs));
  }

  // Sort artists by count descending for stable interleaving
  const sortedArtists = Array.from(artistGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  // Interleave: place each artist's songs at regular intervals
  const result: (Song | undefined)[] = new Array(songs.length);
  const filled: boolean[] = new Array(songs.length).fill(false);

  for (const [, artistSongs] of sortedArtists) {
    const interval = songs.length / artistSongs.length;
    let offset = Math.random() * interval;

    for (const song of artistSongs) {
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

  // Safety: fill any gaps (shouldn't happen normally)
  const placedIds = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    if (result[i]) placedIds.add(result[i]!.id);
  }
  const gapSongs = songs.filter(s => !placedIds.has(s.id));
  let gapIdx = 0;
  for (let i = 0; i < result.length; i++) {
    if (!filled[i] && gapIdx < gapSongs.length) {
      result[i] = gapSongs[gapIdx++];
    }
  }

  // Light swap pass — swap adjacent pairs 20% of the time unless it creates adjacency
  const out = result as Song[];
  for (let i = 0; i < out.length - 1; i++) {
    if (Math.random() < 0.2) {
      const prev = i > 0 ? out[i - 1] : null;
      const afterNext = i + 2 < out.length ? out[i + 2] : null;
      const curArtist = out[i]?.artist?.toLowerCase();
      const nextArtist = out[i + 1]?.artist?.toLowerCase();
      const prevArtist = prev?.artist?.toLowerCase();
      const afterArtist = afterNext?.artist?.toLowerCase();
      const swapBreaks =
        (prevArtist && prevArtist === nextArtist) ||
        (afterArtist && afterArtist === curArtist);
      if (!swapBreaks) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
      }
    }
  }

  return out;
}

// --- Scoring dimensions ---

/**
 * Freshness (weight: 30%) — penalize recently-played songs that appear early.
 * Returns 0..1 where 1 = perfectly fresh.
 */
function freshness(candidate: Song[], recentSet: Set<string>, recentOrder: string[]): number {
  if (recentSet.size === 0) return 1;
  let penalty = 0;
  const n = candidate.length;
  for (let i = 0; i < n; i++) {
    if (recentSet.has(candidate[i].id)) {
      // Position weight: earlier positions penalized more (1.0 → 0.0)
      const positionWeight = 1 - i / n;
      // Recency weight: more recently played → higher penalty
      const recencyIdx = recentOrder.indexOf(candidate[i].id);
      const recencyWeight = recencyIdx >= 0 ? 1 - recencyIdx / recentOrder.length : 0.5;
      penalty += positionWeight * recencyWeight;
    }
  }
  const maxPenalty = Math.min(recentSet.size, n);
  return Math.max(0, 1 - penalty / maxPenalty);
}

/**
 * Opening stretch (weight: 25%) — first 5 songs should have max artist/genre diversity.
 * Returns 0..1.
 */
function openingStretch(candidate: Song[]): number {
  const windowSize = Math.min(5, candidate.length);
  if (windowSize <= 1) return 1;

  const window = candidate.slice(0, windowSize);

  // Artist diversity in opening
  const artists = new Set(window.map(s => s.artist?.toLowerCase() || 'unknown'));
  const artistDiversity = artists.size / windowSize;

  // Genre diversity in opening
  const genres = new Set(window.map(s => s.genre?.toLowerCase() || 'unknown'));
  const genreDiversity = genres.size / windowSize;

  return artistDiversity * 0.6 + genreDiversity * 0.4;
}

/**
 * Artist diversity (weight: 20%) — count same-artist adjacencies.
 * Returns 0..1 where 1 = no adjacencies.
 */
function artistDiversity(candidate: Song[]): number {
  if (candidate.length <= 1) return 1;
  let adjacencies = 0;
  for (let i = 0; i < candidate.length - 1; i++) {
    if (
      candidate[i].artist?.toLowerCase() === candidate[i + 1].artist?.toLowerCase()
    ) {
      adjacencies++;
    }
  }
  return 1 - adjacencies / (candidate.length - 1);
}

/**
 * Genre clustering (weight: 10%) — penalize 3+ same-genre in a sliding window of 3.
 * Returns 0..1.
 */
function genreClustering(candidate: Song[]): number {
  if (candidate.length < 3) return 1;
  let clusters = 0;
  const windows = candidate.length - 2;
  for (let i = 0; i < windows; i++) {
    const g1 = candidate[i].genre?.toLowerCase() || '';
    const g2 = candidate[i + 1].genre?.toLowerCase() || '';
    const g3 = candidate[i + 2].genre?.toLowerCase() || '';
    if (g1 && g1 === g2 && g2 === g3) {
      clusters++;
    }
  }
  return 1 - clusters / windows;
}

/**
 * Skip penalty (weight: 15%) — penalize frequently-skipped songs, especially early.
 * Returns 0..1 where 1 = no skip penalty.
 */
function skipPenalty(candidate: Song[], skipCounts: Record<string, number>): number {
  if (Object.keys(skipCounts).length === 0) return 1;
  let penalty = 0;
  const n = candidate.length;
  for (let i = 0; i < n; i++) {
    const count = skipCounts[candidate[i].id] || 0;
    if (count >= 2) {
      // Penalty proportional to skip count (capped at 1)
      const skipWeight = Math.min(1, count / 10);
      // Earlier positions penalized more
      const posWeight = 1 - i / n;
      penalty += skipWeight * posWeight;
    }
  }
  const maxPenalty = n;
  return Math.max(0, 1 - penalty / maxPenalty);
}

/**
 * Score a candidate shuffle sequence.
 * Returns a composite score (higher = better).
 *
 * Base weights: freshness 30%, opening 25%, artist 20%, genre 10%, skip 15%
 * Bonus: +0.1 per hook song in position 0–2 (up to +0.3)
 * Penalty: -0.05 if first 2 songs share the same genre
 */
export function scoreCandidate(
  candidate: Song[],
  options: ShuffleOptions,
  hookIds?: Set<string>,
): number {
  const recentSet = new Set(options.recentlyPlayedIds);

  const f = freshness(candidate, recentSet, options.recentlyPlayedIds);
  const o = openingStretch(candidate);
  const a = artistDiversity(candidate);
  const g = genreClustering(candidate);
  const s = skipPenalty(candidate, options.skipCounts);

  let score = f * 0.30 + o * 0.25 + a * 0.20 + g * 0.10 + s * 0.15;

  // Hook bonus: reward hook songs in prominent positions
  if (hookIds && hookIds.size > 0) {
    const maxPos = Math.min(3, candidate.length);
    let hookBonus = 0;
    for (let i = 0; i < maxPos; i++) {
      if (hookIds.has(candidate[i].id)) {
        hookBonus += 0.1;
      }
    }
    score += Math.min(hookBonus, 0.3);
  }

  // Penalty: first 2 songs sharing the same genre feels repetitive
  if (candidate.length >= 2) {
    const g1 = candidate[0].genre?.toLowerCase();
    const g2 = candidate[1].genre?.toLowerCase();
    if (g1 && g1 === g2) {
      score -= 0.05;
    }
  }

  return score;
}

/**
 * Identify "hook" songs — frequently played and rarely skipped.
 * A hook = appears 3+ times in recentlyPlayedIds AND skipCount < 2.
 */
export function identifyHookSongs(
  songs: Song[],
  recentlyPlayedIds: string[],
  skipCounts: Record<string, number>,
): Set<string> {
  // Count appearances in recently played
  const playCounts = new Map<string, number>();
  for (const id of recentlyPlayedIds) {
    playCounts.set(id, (playCounts.get(id) || 0) + 1);
  }

  const hookIds = new Set<string>();
  const songIdSet = new Set(songs.map(s => s.id));

  for (const [id, count] of playCounts) {
    if (count >= 3 && (skipCounts[id] || 0) < 2 && songIdSet.has(id)) {
      hookIds.add(id);
    }
  }

  return hookIds;
}

/**
 * Apply opening-stretch hard constraints after generating a candidate:
 * - If fewer than 1 hook song in positions 0–4, swap one in from later
 * - Ensure first 5 songs have no repeated artist
 */
function applyOpeningConstraints(
  candidate: Song[],
  hookIds: Set<string>,
): Song[] {
  if (candidate.length < 5) return candidate;
  const result = [...candidate];

  // 1. Ensure at least 1 hook song in positions 0–4
  const openingHooks = result.slice(0, 5).filter(s => hookIds.has(s.id)).length;
  if (openingHooks < 1 && hookIds.size > 0) {
    // Find first hook song after position 4
    const hookLaterIdx = result.findIndex((s, i) => i >= 5 && hookIds.has(s.id));
    if (hookLaterIdx !== -1) {
      // Swap with a non-hook song in positions 0–4 (pick position 2 for balanced feel)
      const swapTarget = Math.min(2, result.length - 1);
      [result[swapTarget], result[hookLaterIdx]] = [result[hookLaterIdx], result[swapTarget]];
    }
  }

  // 2. Ensure first 5 songs have no repeated artist
  const windowSize = Math.min(5, result.length);
  const seenArtists = new Set<string>();
  for (let i = 0; i < windowSize; i++) {
    const artist = result[i].artist?.toLowerCase() || 'unknown';
    if (seenArtists.has(artist)) {
      // Find a swap candidate after the window with a different artist
      for (let j = windowSize; j < result.length; j++) {
        const otherArtist = result[j].artist?.toLowerCase() || 'unknown';
        if (!seenArtists.has(otherArtist)) {
          [result[i], result[j]] = [result[j], result[i]];
          seenArtists.add(otherArtist);
          break;
        }
      }
    } else {
      seenArtists.add(artist);
    }
  }

  return result;
}

/**
 * Generate N candidates, score each, return the best.
 *
 * - <10 songs: single candidate (no multi-candidate needed)
 * - 10–500 songs: 50 candidates
 * - >500 songs: 20 candidates (performance)
 */
export function selectBestShuffle(songs: Song[], options: ShuffleOptions): Song[] {
  if (songs.length === 0) return [];
  if (songs.length < 10) {
    const candidate = generateCandidate(songs, options);
    const hookIds = identifyHookSongs(songs, options.recentlyPlayedIds, options.skipCounts);
    return applyOpeningConstraints(candidate, hookIds);
  }

  const numCandidates = songs.length > 500 ? 20 : 50;
  const hookIds = identifyHookSongs(songs, options.recentlyPlayedIds, options.skipCounts);

  let bestCandidate: Song[] | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < numCandidates; i++) {
    const candidate = generateCandidate(songs, options);
    const constrained = applyOpeningConstraints(candidate, hookIds);
    const score = scoreCandidate(constrained, options, hookIds);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = constrained;
    }
  }

  return bestCandidate!;
}
