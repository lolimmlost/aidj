/**
 * YouTube per-song fallback download (issue #145)
 *
 * When a playlist-import "miss" can't be resolved through Lidarr (commonly the
 * "artist has 0 albums" dead-end — see issue #144), we can still fetch the track
 * straight from YouTube via MeTube, **one song at a time**, using yt-dlp's
 * `ytsearch1:` search syntax (no YouTube API key / OAuth required). Each download
 * is verified against the requested artist/title so obvious wrong-video / live /
 * channel-rip results are flagged instead of silently polluting the library.
 *
 * The landed file (named `Artist - Title`) drops into MeTube's download folder,
 * where the existing Picard retag → Lidarr move → Navidrome rescan flow can pick
 * it up. This module deliberately stops at "file downloaded + verified"; the
 * reconcile-back-into-playlist step is owned by the Import Manager (issue #132).
 *
 * Job state is kept in-process (this is a diagnostic / testing path polled while
 * the page is open), mirroring the media-flow-manager pattern — no new table.
 */

import * as metube from './metube';
import type { MeTubeDownload } from './metube';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FallbackTrack {
  artist: string;
  title: string;
  album?: string;
  duration?: number; // seconds, if known
}

export type FallbackTrackStatus =
  | 'pending' // not yet started
  | 'skipped' // already in the library (dedup guard) — not downloaded
  | 'searching' // queued to MeTube, waiting for the download to land
  | 'downloaded' // finished; verification passed (or verification disabled)
  | 'mismatch' // finished, but verification thinks it's likely the wrong track
  | 'downloading' // still fetching in MeTube when our window closed (not confirmed, not failed)
  | 'failed'; // MeTube reported an error, after exhausting retries

export interface FallbackVerification {
  matched: boolean;
  score: number; // 0..1
  reason: string;
}

export interface FallbackTrackResult {
  track: FallbackTrack;
  query: string;
  status: FallbackTrackStatus;
  metubeId?: string;
  resultTitle?: string;
  filename?: string;
  verification?: FallbackVerification;
  /**
   * Set on a `skipped` entry whose library match hinged on a differing bracketed
   * qualifier ("(Day)" vs "(Night)"). The skip stands — re-queue the track with
   * `skipInLibrary: false` to override it.
   */
  review?: string;
  error?: string;
  attempts?: number; // how many download attempts were made (>=1 once started)
  startedAt?: number;
  finishedAt?: number;
}

export interface FallbackJob {
  id: string;
  userId: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  verify: boolean;
  folder?: string;
  maxAttempts: number;
  skipInLibrary: boolean;
  currentIndex: number;
  results: FallbackTrackResult[];
}

export interface StartFallbackOptions {
  verify?: boolean; // default true
  folder?: string; // MeTube subfolder; default = MeTube's configured folder
  maxAttempts?: number; // download attempts per track before giving up (default 3)
  skipInLibrary?: boolean; // dedup guard: skip tracks already in Navidrome (default true)
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Poll MeTube this often while waiting for a single download. */
const POLL_INTERVAL_MS = 3000;
/** Confirmation window for a single track. These downloads can take 5–10 min
 *  under yt-dlp throttling, so this is generous; a slow one that's still fetching
 *  when it closes is reported `downloading`, not failed. */
const DOWNLOAD_TIMEOUT_MS = 12 * 60 * 1000;
/** Small breather between tracks so each is attributable in MeTube/logs. */
const BETWEEN_TRACKS_MS = 750;
/** Wait between retry attempts for a track that failed to download. */
const RETRY_DELAY_MS = 5000;
/** Default download attempts per track. YouTube 403 / PO-token errors are often
 *  transient, so we re-queue a few times before declaring a track failed. */
export const DEFAULT_MAX_ATTEMPTS = 3;
/** Ceiling on attempts, whatever the caller asks for. */
export const MAX_ATTEMPTS_LIMIT = 5;
/** Hard cap on tracks per job to avoid runaway batches. */
export const MAX_TRACKS_PER_JOB = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Build a clean YouTube search query from a track. Uses the primary artist
 * (drops `;`/`,`-joined collaborators, which hurt search) and strips noisy
 * qualifiers that rarely appear in YouTube titles.
 */
export function normalizeSearchQuery(track: FallbackTrack): string {
  const primaryArtist = (track.artist || '')
    .split(/[;,]/)[0]
    .trim();

  const cleanTitle = (track.title || '')
    .replace(/\s*\((?:with|feat\.?|ft\.?|featuring)\s+[^)]+\)/gi, '')
    .replace(/\s*\[(?:with|feat\.?|ft\.?|featuring)\s+[^\]]+\]/gi, '')
    .replace(/\s*\([^)]*\b(?:remaster|remastered|deluxe|anniversary|expanded|bonus)\b[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\b(?:remaster|remastered|deluxe|anniversary|expanded|bonus)\b[^\]]*\]/gi, '')
    .replace(/\s+-\s*\d{4}\s*remaster(?:ed)?\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return `${primaryArtist} ${cleanTitle}`.trim();
}

