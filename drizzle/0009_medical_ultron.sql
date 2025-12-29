CREATE TYPE "public"."collaborator_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."playlist_privacy" AS ENUM('public', 'private', 'invite_only');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "collaboration_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"metadata" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_collaboration_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"privacy" "playlist_privacy" DEFAULT 'private' NOT NULL,
	"allow_suggestions" boolean DEFAULT true NOT NULL,
	"auto_approve_threshold" integer DEFAULT 3,
	"max_suggestions_per_user" integer DEFAULT 10,
	"max_total_suggestions" integer DEFAULT 50,
	"notify_on_suggestion" boolean DEFAULT true NOT NULL,
	"notify_on_vote" boolean DEFAULT false NOT NULL,
	"notify_on_approval" boolean DEFAULT true NOT NULL,
	"share_code" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "playlist_collaboration_settings_playlist_id_unique" UNIQUE("playlist_id"),
	CONSTRAINT "playlist_collaboration_settings_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "playlist_collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "collaborator_role" DEFAULT 'viewer' NOT NULL,
	"invited_by" text,
	"invited_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"last_active_at" timestamp,
	"is_online" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_playlist_collaborator" UNIQUE("playlist_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "playlist_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"song_id" text NOT NULL,
	"song_title" text NOT NULL,
	"song_artist" text NOT NULL,
	"song_album" text,
	"song_duration" integer,
	"suggested_by" text NOT NULL,
	"suggested_at" timestamp NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"processed_by" text,
	"processed_at" timestamp,
	"rejection_reason" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"availability_checked_at" timestamp,
	CONSTRAINT "unique_suggestion_song_playlist" UNIQUE("playlist_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "suggestion_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"suggestion_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vote" integer NOT NULL,
	"voted_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "unique_suggestion_vote" UNIQUE("suggestion_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "collaboration_activity" ADD CONSTRAINT "collaboration_activity_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_activity" ADD CONSTRAINT "collaboration_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaboration_settings" ADD CONSTRAINT "playlist_collaboration_settings_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_suggestions" ADD CONSTRAINT "playlist_suggestions_playlist_id_user_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_suggestions" ADD CONSTRAINT "playlist_suggestions_suggested_by_user_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_suggestions" ADD CONSTRAINT "playlist_suggestions_processed_by_user_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestion_id_playlist_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."playlist_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_playlist_id_idx" ON "collaboration_activity" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "activity_user_id_idx" ON "collaboration_activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_created_at_idx" ON "collaboration_activity" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "collab_settings_playlist_id_idx" ON "playlist_collaboration_settings" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "collab_settings_share_code_idx" ON "playlist_collaboration_settings" USING btree ("share_code");--> statement-breakpoint
CREATE INDEX "collaborators_playlist_id_idx" ON "playlist_collaborators" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "collaborators_user_id_idx" ON "playlist_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_playlist_id_idx" ON "playlist_suggestions" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "suggestions_suggested_by_idx" ON "playlist_suggestions" USING btree ("suggested_by");--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "playlist_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suggestions_score_idx" ON "playlist_suggestions" USING btree ("score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "votes_suggestion_id_idx" ON "suggestion_votes" USING btree ("suggestion_id");--> statement-breakpoint
CREATE INDEX "votes_user_id_idx" ON "suggestion_votes" USING btree ("user_id");