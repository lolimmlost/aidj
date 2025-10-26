import { pgTable, text, timestamp, integer, unique, index, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

export const userPlaylists = pgTable("user_playlists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // Navidrome sync fields
  navidromeId: text("navidrome_id"), // Nullable - only set for synced playlists
  lastSynced: timestamp("last_synced"), // When playlist was last synced with Navidrome
  songCount: integer("song_count"), // Cached song count for performance
  totalDuration: integer("total_duration"), // Total duration in seconds
  smartPlaylistCriteria: jsonb("smart_playlist_criteria").$type<{
    genre?: string[];
    yearFrom?: number;
    yearTo?: number;
    artists?: string[];
    rating?: number;
    recentlyAdded?: '7d' | '30d' | '90d';
  }>(), // Filter rules for smart playlists
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  userIdIdx: index("user_playlists_user_id_idx").on(table.userId),
  createdAtIdx: index("user_playlists_created_at_idx").on(table.createdAt.desc()),
  navidromeIdIdx: index("user_playlists_navidrome_id_idx").on(table.navidromeId), // Index for fast sync lookups
  uniqueUserPlaylistName: unique("unique_user_playlist_name").on(table.userId, table.name),
}));

export const playlistSongs = pgTable("playlist_songs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => userPlaylists.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull(),
  songArtistTitle: text("song_artist_title").notNull(),
  position: integer("position").notNull(),
  addedAt: timestamp("added_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  playlistIdIdx: index("playlist_songs_playlist_id_idx").on(table.playlistId),
  songIdIdx: index("playlist_songs_song_id_idx").on(table.songId),
  positionIdx: index("playlist_songs_position_idx").on(table.playlistId, table.position),
  uniquePlaylistSong: unique("unique_playlist_song").on(table.playlistId, table.songId),
}));

export type UserPlaylist = typeof userPlaylists.$inferSelect;
export type UserPlaylistInsert = typeof userPlaylists.$inferInsert;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type PlaylistSongInsert = typeof playlistSongs.$inferInsert;
