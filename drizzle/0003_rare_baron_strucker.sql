ALTER TABLE "recommendation_feedback" ADD COLUMN "song_id" text;--> statement-breakpoint
CREATE INDEX "recommendation_feedback_song_id_idx" ON "recommendation_feedback" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_user_song_id_idx" ON "recommendation_feedback" USING btree ("user_id","song_id");