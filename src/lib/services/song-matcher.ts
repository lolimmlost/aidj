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
 * Strip a leading "Artist - " prefix from a title when it overlaps the given
 * artist. YouTube-rip imports frequently store the whole video title as the track
 * title (e.g. "Cloonee & Prospa - Good Girl (ft. Tristan Henry)"), which tanks the
 * title-similarity score against the real title ("Good Girl"). Only strips when the
 * prefix shares a token with the artist, so genuine "A - B" titles are left alone.
 */
export function stripLeadingArtistPrefix(title: string, artist: string): string {
  return splitArtistPrefix(title, [artist])?.rest ?? title;
}

/**
 * Split "Artist - Title" / "Artist: Title" when the prefix overlaps one of the
 * given artists (token overlap, or the same letters ignoring spaces — channel
 * names like "dirtybrunetteVEVO"). Returns null for a genuine "A - B" title.
 */
export function splitArtistPrefix(title: string, artists: string[]): { prefix: string; rest: string } | null {
  const m = title.match(/^(.{1,60}?)(?:\s[-—–]|:)\s(.+)$/);
  if (!m) return null;
  const prefix = normalizeArtist(m[1]);
  if (!prefix) return null;
  const prefixTokens = prefix.split(' ').filter(Boolean);
  const squash = (x: string) => x.replace(/ /g, '');
  for (const artist of artists) {
    const art = normalizeArtist(cleanChannelName(artist || ''));
    if (!art) continue;
    const artistTokens = new Set(art.split(' ').filter(Boolean));
    if (prefixTokens.some((t) => artistTokens.has(t)) || squash(prefix) === squash(art)) {
      return { prefix: m[1].trim(), rest: m[2] };
    }
  }
  return null;
}

/** "dirtybrunetteVEVO" → "dirtybrunette", "Aminé - Topic" → "Aminé", "Fazer Official" → "Fazer". */
export function cleanChannelName(artist: string): string {
  return artist
    .replace(/\s*-\s*topic\s*$/i, '')
    .replace(/(?<=\S)\s*vevo\s*$/i, '')
    .replace(/(?<=\S)\s+official\s*$/i, '')
    .trim();
}

/**
 * Tags that make it a different recording (remix, live take, instrumental, …).
 * Anything else in a version-looking segment — remaster, single/radio/LP edit,
 * 12" version, extended mix, bonus track, a year — is treated as the same song.
 */
const SIGNIFICANT_VERSION =
  /\b(?:remix|rmx|live|acoustic|instrumental|demo|slowed|sped|reverb|nightcore|cover|karaoke|vip|bootleg|flip|rework|unplugged|acapella|a cappella)\b/;
/** Release/length variants: same song for matching purposes. */
const RELEASE_VARIANT =
  /\b(?:remaster(?:ed)?|remasterizado|deluxe|edition|edit|version|versi[oó]n|mix|mixed|single|ep|interlude|bonus|explicit|clean|dirty|mono|stereo|original|extended|lp|album|radio|street|\d{4}|\d+)\b/;
const FEAT_LEAD = /^(?:feat|ft|featuring|with|vocals by)\b/;
/** YouTube upload noise: "(Official Video)", "(Audio)", "(Prod. by X)", "[HD]". */
const VIDEO_NOISE =
  /^(?:official|audio|video|visuali[sz]er|lyrics?|music video|mv|hd|hq|4k|prod|produced|out now|free download)\b|\b(?:official (?:music )?video|official audio|lyric video|visuali[sz]er)\b/;

export interface ParsedTitle {
  /** Normalized title with feat credits and version tags removed. */
  base: string;
  /** Normalized significant version tag(s), e.g. "oliverse remix"; '' for the original. */
  version: string;
}

/**
 * Split a raw title into base title + version tag, BEFORE punctuation is
 * normalized away (normalizeString turns "(" and " - " into spaces, which is why
 * the old normalizeTitle regexes never matched anything).
 *
 *   "She's My Collar (feat. Kali Uchis)"             → base "she s my collar", version ""
 *   "After Life - Oliverse Remix"                    → base "after life", version "oliverse remix"
 *   "I'll Be Missing You (feat. X) - 2014 Remaster"  → base "i ll be missing you", version ""
 *   "X (with 2 Chainz & Saudi)"                      → base "x", version ""
 *
 * Featured artists never count against a match — albums often list them only in
 * the artist field. A remix that ADDS features ("Surround Sound (KAYTRANADA Remix)")
 * still differs from the original through its version tag.
 */
