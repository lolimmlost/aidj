CREATE TABLE "discovery_feed_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"aggregation_level" text NOT NULL,
	"user_id" text,
	"total_items_shown" integer DEFAULT 0 NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_plays" integer DEFAULT 0 NOT NULL,
	"total_play_duration" integer DEFAULT 0 NOT NULL,
	"total_saves" integer DEFAULT 0 NOT NULL,
	"total_skips" integer DEFAULT 0 NOT NULL,
	"total_dismissals" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"total_dislikes" integer DEFAULT 0 NOT NULL,
	"total_not_interested" integer DEFAULT 0 NOT NULL,
	"click_through_rate" real DEFAULT 0,
	"play_rate" real DEFAULT 0,
	"save_rate" real DEFAULT 0,
	"skip_rate" real DEFAULT 0,
	"dismissal_rate" real DEFAULT 0,
	"source_breakdown" jsonb DEFAULT '[]'::jsonb,
	"time_slot_breakdown" jsonb DEFAULT '[]'::jsonb,
	"notifications_sent" integer DEFAULT 0 NOT NULL,
	"notifications_opened" integer DEFAULT 0 NOT NULL,
	"notification_open_rate" real DEFAULT 0,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "discovery_feed_analytics_unique" UNIQUE("period_start","aggregation_level","user_id")
);
--> statement-breakpoint
CREATE TABLE "discovery_feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"content_id" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"explanation" text,
	"recommendation_source" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"target_time_slot" text DEFAULT 'any',
	"target_context" text DEFAULT 'general',
	"shown" boolean DEFAULT false NOT NULL,
	"shown_at" timestamp,
	"clicked" boolean DEFAULT false NOT NULL,
	"clicked_at" timestamp,
	"played" boolean DEFAULT false NOT NULL,
	"played_at" timestamp,
	"play_duration" integer,
	"saved" boolean DEFAULT false NOT NULL,
	"saved_at" timestamp,
	"skipped" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"feedback" text,
	"feedback_at" timestamp,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"preferred_times" jsonb DEFAULT '["09:00","17:00"]'::jsonb NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00',
	"quiet_hours_end" text DEFAULT '08:00',
	"active_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"include_new_releases" boolean DEFAULT true NOT NULL,
	"include_personalized" boolean DEFAULT true NOT NULL,
	"include_time_based_suggestions" boolean DEFAULT true NOT NULL,
	"include_trending" boolean DEFAULT false NOT NULL,
	"max_notifications_per_day" integer DEFAULT 3 NOT NULL,
	"computed_optimal_time" text,
	"ab_test_group" text DEFAULT 'control',
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "discovery_notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "listening_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"time_slot" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"top_genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_moods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avg_energy" real DEFAULT 0.5,
	"avg_bpm" integer,
	"primary_context" text DEFAULT 'general',
	"sample_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "listening_patterns_unique" UNIQUE("user_id","time_slot","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_url" text,
	"feed_item_id" text,
	"notification_type" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"clicked_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"ab_test_variant" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_feed_analytics" ADD CONSTRAINT "discovery_feed_analytics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_feed_items" ADD CONSTRAINT "discovery_feed_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_notification_preferences" ADD CONSTRAINT "discovery_notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_patterns" ADD CONSTRAINT "listening_patterns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_feed_analytics_period_idx" ON "discovery_feed_analytics" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "discovery_feed_analytics_user_id_idx" ON "discovery_feed_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discovery_feed_items_user_id_idx" ON "discovery_feed_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discovery_feed_items_user_time_slot_idx" ON "discovery_feed_items" USING btree ("user_id","target_time_slot");--> statement-breakpoint
CREATE INDEX "discovery_feed_items_shown_at_idx" ON "discovery_feed_items" USING btree ("shown_at");--> statement-breakpoint
CREATE INDEX "discovery_feed_items_expires_at_idx" ON "discovery_feed_items" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discovery_feed_items_user_content_idx" ON "discovery_feed_items" USING btree ("user_id","content_id","item_type");--> statement-breakpoint
CREATE INDEX "discovery_notification_prefs_user_id_idx" ON "discovery_notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listening_patterns_user_id_idx" ON "listening_patterns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listening_patterns_time_slot_idx" ON "listening_patterns" USING btree ("time_slot");--> statement-breakpoint
CREATE INDEX "listening_patterns_user_time_day_idx" ON "listening_patterns" USING btree ("user_id","time_slot","day_of_week");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_status_scheduled_idx" ON "scheduled_notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_user_id_idx" ON "scheduled_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_type_status_idx" ON "scheduled_notifications" USING btree ("notification_type","status");