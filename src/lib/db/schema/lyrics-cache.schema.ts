import { pgTable, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

/**
 * Lyrics Cache Schema
 * Caches lyrics fetched from external APIs (LRCLIB) and Navidrome
 * Cache expires after 30 days
 */
export const lyricsCache = pgTable('lyrics_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Song identifiers (for cache key)
  artist: text('artist').notNull(),
  title: text('title').notNull(),
  album: text('album'),
  duration: text('duration'), // Store as string to handle null

  // Cached lyrics data
  lyrics: text('lyrics'),
  syncedLyrics: jsonb('synced_lyrics').$type<Array<{ time: number; text: string }>>(),
  source: text('source').notNull(), // 'navidrome' | 'lrclib' | 'none'
  instrumental: boolean('instrumental').default(false),

  // Cache metadata
  fetchedAt: timestamp('fetched_at').$defaultFn(() => new Date()).notNull(),
  expiresAt: timestamp('expires_at').$defaultFn(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30); // Cache for 30 days
    return date;
  }).notNull(),
});

export type LyricsCache = typeof lyricsCache.$inferSelect;
export type LyricsCacheInsert = typeof lyricsCache.$inferInsert;
