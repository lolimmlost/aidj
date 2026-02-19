import { pgTable, text, boolean, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Cache table for Deezer explicit content lookups.
 * Stores whether a song is explicit based on Deezer API data.
 * Global cache (not per-user) since explicit status is a property of the song.
 */
export const explicitContentCache = pgTable("explicit_content_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  isExplicit: boolean("is_explicit").notNull(),
  source: text("source").notNull().default("deezer"),
  confidence: real("confidence").default(1.0),
  checkedAt: timestamp("checked_at").$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  artistTitleIdx: uniqueIndex("explicit_artist_title_idx").on(table.artist, table.title),
}));

export type ExplicitContentCache = typeof explicitContentCache.$inferSelect;
export type ExplicitContentCacheInsert = typeof explicitContentCache.$inferInsert;
