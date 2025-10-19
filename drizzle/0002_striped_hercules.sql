CREATE TABLE "playlist_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"song_id" text NOT NULL,
	"song_artist_title" text NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp NOT NULL,
	CONSTRAINT "unique_playlist_song" UNIQUE("playlist_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "user_playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "unique_user_playlist_name" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "recommendation_settings" SET DEFAULT '{"aiEnabled":true,"frequency":"always","styleBasedPlaylists":true,"useFeedbackForPersonalization":true,"enableSeasonalRecommendations":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_songs_playlist_id_idx" ON "playlist_songs" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "playlist_songs_song_id_idx" ON "playlist_songs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "playlist_songs_position_idx" ON "playlist_songs" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "user_playlists_user_id_idx" ON "user_playlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_playlists_created_at_idx" ON "user_playlists" USING btree ("created_at" DESC NULLS LAST);