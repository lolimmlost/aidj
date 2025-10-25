import { pgTable, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Stores analyzed genre and keyword profiles for user libraries
 * Used for genre-based recommendation filtering and ranking
 */
export const libraryProfiles = pgTable("library_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  // Genre distribution as percentage map: { "Rock": 0.40, "Electronic": 0.25, ... }
  genreDistribution: jsonb("genre_distribution").$type<Record<string, number>>().notNull(),

  // Top 20 keywords extracted from artist/album/song metadata
  topKeywords: jsonb("top_keywords").$type<string[]>().notNull(),

  // Total number of songs analyzed
  totalSongs: integer("total_songs").notNull(),

  // Last time the library was analyzed
  lastAnalyzed: timestamp("last_analyzed")
    .$defaultFn(() => new Date())
    .notNull(),

  // Flag indicating if profile needs refresh (e.g., library changed >10%)
  refreshNeeded: boolean("refresh_needed").default(false).notNull(),
}, (table) => [
  // Index for user-scoped queries
  index("library_profiles_user_id_idx").on(table.userId),

  // Index for finding stale profiles that need refresh
  index("library_profiles_last_analyzed_idx").on(table.lastAnalyzed),

  // Index for finding profiles that need refresh
  index("library_profiles_refresh_needed_idx").on(table.refreshNeeded),
]);

export type LibraryProfile = typeof libraryProfiles.$inferSelect;
export type LibraryProfileInsert = typeof libraryProfiles.$inferInsert;
