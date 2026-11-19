CREATE TABLE "artist_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artist_mbid" text NOT NULL,
	"artist_name" text NOT NULL,
	"mode" text NOT NULL,
	"release_group_id" text,
	"release_title" text,
	"song_title" text,
	"outcome" text NOT NULL,
	"lidarr_artist_id" integer,
	"lidarr_album_id" integer,
	"requested_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_requests" ADD CONSTRAINT "artist_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_requests_mbid_idx" ON "artist_requests" USING btree ("artist_mbid");--> statement-breakpoint
CREATE INDEX "artist_requests_user_idx" ON "artist_requests" USING btree ("user_id");