import { pgTable, text, timestamp, integer, real, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Listening History Schema
 *
 * Phase 4 of the recommendation engine refactor - tracks song plays
 * to build compound scoring for better recommendations.
 *
 * Inspired by Platypush's approach:
 * - Track what songs are played
 * - Fetch similar tracks from Last.fm for each played song
 * - Build compound scores: songs suggested by multiple played songs rank higher
 *
 * @see docs/architecture/recommendation-engine-refactor.md
 */

/**
 * Stores listening history - every song play by a user
 * Used to build compound scores over time
 */
export const listeningHistory = pgTable("listening_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Song identifiers
  songId: text("song_id").notNull(), // Navidrome song ID
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  album: text("album"),

  // Genre info for fallback scoring
  genre: text("genre"),

  // Play timestamp
  playedAt: timestamp("played_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // Play duration in seconds (helps determine if song was skipped)
  playDuration: integer("play_duration"),

  // Total song duration in seconds
  songDuration: integer("song_duration"),

  // Did the user finish the song? (> 80% played)
  completed: integer("completed").default(0), // 0 = no, 1 = yes (using integer for SQLite compat)

  // Phase 3.1: Skip detection - was the song explicitly skipped?
  // 0 = not skipped (completed or just not tracked)
  // 1 = skipped (played < 30% AND played > 5 seconds)
  skipDetected: integer("skip_detected").default(0),
}, (table) => ({
  // Index for user's listening history
  userIdIdx: index("listening_history_user_id_idx").on(table.userId),

  // Index for time-based queries
  playedAtIdx: index("listening_history_played_at_idx").on(table.playedAt),

  // Compound index for user's recent history
  userPlayedAtIdx: index("listening_history_user_played_at_idx").on(table.userId, table.playedAt),

  // Index for song lookups
  songIdIdx: index("listening_history_song_id_idx").on(table.songId),

  // Index for artist-based queries
  artistIdx: index("listening_history_artist_idx").on(table.artist),

  // Phase 3.1: Index for skip tracking queries
  skipIdx: index("listening_history_skip_idx").on(table.userId, table.skipDetected, table.playedAt),
}));

/**
 * Stores track similarity data from Last.fm
 * When a song is played, we fetch similar tracks and store them here
 * This allows compound scoring over time
 */
export const trackSimilarities = pgTable("track_similarities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // The "source" song that was played
  sourceArtist: text("source_artist").notNull(),
  sourceTitle: text("source_title").notNull(),

  // The "target" similar song recommended by Last.fm
  targetArtist: text("target_artist").notNull(),
  targetTitle: text("target_title").notNull(),

  // Navidrome song ID if the target exists in library
  targetSongId: text("target_song_id"),

  // Last.fm match score (0.0 - 1.0)
  matchScore: real("match_score").notNull(),

  // When this similarity was fetched
  fetchedAt: timestamp("fetched_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // When to refresh this data (Last.fm data rarely changes, cache for 30 days)
  expiresAt: timestamp("expires_at")
    .$defaultFn(() => {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    })
    .notNull(),
}, (table) => ({
  // Unique constraint: one similarity record per source-target pair
  uniqueSimilarity: unique("track_similarities_unique").on(
    table.sourceArtist,
    table.sourceTitle,
    table.targetArtist,
    table.targetTitle
  ),

  // Index for source song lookups
  sourceIdx: index("track_similarities_source_idx").on(table.sourceArtist, table.sourceTitle),

  // Index for target song lookups
  targetIdx: index("track_similarities_target_idx").on(table.targetArtist, table.targetTitle),

  // Index for library songs (when targetSongId is set)
  targetSongIdIdx: index("track_similarities_target_song_id_idx").on(table.targetSongId),

  // Index for cache expiry queries
  expiresAtIdx: index("track_similarities_expires_at_idx").on(table.expiresAt),
}));

/**
 * Compound scores - aggregated recommendation scores for songs
 * Updated periodically based on listening history + similarities
 */
export const compoundScores = pgTable("compound_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // The recommended song
  songId: text("song_id").notNull(),
  artist: text("artist").notNull(),
  title: text("title").notNull(),

  // Compound score: sum of (match_score * recency_weight) for all similar sources
  // Higher = more different played songs suggest this song
  score: real("score").notNull().default(0),

  // How many different source songs led to this recommendation
  sourceCount: integer("source_count").notNull().default(0),

  // Weighted by recency: more recent plays contribute more
  recencyWeightedScore: real("recency_weighted_score").notNull().default(0),

  // Last time this score was calculated
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Unique constraint: one score per user-song pair
  uniqueUserSong: unique("compound_scores_unique").on(table.userId, table.songId),

  // Index for user lookups
  userIdIdx: index("compound_scores_user_id_idx").on(table.userId),

  // Index for ranked recommendations (by score)
  userScoreIdx: index("compound_scores_user_score_idx").on(table.userId, table.score),

  // Index for song lookups
  songIdIdx: index("compound_scores_song_id_idx").on(table.songId),
}));

// Type exports
export type ListeningHistory = typeof listeningHistory.$inferSelect;
export type ListeningHistoryInsert = typeof listeningHistory.$inferInsert;

export type TrackSimilarity = typeof trackSimilarities.$inferSelect;
export type TrackSimilarityInsert = typeof trackSimilarities.$inferInsert;

export type CompoundScore = typeof compoundScores.$inferSelect;
export type CompoundScoreInsert = typeof compoundScores.$inferInsert;
