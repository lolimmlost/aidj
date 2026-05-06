CREATE TABLE "artist_cooccurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"artist_a" text NOT NULL,
	"artist_b" text NOT NULL,
	"cooccurrence_score" real DEFAULT 0 NOT NULL,
	"coplay_count" integer DEFAULT 0 NOT NULL,
	"last_coplayed_at" timestamp,
	"calculated_at" timestamp NOT NULL,
	CONSTRAINT "artist_cooccurrence_unique" UNIQUE("user_id","artist_a","artist_b")
);
--> statement-breakpoint
ALTER TABLE "artist_cooccurrence" ADD CONSTRAINT "artist_cooccurrence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_cooccurrence_user_artist_score_idx" ON "artist_cooccurrence" USING btree ("user_id","artist_a","cooccurrence_score");--> statement-breakpoint
CREATE INDEX "artist_cooccurrence_user_id_idx" ON "artist_cooccurrence" USING btree ("user_id");