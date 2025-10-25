CREATE TABLE "library_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"genre_distribution" jsonb NOT NULL,
	"top_keywords" jsonb NOT NULL,
	"total_songs" integer NOT NULL,
	"last_analyzed" timestamp NOT NULL,
	"refresh_needed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "library_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "library_profiles" ADD CONSTRAINT "library_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_profiles_user_id_idx" ON "library_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "library_profiles_last_analyzed_idx" ON "library_profiles" USING btree ("last_analyzed");--> statement-breakpoint
CREATE INDEX "library_profiles_refresh_needed_idx" ON "library_profiles" USING btree ("refresh_needed");