/**
 * Media Flow Manager
 *
 * Handles the complete flow from content discovery through playlist insertion.
 * Provides:
 * - State machine for tracking media states
 * - Duplicate detection across discovery queue and playlists
 * - Robust error handling with retry logic
 * - Proper cancellation support for interrupted operations
 * - Transaction-like operations for consistency
 *
 * @see Feature: Review and Refactor Discover-to-Playlist Media Flow
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Media item states following a state machine pattern
 */
export type MediaFlowState =
  | 'idle'           // Initial state - item discovered but not queued
  | 'queued'         // Added to discovery queue, waiting for download
  | 'downloading'    // Actively downloading via Lidarr
  | 'processing'     // Downloaded, being imported to Navidrome
  | 'ready'          // Available in Navidrome, ready to play
  | 'playing'        // Currently in playback queue
  | 'in_playlist'    // Added to a user playlist
  | 'failed'         // Error state
  | 'cancelled';     // User cancelled or navigated away

export interface MediaFlowItem {
  id: string;
  artist: string;
  title: string;
  album?: string;
  state: MediaFlowState;
  source: 'discovery' | 'search' | 'recommendation';

  // External IDs
  navidromeSongId?: string;
  lidarrArtistId?: string;
  lidarrAlbumId?: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
  stateChangedAt: number;

  // Error tracking
  error?: {
    message: string;
    code: string;
    retryable: boolean;
    retryCount: number;
    lastRetryAt?: number;
  };

  // Progress tracking
  progress?: {
    percentage: number;
    stage: string;
    details?: string;
  };

  // Target playlist (if adding to playlist)
  targetPlaylistId?: string;
  playlistPosition?: number;
}

export interface MediaFlowTransition {
  from: MediaFlowState;
  to: MediaFlowState;
  item: MediaFlowItem;
  timestamp: number;
  reason?: string;
}

export interface MediaFlowOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  pollingIntervalMs?: number;
  autoRetryOnTransient?: boolean;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  location?: 'discovery_queue' | 'playlist' | 'audio_queue';
  existingId?: string;
  playlistId?: string;
  playlistName?: string;
}

// ============================================================================
// State Machine Transitions
// ============================================================================

/**
 * Valid state transitions for the media flow state machine
 */
const VALID_TRANSITIONS: Record<MediaFlowState, MediaFlowState[]> = {
  idle: ['queued', 'ready', 'failed', 'cancelled'],
  queued: ['downloading', 'failed', 'cancelled'],
  downloading: ['processing', 'failed', 'cancelled'],
  processing: ['ready', 'failed'],
  ready: ['playing', 'in_playlist', 'cancelled'],
  playing: ['in_playlist', 'ready'],
  in_playlist: [], // Terminal state
  failed: ['idle', 'queued'], // Can retry
  cancelled: ['idle'], // Can restart
};

/**
 * Error codes for the media flow
 */
export const MediaFlowErrorCodes = {
  DUPLICATE_IN_QUEUE: 'DUPLICATE_IN_QUEUE',
  DUPLICATE_IN_PLAYLIST: 'DUPLICATE_IN_PLAYLIST',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  LIDARR_UNAVAILABLE: 'LIDARR_UNAVAILABLE',
  NAVIDROME_UNAVAILABLE: 'NAVIDROME_UNAVAILABLE',
  PLAYLIST_NOT_FOUND: 'PLAYLIST_NOT_FOUND',
  PLAYLIST_DELETED: 'PLAYLIST_DELETED',
  STORAGE_FULL: 'STORAGE_FULL',
  CONTENT_UNAVAILABLE: 'CONTENT_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  USER_NAVIGATED_AWAY: 'USER_NAVIGATED_AWAY',
} as const;

export type MediaFlowErrorCode = typeof MediaFlowErrorCodes[keyof typeof MediaFlowErrorCodes];

// ============================================================================
// Media Flow Manager Class
// ============================================================================

class MediaFlowManagerImpl extends EventEmitter {
  private items: Map<string, MediaFlowItem> = new Map();
  private options: Required<MediaFlowOptions>;
  private abortControllers: Map<string, AbortController> = new Map();
  private isInitialized: boolean = false;

