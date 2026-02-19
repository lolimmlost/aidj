-- Safe Mode: explicit content cache for Deezer lookups

CREATE TABLE IF NOT EXISTS "explicit_content_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"is_explicit" boolean NOT NULL,
	"source" text DEFAULT 'deezer' NOT NULL,
	"confidence" real DEFAULT 1,
	"checked_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "explicit_artist_title_idx" ON "explicit_content_cache" USING btree ("artist","title");
