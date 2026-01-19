import { ServiceError } from '../utils';
import type {
  PlaylistPlatform,
  MatchConfidence,
  SongMatchResult,
} from '../db/schema/playlist-export.schema';
import type { ExportableSong } from './playlist-export';

/**
 * Match configuration options
 */
export interface MatchOptions {
  targetPlatforms: PlaylistPlatform[];
  useIsrc?: boolean;
  useFuzzyMatch?: boolean;
  minConfidenceScore?: number;
  maxMatchesPerSong?: number;
}

/**
 * Platform search result
 */
export interface PlatformSearchResult {
  platform: PlaylistPlatform;
  platformId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  isrc?: string;
  url?: string;
}

/**
 * Platform searcher interface
 */
export interface PlatformSearcher {
  platform: PlaylistPlatform;
  searchByIsrc(isrc: string): Promise<PlatformSearchResult[]>;
  searchByTitleArtist(title: string, artist: string, album?: string): Promise<PlatformSearchResult[]>;
}

/**
 * Fuzzy string matching using Levenshtein distance
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
  const normalizedA = normalizeString(a);
  const normalizedB = normalizeString(b);

  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);

  return 1 - distance / maxLength;
}

/**
 * Normalize string for comparison
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, ' ') // Replace non-word chars with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Normalize artist name for comparison
 * Handles common variations like "feat.", "ft.", "&", "and", etc.
 */
export function normalizeArtist(artist: string): string {
  return normalizeString(artist)
    .replace(/\s*(feat|ft|featuring|with|vs|versus|and|&)\s*/gi, ' ')
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical info
    .replace(/\s*\[[^\]]*\]/g, '') // Remove bracketed info
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize title for comparison
 * Removes common suffixes like "(Remastered)", "(Live)", etc.
 */
