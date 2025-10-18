CREATE TABLE "recommendation_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recommendation_cache_id" integer,
	"song_artist_title" text NOT NULL,
	"feedback_type" text NOT NULL,
	"source" text DEFAULT 'recommendation' NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendations_cache" ADD COLUMN "quality_score" real;--> statement-breakpoint
ALTER TABLE "recommendations_cache" ADD COLUMN "feedback_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_recommendation_cache_id_recommendations_cache_id_fk" FOREIGN KEY ("recommendation_cache_id") REFERENCES "public"."recommendations_cache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_feedback_user_id_idx" ON "recommendation_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_timestamp_idx" ON "recommendation_feedback" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_cache_id_idx" ON "recommendation_feedback" USING btree ("recommendation_cache_id");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_user_type_time_idx" ON "recommendation_feedback" USING btree ("user_id","feedback_type","timestamp");