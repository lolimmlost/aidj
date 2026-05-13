-- Add `source` column to listening_history to tag the origin of each play
-- (ai_dj | autoplay | radio | manual | NULL for pre-existing rows).
-- Wire-up: PlayerBar.recordListeningHistory computes the source from audio
-- store state, posts it through /api/listening-history/record, and
-- recordSongPlay persists it. Used by the Listening Analytics page.
--
-- Idempotent so we can re-run safely against an already-migrated DB.

ALTER TABLE "listening_history" ADD COLUMN IF NOT EXISTS "source" text;