export function normalizeTitle(title: string): string {
  return normalizeString(title)
    .replace(/\s*\((remaster|remastered|deluxe|extended|live|acoustic|demo|remix|edit|radio|single|album|bonus|version|ver|mix)[^)]*\)/gi, '')
    .replace(/\s*\[(remaster|remastered|deluxe|extended|live|acoustic|demo|remix|edit|radio|single|album|bonus|version|ver|mix)[^\]]*\]/gi, '')
    .replace(/\s*-\s*(remaster|remastered|deluxe|extended|live|acoustic|demo|remix|edit|radio|single|album|bonus|version|ver|mix).*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate match score between two songs
 */
export function calculateMatchScore(
  source: ExportableSong,
  candidate: PlatformSearchResult
): { score: number; confidence: MatchConfidence; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // ISRC match is definitive
  if (source.isrc && candidate.isrc && source.isrc.toUpperCase() === candidate.isrc.toUpperCase()) {
    return { score: 100, confidence: 'exact', reason: 'ISRC code match' };
  }

  // Title similarity (40% weight)
  const titleSimilarity = stringSimilarity(
    normalizeTitle(source.title),
    normalizeTitle(candidate.title)
  );
  score += titleSimilarity * 40;
  if (titleSimilarity > 0.9) reasons.push('Title matches closely');
  else if (titleSimilarity > 0.7) reasons.push('Title similar');

  // Artist similarity (40% weight)
  const artistSimilarity = stringSimilarity(
    normalizeArtist(source.artist),
    normalizeArtist(candidate.artist)
  );
  score += artistSimilarity * 40;
  if (artistSimilarity > 0.9) reasons.push('Artist matches closely');
  else if (artistSimilarity > 0.7) reasons.push('Artist similar');

  // Album similarity (10% weight) - if both have album info
  if (source.album && candidate.album) {
    const albumSimilarity = stringSimilarity(
      normalizeString(source.album),
      normalizeString(candidate.album)
    );
    score += albumSimilarity * 10;
    if (albumSimilarity > 0.8) reasons.push('Album matches');
  }

  // Duration similarity (10% weight) - if both have duration
  if (source.duration && candidate.duration) {
    const durationDiff = Math.abs(source.duration - candidate.duration);
    if (durationDiff <= 3) {
      score += 10;
      reasons.push('Duration matches');
    } else if (durationDiff <= 10) {
      score += 5;
      reasons.push('Duration close');
    }
  }

  // Determine confidence level
  let confidence: MatchConfidence;
  if (score >= 90) {
    confidence = 'exact';
  } else if (score >= 70) {
    confidence = 'high';
  } else if (score >= 50) {
    confidence = 'low';
  } else {
    confidence = 'none';
  }

  return {
    score: Math.round(score),
    confidence,
    reason: reasons.length > 0 ? reasons.join(', ') : 'Partial match',
  };
}

/**
 * Match a single song across platforms
 */
export async function matchSong(
  song: ExportableSong,
  searchers: PlatformSearcher[],
  options: MatchOptions
): Promise<SongMatchResult> {
  const matches: SongMatchResult['matches'] = [];
  const minScore = options.minConfidenceScore ?? 50;
  const maxMatches = options.maxMatchesPerSong ?? 5;

  for (const searcher of searchers) {
    if (!options.targetPlatforms.includes(searcher.platform)) {
      continue;
    }

    try {
      const candidates: PlatformSearchResult[] = [];

      // Try ISRC search first (most reliable)
      if (options.useIsrc !== false && song.isrc) {
        const isrcResults = await searcher.searchByIsrc(song.isrc);
        candidates.push(...isrcResults);
      }

      // Fall back to title/artist search
      if (candidates.length === 0) {
        const searchResults = await searcher.searchByTitleArtist(
          song.title,
          song.artist,
          song.album
        );
        candidates.push(...searchResults);
      }

      // Score and filter candidates
      for (const candidate of candidates) {
        const { score, confidence, reason } = calculateMatchScore(song, candidate);

        if (score >= minScore) {
          matches.push({
            platform: candidate.platform,
            platformId: candidate.platformId,
            title: candidate.title,
            artist: candidate.artist,
            album: candidate.album,
            duration: candidate.duration,
            confidence,
            matchScore: score,
            matchReason: reason,
          });
        }
      }
    } catch (error) {
      console.error(`Error searching ${searcher.platform}:`, error);
      // Continue with other platforms
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.matchScore - a.matchScore);

  // Limit results
  const limitedMatches = matches.slice(0, maxMatches);

  // Determine overall status
  let status: SongMatchResult['status'];
  let selectedMatch: SongMatchResult['selectedMatch'];

  if (limitedMatches.length === 0) {
    status = 'no_match';
  } else if (limitedMatches[0].confidence === 'exact') {
    status = 'matched';
    selectedMatch = {
      platform: limitedMatches[0].platform,
      platformId: limitedMatches[0].platformId,
    };
  } else if (limitedMatches[0].confidence === 'high') {
    // Auto-select high confidence matches
    status = 'matched';
    selectedMatch = {
      platform: limitedMatches[0].platform,
      platformId: limitedMatches[0].platformId,
    };
  } else {
    // Low confidence - needs review
    status = 'pending_review';
  }

  return {
    originalSong: {
      title: song.title || 'Unknown Title',
      artist: song.artist || 'Unknown Artist',
      album: song.album,
      duration: song.duration,
      isrc: song.isrc,
      platform: song.platform,
      platformId: song.platformId,
    },
    matches: limitedMatches,
    selectedMatch,
    status,
  };
}

/**
 * Match multiple songs with progress callback
 */
export async function matchSongs(
  songs: ExportableSong[],
  searchers: PlatformSearcher[],
  options: MatchOptions,
  onProgress?: (current: number, total: number, song: ExportableSong) => void
): Promise<SongMatchResult[]> {
  const results: SongMatchResult[] = [];

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];

    if (onProgress) {
      onProgress(i + 1, songs.length, song);
    }

    try {
      const result = await matchSong(song, searchers, options);
      results.push(result);
    } catch (error) {
      // If matching fails for a song (e.g., rate limit timeout), continue with others
      console.error(`Error matching song "${song.artist} - ${song.title}":`, error);
      results.push({
        originalSong: {
          title: song.title || 'Unknown Title',
          artist: song.artist || 'Unknown Artist',
          album: song.album,
          duration: song.duration,
          isrc: song.isrc,
          platform: song.platform,
          platformId: song.platformId,
        },
        matches: [],
        selectedMatch: undefined,
        status: 'no_match',
      });
    }

    // Small delay to avoid rate limiting
    if (i < songs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Generate a matching report
 */
export function generateMatchReport(results: SongMatchResult[]): {
  summary: {
    total: number;
    matched: number;
    pendingReview: number;
    noMatch: number;
    skipped: number;
  };
  byConfidence: {
    exact: number;
    high: number;
    low: number;
    none: number;
  };
  unmatchedSongs: Array<{
    title: string;
    artist: string;
    album?: string;
  }>;
  pendingReviewSongs: Array<{
    title: string;
    artist: string;
    album?: string;
    topMatchScore: number;
    topMatchReason: string;
  }>;
} {
  const summary = {
    total: results.length,
    matched: 0,
    pendingReview: 0,
    noMatch: 0,
    skipped: 0,
  };

  const byConfidence = {
    exact: 0,
    high: 0,
    low: 0,
    none: 0,
  };

  const unmatchedSongs: Array<{ title: string; artist: string; album?: string }> = [];
  const pendingReviewSongs: Array<{
    title: string;
    artist: string;
    album?: string;
    topMatchScore: number;
    topMatchReason: string;
  }> = [];

  for (const result of results) {
    // Defensive check for malformed results
    if (!result || !result.originalSong) {
      console.warn('Skipping malformed match result:', result);
      continue;
    }

    switch (result.status) {
      case 'matched':
        summary.matched++;
        if (result.matches?.[0]) {
          byConfidence[result.matches[0].confidence]++;
        }
        break;
      case 'pending_review':
        summary.pendingReview++;
        if (result.matches?.[0]) {
          byConfidence[result.matches[0].confidence]++;
          pendingReviewSongs.push({
            title: result.originalSong.title || 'Unknown',
            artist: result.originalSong.artist || 'Unknown',
            album: result.originalSong.album,
            topMatchScore: result.matches[0].matchScore,
            topMatchReason: result.matches[0].matchReason || '',
          });
        }
        break;
      case 'no_match':
        summary.noMatch++;
        byConfidence.none++;
        unmatchedSongs.push({
          title: result.originalSong.title || 'Unknown',
          artist: result.originalSong.artist || 'Unknown',
          album: result.originalSong.album,
        });
        break;
      case 'skipped':
        summary.skipped++;
        break;
    }
  }

  return {
    summary,
    byConfidence,
    unmatchedSongs,
    pendingReviewSongs,
  };
}

/**
 * Export match results to CSV
 */
export function exportMatchResultsToCSV(results: SongMatchResult[]): string {
  const headers = [
    'Original Title',
    'Original Artist',
    'Original Album',
    'Status',
    'Match Platform',
    'Match Title',
    'Match Artist',
    'Confidence',
    'Score',
    'Reason',
  ];

  const rows = results.map(result => {
    const match = result.matches[0];
    return [
      result.originalSong.title,
      result.originalSong.artist,
      result.originalSong.album || '',
      result.status,
      match?.platform || '',
      match?.title || '',
      match?.artist || '',
      match?.confidence || '',
      match?.matchScore?.toString() || '',
      match?.matchReason || '',
    ].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Update match selection (for user review)
 */
export function updateMatchSelection(
  result: SongMatchResult,
  platformId: string,
  platform: PlaylistPlatform
): SongMatchResult {
  const selectedMatch = result.matches.find(
    m => m.platformId === platformId && m.platform === platform
  );

  if (!selectedMatch) {
    throw new ServiceError(
      'MATCH_NOT_FOUND',
      'Selected match not found in match results'
    );
  }

  return {
    ...result,
    selectedMatch: {
      platform,
      platformId,
    },
    status: 'matched',
  };
}

/**
 * Skip a song (mark as intentionally unmatched)
 */
export function skipSong(result: SongMatchResult): SongMatchResult {
  return {
    ...result,
    status: 'skipped',
    selectedMatch: undefined,
  };
}
