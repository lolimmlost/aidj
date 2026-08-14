ALTER TABLE "user_playlists" ADD COLUMN "is_liked_songs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_playlists_one_liked_per_user" ON "user_playlists" USING btree ("user_id") WHERE "user_playlists"."is_liked_songs";--> statement-breakpoint
-- Backfill: flag the canonical app-managed Liked Songs playlist. The
-- unique_user_playlist_name constraint guarantees at most one such row per user,
-- so this can never violate user_playlists_one_liked_per_user. Differently-named
-- legacy liked playlists self-heal via findLikedPlaylist() on first access.
UPDATE "user_playlists" SET "is_liked_songs" = true WHERE "name" = '❤️ Liked Songs' AND "navidrome_id" IS NULL;