/**
 * yt-dlp search "URL". MeTube passes the `url` field straight to yt-dlp, which
 * treats `ytsearch1:<query>` as "download the top YouTube result for <query>".
 */
export function buildYouTubeSearchUrl(query: string): string {
  return `ytsearch1:${query}`;
}

/** Lowercase, strip punctuation, collapse whitespace — for loose comparison. */
function normalizeForCompare(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ') // drop bracketed qualifiers
    .replace(/\b(official|music|video|audio|lyrics?|visualizer|hd|4k)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(want: string, got: string): number {
  const wantTokens = want.split(' ').filter(Boolean);
  if (wantTokens.length === 0) return 0;
  const gotSet = new Set(got.split(' ').filter(Boolean));
  const hits = wantTokens.filter((t) => gotSet.has(t)).length;
  return hits / wantTokens.length;
}

/** True when every token of `sub` also appears in `sup` (order-independent). */
function tokensSubsetOf(sub: string, sup: string): boolean {
  const subTokens = sub.split(' ').filter(Boolean);
  if (subTokens.length === 0) return false;
  const supSet = new Set(sup.split(' ').filter(Boolean));
  return subTokens.every((t) => supSet.has(t));
}

/**
 * Isolate the artist portion of a resolved video title. yt-dlp / YouTube titles
 * are overwhelmingly "Artist - Title …", so the left of the first spaced
 * delimiter is the artist. Comparing artist FIELD-to-FIELD (as MusicBrainz Picard
 * and beets do) — rather than matching the artist against the whole title string
 * — is what lets us tell a *dropped* artist word ("bad tuner" → "tuner", benign)
 * from a *substituted* one ("Phil Odd" → "Phil Collins", a real mismatch): both
 * share exactly one token against the whole string, but only the dropped case is
 * a clean subset of the artist field. Falls back to the whole (normalized) string
 * when there's no separator — no worse than matching against the full title.
 */
function artistFieldOfTitle(resultTitle: string): string {
  const idx = resultTitle.search(/\s[-–—:|]\s/); // spaced hyphen/dash/colon/pipe only
  return normalizeForCompare(idx > 0 ? resultTitle.slice(0, idx) : resultTitle);
}

/**
 * Verify a completed MeTube item is plausibly the requested track. Because
 * `ytsearch1:` returns whatever YouTube ranks first, this guards against live
 * versions, remixes, hour-long mixes, and channel rips.
 */
export function verifyDownload(
  track: FallbackTrack,
  item: Partial<Pick<MeTubeDownload, 'title' | 'filename'>>
): FallbackVerification {
  const resultTitle = (item.title || item.filename || '').toString();
  if (!resultTitle) {
    return { matched: false, score: 0, reason: 'no result title to verify against' };
  }

  const got = normalizeForCompare(resultTitle);
  const gotArtist = artistFieldOfTitle(resultTitle); // artist portion only, when present
  const wantTitle = normalizeForCompare(track.title);
  const wantArtist = normalizeForCompare((track.artist || '').split(/[;,]/)[0]);

  const titleScore = got.includes(wantTitle) && wantTitle.length > 0 ? 1 : tokenOverlap(wantTitle, got);
  const artistReliable = wantArtist.length >= 3; // too short to be a reliable signal
  // Containment-aware artist corroboration (field-to-field; see artistFieldOfTitle).
  // A dropped artist word — one field is a clean subset of the other — still fully
  // corroborates; only a genuine token *conflict* (competing words on each side,
  // the "Phil Odd" → "Phil Collins" case) falls through to the low overlap score.
  const artistScore = !artistReliable
    ? 1
    : got.includes(wantArtist) // full artist present anywhere in the title
      ? 1
      : tokensSubsetOf(wantArtist, gotArtist) || tokensSubsetOf(gotArtist, wantArtist)
        ? 1
        : Math.max(tokenOverlap(wantArtist, gotArtist), tokenOverlap(wantArtist, got));

  // Title carries most of the weight; a strong title + corroborating artist passes.
  const score = titleScore * 0.65 + artistScore * 0.35;
  // A confident title is NOT enough on its own: `ytsearch1:` routinely returns a
  // same-titled song by the WRONG artist. When the artist is a usable signal it
  // must genuinely corroborate — but "corroborate" means field-level containment,
  // not exact token match, so we don't reject legitimate downloads whose YouTube
  // title merely abbreviates a multi-word artist. (score >= 0.6 is implied by both
  // sub-scores clearing 0.6, so it's not a separate gate.)
  const matched = titleScore >= 0.6 && (!artistReliable || artistScore >= 0.6);

  return {
    matched,
    score: Math.round(score * 100) / 100,
    reason: `title ${(titleScore * 100) | 0}% / artist ${(artistScore * 100) | 0}% vs "${resultTitle}"`,
  };
}

// ---------------------------------------------------------------------------
// MeTube interaction: queue one track and wait for it to land
// ---------------------------------------------------------------------------

interface DownloadOutcome {
  metubeId?: string;
  item?: MeTubeDownload;
  errored?: boolean;
  timedOut?: boolean;
  stillDownloading?: boolean; // timed out, but MeTube was still actively fetching it
  preExisting?: boolean; // matched an item already finished before this job queued anything
  error?: string;
}

/**
 * Loose "is this MeTube item our track?" check for DETECTION (not verification).
 * We can't know the resolved video id in advance and MeTube keys by video id, so
 * matching a *previously downloaded* video would never appear as a "new id".
 * Instead we match on content: decent title-token overlap plus the primary artist
 * present. Deliberately looser than `verifyDownload` — a loose-matched item that
 * turns out to be wrong is still surfaced later as `mismatch` by verification.
 */
export function itemLikelyMatchesTrack(
  track: FallbackTrack,
  item: Partial<Pick<MeTubeDownload, 'title' | 'filename'>>
): boolean {
  const got = normalizeForCompare(item.title || item.filename || '');
  if (!got) return false;
  const wantTitle = normalizeForCompare(track.title);
  const wantArtist = normalizeForCompare((track.artist || '').split(/[;,]/)[0]);
  if (!wantTitle) return false;

  const titleOverlap = got.includes(wantTitle) ? 1 : tokenOverlap(wantTitle, got);
  const artistOk =
    wantArtist.length < 3 || got.includes(wantArtist) || tokenOverlap(wantArtist, got) >= 0.5;

  return titleOverlap >= 0.5 && artistOk;
}

/**
 * Queue a single `ytsearch1:` download and wait for the matching item to reach a
 * terminal state. Detection is content-based (see `itemLikelyMatchesTrack`) so it
 * survives MeTube's id-dedup of already-downloaded videos and never gives up on a
 * download that is simply slow — on timeout it reports `stillDownloading` rather
 * than a false failure, and never deletes an in-flight item.
 */
async function queueAndAwaitDownload(
  track: FallbackTrack,
  query: string,
  folder: string | undefined,
  claimedIds: Set<string>
): Promise<DownloadOutcome> {
  let before: metube.MeTubeQueueResponse;
  try {
    before = await metube.getQueue();
  } catch {
    before = { done: {}, queue: {} };
  }

  // Content detection can't tell "the item I just queued" from some other item
  // that loosely matches this track — including one already claimed by an earlier
  // track in the same batch (e.g. "Song" vs "Song (Remix)"). Exclude claimed ids so
  // each MeTube item is attributed to at most one track.
  const matches = (d: MeTubeDownload) => !claimedIds.has(d.id) && itemLikelyMatchesTrack(track, d);

  // Ignore a pre-existing *errored* entry for this track (a stale prior failure);
  // but a pre-existing *finished* match means it's already downloaded — done.
  const staleErrorIds = new Set(
    Object.values(before.done)
      .filter((d) => d.status === 'error' && matches(d))
      .map((d) => d.id)
  );
  const preFinished = Object.values(before.done).find(
    (d) => d.status === 'finished' && matches(d)
  );
  if (preFinished) {
    // Not ours: it was on disk before this job started, so it must never be
    // deleted on a failed verification (see runJob).
    return { metubeId: preFinished.id, item: preFinished, preExisting: true };
  }

  try {
    // No custom_name_prefix: yt-dlp's own title (usually "Artist - Title …")
    // already carries the naming, and prefixing it doubled the string. Picard
    // retags from the audio fingerprint anyway, so the raw title filename is fine.
    await metube.addDownload({
      url: buildYouTubeSearchUrl(query),
      format: 'mp3',
      quality: 'best',
      folder,
      auto_start: true,
    });
  } catch (err) {
    return { errored: true, error: err instanceof Error ? err.message : 'MeTube add failed' };
  }

  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  let sawInFlight = false;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let q: metube.MeTubeQueueResponse;
    try {
      q = await metube.getQueue();
    } catch {
      continue;
    }

    const finished = Object.values(q.done).find(
      (d) => d.status === 'finished' && matches(d)
    );
    if (finished) return { metubeId: finished.id, item: finished };

    const errored = Object.values(q.done).find(
      (d) => d.status === 'error' && !staleErrorIds.has(d.id) && matches(d)
    );
    if (errored) {
      return { metubeId: errored.id, item: errored, errored: true, error: errored.msg || 'MeTube reported error' };
    }

    // Actively fetching? These downloads can take 5–10 min, so this matters.
    if (Object.values(q.queue).some((d) => matches(d))) {
      sawInFlight = true;
    }
  }

  // Timed out. If MeTube was still fetching it, it will very likely finish shortly
  // — report as still-downloading (NOT failed) and never delete it.
  return {
    timedOut: true,
    stillDownloading: sawInFlight,
    error: sawInFlight
      ? 'still downloading when the confirmation window closed'
      : 'no matching download appeared before timeout',
  };
}

/**
 * Dedup guard: is this track already in the Navidrome library? Uses a loose
 * content match (same as detection) so it catches copies stored under a polluted
 * YouTube-rip title that the import matcher scored too low — the exact case that
 * causes the same track to be re-downloaded. Navidrome import is lazy so this
 * module stays importable in tests without pulling in the service graph.
 */
type LibSong = { title?: string; name?: string; artist?: string };

/**
 * Does a Navidrome song correspond to the requested track? Unlike a MeTube item
 * (whose title is the full "Artist - Title" video title), a Navidrome song keeps
 * artist and title in separate fields — AND a junk-titled copy may carry the whole
 * video title in `title`. So we accept a match on either shape:
 *  - clean: title matches by containment/overlap AND the artist field matches, or
 *  - junk:  the stored title contains both the requested title and artist tokens.
 */
export function libraryMatch(track: FallbackTrack, song: LibSong): boolean {
  const gotTitle = normalizeForCompare(song.title || song.name || '');
  const wantTitle = normalizeForCompare(track.title);
  if (!gotTitle || !wantTitle) return false;
  const wantArtist = normalizeForCompare((track.artist || '').split(/[;,]/)[0]);

  const titleOk =
    gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle) || tokenOverlap(wantTitle, gotTitle) >= 0.6;
  if (!titleOk) return false;

  // A same TITLE is not enough — the library holds plenty of distinct songs that
  // share a title ("Wasting Time", "Forever", …). Skipping on title alone falsely
  // marks a genuinely-missing track as "already in library" and drops its download
  // (the eric404 - Wasting Time case). The artist MUST corroborate.
  const gotArtist = normalizeForCompare(song.artist || '');
  // Navidrome never reports an empty artist: the library mapper substitutes a
  // placeholder (`artist: song.artist || 'Unknown Artist'`, navidrome/library.ts).
  // An untagged rip therefore arrives with a non-empty artist that carries no
  // information, so it has to be treated as absent — otherwise the junk path
  // below is unreachable for the exact copies it exists to catch.
  const artistFieldPresent = !!gotArtist && gotArtist !== 'unknown artist';

  // A 1–2 character artist ("U2", "AJ") is too weak for the fuzzy paths below:
  // it wins `includes()` against half the library and appears by accident inside
  // unrelated titles. But refusing it outright means the dedup guard NEVER fires
  // for those artists and every one of their tracks re-downloads as a duplicate.
  // So keep them — just require the strongest evidence: the name standing as a
  // whole token in the song's own artist FIELD. No overlap, no title containment,
  // no junk-copy path.
  if (wantArtist.length < 3) {
    return artistFieldPresent && gotArtist.split(' ').includes(wantArtist);
  }

  // Clean case: the library song's own ARTIST field matches the request.
  const artistFieldOk =
    artistFieldPresent &&
    (gotArtist.includes(wantArtist) ||
      wantArtist.includes(gotArtist) ||
      tokenOverlap(wantArtist, gotArtist) >= 0.6);

  // Junk-title copy: a YouTube rip stored with the whole "Artist - Title" video
  // string in the title field, whose artist field failed to corroborate — either
  // missing/placeholder (MeTube writes no tags; Picard retags later from the
  // fingerprint) or mis-tagged. Gate on "the artist field didn't corroborate"
  // rather than "there is no artist field", and only accept the requested artist
  // appearing IN FULL inside the stored title, which a same-title-different-artist
  // song (the eric404 case) never does.
  const junkCopyOk = !artistFieldOk && gotTitle.includes(wantArtist);

  return artistFieldOk || junkCopyOk;
}

