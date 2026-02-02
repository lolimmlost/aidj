CREATE TABLE "artist_affinities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artist" text NOT NULL,
	"affinity_score" real DEFAULT 0 NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"liked_count" integer DEFAULT 0 NOT NULL,
	"skip_count" integer DEFAULT 0 NOT NULL,
	"total_play_time" integer DEFAULT 0 NOT NULL,
	"calculated_at" timestamp NOT NULL,
	CONSTRAINT "artist_affinities_unique" UNIQUE("user_id","artist")
);
--> statement-breakpoint
CREATE TABLE "liked_songs_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"synced_at" timestamp NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "liked_songs_sync_unique" UNIQUE("user_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "temporal_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"time_slot" text NOT NULL,
	"season" text,
	"genre" text NOT NULL,
	"preference_score" real DEFAULT 0 NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"calculated_at" timestamp NOT NULL,
	CONSTRAINT "temporal_preferences_unique" UNIQUE("user_id","time_slot","season","genre")
);
--> statement-breakpoint
ALTER TABLE "discovery_job_state" ADD COLUMN "max_suggestions_per_run" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_job_state" ADD COLUMN "seed_count" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "artist_affinities" ADD CONSTRAINT "artist_affinities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liked_songs_sync" ADD CONSTRAINT "liked_songs_sync_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_preferences" ADD CONSTRAINT "temporal_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_affinities_user_id_idx" ON "artist_affinities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artist_affinities_user_score_idx" ON "artist_affinities" USING btree ("user_id","affinity_score");--> statement-breakpoint
CREATE INDEX "artist_affinities_artist_idx" ON "artist_affinities" USING btree ("artist");--> statement-breakpoint
CREATE INDEX "liked_songs_sync_user_id_idx" ON "liked_songs_sync" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "liked_songs_sync_song_id_idx" ON "liked_songs_sync" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "liked_songs_sync_user_active_idx" ON "liked_songs_sync" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "temporal_preferences_user_id_idx" ON "temporal_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "temporal_preferences_user_time_idx" ON "temporal_preferences" USING btree ("user_id","time_slot");--> statement-breakpoint
CREATE INDEX "temporal_preferences_user_season_idx" ON "temporal_preferences" USING btree ("user_id","season");--> statement-breakpoint
CREATE INDEX "temporal_preferences_genre_idx" ON "temporal_preferences" USING btree ("genre");