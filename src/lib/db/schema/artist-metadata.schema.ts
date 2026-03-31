import { pgTable, text, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Artist Metadata Cache Schema
 * Caches enriched artist metadata from Aurral/MusicBrainz to avoid
 * repeated API calls. 7-day TTL, looked up by name, MBID, or Navidrome ID.
 */
export const artistMetadataCache = pgTable('artist_metadata_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Lookup keys (multiple paths to the same artist)
  artistName: text('artist_name').notNull(),
  artistNameNormalized: text('artist_name_normalized').notNull(), // lowercase for case-insensitive lookups
  mbid: text('mbid'), // MusicBrainz ID — nullable until resolved
  navidromeId: text('navidrome_id'), // cross-reference from Navidrome data

  // Basic info
  disambiguation: text('disambiguation'),
  artistType: text('artist_type'), // Group, Person, Orchestra, etc.
  country: text('country'), // ISO country code
  formedYear: text('formed_year'), // life-span begin
  ended: boolean('ended').default(false),

  // Rich metadata (stored as JSON for flexibility)
  tags: jsonb('tags').$type<{ name: string; count: number }[]>(),
  genres: jsonb('genres').$type<string[]>(),
  bio: jsonb('bio').$type<Record<string, unknown>>(),
  relations: jsonb('relations').$type<{ type: string; url: string }[]>(),
  similarArtists: jsonb('similar_artists').$type<{ name: string; mbid: string; score: number; image?: string }[]>(),
  releaseGroups: jsonb('release_groups').$type<{ id: string; title: string; firstReleaseDate?: string; primaryType?: string }[]>(),

  // Images
  coverImageUrl: text('cover_image_url'),

  // Lidarr cross-reference
  lidarrId: text('lidarr_id'),
  lidarrMonitored: boolean('lidarr_monitored'),

  // Cache management
  fetchedAt: timestamp('fetched_at').$defaultFn(() => new Date()).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_artist_metadata_name').on(table.artistNameNormalized),
  index('idx_artist_metadata_mbid').on(table.mbid),
  index('idx_artist_metadata_navidrome').on(table.navidromeId),
]);

export type ArtistMetadata = typeof artistMetadataCache.$inferSelect;
export type ArtistMetadataInsert = typeof artistMetadataCache.$inferInsert;
