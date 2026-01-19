import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { userPlaylists } from "./playlists.schema";

/**
 * Playlist Export Format Types
 */
export type PlaylistExportFormat = 'm3u' | 'xspf' | 'json' | 'csv';

/**
 * Platform Types for Import/Export
 */
export type PlaylistPlatform = 'spotify' | 'youtube_music' | 'navidrome' | 'local';

/**
 * Match Confidence Levels
 */
export type MatchConfidence = 'exact' | 'high' | 'low' | 'none';

/**
 * Download Service Types
 */
export type DownloadService = 'lidarr' | 'metube';

/**
 * Playlist Export/Import Job Status
 */
export type ExportImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Song Match Result
 */
export interface SongMatchResult {
  originalSong: {
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    isrc?: string;
    platform?: PlaylistPlatform;
    platformId?: string;
  };
  matches: Array<{
    platform: PlaylistPlatform;
    platformId: string;
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    confidence: MatchConfidence;
    matchScore: number;
    matchReason: string;
  }>;
  selectedMatch?: {
    platform: PlaylistPlatform;
    platformId: string;
  };
  status: 'matched' | 'pending_review' | 'no_match' | 'skipped';
}

/**
 * Download Queue Item
 */
export interface DownloadQueueItem {
  songId: string;
  title: string;
  artist: string;
  album?: string;
  service: DownloadService;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  serviceJobId?: string;
  progress?: number;
  error?: string;
  downloadedPath?: string;
  needsManualOrganization?: boolean;
}

/**
 * Playlist Export Jobs Table
 * Tracks export operations for auditing and progress monitoring
 */
export const playlistExportJobs = pgTable("playlist_export_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Source playlist (optional - could be batch export)
  playlistId: text("playlist_id")
    .references(() => userPlaylists.id, { onDelete: "set null" }),

  // Export configuration
  format: text("format").$type<PlaylistExportFormat>().notNull(),
  sourcePlatform: text("source_platform").$type<PlaylistPlatform>().notNull(),

  // Status tracking
  status: text("status").$type<ExportImportStatus>().notNull().default('pending'),

  // Progress tracking
  totalSongs: integer("total_songs").default(0),
  processedSongs: integer("processed_songs").default(0),

  // Results
  exportedData: text("exported_data"), // The actual exported content
  filename: text("filename"),

  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),

  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  userIdIdx: index("playlist_export_jobs_user_id_idx").on(table.userId),
  statusIdx: index("playlist_export_jobs_status_idx").on(table.status),
  createdAtIdx: index("playlist_export_jobs_created_at_idx").on(table.createdAt.desc()),
}));

/**
 * Playlist Import Jobs Table
 * Tracks import operations with matching results
 */
export const playlistImportJobs = pgTable("playlist_import_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Import configuration
  format: text("format").$type<PlaylistExportFormat>().notNull(),
  targetPlatform: text("target_platform").$type<PlaylistPlatform>().notNull(),
  originalFilename: text("original_filename"),

  // Playlist metadata from import file
  playlistName: text("playlist_name"),
  playlistDescription: text("playlist_description"),

  // Created playlist reference
  createdPlaylistId: text("created_playlist_id")
    .references(() => userPlaylists.id, { onDelete: "set null" }),

  // Status tracking
  status: text("status").$type<ExportImportStatus>().notNull().default('pending'),

  // Progress and statistics
  totalSongs: integer("total_songs").default(0),
  processedSongs: integer("processed_songs").default(0),
  matchedSongs: integer("matched_songs").default(0),
  unmatchedSongs: integer("unmatched_songs").default(0),
  pendingReviewSongs: integer("pending_review_songs").default(0),

  // Matching results (detailed)
  matchResults: jsonb("match_results").$type<SongMatchResult[]>(),

  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),

  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  userIdIdx: index("playlist_import_jobs_user_id_idx").on(table.userId),
  statusIdx: index("playlist_import_jobs_status_idx").on(table.status),
  createdAtIdx: index("playlist_import_jobs_created_at_idx").on(table.createdAt.desc()),
}));

/**
 * Download Jobs Table
 * Tracks download requests to Lidarr/MeTube
 */
export const playlistDownloadJobs = pgTable("playlist_download_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Related import job (optional)
  importJobId: text("import_job_id")
    .references(() => playlistImportJobs.id, { onDelete: "set null" }),

  // Download configuration
  service: text("service").$type<DownloadService>().notNull(),

  // Status tracking
  status: text("status").$type<ExportImportStatus>().notNull().default('pending'),

  // Progress tracking
  totalItems: integer("total_items").default(0),
  completedItems: integer("completed_items").default(0),
  failedItems: integer("failed_items").default(0),

  // Queue details
  downloadQueue: jsonb("download_queue").$type<DownloadQueueItem[]>(),

  // Files that need manual organization (for MeTube)
  pendingOrganization: jsonb("pending_organization").$type<{
    files: Array<{
      path: string;
      suggestedPath: string;
      title: string;
      artist: string;
    }>;
    organized: boolean;
  }>(),

  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),

  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  userIdIdx: index("playlist_download_jobs_user_id_idx").on(table.userId),
  serviceIdx: index("playlist_download_jobs_service_idx").on(table.service),
  statusIdx: index("playlist_download_jobs_status_idx").on(table.status),
  createdAtIdx: index("playlist_download_jobs_created_at_idx").on(table.createdAt.desc()),
}));

/**
 * Platform Credentials Table
 * Stores OAuth tokens and API credentials for streaming platforms
 */
export const platformCredentials = pgTable("platform_credentials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Platform identification
  platform: text("platform").$type<PlaylistPlatform>().notNull(),

  // OAuth tokens (encrypted in application layer)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),

  // Platform-specific user info
  platformUserId: text("platform_user_id"),
  platformUsername: text("platform_username"),

  // Scope/permissions granted
  scopes: jsonb("scopes").$type<string[]>(),

  // Timestamps
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  userPlatformIdx: index("platform_credentials_user_platform_idx").on(table.userId, table.platform),
}));

// Type exports
export type PlaylistExportJob = typeof playlistExportJobs.$inferSelect;
export type PlaylistExportJobInsert = typeof playlistExportJobs.$inferInsert;
export type PlaylistImportJob = typeof playlistImportJobs.$inferSelect;
export type PlaylistImportJobInsert = typeof playlistImportJobs.$inferInsert;
export type PlaylistDownloadJob = typeof playlistDownloadJobs.$inferSelect;
export type PlaylistDownloadJobInsert = typeof playlistDownloadJobs.$inferInsert;
export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type PlatformCredentialInsert = typeof platformCredentials.$inferInsert;
