CREATE TABLE "saved_cover_art" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"image_url" text NOT NULL,
	"source" text NOT NULL,
	"user_id" text NOT NULL,
	"saved_at" timestamp NOT NULL,
	CONSTRAINT "saved_cover_art_entity_id_unique" UNIQUE("entity_id")
);
