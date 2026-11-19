import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * Artist Requests (#436)
 *
 * One row per "get this" click on an artist the library doesn't have yet
 * (search → MusicBrainz card). It's a demand signal: who asked for what, and
 * whether Lidarr ever delivered it. Used for "requested by you / N others" on
 * the card, and to spot requests that never resolved (#435).
 *
 * mode:
 *  - 'artist'  — follow the artist: future releases download (monitorNewItems=new)
 *  - 'release' — one release group (album / EP / single) by MusicBrainz id
 *  - 'song'    — a song title; resolved to a release group when possible
 *
 * outcome is what happened at request time:
 *  'monitored' | 'already_monitored' | 'in_library' | 'pending' (Lidarr is still
 *  loading the release) | 'not_found' | 'failed'
 */
export const artistRequests = pgTable('artist_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  artistMbid: text('artist_mbid').notNull(),
  artistName: text('artist_name').notNull(),
  mode: text('mode', { enum: ['artist', 'release', 'song'] }).notNull(),
  releaseGroupId: text('release_group_id'),
  releaseTitle: text('release_title'),
  songTitle: text('song_title'),

  outcome: text('outcome').notNull(),
  lidarrArtistId: integer('lidarr_artist_id'),
  lidarrAlbumId: integer('lidarr_album_id'),

  requestedAt: timestamp('requested_at').$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('artist_requests_mbid_idx').on(table.artistMbid),
  index('artist_requests_user_idx').on(table.userId),
]);

export type ArtistRequest = typeof artistRequests.$inferSelect;
export type ArtistRequestInsert = typeof artistRequests.$inferInsert;
