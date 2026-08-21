CREATE TABLE "library_reconciliation_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency_hours" integer DEFAULT 6 NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"is_running" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"last_result" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_reconciliation_state" ADD CONSTRAINT "library_reconciliation_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_reconciliation_state_next_run_at_idx" ON "library_reconciliation_state" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "library_reconciliation_state_enabled_idx" ON "library_reconciliation_state" USING btree ("enabled");