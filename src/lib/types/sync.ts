import type { Song } from './song';

/**
 * Minimal song data stored in playback_sessions.queue JSONB.
 * Omits `url` (reconstructed client-side) to reduce storage size.
 */
export type SyncSong = {
  id: string;
  name: string;
  title?: string;
  albumId: string;
  album?: string;
  duration: number;
  track: number;
  artist?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  energy?: number;
};

/** Convert a full Song to SyncSong (strip url) */
export function toSyncSong(song: Song): SyncSong {
  const { url: _url, ...rest } = song;
  return rest;
}

/** Convert a SyncSong back to a full Song (reconstruct url) */
export function fromSyncSong(sync: SyncSong): Song {
  return { ...sync, url: `/api/navidrome/stream/${sync.id}` };
}

/** Server-side playback state as returned by the API */
export interface PlaybackStateResponse {
  queue: SyncSong[];
  originalQueue: SyncSong[];
  currentIndex: number;
  currentPositionMs: number;
  isPlaying: boolean;
  volume: number;
  isShuffled: boolean;
  activeDevice: {
    id: string | null;
    name: string | null;
    type: string | null;
  };
  queueUpdatedAt: string;
  positionUpdatedAt: string;
  playStateUpdatedAt: string;
  updatedAt: string;
}