export function parseTitle(raw: string): ParsedTitle {
  let rest = raw || '';
  const versions: string[] = [];

  const classify = (segment: string): 'feat' | 'ignore' | 'version' | 'keep' => {
    const n = normalizeString(segment);
    if (!n) return 'ignore';
    if (FEAT_LEAD.test(n)) return 'feat';
    if (VIDEO_NOISE.test(n)) return 'ignore';
    if (SIGNIFICANT_VERSION.test(n)) return 'version';
    if (RELEASE_VARIANT.test(n)) return 'ignore';
    return 'keep';
  };

  // Bracketed segments: (feat. X), [Live], (Oliverse remix)
  rest = rest.replace(/\s*[([]([^)\]]*)[)\]]/g, (whole, inner: string) => {
    const kind = classify(inner);
    if (kind === 'version') versions.push(normalizeString(inner));
    return kind === 'keep' ? whole : ' ';
  });

  // Trailing " - X" segments (any dash), peeled from the end: "Song - Oliverse Remix - 2014 Remaster"
  for (;;) {
    const m = rest.match(/^(.*\S)\s+[-–—]\s+([^-–—]+)$/);
    if (!m) break;
    const kind = classify(m[2]);
    if (kind === 'keep') break;
    if (kind === 'version') versions.push(normalizeString(m[2]));
    rest = m[1];
  }

  // Inline feat without brackets: "Song feat. X"
  rest = rest.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '');

  // Inline trailing remix/VIP word with no separator: "Get Stupid Remix", "Wobble Master Vip"
  let base = normalizeString(rest);
  const inline = base.match(/^(.+?)\s+(remix|rmx|vip)$/);
  if (inline) {
    base = inline[1];
    versions.push(inline[2] === 'rmx' ? 'remix' : inline[2]);
  }

  return { base, version: versions.sort().join(' ') };
}

/**
 * Title similarity on base titles. `versionMismatch` is set when one side is a
 * remix/live/instrumental/etc. and the other isn't (or they're different remixes);
 * the similarity is halved and the caller must not auto-match.
 */
export function titleMatch(a: string, b: string): { similarity: number; versionMismatch: boolean } {
  const pa = parseTitle(a);
  const pb = parseTitle(b);
  // Also compare with spaces removed: "2am" vs "2 AM", "UFO" vs "U.F.O."
  const base = Math.max(
    stringSimilarity(pa.base, pb.base),
    stringSimilarity(pa.base.replace(/ /g, ''), pb.base.replace(/ /g, ''))
  );
  const coreTokens = (v: string) =>
    new Set(v.split(' ').filter((t) => t && !RELEASE_VARIANT.test(t)));
  const ta = coreTokens(pa.version);
  const tb = coreTokens(pb.version);
  // Same version when the significant words agree: "acoustic version" == "acoustic",
  // "Oliverse Remix" == "oliverse remix"; "KAYTRANADA remix" != "" (the original).
  const subset = (x: Set<string>, y: Set<string>) => [...x].every((t) => y.has(t));
  const sameVersion =
    (ta.size === 0 && tb.size === 0) ||
    (ta.size > 0 && tb.size > 0 && (subset(ta, tb) || subset(tb, ta) || stringSimilarity(pa.version, pb.version) >= 0.8));
  return sameVersion ? { similarity: base, versionMismatch: false } : { similarity: base * 0.5, versionMismatch: true };
}

export function titleMatchSimilarity(a: string, b: string): number {
  return titleMatch(a, b).similarity;
}

/** Below these, album/duration agreement alone must not push a candidate to auto-match. */
const AUTO_MATCH_MIN_TITLE = 0.8;
const AUTO_MATCH_MIN_ARTIST = 0.8;

/** Split a multi-artist credit: "Gorillaz;Kali Uchis", "ScHoolboy Q, 2 Chainz, Saudi", "A feat. B". */
export function splitArtists(artist: string): string[] {
  return (artist || '')
    .split(/\s*(?:;|,|\/|&|\+|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\band\b|\bvs\.?)\s*/i)
    .map((a) => normalizeArtist(a))
    .filter(Boolean);
}

/**
 * Artist similarity that understands credit lists. Spotify lists every
 * performer ("DJ Jazzy Jeff;Jazzyfatnastees;The Roots") while the library file
 * usually carries just the album artist ("The Roots"). Every artist on the
 * shorter side being present on the longer side counts as a full match.
 */
export function artistMatchSimilarity(a: string, b: string): number {
  a = cleanChannelName(a);
  b = cleanChannelName(b);
  const na = normalizeArtist(a);
  const nb = normalizeArtist(b);
  const whole = Math.max(stringSimilarity(na, nb), stringSimilarity(na.replace(/ /g, ''), nb.replace(/ /g, '')));
  const la = splitArtists(a);
  const lb = splitArtists(b);
  if (la.length === 0 || lb.length === 0) return whole;
  const [small, big] = la.length <= lb.length ? [la, lb] : [lb, la];
  const coverage =
    small.reduce((sum, x) => sum + Math.max(...big.map((y) => stringSimilarity(x, y))), 0) / small.length;
  return Math.max(whole, coverage);
}

/**
 * "NITTI" vs "Nitti Gritti": one name is the other's leading words. Could be an
 * alias or a different act ("Tay" / "Tay Zonday"), so it is only ever accepted
 * with an exact title and matching duration — see calculateMatchScore.
 */
