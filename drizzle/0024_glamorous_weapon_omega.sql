CREATE TABLE "artist_metadata_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_name" text NOT NULL,
	"artist_name_normalized" text NOT NULL,
	"mbid" text,
	"navidrome_id" text,
	"disambiguation" text,
	"artist_type" text,
	"country" text,
	"formed_year" text,
	"ended" boolean DEFAULT false,
	"tags" jsonb,
	"genres" jsonb,
	"bio" jsonb,
	"relations" jsonb,
	"similar_artists" jsonb,
	"release_groups" jsonb,
	"cover_image_url" text,
	"lidarr_id" text,
	"lidarr_monitored" boolean,
	"fetched_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_artist_metadata_name" ON "artist_metadata_cache" USING btree ("artist_name_normalized");--> statement-breakpoint
CREATE INDEX "idx_artist_metadata_mbid" ON "artist_metadata_cache" USING btree ("mbid");--> statement-breakpoint
CREATE INDEX "idx_artist_metadata_navidrome" ON "artist_metadata_cache" USING btree ("navidrome_id");