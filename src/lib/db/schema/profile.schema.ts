/**
 * Profile Schema
 *
 * Pre-computed user profile data for profile-based AI DJ recommendations.
 * These tables store pre-calculated scores that enable zero-API-call
 * recommendation generation.
 *
 * Key tables:
 * - artistAffinities: User's affinity scores for each artist
 * - temporalPreferences: Genre preferences by time of day/season
 *
 * @see docs/architecture/profile-based-recommendations.md
 */

import { pgTable, text, timestamp, integer, real, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Artist Affinities Table
 *
 * Stores pre-computed affinity scores for each artist a user has listened to.
 * Affinity is calculated from:
 * - Play count (how many times user played songs by this artist)
 * - Liked count (how many songs by this artist are starred/liked)
 * - Skip count (how often songs by this artist are skipped)
 *
 * Formula: affinity = (play_weight * plays + liked_weight * likes) / (1 + skip_penalty * skips)
 */
export const artistAffinities = pgTable("artist_affinities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Artist identifier (normalized lowercase)
  artist: text("artist").notNull(),

  // Normalized affinity score (0-1)
  // Higher = stronger preference for this artist
  affinityScore: real("affinity_score").notNull().default(0),

  // Raw counts used to calculate affinity
  playCount: integer("play_count").notNull().default(0),
  likedCount: integer("liked_count").notNull().default(0),
  skipCount: integer("skip_count").notNull().default(0),

  // Total play time in seconds (for weighted scoring)
  totalPlayTime: integer("total_play_time").notNull().default(0),

  // When this affinity was last calculated
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Unique constraint: one affinity per user-artist pair
  uniqueUserArtist: unique("artist_affinities_unique").on(table.userId, table.artist),

  // Index for user lookups
  userIdIdx: index("artist_affinities_user_id_idx").on(table.userId),

  // Index for ranked affinities (by score)
  userScoreIdx: index("artist_affinities_user_score_idx").on(table.userId, table.affinityScore),

  // Index for artist lookups
  artistIdx: index("artist_affinities_artist_idx").on(table.artist),
}));

/**
 * Temporal Preferences Table
 *
 * Stores genre preferences by time of day and season.
 * Enables recommendations that match the user's mood patterns.
 *
 * Time slots:
 * - morning: 6:00 - 11:59
 * - afternoon: 12:00 - 17:59
 * - evening: 18:00 - 21:59
 * - night: 22:00 - 5:59
 *
 * Seasons:
 * - spring: March-May
 * - summer: June-August
 * - fall: September-November
 * - winter: December-February
 */
export const temporalPreferences = pgTable("temporal_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Time context
  timeSlot: text("time_slot", { enum: ['morning', 'afternoon', 'evening', 'night'] }).notNull(),
  season: text("season", { enum: ['spring', 'summer', 'fall', 'winter'] }),

  // Genre for this preference
  genre: text("genre").notNull(),

  // Normalized preference score (0-1)
  // Higher = stronger preference for this genre at this time
  preferenceScore: real("preference_score").notNull().default(0),

  // Play count at this time/season combination
  playCount: integer("play_count").notNull().default(0),

  // When this preference was last calculated
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Unique constraint: one preference per user-time-season-genre combination
  uniqueTemporal: unique("temporal_preferences_unique").on(
    table.userId,
    table.timeSlot,
    table.season,
    table.genre
  ),

  // Index for user lookups
  userIdIdx: index("temporal_preferences_user_id_idx").on(table.userId),

  // Index for time-based queries
  userTimeIdx: index("temporal_preferences_user_time_idx").on(table.userId, table.timeSlot),

  // Index for season-based queries
  userSeasonIdx: index("temporal_preferences_user_season_idx").on(table.userId, table.season),

  // Index for genre lookups
  genreIdx: index("temporal_preferences_genre_idx").on(table.genre),
}));

/**
 * Liked Songs Sync Tracker
 *
 * Tracks which starred songs have been synced to the feedback table.
 * Prevents duplicate syncing and tracks un-stars.
 */
export const likedSongsSync = pgTable("liked_songs_sync", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Song identifiers
  songId: text("song_id").notNull(),
  artist: text("artist").notNull(),
  title: text("title").notNull(),

  // Sync status
  syncedAt: timestamp("synced_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // Is the song still starred? (false = was un-starred)
  isActive: integer("is_active").notNull().default(1), // 1 = active, 0 = un-starred
}, (table) => ({
  // Unique constraint: one sync record per user-song pair
  uniqueUserSong: unique("liked_songs_sync_unique").on(table.userId, table.songId),

  // Index for user lookups
  userIdIdx: index("liked_songs_sync_user_id_idx").on(table.userId),

  // Index for song lookups
  songIdIdx: index("liked_songs_sync_song_id_idx").on(table.songId),

  // Index for active songs
  userActiveIdx: index("liked_songs_sync_user_active_idx").on(table.userId, table.isActive),
}));

// Type exports
export type ArtistAffinity = typeof artistAffinities.$inferSelect;
export type ArtistAffinityInsert = typeof artistAffinities.$inferInsert;

export type TemporalPreference = typeof temporalPreferences.$inferSelect;
export type TemporalPreferenceInsert = typeof temporalPreferences.$inferInsert;

export type LikedSongsSync = typeof likedSongsSync.$inferSelect;
export type LikedSongsSyncInsert = typeof likedSongsSync.$inferInsert;
