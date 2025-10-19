ALTER TABLE "user_preferences" ALTER COLUMN "recommendation_settings" SET DEFAULT '{"aiEnabled":true,"frequency":"always","styleBasedPlaylists":true,"useFeedbackForPersonalization":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD COLUMN "month" integer;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD COLUMN "season" text;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD COLUMN "day_of_week" integer;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD COLUMN "hour_of_day" integer;--> statement-breakpoint
CREATE INDEX "recommendation_feedback_month_idx" ON "recommendation_feedback" USING btree ("month");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_season_idx" ON "recommendation_feedback" USING btree ("season");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_user_season_idx" ON "recommendation_feedback" USING btree ("user_id","season");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_user_month_idx" ON "recommendation_feedback" USING btree ("user_id","month");