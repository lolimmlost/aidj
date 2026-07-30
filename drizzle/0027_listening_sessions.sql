-- Listening Sessions: materialize session aggregates from listening_history
-- so users can rate sessions and we can analyze what makes a great mix.

CREATE TABLE "listening_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"duration_minutes" integer NOT NULL,
	"song_count" integer NOT NULL,
	"unique_artist_count" integer NOT NULL,
	"unique_genre_count" integer NOT NULL,
	"completion_rate" real NOT NULL,
	"skip_rate" real NOT NULL,
	"avg_play_percentage" real NOT NULL,
	"top_artists" jsonb NOT NULL,
	"top_genres" jsonb NOT NULL,
	"source_mix" jsonb NOT NULL,
	"dominant_source" text,
	"day_of_week" integer,
	"hour_of_day" integer,
	"season" text,
	"rating" integer,
	"rated_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "listening_sessions_user_start_unique" UNIQUE("user_id","started_at")
);
--> statement-breakpoint
ALTER TABLE "listening_history" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "listening_sessions_user_id_idx" ON "listening_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "listening_sessions_user_started_at_idx" ON "listening_sessions" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE INDEX "listening_sessions_user_rating_idx" ON "listening_sessions" USING btree ("user_id","rating");
--> statement-breakpoint
CREATE INDEX "listening_sessions_user_source_idx" ON "listening_sessions" USING btree ("user_id","dominant_source");
--> statement-breakpoint
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_session_id_listening_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "listening_history_session_id_idx" ON "listening_history" USING btree ("session_id");
