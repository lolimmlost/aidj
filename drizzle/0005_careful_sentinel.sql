ALTER TABLE "user_playlists" ADD COLUMN "navidrome_id" text;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD COLUMN "last_synced" timestamp;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD COLUMN "song_count" integer;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD COLUMN "total_duration" integer;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD COLUMN "smart_playlist_criteria" jsonb;--> statement-breakpoint
CREATE INDEX "user_playlists_navidrome_id_idx" ON "user_playlists" USING btree ("navidrome_id");