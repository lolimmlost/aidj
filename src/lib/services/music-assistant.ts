/**
 * Music Assistant client (server-only) — plays AIDJ's queue on house speakers (#244).
 *
 * MA exposes a JSON-RPC-style API: `POST {url}/api` with `{command, args}` and a
 * Bearer token. Success is the raw result as JSON (HTTP 200); failure is a plain
 * text message with a 4xx/5xx status.
 *
 * Tracks are addressed by URI: MA's OpenSubsonic provider uses the Navidrome
 * song id as its item id, so `${provider}://track/${navidromeSongId}` plays a
 * Navidrome song directly (verified against the live server 2026-09-25).
 *
 * For a speaker player the queue id equals the player id.
 */

import { getConfig } from '@/lib/config/config';

const REQUEST_TIMEOUT_MS = 15_000;
// play_media only returns once the receiver is playing; a cold Chromecast
// launch took ~5.6s in testing.
const PLAY_TIMEOUT_MS = 30_000;

export class MusicAssistantError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'MusicAssistantError';
  }
}

function maConfig() {
  const cfg = getConfig();
  return {
    url: cfg.musicAssistantUrl.replace(/\/+$/, ''),
    token: cfg.musicAssistantToken,
    provider: cfg.musicAssistantSubsonicProvider,
  };
}

export function isMusicAssistantConfigured(): boolean {
  const { url, token, provider } = maConfig();
  return Boolean(url && token && provider);
}

