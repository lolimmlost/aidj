/**
 * Library Sync Schema
 *
 * Tracks incremental library indexing and background synchronization state.
 * Stores sync checkpoints, item metadata, and error logs.
 */

import { pgTable, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Library sync state - tracks overall sync progress and configuration
 */
export const librarySyncState = pgTable('library_sync_state', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),

  // Sync timestamps
  lastFullSyncAt: timestamp('last_full_sync_at'),
  lastIncrementalSyncAt: timestamp('last_incremental_sync_at'),
  lastSyncStartedAt: timestamp('last_sync_started_at'),
  lastSyncCompletedAt: timestamp('last_sync_completed_at'),

  // Sync progress
  status: text('status').$type<'idle' | 'running' | 'paused' | 'error' | 'completed'>().default('idle').notNull(),
  currentPhase: text('current_phase').$type<'artists' | 'albums' | 'songs' | 'cleanup'>(),
  totalItems: integer('total_items').default(0),
  processedItems: integer('processed_items').default(0),
  errorCount: integer('error_count').default(0),

  // Checkpoint for resumable sync
  checkpoint: jsonb('checkpoint').$type<SyncCheckpoint>(),

  // Configuration
  syncFrequencyMinutes: integer('sync_frequency_minutes').default(30),
  batchSize: integer('batch_size').default(100),
  maxConcurrentRequests: integer('max_concurrent_requests').default(3),
  autoSyncEnabled: boolean('auto_sync_enabled').default(true),

  // Stats
  lastSyncDurationMs: integer('last_sync_duration_ms'),
  totalSongsIndexed: integer('total_songs_indexed').default(0),
  totalArtistsIndexed: integer('total_artists_indexed').default(0),
  totalAlbumsIndexed: integer('total_albums_indexed').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('library_sync_state_user_id_idx').on(table.userId),
]);

/**
 * Indexed song metadata - tracks individual song sync state
 */
export const indexedSongs = pgTable('indexed_songs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  navidromeSongId: text('navidrome_song_id').notNull(),

  // Song metadata
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  album: text('album'),
  albumId: text('album_id'),
  artistId: text('artist_id'),
  duration: integer('duration'),
  track: integer('track'),
  genre: text('genre'),
  year: integer('year'),

  // For display and search
  songKey: text('song_key').notNull(), // "artist - title" normalized for search

  // Change detection
  checksum: text('checksum'), // Hash of relevant fields to detect changes
  lastModifiedAt: timestamp('last_modified_at'),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('indexed_songs_user_id_idx').on(table.userId),
  uniqueIndex('indexed_songs_user_song_idx').on(table.userId, table.navidromeSongId),
  index('indexed_songs_song_key_idx').on(table.songKey),
  index('indexed_songs_artist_idx').on(table.artist),
  index('indexed_songs_synced_at_idx').on(table.syncedAt),
]);

/**
 * Indexed artists - tracks artist sync state
 */
export const indexedArtists = pgTable('indexed_artists', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  navidromeArtistId: text('navidrome_artist_id').notNull(),

  // Artist metadata
  name: text('name').notNull(),
  albumCount: integer('album_count').default(0),
  songCount: integer('song_count').default(0),
  genres: text('genres'),

  // Change detection
  checksum: text('checksum'),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('indexed_artists_user_id_idx').on(table.userId),
  uniqueIndex('indexed_artists_user_artist_idx').on(table.userId, table.navidromeArtistId),
  index('indexed_artists_name_idx').on(table.name),
]);

/**
 * Sync error log - tracks errors during sync for debugging
 */
export const syncErrorLog = pgTable('sync_error_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  syncSessionId: text('sync_session_id'),

  // Error details
  errorType: text('error_type').$type<'fetch' | 'parse' | 'permission' | 'timeout' | 'unknown'>().notNull(),
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),

  // Context
  phase: text('phase').$type<'artists' | 'albums' | 'songs' | 'cleanup'>(),
  itemId: text('item_id'),
  itemType: text('item_type').$type<'artist' | 'album' | 'song'>(),

  // Resolution
  resolved: boolean('resolved').default(false),
  retryCount: integer('retry_count').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('sync_error_log_user_id_idx').on(table.userId),
  index('sync_error_log_session_idx').on(table.syncSessionId),
  index('sync_error_log_created_at_idx').on(table.createdAt),
]);

// Types for the checkpoint object
export interface SyncCheckpoint {
  phase: 'artists' | 'albums' | 'songs' | 'cleanup';
  lastProcessedId?: string;
  artistOffset?: number;
  albumOffset?: number;
  songOffset?: number;
  currentArtistId?: string;
  currentAlbumId?: string;
  pendingArtistIds?: string[];
  pendingAlbumIds?: string[];
}

// Export types for the tables
export type LibrarySyncState = typeof librarySyncState.$inferSelect;
export type NewLibrarySyncState = typeof librarySyncState.$inferInsert;
export type IndexedSong = typeof indexedSongs.$inferSelect;
export type NewIndexedSong = typeof indexedSongs.$inferInsert;
export type IndexedArtist = typeof indexedArtists.$inferSelect;
export type NewIndexedArtist = typeof indexedArtists.$inferInsert;
export type SyncErrorLogEntry = typeof syncErrorLog.$inferSelect;
export type NewSyncErrorLogEntry = typeof syncErrorLog.$inferInsert;
