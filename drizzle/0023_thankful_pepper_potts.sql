CREATE TABLE "cover_art_fetch_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"not_found" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "cover_art_fetch_jobs" ADD CONSTRAINT "cover_art_fetch_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cover_art_fetch_jobs_user_id_idx" ON "cover_art_fetch_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cover_art_fetch_jobs_status_idx" ON "cover_art_fetch_jobs" USING btree ("status");