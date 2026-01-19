-- Lyrics Cache Table
-- Caches lyrics fetched from external APIs (LRCLIB) and Navidrome
-- Cache expires after 30 days

CREATE TABLE IF NOT EXISTS "lyrics_cache" (
  "id" text PRIMARY KEY NOT NULL,
  "artist" text NOT NULL,
  "title" text NOT NULL,
  "album" text,
  "duration" text,
  "lyrics" text,
  "synced_lyrics" jsonb,
  "source" text NOT NULL,
  "instrumental" boolean DEFAULT false,
  "fetched_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL
);

-- Index for cache lookups by artist/title
CREATE INDEX IF NOT EXISTS "lyrics_cache_lookup_idx" ON "lyrics_cache" ("artist", "title");

-- Index for cache expiration cleanup
CREATE INDEX IF NOT EXISTS "lyrics_cache_expires_idx" ON "lyrics_cache" ("expires_at");

-- Unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS "lyrics_cache_unique_idx" ON "lyrics_cache" ("artist", "title", "album", "duration");