export function isArtistNamePrefix(a: string, b: string): boolean {
  const names = (x: string) => splitArtists(cleanChannelName(x)).map((n) => n.split(' ').filter(Boolean));
  for (const x of names(a)) {
    for (const y of names(b)) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length > 0 && short.length < long.length && short.every((t, i) => long[i] === t)) return true;
    }
  }
  return false;
}

const CREDIT_CONNECTORS = new Set(['feat', 'ft', 'featuring', 'x', 'and', 'with', 'vs']);

/**
 * Drop "(…)" and trailing " - …" segments that only list credited artists:
 * "Big Rocks (Offset feat. Young Thug)", "Never Recover (Lil Baby & Gunna, Drake)",
 * "September - Throttle x Earth, Wind & Fire". Spotify puts these in the title;
 * the library file usually doesn't.
 */
export function stripCreditSegments(title: string, artists: string[]): string {
  const credit = new Set(artists.flatMap((a) => splitArtists(a)).flatMap((n) => n.split(' ')).filter(Boolean));
  if (credit.size === 0) return title;
  const isCredit = (segment: string) => {
    const tokens = normalizeString(segment).split(' ').filter((t) => t && !CREDIT_CONNECTORS.has(t));
    return tokens.length > 0 && tokens.every((t) => credit.has(t));
  };
  let out = title.replace(/\s*\(([^)]*)\)/g, (whole, inner: string) => (isCredit(inner) ? ' ' : whole));
  const m = out.match(/^(.*\S)\s+[-–—]\s+([^-–—]+)$/);
  if (m && isCredit(m[2])) out = m[1];
  return out.replace(/\s+/g, ' ').trim();
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

  // Title similarity (40% weight). Feat credits are ignored and version tags
  // (remix/live/…) must agree. Also try the candidate with a leading "Artist - "
  // prefix stripped, so a polluted YouTube-rip title still matches.
  // The prefix may name the uploader's channel artist or the requested artist
  // ("Beast Coast - Snow In The Stadium" uploaded by "FlatbushZombies TV").
  const split = splitArtistPrefix(candidate.title, [candidate.artist, source.artist]);
  const credits = [source.artist, candidate.artist];
  const sourceTitle = stripCreditSegments(source.title, credits);
  let title = titleMatch(sourceTitle, stripCreditSegments(candidate.title, credits));
  if (split) {
    const stripped = titleMatch(sourceTitle, stripCreditSegments(split.rest, credits));
    if (stripped.similarity > title.similarity) title = stripped;
  }
  const titleSimilarity = title.similarity;
  score += titleSimilarity * 40;
  if (titleSimilarity > 0.9) reasons.push('Title matches closely');
  else if (titleSimilarity > 0.7) reasons.push('Title similar');

  // Artist similarity (40% weight)
  // A rip whose title starts with the requested artist credits them even when
  // the uploader is a channel.
  const artistSimilarity = Math.max(
    artistMatchSimilarity(source.artist, candidate.artist),
    split ? artistMatchSimilarity(source.artist, split.prefix) : 0
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

  // Gate auto-matching: a matching album + duration must not carry a different
  // artist ("Tornillo - Morena" → "Panache Savage - Morena"), a different title
  // ("Mona June" → "Mona Lisa") or a different version ("E. Coli" → "E Coli
  // (instrumental)") past review. Such candidates stay at 'low' at most.
  // Strong evidence: same album (not just a single named after the song) AND
  // same length. That vouches for artist aliases ("Mos Def" / "Yasiin Bey",
  // "RÜFÜS DU SOL" / "RÜFÜS") and looser titles ("Kush & Corinthians" /
  // "Kush & Corinthians (His Pain)"), but never for a different version.
  const albumIsJustTitle =
    !!source.album && stringSimilarity(parseTitle(source.album).base, parseTitle(source.title).base) > 0.8;
  const strongEvidence =
    !!source.album && !!candidate.album && !albumIsJustTitle &&
    stringSimilarity(normalizeString(source.album), normalizeString(candidate.album)) > 0.8 &&
    !!source.duration && !!candidate.duration && Math.abs(source.duration - candidate.duration) <= 3;
  const durationMatches =
    !!source.duration && !!candidate.duration && Math.abs(source.duration - candidate.duration) <= 3;
  const nameAlias =
    titleSimilarity >= 0.95 && durationMatches && isArtistNamePrefix(source.artist, candidate.artist);
  const autoMatchable =
    !title.versionMismatch &&
    ((titleSimilarity >= AUTO_MATCH_MIN_TITLE && artistSimilarity >= AUTO_MATCH_MIN_ARTIST) ||
      (strongEvidence && titleSimilarity >= 0.9) ||
      (strongEvidence && titleSimilarity >= 0.6 && artistSimilarity >= AUTO_MATCH_MIN_ARTIST) ||
      nameAlias);
  if (nameAlias && !title.versionMismatch && score < 75) {
    score = 75;
    reasons.push('Artist name alias, title and length match');
  }
  if (!autoMatchable) {
    if (score >= 70) {
      score = 69;
      reasons.push(title.versionMismatch ? 'Different version' : 'Needs review');
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
