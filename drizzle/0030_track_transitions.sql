CREATE TABLE "track_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"granularity" text NOT NULL,
	"from_key" text NOT NULL,
	"to_key" text NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"pos_weight" real DEFAULT 0 NOT NULL,
	"neg_weight" real DEFAULT 0 NOT NULL,
	"last_observed" timestamp NOT NULL,
	"calculated_at" timestamp NOT NULL,
	CONSTRAINT "track_transitions_unique" UNIQUE("user_id","granularity","from_key","to_key")
);
--> statement-breakpoint
ALTER TABLE "track_transitions" ADD CONSTRAINT "track_transitions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_transitions_user_gran_from_idx" ON "track_transitions" USING btree ("user_id","granularity","from_key");--> statement-breakpoint
CREATE INDEX "track_transitions_user_id_idx" ON "track_transitions" USING btree ("user_id");