/**
 * Bracketed qualifiers that survive `normalizeForCompare` — i.e. the ones that
 * actually distinguish one recording from another. `normalizeForCompare` already
 * blanks pure packaging noise ("(Official Video)", "(Lyrics)"); on top of that we
 * drop collaborator and reissue qualifiers, which name the same recording.
 */
const NOISE_QUALIFIER = /^(?:with|feat|ft|featuring)\b|\b(?:remaster(?:ed)?|deluxe|anniversary|expanded|bonus)\b/;

function meaningfulQualifiers(s: string): string[] {
  return [...(s || '').matchAll(/[([]([^)\]]*)[)\]]/g)]
    .map((m) => normalizeForCompare(m[1]))
    .filter((q) => q && !NOISE_QUALIFIER.test(q));
}

/**
 * Did this title match ONLY because the bracketed qualifiers were stripped, with
 * each side carrying a *different* meaningful one? That is the "(Day)" vs
 * "(Night)" shape — same base title, same artist, demonstrably different
 * recordings — which no heuristic can settle: "(Day)"/"(Night)" and
 * "(Live)"/studio are distinct tracks, while "(Lyrics)" or "(feat. X)" is the
 * same one. So we don't guess; the skip is flagged for a human instead.
 *
 * Requires a qualifier on BOTH sides: one bare side is ordinary YouTube-title
 * noise, already handled, and flagging it would bury the real cases.
 */
