import { pgTable, text, timestamp, integer, real, jsonb, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

export const listeningSessions = pgTable("listening_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),

  songCount: integer("song_count").notNull(),
  uniqueArtistCount: integer("unique_artist_count").notNull(),
  uniqueGenreCount: integer("unique_genre_count").notNull(),
  completionRate: real("completion_rate").notNull(),
  skipRate: real("skip_rate").notNull(),
  avgPlayPercentage: real("avg_play_percentage").notNull(),

  topArtists: jsonb("top_artists").$type<TopSessionItem[]>().notNull(),
  topGenres: jsonb("top_genres").$type<TopSessionItem[]>().notNull(),
  sourceMix: jsonb("source_mix").$type<Record<string, number>>().notNull(),
  dominantSource: text("dominant_source"),

  dayOfWeek: integer("day_of_week"),
  hourOfDay: integer("hour_of_day"),
  season: text("season", { enum: ['spring', 'summer', 'fall', 'winter'] }),

  rating: integer("rating"),
  ratedAt: timestamp("rated_at"),

  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  userIdIdx: index("listening_sessions_user_id_idx").on(table.userId),
  userStartedAtIdx: index("listening_sessions_user_started_at_idx").on(table.userId, table.startedAt),
  userRatingIdx: index("listening_sessions_user_rating_idx").on(table.userId, table.rating),
  userSourceIdx: index("listening_sessions_user_source_idx").on(table.userId, table.dominantSource),
  uniqueUserStart: unique("listening_sessions_user_start_unique").on(table.userId, table.startedAt),
}));

export interface TopSessionItem {
  name: string;
  count: number;
}

export type ListeningSession = typeof listeningSessions.$inferSelect;
export type ListeningSessionInsert = typeof listeningSessions.$inferInsert;
