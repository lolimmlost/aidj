CREATE TABLE "compound_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"recency_weighted_score" real DEFAULT 0 NOT NULL,
	"calculated_at" timestamp NOT NULL,
	CONSTRAINT "compound_scores_unique" UNIQUE("user_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "listening_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"album" text,
	"genre" text,
	"played_at" timestamp NOT NULL,
	"play_duration" integer,
	"song_duration" integer,
	"completed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "track_similarities" (
	"id" text PRIMARY KEY NOT NULL,
	"source_artist" text NOT NULL,
	"source_title" text NOT NULL,
	"target_artist" text NOT NULL,
	"target_title" text NOT NULL,
	"target_song_id" text,
	"match_score" real NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "track_similarities_unique" UNIQUE("source_artist","source_title","target_artist","target_title")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "recommendation_settings" SET DEFAULT '{"aiEnabled":true,"frequency":"always","styleBasedPlaylists":true,"useFeedbackForPersonalization":true,"enableSeasonalRecommendations":true,"syncFeedbackToNavidrome":true,"aiDJEnabled":false,"aiDJQueueThreshold":2,"aiDJBatchSize":3,"aiDJUseCurrentContext":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "compound_scores" ADD CONSTRAINT "compound_scores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compound_scores_user_id_idx" ON "compound_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compound_scores_user_score_idx" ON "compound_scores" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "compound_scores_song_id_idx" ON "compound_scores" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "listening_history_user_id_idx" ON "listening_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listening_history_played_at_idx" ON "listening_history" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "listening_history_user_played_at_idx" ON "listening_history" USING btree ("user_id","played_at");--> statement-breakpoint
CREATE INDEX "listening_history_song_id_idx" ON "listening_history" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "listening_history_artist_idx" ON "listening_history" USING btree ("artist");--> statement-breakpoint
CREATE INDEX "track_similarities_source_idx" ON "track_similarities" USING btree ("source_artist","source_title");--> statement-breakpoint
CREATE INDEX "track_similarities_target_idx" ON "track_similarities" USING btree ("target_artist","target_title");--> statement-breakpoint
CREATE INDEX "track_similarities_target_song_id_idx" ON "track_similarities" USING btree ("target_song_id");--> statement-breakpoint
CREATE INDEX "track_similarities_expires_at_idx" ON "track_similarities" USING btree ("expires_at");