export function qualifierAmbiguity(
  track: FallbackTrack,
  song: LibSong
): { wanted: string; found: string } | null {
  const wantQ = meaningfulQualifiers(track.title);
  const gotQ = meaningfulQualifiers(song.title || song.name || '');
  if (wantQ.length === 0 || gotQ.length === 0) return null;
  if (wantQ.some((w) => gotQ.some((g) => g === w || g.includes(w) || w.includes(g)))) return null;
  return { wanted: wantQ.join(' / '), found: gotQ.join(' / ') };
}

interface LibraryHit {
  title: string;
  /** Set when the match hinged on a differing qualifier — needs a human look. */
  ambiguity?: { wanted: string; found: string };
}

async function findInLibrary(track: FallbackTrack): Promise<LibraryHit | null> {
  const toHit = (s: LibSong): LibraryHit => {
    const ambiguity = qualifierAmbiguity(track, s);
    return { title: s.title || s.name || '', ...(ambiguity ? { ambiguity } : {}) };
  };
  try {
    const { search } = await import('./navidrome');
    const primaryArtist = (track.artist || '').split(/[;,]/)[0].trim();
    const query = normalizeSearchQuery(track); // "<primary artist> <clean title>"
    const results = (await search(query).catch(() => [])) as LibSong[];
    // Prefer an unambiguous hit over an ambiguous one from the same result set,
    // so a "(Day)" request that ALSO has a real "(Day)" copy skips cleanly.
    const matches = results.filter((s) => libraryMatch(track, s));
    const clean = matches.find((s) => !qualifierAmbiguity(track, s));
    if (clean || matches.length > 0) return toHit(clean ?? matches[0]);
    // Fallback: artist-only search (catches title-mismatch / junk-title copies).
    if (primaryArtist.length > 2) {
      const r2 = (await search(primaryArtist).catch(() => [])) as LibSong[];
      const m2 = r2.filter((s) => libraryMatch(track, s));
      const clean2 = m2.find((s) => !qualifierAmbiguity(track, s));
      if (clean2 || m2.length > 0) return toHit(clean2 ?? m2[0]);
    }
    return null;
  } catch {
    return null; // never let a library-check failure block a download
  }
}

