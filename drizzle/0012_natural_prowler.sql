CREATE TABLE "music_identity_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_type" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer,
	"title" text NOT NULL,
	"ai_insights" jsonb NOT NULL,
	"mood_profile" jsonb NOT NULL,
	"artist_affinities" jsonb NOT NULL,
	"trend_analysis" jsonb NOT NULL,
	"top_artists" jsonb NOT NULL,
	"top_tracks" jsonb NOT NULL,
	"top_genres" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"card_theme" text DEFAULT 'default',
	"card_data" jsonb,
	"share_token" text,
	"is_public" integer DEFAULT 0,
	"generated_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "music_identity_summaries" ADD CONSTRAINT "music_identity_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_identity_user_id_idx" ON "music_identity_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "music_identity_user_period_idx" ON "music_identity_summaries" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE INDEX "music_identity_share_token_idx" ON "music_identity_summaries" USING btree ("share_token");