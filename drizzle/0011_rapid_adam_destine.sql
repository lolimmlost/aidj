CREATE TABLE "platform_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"platform_user_id" text,
	"platform_username" text,
	"scopes" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_download_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"import_job_id" text,
	"service" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0,
	"completed_items" integer DEFAULT 0,
	"failed_items" integer DEFAULT 0,
	"download_queue" jsonb,
	"pending_organization" jsonb,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_export_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"playlist_id" text,
	"format" text NOT NULL,
	"source_platform" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_songs" integer DEFAULT 0,
	"processed_songs" integer DEFAULT 0,
	"exported_data" text,
	"filename" text,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"format" text NOT NULL,
	"target_platform" text NOT NULL,
	"original_filename" text,
	"playlist_name" text,
	"playlist_description" text,
	"created_playlist_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_songs" integer DEFAULT 0,
	"processed_songs" integer DEFAULT 0,
	"matched_songs" integer DEFAULT 0,
	"unmatched_songs" integer DEFAULT 0,
	"pending_review_songs" integer DEFAULT 0,
	"match_results" jsonb,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_credentials" ADD CONSTRAINT "platform_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_download_jobs" ADD CONSTRAINT "playlist_download_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_download_jobs" ADD CONSTRAINT "playlist_download_jobs_import_job_id_playlist_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."playlist_import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_export_jobs" ADD CONSTRAINT "playlist_export_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_export_jobs" ADD CONSTRAINT "playlist_export_jobs_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_import_jobs" ADD CONSTRAINT "playlist_import_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_import_jobs" ADD CONSTRAINT "playlist_import_jobs_created_playlist_id_user_playlists_id_fk" FOREIGN KEY ("created_playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_credentials_user_platform_idx" ON "platform_credentials" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "playlist_download_jobs_user_id_idx" ON "playlist_download_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlist_download_jobs_service_idx" ON "playlist_download_jobs" USING btree ("service");--> statement-breakpoint
CREATE INDEX "playlist_download_jobs_status_idx" ON "playlist_download_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playlist_download_jobs_created_at_idx" ON "playlist_download_jobs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "playlist_export_jobs_user_id_idx" ON "playlist_export_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlist_export_jobs_status_idx" ON "playlist_export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playlist_export_jobs_created_at_idx" ON "playlist_export_jobs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "playlist_import_jobs_user_id_idx" ON "playlist_import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlist_import_jobs_status_idx" ON "playlist_import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playlist_import_jobs_created_at_idx" ON "playlist_import_jobs" USING btree ("created_at" DESC NULLS LAST);