/**
 * Remove a finished/errored MeTube entry — so a retry can re-add the same video
 * cleanly, or so a wrong-track rip doesn't sit in the download folder waiting to
 * be indexed. Only ever called for terminal items, never for in-flight downloads.
 *
 * MeTube's `/delete` keys `done` entries by the **full resolved URL**; a bare
 * video id is accepted with `200 ok` and silently no-ops. So send the item's url
 * and keep its id as a fallback for entries we only know by id.
 *
 * Whether the *file* goes with the entry is MeTube's call (`DELETE_FILE_ON_TRASHCAN`);
 * either way the entry is gone, and the caller records `filename` for manual cleanup.
 */
async function deleteMeTubeItem(item?: MeTubeDownload, metubeId?: string): Promise<boolean> {
  const ids = [...new Set([item?.url, item?.id ?? metubeId].filter((v): v is string => !!v))];
  if (ids.length === 0) return false;
  try {
    await metube.deleteDownloads(ids, 'done');
    return true;
  } catch {
    return false; // best-effort
  }
}

/**
 * Queue a track and, on a *confirmed error*, retry up to `maxAttempts` (YouTube
 * 403 / PO-token errors are often transient). We retry ONLY confirmed errors:
 * a bare timeout (nothing matching ever appeared) means the same `ytsearch1:`
 * query would just re-resolve to the same video our content detection couldn't
 * see — re-queuing it risks a duplicate/orphan file, not a better outcome. A
 * still-in-flight timeout is likewise left alone (it's probably about to finish).
 * Returns the final outcome plus the attempt count.
 */