  constructor(options: MediaFlowOptions = {}) {
    super();
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 5000,
      pollingIntervalMs: options.pollingIntervalMs ?? 60000,
      autoRetryOnTransient: options.autoRetryOnTransient ?? true,
    };
  }

  /**
   * Initialize the manager, loading persisted state
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load persisted items from localStorage
      const stored = localStorage.getItem('media-flow-items');
      if (stored) {
        const parsed = JSON.parse(stored) as MediaFlowItem[];
        // Only restore non-terminal items that are less than 24 hours old
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        parsed.forEach(item => {
          if (item.createdAt > cutoff && !this.isTerminalState(item.state)) {
            this.items.set(item.id, item);
          }
        });
      }
      this.isInitialized = true;
      this.emit('initialized', { itemCount: this.items.size });
    } catch (error) {
      console.error('[MediaFlowManager] Failed to initialize:', error);
      this.isInitialized = true; // Continue without persisted state
    }
  }

  /**
   * Persist current state to localStorage
   */
  private persistState(): void {
    try {
      const items = Array.from(this.items.values());
      localStorage.setItem('media-flow-items', JSON.stringify(items));
    } catch (error) {
      console.error('[MediaFlowManager] Failed to persist state:', error);
    }
  }

  /**
   * Check if a state is terminal (no more transitions allowed)
   */
  private isTerminalState(state: MediaFlowState): boolean {
    return state === 'in_playlist' || state === 'cancelled';
  }

  /**
   * Validate a state transition
   */
  private isValidTransition(from: MediaFlowState, to: MediaFlowState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Generate a unique ID for a media item
   */
  generateId(artist: string, title: string): string {
    const normalized = `${artist.toLowerCase().trim()}-${title.toLowerCase().trim()}`;
    return `media-${normalized.replace(/[^a-z0-9-]/g, '-')}-${Date.now()}`;
  }

  /**
   * Create a new media flow item
   */
  createItem(params: {
    artist: string;
    title: string;
    album?: string;
    source: MediaFlowItem['source'];
    targetPlaylistId?: string;
  }): MediaFlowItem {
    const now = Date.now();
    const id = this.generateId(params.artist, params.title);

    const item: MediaFlowItem = {
      id,
      artist: params.artist,
      title: params.title,
      album: params.album,
      state: 'idle',
      source: params.source,
      createdAt: now,
      updatedAt: now,
      stateChangedAt: now,
      targetPlaylistId: params.targetPlaylistId,
    };

    this.items.set(id, item);
    this.persistState();
    this.emit('item:created', item);

    return item;
  }

  /**
   * Transition an item to a new state
   */
  async transitionState(
    id: string,
    newState: MediaFlowState,
    options: {
      reason?: string;
      error?: MediaFlowItem['error'];
      progress?: MediaFlowItem['progress'];
      navidromeSongId?: string;
      lidarrArtistId?: string;
      lidarrAlbumId?: number;
      playlistPosition?: number;
    } = {}
  ): Promise<boolean> {
    const item = this.items.get(id);
    if (!item) {
      console.warn(`[MediaFlowManager] Item not found: ${id}`);
      return false;
    }

    const oldState = item.state;

    // Validate transition
    if (!this.isValidTransition(oldState, newState)) {
      console.error(
        `[MediaFlowManager] Invalid transition: ${oldState} -> ${newState} for item ${id}`
      );
      this.emit('error', {
        code: MediaFlowErrorCodes.INVALID_STATE_TRANSITION,
        message: `Cannot transition from ${oldState} to ${newState}`,
        item,
      });
      return false;
    }

    // Update item
    const now = Date.now();
    item.state = newState;
    item.updatedAt = now;
    item.stateChangedAt = now;

    if (options.error) item.error = options.error;
    if (options.progress) item.progress = options.progress;
    if (options.navidromeSongId) item.navidromeSongId = options.navidromeSongId;
    if (options.lidarrArtistId) item.lidarrArtistId = options.lidarrArtistId;
    if (options.lidarrAlbumId) item.lidarrAlbumId = options.lidarrAlbumId;
    if (options.playlistPosition !== undefined) item.playlistPosition = options.playlistPosition;

    // Clear error on successful transition (unless transitioning to failed)
    if (newState !== 'failed' && item.error) {
      delete item.error;
    }

    this.persistState();

    const transition: MediaFlowTransition = {
      from: oldState,
      to: newState,
      item,
      timestamp: now,
      reason: options.reason,
    };

    this.emit('transition', transition);
    this.emit(`state:${newState}`, item);

    console.log(
      `[MediaFlowManager] ${item.artist} - ${item.title}: ${oldState} -> ${newState}${options.reason ? ` (${options.reason})` : ''}`
    );

    return true;
  }

  /**
   * Mark an item as failed with error details
   */
  async markFailed(
    id: string,
    error: {
      message: string;
      code: MediaFlowErrorCode;
      retryable?: boolean;
    }
  ): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;

    const retryCount = (item.error?.retryCount ?? 0) + 1;
    const retryable = error.retryable ?? retryCount < this.options.maxRetries;

    await this.transitionState(id, 'failed', {
      reason: error.message,
      error: {
        message: error.message,
        code: error.code,
        retryable,
        retryCount,
        lastRetryAt: Date.now(),
      },
    });

    // Auto-retry if configured and retryable
    if (this.options.autoRetryOnTransient && retryable && this.isTransientError(error.code)) {
      setTimeout(() => {
        this.retryItem(id);
      }, this.options.retryDelayMs * retryCount);
    }
  }

  /**
   * Check if an error is transient (network issues, temporary unavailability)
   */
  private isTransientError(code: MediaFlowErrorCode): boolean {
    const transientCodes: MediaFlowErrorCode[] = [
      MediaFlowErrorCodes.NETWORK_ERROR,
      MediaFlowErrorCodes.LIDARR_UNAVAILABLE,
      MediaFlowErrorCodes.NAVIDROME_UNAVAILABLE,
      MediaFlowErrorCodes.TIMEOUT,
    ];
    return transientCodes.includes(code);
  }

  /**
   * Retry a failed item
   */
  async retryItem(id: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.state !== 'failed') return false;

    // Check if we've exceeded max retries
    if ((item.error?.retryCount ?? 0) >= this.options.maxRetries) {
      console.warn(`[MediaFlowManager] Max retries exceeded for item ${id}`);
      return false;
    }

    // Transition back to queued to restart the flow
    return this.transitionState(id, 'queued', {
      reason: `Retry attempt ${(item.error?.retryCount ?? 0) + 1}`,
    });
  }

  /**
   * Cancel an in-progress item
   */
  async cancelItem(id: string, reason?: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || this.isTerminalState(item.state)) return false;

    // Abort any in-progress operations
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    return this.transitionState(id, 'cancelled', {
      reason: reason ?? 'User cancelled',
    });
  }

  /**
   * Get an abort signal for an item's operations
   */
  getAbortSignal(id: string): AbortSignal {
    let controller = this.abortControllers.get(id);
    if (!controller) {
      controller = new AbortController();
      this.abortControllers.set(id, controller);
    }
    return controller.signal;
  }

  /**
   * Check if an item operation has been aborted
   */
  isAborted(id: string): boolean {
    const controller = this.abortControllers.get(id);
    return controller?.signal.aborted ?? false;
  }

  /**
   * Get item by ID
   */
  getItem(id: string): MediaFlowItem | undefined {
    return this.items.get(id);
  }

  /**
   * Get all items in a specific state
   */
  getItemsByState(state: MediaFlowState): MediaFlowItem[] {
    return Array.from(this.items.values()).filter(item => item.state === state);
  }

  /**
   * Get all active (non-terminal) items
   */
  getActiveItems(): MediaFlowItem[] {
    return Array.from(this.items.values()).filter(
      item => !this.isTerminalState(item.state) && item.state !== 'failed'
    );
  }

  /**
   * Remove an item from tracking
   */
  removeItem(id: string): boolean {
    const deleted = this.items.delete(id);
    if (deleted) {
      this.abortControllers.delete(id);
      this.persistState();
      this.emit('item:removed', { id });
    }
    return deleted;
  }

  /**
   * Clear all completed/failed items older than specified age
   */
  cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, item] of this.items) {
      if (
        (this.isTerminalState(item.state) || item.state === 'failed') &&
        item.updatedAt < cutoff
      ) {
        this.items.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.persistState();
    }

    return removed;
  }

  /**
   * Update progress for an item
   */
  updateProgress(
    id: string,
    progress: MediaFlowItem['progress']
  ): void {
    const item = this.items.get(id);
    if (!item) return;

    item.progress = progress;
    item.updatedAt = Date.now();
    this.emit('progress', { id, progress });
  }

  /**
   * Handle user navigation - cancel pending downloads but keep ready items
   */
  handleUserNavigation(): void {
    const activeItems = this.getActiveItems();

    for (const item of activeItems) {
      // Only cancel items that are still downloading/processing
      if (item.state === 'downloading' || item.state === 'processing' || item.state === 'queued') {
        this.cancelItem(item.id, 'User navigated away');
      }
    }
  }

  /**
   * Get statistics about current media flow
   */
  getStats(): {
    total: number;
    byState: Record<MediaFlowState, number>;
    failedRetryable: number;
    avgProcessingTime: number;
  } {
    const items = Array.from(this.items.values());
    const byState: Record<MediaFlowState, number> = {
      idle: 0,
      queued: 0,
      downloading: 0,
      processing: 0,
      ready: 0,
      playing: 0,
      in_playlist: 0,
      failed: 0,
      cancelled: 0,
    };

    let failedRetryable = 0;
    let totalProcessingTime = 0;
    let completedCount = 0;

    for (const item of items) {
      byState[item.state]++;

      if (item.state === 'failed' && item.error?.retryable) {
        failedRetryable++;
      }

      if (item.state === 'ready' || item.state === 'in_playlist' || item.state === 'playing') {
        totalProcessingTime += item.stateChangedAt - item.createdAt;
        completedCount++;
      }
    }

    return {
      total: items.length,
      byState,
      failedRetryable,
      avgProcessingTime: completedCount > 0 ? totalProcessingTime / completedCount : 0,
    };
  }
}