async function maCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const { url, token } = maConfig();
  if (!url || !token) throw new MusicAssistantError('Music Assistant is not configured');

  let res: Response;
  try {
    res = await fetch(`${url}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command, args, message_id: `aidj-${Date.now()}` }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MusicAssistantError(
      `Music Assistant unreachable (${command}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new MusicAssistantError(`Music Assistant ${command} failed: ${text.slice(0, 200)}`, res.status);
  }
  return (text ? JSON.parse(text) : null) as T;
}

// ─── Track URIs ────────────────────────────────────────────────────────────

export function songIdToUri(songId: string): string {
  return `${maConfig().provider}://track/${songId}`;
}

/** Navidrome song id from an MA track uri, or null for any other source. */
export function uriToSongId(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const prefix = `${maConfig().provider}://track/`;
  return uri.startsWith(prefix) ? uri.slice(prefix.length) || null : null;
}

// ─── Speakers ──────────────────────────────────────────────────────────────

interface MaPlayer {
  player_id: string;
  display_name?: string;
  name?: string;
  provider?: string;
  type?: string;
  available?: boolean;
  enabled?: boolean;
  playback_state?: string;
  active_source?: string | null;
  volume_level?: number | null;
  source_list?: Array<{ id: string; name: string }>;
}

export interface Speaker {
  id: string;
  name: string;
  provider: string;
  playbackState: string;
  volume: number | null;
  /**
   * Name of another app currently playing on this speaker (e.g. "YouTube"),
   * or null when it's idle or playing MA's own queue. Taking over a busy
   * speaker interrupts whoever is using it, so the UI asks first.
   */
  busyWith: string | null;
}

export function toSpeaker(p: MaPlayer): Speaker {
  const ownQueue = !p.active_source || p.active_source === p.player_id;
  const busy = !ownQueue && p.playback_state === 'playing';
  const sourceName = p.source_list?.find((s) => s.id === p.active_source)?.name ?? p.active_source ?? null;
  return {
    id: p.player_id,
    name: p.display_name || p.name || p.player_id,
    provider: p.provider ?? 'unknown',
    playbackState: p.playback_state ?? 'unknown',
    volume: p.volume_level ?? null,
    busyWith: busy ? sourceName : null,
  };
}

export async function listSpeakers(): Promise<Speaker[]> {
  const players = await maCommand<MaPlayer[]>('players/all');
  return (players ?? [])
    .filter((p) => p.available !== false && p.enabled !== false)
    .map(toSpeaker)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Playback ──────────────────────────────────────────────────────────────

/**
 * Replace the speaker's queue with `songIds` (first one plays now) and seek to
 * `positionSec`. MA's autoplay ("don't stop the music") is switched off first,
 * otherwise MA appends its own picks when the queue runs low and fights the DJ.
 */
export async function playOnSpeaker(playerId: string, songIds: string[], positionSec = 0): Promise<void> {
  if (songIds.length === 0) throw new MusicAssistantError('Nothing to play');
  await maCommand('player_queues/autoplay', { queue_id: playerId, autoplay_enabled: false });
  await maCommand(
    'player_queues/play_media',
    { queue_id: playerId, media: songIds.map(songIdToUri), option: 'replace' },
    PLAY_TIMEOUT_MS,
  );
  // Handing off mid-song: skip the seek for the first few seconds, where
  // starting from the top is indistinguishable and saves a round-trip.
  if (positionSec > 3) {
    await maCommand('player_queues/seek', { queue_id: playerId, position: Math.floor(positionSec) });
  }
}

/**
 * Update what plays after the current track.
 * - `add` appends (look-ahead top-up).
 * - `replace_next` swaps out everything after the current track, used when
 *   AIDJ's upcoming queue changed (AI DJ insert, "play next", reorder).
 */
export type EnqueueMode = 'add' | 'replace_next';

export async function enqueueOnSpeaker(playerId: string, songIds: string[], mode: EnqueueMode = 'add'): Promise<void> {
  if (songIds.length === 0) return;
  await maCommand('player_queues/play_media', {
    queue_id: playerId,
    media: songIds.map(songIdToUri),
    option: mode,
  });
}

export type SpeakerAction = 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'seek' | 'volume';

export async function controlSpeaker(playerId: string, action: SpeakerAction, value?: number): Promise<void> {
  switch (action) {
    case 'play':
    case 'pause':
    case 'next':
    case 'previous':
    case 'stop':
      await maCommand(`player_queues/${action}`, { queue_id: playerId });
      return;
    case 'seek':
      await maCommand('player_queues/seek', { queue_id: playerId, position: Math.max(0, Math.floor(value ?? 0)) });
      return;
    case 'volume':
      await maCommand('players/cmd/volume_set', {
        player_id: playerId,
        volume_level: Math.max(0, Math.min(100, Math.round(value ?? 0))),
      });
      return;
  }
}

// ─── State ─────────────────────────────────────────────────────────────────

interface MaQueueItem {
  duration?: number | null;
  media_item?: { uri?: string | null } | null;
  streamdetails?: { provider?: string; item_id?: string } | null;
}

interface MaQueue {
  state?: string;
  current_index?: number | null;
  items?: number;
  elapsed_time?: number;
  elapsed_time_last_updated?: number;
  /** Position saved on pause — set even when elapsed_time hasn't caught up yet. */
  resume_pos?: number;
  current_item?: MaQueueItem | null;
}

export interface SpeakerState {
  state: 'playing' | 'paused' | 'idle';
  /** Navidrome id of the current track, or null when it isn't a Navidrome track. */
  currentSongId: string | null;
  positionSec: number;
  durationSec: number | null;
  /** Navidrome ids queued after the current track, in order. */
  upcomingSongIds: string[];
  /** Server clock (ms) at which positionSec was computed. */
  sampledAt: number;
}

function itemSongId(item: MaQueueItem | null | undefined): string | null {
  if (!item) return null;
  const fromUri = uriToSongId(item.media_item?.uri);
  if (fromUri) return fromUri;
  const sd = item.streamdetails;
  return sd?.provider === maConfig().provider && sd.item_id ? sd.item_id : null;
}

export async function getSpeakerState(playerId: string): Promise<SpeakerState> {
  const queue = await maCommand<MaQueue | null>('player_queues/get', { queue_id: playerId });
  const now = Date.now();
  const raw = queue?.state;
  const state: SpeakerState['state'] = raw === 'playing' || raw === 'paused' ? raw : 'idle';

  // elapsed_time is as of elapsed_time_last_updated (unix seconds); project it
  // forward so the phone's progress bar doesn't lag by the MA update interval.
  let positionSec = queue?.elapsed_time ?? 0;
  if (state === 'playing' && queue?.elapsed_time_last_updated) {
    positionSec += Math.max(0, now / 1000 - queue.elapsed_time_last_updated);
  }
  // resume_pos is written at the moment of pause; elapsed_time only updates
  // every few seconds, so prefer whichever is further along.
  if (state === 'paused' && queue?.resume_pos) {
    positionSec = Math.max(positionSec, queue.resume_pos);
  }
  const durationSec = queue?.current_item?.duration ?? null;
  if (durationSec) positionSec = Math.min(positionSec, durationSec);

  let upcomingSongIds: string[] = [];
  const index = queue?.current_index;
  if (index != null && (queue?.items ?? 0) > index + 1) {
    const items = await maCommand<MaQueueItem[]>('player_queues/items', {
      queue_id: playerId,
      offset: index + 1,
      limit: 25,
    });
    upcomingSongIds = (items ?? []).map(itemSongId).filter((id): id is string => Boolean(id));
  }

  return {
    state,
    currentSongId: itemSongId(queue?.current_item),
    positionSec,
    durationSec,
    upcomingSongIds,
    sampledAt: now,
  };
}