async function queueWithRetries(
  track: FallbackTrack,
  query: string,
  folder: string | undefined,
  maxAttempts: number,
  label: string,
  claimedIds: Set<string>
): Promise<DownloadOutcome & { attempts: number }> {
  let outcome: DownloadOutcome = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    outcome = await queueAndAwaitDownload(track, query, folder, claimedIds);

    // Anything but a confirmed error is terminal — success, mismatch-to-verify,
    // still-downloading, or a bare timeout all stop here (see docstring).
    if (!outcome.errored) {
      return { ...outcome, attempts: attempt };
    }

    // Confirmed error — clean up the failed entry and retry.
    await deleteMeTubeItem(outcome.item, outcome.metubeId);

    if (attempt < maxAttempts) {
      console.warn(
        `[YouTubeFallback] attempt ${attempt}/${maxAttempts} failed for ${label}: ${outcome.error}; retrying in ${RETRY_DELAY_MS}ms`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  return { ...outcome, attempts: maxAttempts };
}

// ---------------------------------------------------------------------------
// In-process job registry + batch runner
// ---------------------------------------------------------------------------

const jobs = new Map<string, FallbackJob>();

/** Drop jobs older than this on the next start, so the map can't grow forever. */
const JOB_TTL_MS = 6 * 60 * 60 * 1000;

function pruneOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && job.updatedAt < cutoff) jobs.delete(id);
  }
}