// ============================================================================
// Duplicate Detection Utilities
// ============================================================================

/**
 * Check for duplicates across discovery queue, audio queue, and playlists
 */
export async function checkDuplicates(
  artist: string,
  title: string,
  options: {
    checkDiscoveryQueue?: boolean;
    checkAudioQueue?: boolean;
    checkPlaylists?: boolean;
    targetPlaylistId?: string;
  } = {}
): Promise<DuplicateCheckResult> {
  const {
    checkDiscoveryQueue = true,
    checkAudioQueue = true,
    checkPlaylists = true,
    targetPlaylistId,
  } = options;

  const normalizedArtist = artist.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();

  // Check discovery queue (from localStorage)
  if (checkDiscoveryQueue) {
    try {
      const stored = localStorage.getItem('discovery-queue-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        const items = parsed.state?.items || [];
        const match = items.find((item: { artist: string; title: string; id: string }) =>
          item.artist.toLowerCase().trim() === normalizedArtist &&
          item.title.toLowerCase().trim() === normalizedTitle
        );
        if (match) {
          return {
            isDuplicate: true,
            location: 'discovery_queue',
            existingId: match.id,
          };
        }
      }
    } catch (error) {
      console.warn('[checkDuplicates] Failed to check discovery queue:', error);
    }
  }

  // Check audio queue (from localStorage)
  if (checkAudioQueue) {
    try {
      const stored = localStorage.getItem('audio-player-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        const playlist = parsed.state?.playlist || [];
        const match = playlist.find((song: { artist?: string; title?: string; name?: string; id: string }) => {
          const songArtist = (song.artist || '').toLowerCase().trim();
          const songTitle = (song.title || song.name || '').toLowerCase().trim();
          return songArtist === normalizedArtist && songTitle === normalizedTitle;
        });
        if (match) {
          return {
            isDuplicate: true,
            location: 'audio_queue',
            existingId: match.id,
          };
        }
      }
    } catch (error) {
      console.warn('[checkDuplicates] Failed to check audio queue:', error);
    }
  }

  // Check target playlist (via API)
  if (checkPlaylists && targetPlaylistId) {
    try {
      const response = await fetch(`/api/playlists/${targetPlaylistId}`);
      if (response.ok) {
        const data = await response.json();
        const songs = data.data?.songs || [];
        const match = songs.find((song: { songArtistTitle?: string; id: string }) => {
          if (song.songArtistTitle) {
            const parts = song.songArtistTitle.split(' - ');
            if (parts.length >= 2) {
              const songArtist = parts[0].toLowerCase().trim();
              const songTitle = parts.slice(1).join(' - ').toLowerCase().trim();
              return songArtist === normalizedArtist && songTitle === normalizedTitle;
            }
          }
          return false;
        });
        if (match) {
          return {
            isDuplicate: true,
            location: 'playlist',
            existingId: match.id,
            playlistId: targetPlaylistId,
            playlistName: data.data?.name,
          };
        }
      }
    } catch (error) {
      console.warn('[checkDuplicates] Failed to check playlist:', error);
    }
  }

  return { isDuplicate: false };
}

/**
 * Fuzzy match check for artist/title (handles slight variations)
 */
export function fuzzyMatch(str1: string, str2: string, threshold: number = 0.85): boolean {
  const s1 = str1.toLowerCase().trim().replace(/[^\w\s]/g, '');
  const s2 = str2.toLowerCase().trim().replace(/[^\w\s]/g, '');

  if (s1 === s2) return true;
  if (s1.includes(s2) || s2.includes(s1)) return true;

  // Calculate Levenshtein similarity
  const similarity = 1 - levenshteinDistance(s1, s2) / Math.max(s1.length, s2.length);
  return similarity >= threshold;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ============================================================================
// Singleton Export
// ============================================================================

export const mediaFlowManager = new MediaFlowManagerImpl();

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  mediaFlowManager.initialize().catch(console.error);
}

export type { MediaFlowManagerImpl as MediaFlowManager };
