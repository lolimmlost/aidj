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
  | 'searching' // queued to MeTube, waiting for the download to land
  | 'downloaded' // finished; verification passed (or verification disabled)
  | 'mismatch' // finished, but verification thinks it's likely the wrong track
  | 'failed'; // MeTube reported an error, or we timed out waiting

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
  error?: string;
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
  currentIndex: number;
  results: FallbackTrackResult[];
}

export interface StartFallbackOptions {
  verify?: boolean; // default true
  folder?: string; // MeTube subfolder; default = MeTube's configured folder
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Poll MeTube this often while waiting for a single download. */
const POLL_INTERVAL_MS = 3000;
/** Give up on a single track after this long. */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
/** Small breather between tracks so each is attributable in MeTube/logs. */
const BETWEEN_TRACKS_MS = 750;
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
  const wantTitle = normalizeForCompare(track.title);
  const wantArtist = normalizeForCompare((track.artist || '').split(/[;,]/)[0]);

  const titleScore = got.includes(wantTitle) && wantTitle.length > 0 ? 1 : tokenOverlap(wantTitle, got);
  const artistScore =
    wantArtist.length < 3 // too short to be a reliable signal
      ? 1
      : got.includes(wantArtist)
        ? 1
        : tokenOverlap(wantArtist, got);

  // Title carries most of the weight; a strong title + present artist passes.
  const score = titleScore * 0.65 + artistScore * 0.35;
  const matched = titleScore >= 0.6 && score >= 0.6;

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
  error?: string;
}

/**
 * Snapshot MeTube's current ids, queue a single `ytsearch1:` download, then poll
 * until a *new* item reaches a terminal (finished/error) state or we time out.
 * One-at-a-time makes the "new id" detection unambiguous.
 */
async function queueAndAwaitDownload(
  track: FallbackTrack,
  query: string,
  folder?: string
): Promise<DownloadOutcome> {
  let before: metube.MeTubeQueueResponse;
  try {
    before = await metube.getQueue();
  } catch {
    before = { done: {}, queue: {} };
  }
  const knownIds = new Set([...Object.keys(before.done), ...Object.keys(before.queue)]);

  try {
    await metube.addDownload({
      url: buildYouTubeSearchUrl(query),
      format: 'mp3',
      quality: 'best',
      folder,
      custom_name_prefix: `${track.artist} - ${track.title}`,
      auto_start: true,
    });
  } catch (err) {
    return { errored: true, error: err instanceof Error ? err.message : 'MeTube add failed' };
  }

  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  let seenId: string | undefined;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let q: metube.MeTubeQueueResponse;
    try {
      q = await metube.getQueue();
    } catch {
      continue;
    }

    // Terminal first: a new item in `done` is finished or errored.
    const doneNew = Object.values(q.done).find((d) => !knownIds.has(d.id));
    if (doneNew) {
      if (doneNew.status === 'error') {
        return { metubeId: doneNew.id, item: doneNew, errored: true, error: doneNew.msg || 'MeTube reported error' };
      }
      return { metubeId: doneNew.id, item: doneNew };
    }

    // Still in flight — remember the id so a timeout can still report it.
    const queueNew = Object.values(q.queue).find((d) => !knownIds.has(d.id));
    if (queueNew) seenId = queueNew.id;
  }

  return { metubeId: seenId, timedOut: true, error: 'timed out waiting for download to finish' };
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
  for (let i = 0; i < job.results.length; i++) {
    job.currentIndex = i;
    const entry = job.results[i];
    entry.status = 'searching';
    entry.startedAt = Date.now();
    job.updatedAt = Date.now();

    console.log(`[YouTubeFallback] (${i + 1}/${job.results.length}) searching: ${entry.query}`);

    const outcome = await queueAndAwaitDownload(entry.track, entry.query, job.folder);
    entry.metubeId = outcome.metubeId;
    entry.finishedAt = Date.now();

    if (outcome.item) {
      entry.resultTitle = outcome.item.title;
      entry.filename = outcome.item.filename;
    }

    if (outcome.errored || outcome.timedOut) {
      entry.status = 'failed';
      entry.error = outcome.error;
      console.warn(`[YouTubeFallback] FAILED "${entry.track.artist} - ${entry.track.title}": ${entry.error}`);
    } else if (job.verify && outcome.item) {
      const verification = verifyDownload(entry.track, outcome.item);
      entry.verification = verification;
      entry.status = verification.matched ? 'downloaded' : 'mismatch';
      console.log(
        `[YouTubeFallback] ${entry.status.toUpperCase()} "${entry.track.artist} - ${entry.track.title}" (${verification.reason})`
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
    `[YouTubeFallback] Job ${job.id} complete: ${summary.downloaded} downloaded, ${summary.mismatch} mismatch, ${summary.failed} failed (of ${summary.total})`
  );
}

export function summarizeJob(job: FallbackJob): {
  total: number;
  pending: number;
  searching: number;
  downloaded: number;
  mismatch: number;
  failed: number;
} {
  const summary = { total: job.results.length, pending: 0, searching: 0, downloaded: 0, mismatch: 0, failed: 0 };
  for (const r of job.results) summary[r.status]++;
  return summary;
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

  const now = Date.now();
  const job: FallbackJob = {
    id: crypto.randomUUID(),
    userId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    verify: options.verify ?? true,
    folder: options.folder,
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