async function runJob(job: FallbackJob): Promise<void> {
  // MeTube ids already attributed to an earlier track in this batch, so a shared
  // loose-match (e.g. near-duplicate titles) can't be counted twice. See #2.
  const claimedIds = new Set<string>();
  for (let i = 0; i < job.results.length; i++) {
    job.currentIndex = i;
    const entry = job.results[i];
    entry.status = 'searching';
    entry.startedAt = Date.now();
    job.updatedAt = Date.now();

    const label = `"${entry.track.artist} - ${entry.track.title}"`;

    // Dedup guard: don't re-download something already in the library (even if it
    // was stored under a junk title the import matcher missed).
    if (job.skipInLibrary) {
      const existing = await findInLibrary(entry.track);
      if (existing) {
        entry.status = 'skipped';
        entry.resultTitle = existing.title;
        if (existing.ambiguity) {
          // Same base title and artist, different qualifier — the library copy may
          // well be a different recording. Skip (never create a dupe silently) but
          // mark it so the job summary can hand the call back to the user.
          entry.review = `wanted "${existing.ambiguity.wanted}", library has "${existing.ambiguity.found}" — re-queue if these are different recordings`;
        }
        entry.finishedAt = Date.now();
        job.updatedAt = Date.now();
        console.log(
          `[YouTubeFallback] SKIP (already in library) ${label} -> "${existing.title}"${entry.review ? ` [NEEDS REVIEW: ${entry.review}]` : ''}`
        );
        if (i < job.results.length - 1) await sleep(BETWEEN_TRACKS_MS);
        continue;
      }
    }

    console.log(`[YouTubeFallback] (${i + 1}/${job.results.length}) searching: ${entry.query}`);

    const outcome = await queueWithRetries(entry.track, entry.query, job.folder, job.maxAttempts, label, claimedIds);
    entry.metubeId = outcome.metubeId;
    entry.attempts = outcome.attempts;
    entry.finishedAt = Date.now();
    // Claim this MeTube item so a later, similarly-titled track can't reuse it.
    if (outcome.metubeId) claimedIds.add(outcome.metubeId);

    if (outcome.item) {
      entry.resultTitle = outcome.item.title;
      entry.filename = outcome.item.filename;
    }

    if (outcome.stillDownloading) {
      // Slow download still fetching when our window closed — not a failure.
      entry.status = 'downloading';
      entry.error = outcome.error;
      console.log(`[YouTubeFallback] STILL DOWNLOADING ${label} (unconfirmed): ${entry.error}`);
    } else if (outcome.errored || outcome.timedOut) {
      entry.status = 'failed';
      entry.error = outcome.error;
      console.warn(
        `[YouTubeFallback] FAILED ${label} after ${outcome.attempts} attempt(s): ${entry.error}`
      );
    } else if (job.verify && outcome.item) {
      const verification = verifyDownload(entry.track, outcome.item);
      entry.verification = verification;
      entry.status = verification.matched ? 'downloaded' : 'mismatch';
      if (!verification.matched) {
        // A mismatch means `ytsearch1:` resolved to the WRONG track. Flagging it
        // isn't enough: the rip is already in MeTube's download folder, so the
        // next Picard/Navidrome pass indexes it and the library is polluted
        // anyway — which is the whole thing verification exists to prevent. So
        // remove it. Only ever a file THIS job fetched: a pre-existing finished
        // entry may belong to another flow and isn't ours to delete.
        if (outcome.preExisting) {
          entry.error = 'wrong track; pre-existing MeTube entry left for manual cleanup';
        } else {
          const removed = await deleteMeTubeItem(outcome.item, outcome.metubeId);
          entry.error = removed
            ? 'wrong track; removed from MeTube'
            : 'wrong track; MeTube cleanup failed — remove manually';
        }
      }
      console.log(
        `[YouTubeFallback] ${entry.status.toUpperCase()} "${entry.track.artist} - ${entry.track.title}" (${verification.reason})${entry.error ? ` — ${entry.error}` : ''}`
      );
    } else {
      entry.status = 'downloaded';
      console.log(`[YouTubeFallback] DOWNLOADED "${entry.track.artist} - ${entry.track.title}"`);
    }

    job.updatedAt = Date.now();
    if (i < job.results.length - 1) await sleep(BETWEEN_TRACKS_MS);
  }

  job.status = 'completed';
  job.currentIndex = job.results.length;
  job.updatedAt = Date.now();

  const summary = summarizeJob(job);
  console.log(
    `[YouTubeFallback] Job ${job.id} complete: ${summary.downloaded} downloaded, ${summary.skipped} skipped${summary.needsReview ? ` (${summary.needsReview} need review)` : ''}, ${summary.mismatch} mismatch, ${summary.downloading} still-downloading, ${summary.failed} failed (of ${summary.total})`
  );
}

