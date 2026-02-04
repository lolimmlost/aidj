import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Saved Cover Art Schema
 * Persists user-approved album/artist artwork from external sources (Deezer).
 * Once saved, these URLs are used instead of re-fetching from Deezer.
 */
export const savedCoverArt = pgTable('saved_cover_art', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // The entity this artwork belongs to
  entityId: text('entity_id').notNull().unique(),
  entityType: text('entity_type').notNull(), // 'album' | 'artist'

  // Search keys (for matching without entityId)
  artist: text('artist').notNull(),
  album: text('album'),

  // The approved image URL
  imageUrl: text('image_url').notNull(),

  // Where the image came from
  source: text('source').notNull(), // 'deezer' | 'lastfm' | 'manual'

  // Who approved it
  userId: text('user_id').notNull(),

  savedAt: timestamp('saved_at').$defaultFn(() => new Date()).notNull(),
});

export type SavedCoverArt = typeof savedCoverArt.$inferSelect;
export type SavedCoverArtInsert = typeof savedCoverArt.$inferInsert;
