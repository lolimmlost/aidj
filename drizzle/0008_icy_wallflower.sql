CREATE TABLE "indexed_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"navidrome_artist_id" text NOT NULL,
	"name" text NOT NULL,
	"album_count" integer DEFAULT 0,
	"song_count" integer DEFAULT 0,
	"genres" text,
	"checksum" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexed_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"navidrome_song_id" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"album_id" text,
	"artist_id" text,
	"duration" integer,
	"track" integer,
	"genre" text,
	"year" integer,
	"song_key" text NOT NULL,
	"checksum" text,
	"last_modified_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_full_sync_at" timestamp,
	"last_incremental_sync_at" timestamp,
	"last_sync_started_at" timestamp,
	"last_sync_completed_at" timestamp,
	"status" text DEFAULT 'idle' NOT NULL,
	"current_phase" text,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"checkpoint" jsonb,
	"sync_frequency_minutes" integer DEFAULT 30,
	"batch_size" integer DEFAULT 100,
	"max_concurrent_requests" integer DEFAULT 3,
	"auto_sync_enabled" boolean DEFAULT true,
	"last_sync_duration_ms" integer,
	"total_songs_indexed" integer DEFAULT 0,
	"total_artists_indexed" integer DEFAULT 0,
	"total_albums_indexed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_error_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sync_session_id" text,
	"error_type" text NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"phase" text,
	"item_id" text,
	"item_type" text,
	"resolved" boolean DEFAULT false,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mood_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"period_type" text NOT NULL,
	"mood_distribution" jsonb NOT NULL,
	"top_genres" jsonb NOT NULL,
	"top_artists" jsonb NOT NULL,
	"top_tracks" jsonb NOT NULL,
	"total_listens" integer DEFAULT 0 NOT NULL,
	"total_feedback" integer DEFAULT 0 NOT NULL,
	"thumbs_up_count" integer DEFAULT 0 NOT NULL,
	"thumbs_down_count" integer DEFAULT 0 NOT NULL,
	"acceptance_rate" real DEFAULT 0 NOT NULL,
	"diversity_score" real DEFAULT 0 NOT NULL,
	"season" text,
	"month" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"generated_at" timestamp NOT NULL,
	"recommended_songs" jsonb NOT NULL,
	"source" text NOT NULL,
	"mood_context" text,
	"reasoning_factors" jsonb,
	"taste_profile_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "taste_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"captured_at" timestamp NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"profile_data" jsonb NOT NULL,
	"export_formats" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"is_auto_generated" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "mood_snapshots" ADD CONSTRAINT "mood_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_history" ADD CONSTRAINT "recommendation_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_snapshots" ADD CONSTRAINT "taste_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexed_artists_user_id_idx" ON "indexed_artists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indexed_artists_user_artist_idx" ON "indexed_artists" USING btree ("user_id","navidrome_artist_id");--> statement-breakpoint
CREATE INDEX "indexed_artists_name_idx" ON "indexed_artists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "indexed_songs_user_id_idx" ON "indexed_songs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indexed_songs_user_song_idx" ON "indexed_songs" USING btree ("user_id","navidrome_song_id");--> statement-breakpoint
CREATE INDEX "indexed_songs_song_key_idx" ON "indexed_songs" USING btree ("song_key");--> statement-breakpoint
CREATE INDEX "indexed_songs_artist_idx" ON "indexed_songs" USING btree ("artist");--> statement-breakpoint
CREATE INDEX "indexed_songs_synced_at_idx" ON "indexed_songs" USING btree ("synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_sync_state_user_id_idx" ON "library_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_error_log_user_id_idx" ON "sync_error_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_error_log_session_idx" ON "sync_error_log" USING btree ("sync_session_id");--> statement-breakpoint
CREATE INDEX "sync_error_log_created_at_idx" ON "sync_error_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mood_snapshots_user_id_idx" ON "mood_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mood_snapshots_period_start_idx" ON "mood_snapshots" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "mood_snapshots_user_period_idx" ON "mood_snapshots" USING btree ("user_id","period_start");--> statement-breakpoint
CREATE INDEX "mood_snapshots_period_type_idx" ON "mood_snapshots" USING btree ("period_type");--> statement-breakpoint
CREATE INDEX "mood_snapshots_user_period_type_idx" ON "mood_snapshots" USING btree ("user_id","period_type");--> statement-breakpoint
CREATE INDEX "recommendation_history_user_id_idx" ON "recommendation_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendation_history_generated_at_idx" ON "recommendation_history" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "recommendation_history_user_generated_at_idx" ON "recommendation_history" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "recommendation_history_source_idx" ON "recommendation_history" USING btree ("source");--> statement-breakpoint
CREATE INDEX "taste_snapshots_user_id_idx" ON "taste_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "taste_snapshots_captured_at_idx" ON "taste_snapshots" USING btree ("captured_at");