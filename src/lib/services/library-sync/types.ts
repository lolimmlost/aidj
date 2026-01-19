/**
 * Library Sync Types
 *
 * Type definitions for the incremental library indexing and background sync system.
 */

import type { Song, Artist, ArtistWithDetails } from '../navidrome';

/**
 * Sync status for UI display
 */
export type SyncStatus = 'idle' | 'running' | 'paused' | 'error' | 'completed';

/**
 * Sync phases
 */
export type SyncPhase = 'artists' | 'albums' | 'songs' | 'cleanup';

/**
 * Progress information for sync operations
 */
export interface SyncProgress {
  status: SyncStatus;
  phase: SyncPhase | null;
  totalItems: number;
  processedItems: number;
  errorCount: number;
  currentItem?: string;
  estimatedTimeRemainingMs?: number;
  startedAt?: Date;
}

/**
 * Sync configuration options
 */
export interface SyncConfig {
  /** Batch size for processing items */
  batchSize: number;
  /** Maximum concurrent API requests */
  maxConcurrentRequests: number;
  /** Delay between batches in ms */
  batchDelayMs: number;
  /** Maximum errors before stopping sync */
  maxErrors: number;
  /** Whether to force full resync (ignore checksums) */
  forceFullSync: boolean;
  /** Sync frequency in minutes for auto-sync */
  syncFrequencyMinutes: number;
  /** Maximum songs per artist to index */
  maxSongsPerArtist: number;
  /** Maximum artists to process */
  maxArtists: number;
}

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  batchSize: 50,
  maxConcurrentRequests: 3,
  batchDelayMs: 100,
  maxErrors: 50,
  forceFullSync: false,
  syncFrequencyMinutes: 30,
  maxSongsPerArtist: 10,
  maxArtists: 500,
};

/**
 * Sync result summary
 */
export interface SyncResult {
  success: boolean;
  status: SyncStatus;
  stats: {
    artistsProcessed: number;
    albumsProcessed: number;
    songsIndexed: number;
    songsUpdated: number;
    songsRemoved: number;
    errorCount: number;
    durationMs: number;
  };
  errors: SyncError[];
  checkpoint?: SyncCheckpoint;
}

/**
 * Sync error information
 */
export interface SyncError {
  type: 'fetch' | 'parse' | 'permission' | 'timeout' | 'unknown';
  message: string;
  phase: SyncPhase;
  itemId?: string;
  itemType?: 'artist' | 'album' | 'song';
  timestamp: Date;
  retryable: boolean;
}

/**
 * Checkpoint for resumable sync
 */
export interface SyncCheckpoint {
  phase: SyncPhase;
  lastProcessedId?: string;
  artistOffset?: number;
  albumOffset?: number;
  songOffset?: number;
  currentArtistId?: string;
  currentAlbumId?: string;
  pendingArtistIds?: string[];
  pendingAlbumIds?: string[];
  timestamp: Date;
}

/**
 * Song with computed checksum for change detection
 */
export interface IndexedSongData {
  navidromeSongId: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  duration?: number;
  track?: number;
  genre?: string;
  year?: number;
  songKey: string;
  checksum: string;
}

/**
 * Artist with computed checksum for change detection
 */
export interface IndexedArtistData {
  navidromeArtistId: string;
  name: string;
  albumCount?: number;
  songCount?: number;
  genres?: string;
  checksum: string;
}

/**
 * Delta detection result
 */
export interface DeltaResult<T> {
  added: T[];
  updated: T[];
  unchanged: T[];
  removed: string[];
}

/**
 * Sync event types for event emitter
 */
export type SyncEventType =
  | 'start'
  | 'progress'
  | 'phase-complete'
  | 'error'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'abort';

/**
 * Sync event payload
 */
export interface SyncEvent {
  type: SyncEventType;
  progress: SyncProgress;
  error?: SyncError;
  checkpoint?: SyncCheckpoint;
  timestamp: Date;
}

/**
 * Sync event listener function
 */
export type SyncEventListener = (event: SyncEvent) => void;

/**
 * Conflict resolution strategies
 */
export type ConflictResolution = 'remote-wins' | 'local-wins' | 'newest-wins' | 'manual';

/**
 * Sync controller interface for managing sync operations
 */
export interface SyncController {
  /** Start or resume sync */
  start(config?: Partial<SyncConfig>): Promise<SyncResult>;
  /** Pause running sync */
  pause(): Promise<SyncCheckpoint>;
  /** Resume from checkpoint */
  resume(checkpoint: SyncCheckpoint): Promise<SyncResult>;
  /** Abort sync and discard progress */
  abort(): Promise<void>;
  /** Get current progress */
  getProgress(): SyncProgress;
  /** Subscribe to sync events */
  subscribe(listener: SyncEventListener): () => void;
  /** Check if sync is currently running */
  isRunning(): boolean;
}
