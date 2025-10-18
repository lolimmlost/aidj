-- Create user_preferences table
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  "recommendation_settings" jsonb DEFAULT '{"aiEnabled":true,"frequency":"always","styleBasedPlaylists":true}'::jsonb NOT NULL,
  "playback_settings" jsonb DEFAULT '{"volume":0.5,"autoplayNext":true,"crossfadeDuration":0,"defaultQuality":"high"}'::jsonb NOT NULL,
  "notification_settings" jsonb DEFAULT '{"browserNotifications":false,"downloadCompletion":true,"recommendationUpdates":true}'::jsonb NOT NULL,
  "dashboard_layout" jsonb DEFAULT '{"showRecommendations":true,"showRecentlyPlayed":true,"widgetOrder":["recommendations","recentlyPlayed"]}'::jsonb NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
