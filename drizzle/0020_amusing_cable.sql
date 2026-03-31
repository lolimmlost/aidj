-- Deduplicate recommendation_feedback rows before adding unique constraint.
-- Keep the most recent row (by timestamp) for each (user_id, song_id) pair.
DELETE FROM "recommendation_feedback" a
USING "recommendation_feedback" b
WHERE a.user_id = b.user_id
  AND a.song_id = b.song_id
  AND a.song_id IS NOT NULL
  AND a."timestamp" < b."timestamp";

-- For rows with identical timestamps, keep the one with the smaller id
DELETE FROM "recommendation_feedback" a
USING "recommendation_feedback" b
WHERE a.user_id = b.user_id
  AND a.song_id = b.song_id
  AND a.song_id IS NOT NULL
  AND a."timestamp" = b."timestamp"
  AND a.id < b.id;

ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_user_song_unique" UNIQUE("user_id","song_id");
