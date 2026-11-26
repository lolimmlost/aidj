-- better-auth 1.5.6 -> 1.7: two-factor enrolment state + brute-force lockout.
-- 1.7 refuses to start without these columns. Idempotent: safe to run more than once.
ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "failed_verification_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "locked_until" timestamp;--> statement-breakpoint
-- Only rows whose user finished enrolment are verified. A row left by an abandoned setup must be
-- verified=false, or 1.7 answers "TOTP already enabled" and that user can never finish setting up 2FA.
UPDATE "two_factor" tf SET "verified" = COALESCE(u."two_factor_enabled", false) FROM "user" u WHERE u."id" = tf."user_id";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");