export function summarizeJob(job: FallbackJob): {
  total: number;
  pending: number;
  skipped: number;
  searching: number;
  downloaded: number;
  mismatch: number;
  downloading: number;
  failed: number;
  /** Subset of `skipped`: skips whose library match needs a human call. */
  needsReview: number;
} {
  const summary = { total: job.results.length, pending: 0, skipped: 0, searching: 0, downloaded: 0, mismatch: 0, downloading: 0, failed: 0 };
  for (const r of job.results) summary[r.status]++;
  return { ...summary, needsReview: job.results.filter((r) => r.review).length };
}

/**
 * Create and start a fallback job. Returns immediately with the job id; the
 * batch runs one track at a time in the background. Throws on empty/oversized input.
 */
export function startYouTubeFallbackJob(
  userId: string,
  tracks: FallbackTrack[],
  options: StartFallbackOptions = {}
): FallbackJob {
  pruneOldJobs();

  const cleaned = tracks
    .filter((t) => t && t.title && t.artist)
    .slice(0, MAX_TRACKS_PER_JOB);

  if (cleaned.length === 0) {
    throw new Error('No valid tracks to download (each needs an artist and title)');
  }

  const maxAttempts = Math.min(
    MAX_ATTEMPTS_LIMIT,
    Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  );

  const now = Date.now();
  const job: FallbackJob = {
    id: crypto.randomUUID(),
    userId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    verify: options.verify ?? true,
    folder: options.folder,
    maxAttempts,
    skipInLibrary: options.skipInLibrary ?? true,
    currentIndex: 0,
    results: cleaned.map((track) => ({
      track,
      query: normalizeSearchQuery(track),
      status: 'pending' as FallbackTrackStatus,
    })),
  };

  jobs.set(job.id, job);

  // Fire-and-forget; a crash marks the job failed but never takes down the server.
  runJob(job).catch((err) => {
    job.status = 'failed';
    job.updatedAt = Date.now();
    console.error(`[YouTubeFallback] Job ${job.id} crashed:`, err);
  });

  return job;
}

/** Fetch a job, scoped to its owner. */
export function getYouTubeFallbackJob(jobId: string, userId: string): FallbackJob | undefined {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return undefined;
  return job;
}
