CREATE TABLE "known_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_song_id" text NOT NULL,
	"to_song_id" text NOT NULL,
	"from_title" text NOT NULL,
	"from_artist" text DEFAULT '' NOT NULL,
	"to_title" text NOT NULL,
	"to_artist" text DEFAULT '' NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"techniques" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"set_bpm" real,
	"last_played_at" timestamp,
	"role" text,
	"status" text DEFAULT 'lab' NOT NULL,
	"note" text,
	"source" text DEFAULT 'lab' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "known_transitions_unique" UNIQUE("user_id","from_song_id","to_song_id")
);
--> statement-breakpoint
ALTER TABLE "known_transitions" ADD CONSTRAINT "known_transitions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "known_transitions_user_from_idx" ON "known_transitions" USING btree ("user_id","from_song_id");