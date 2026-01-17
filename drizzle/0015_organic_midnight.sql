CREATE TABLE "lyrics_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"album" text,
	"duration" text,
	"lyrics" text,
	"synced_lyrics" jsonb,
	"source" text NOT NULL,
	"instrumental" boolean DEFAULT false,
	"fetched_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_job_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency_hours" integer DEFAULT 12 NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"is_running" boolean DEFAULT false NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"total_suggestions_generated" integer DEFAULT 0 NOT NULL,
	"total_approved" integer DEFAULT 0 NOT NULL,
	"total_rejected" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_rejection_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artist_name" text NOT NULL,
	"track_name" text NOT NULL,
	"rejected_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "discovery_rejection_unique" UNIQUE("user_id","artist_name","track_name")
);
--> statement-breakpoint
CREATE TABLE "discovery_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artist_name" text NOT NULL,
	"track_name" text NOT NULL,
	"album_name" text,
	"source" text NOT NULL,
	"seed_artist" text NOT NULL,
	"seed_track" text,
	"match_score" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lastfm_url" text,
	"image_url" text,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text,
	"suggested_at" timestamp NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "discovery_job_state" ADD CONSTRAINT "discovery_job_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_rejection_history" ADD CONSTRAINT "discovery_rejection_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_suggestions" ADD CONSTRAINT "discovery_suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_job_state_next_run_at_idx" ON "discovery_job_state" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "discovery_job_state_enabled_idx" ON "discovery_job_state" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "discovery_rejection_expires_at_idx" ON "discovery_rejection_history" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discovery_rejection_user_artist_track_idx" ON "discovery_rejection_history" USING btree ("user_id","artist_name","track_name");--> statement-breakpoint
CREATE INDEX "discovery_suggestions_user_status_idx" ON "discovery_suggestions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "discovery_suggestions_user_artist_track_idx" ON "discovery_suggestions" USING btree ("user_id","artist_name","track_name");--> statement-breakpoint
CREATE INDEX "discovery_suggestions_match_score_idx" ON "discovery_suggestions" USING btree ("match_score");--> statement-breakpoint
CREATE INDEX "discovery_suggestions_seed_artist_idx" ON "discovery_suggestions" USING btree ("seed_artist");