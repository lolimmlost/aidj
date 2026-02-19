<!-- Generated: 2026-02-18 -->

# Data Model

All schemas in `src/lib/db/schema/`. Drizzle ORM with `casing: "snake_case"`. PostgreSQL.

## Auth (`auth.schema.ts` — 75 lines)

### `user`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `name` | text | NOT NULL |
| `email` | text | NOT NULL, UNIQUE |
| `email_verified` | boolean | NOT NULL, default false |
| `image` | text | |
| `created_at` | timestamp | NOT NULL |
| `updated_at` | timestamp | NOT NULL |

### `session`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `expires_at` | timestamp | NOT NULL |
| `token` | text | NOT NULL, UNIQUE |
| `ip_address` | text | |
| `user_agent` | text | |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |

### `account`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `account_id` | text | NOT NULL |
| `provider_id` | text | NOT NULL |
| `access_token` | text | |
| `refresh_token` | text | |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |

### `verification`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `identifier` | text | NOT NULL |
| `value` | text | NOT NULL |
| `expires_at` | timestamp | NOT NULL |

### `recommendations_cache`

Stores cached AI recommendation batches with quality metrics.

## Preferences (`preferences.schema.ts` — 100 lines)

### `user_preferences`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, UNIQUE, FK → user.id CASCADE |
| `recommendation_settings` | jsonb | AI DJ, source mode, harmonic mixing, DJ matching, queue seeding |
| `playback_settings` | jsonb | volume, autoplayNext, crossfadeDuration, defaultQuality, safeMode |
| `notification_settings` | jsonb | browser, download, recommendation notifications |
| `dashboard_layout` | jsonb | widget visibility and order |
| `created_at` | timestamp | NOT NULL |
| `updated_at` | timestamp | NOT NULL |

## Playlists (`playlists.schema.ts` — 58 lines)

### `user_playlists`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |
| `name` | text | NOT NULL |
| `description` | text | |
| `navidrome_id` | text | Nullable — only for synced playlists |
| `last_synced` | timestamp | |
| `song_count` | integer | Cached count |
| `total_duration` | integer | Seconds |
| `smart_playlist_criteria` | jsonb | Genre, year, artist filter rules |
| `created_at` | timestamp | NOT NULL |
| `updated_at` | timestamp | NOT NULL |

### `playlist_songs`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `playlist_id` | text | NOT NULL, FK → user_playlists.id CASCADE |
| `song_id` | text | NOT NULL (Navidrome ID) |
| `song_artist_title` | text | Display string |
| `position` | integer | Sort order |
| `added_at` | timestamp | NOT NULL |

## Feedback (`recommendations.schema.ts` — 65 lines)

### `recommendation_feedback`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |
| `recommendation_cache_id` | integer | FK → recommendations_cache.id SET NULL |
| `song_artist_title` | text | NOT NULL |
| `song_id` | text | Navidrome song ID |
| `feedback_type` | text | `thumbs_up` or `thumbs_down` |
| `source` | text | recommendation, playlist, ai_dj, autoplay, etc. |
| `timestamp` | timestamp | |
| `month` | integer | Temporal metadata |
| `season` | text | spring/summer/fall/winter |
| `day_of_week` | integer | 0-6 |
| `hour_of_day` | integer | 0-23 |

## Listening History (`listening-history.schema.ts` — 185 lines)

### `listening_history`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |
| `song_id` | text | NOT NULL |
| `artist` | text | NOT NULL |
| `title` | text | NOT NULL |
| `genre` | text | |
| `played_at` | timestamp | NOT NULL |
| `duration_ms` | integer | |
| `listened_ms` | integer | |
| `skipped` | boolean | |
| `skip_position_ms` | integer | Where in the song they skipped |

**Indexes**: user_id + played_at, user_id + song_id

### `track_similarities`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `source_song_id` | text | NOT NULL |
| `similar_song_id` | text | NOT NULL |
| `match_score` | real | 0.0-1.0 |
| `source` | text | lastfm, navidrome |
| `fetched_at` | timestamp | |

**Unique**: source_song_id + similar_song_id

### `compound_scores`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |
| `song_id` | text | NOT NULL |
| `artist` | text | |
| `title` | text | |
| `score` | real | Compound score value |
| `contributing_songs` | integer | How many played songs suggest this |
| `last_updated` | timestamp | |

## Navidrome Users (`navidrome-users.schema.ts` — 26 lines)

### `navidrome_users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, UNIQUE, FK → user.id CASCADE |
| `navidrome_username` | text | NOT NULL, UNIQUE |
| `navidrome_password` | text | NOT NULL |
| `navidrome_salt` | text | NOT NULL |
| `navidrome_token` | text | NOT NULL (md5(password + salt)) |
| `created_at` | timestamp | NOT NULL |

## Devices (`devices.schema.ts` — 25 lines)

### `devices`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK (client-generated) |
| `user_id` | text | NOT NULL, FK → user.id CASCADE |
| `device_name` | text | NOT NULL |
| `device_type` | text | NOT NULL |
| `user_agent` | text | |
| `last_seen_at` | timestamp | NOT NULL |
| `created_at` | timestamp | NOT NULL |

**Index**: user_id

## Playback Sessions (`playback-session.schema.ts` — 51 lines)

### `playback_sessions`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, UNIQUE, FK → user.id CASCADE |
| `active_device_id` | text | |
| `active_device_name` | text | |
| `active_device_type` | text | |
| `queue` | jsonb | SyncSong[] |
| `original_queue` | jsonb | SyncSong[] |
| `current_index` | integer | |
| `is_playing` | boolean | |
| `is_shuffled` | boolean | |
| `current_position_ms` | integer | |
| `queue_updated_at` | text | ISO timestamp |
| `position_updated_at` | text | ISO timestamp |
| `play_state_updated_at` | text | ISO timestamp |
| `updated_at` | timestamp | |

## Library Profiles (`library-profiles.schema.ts` — 43 lines)

### `library_profiles`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `user_id` | text | NOT NULL, UNIQUE, FK → user.id CASCADE |
| `genre_distribution` | jsonb | `{ "Rock": 0.40, ... }` |
| `top_keywords` | jsonb | `string[]` (top 20) |
| `total_songs` | integer | NOT NULL |
| `last_analyzed` | timestamp | NOT NULL |
| `refresh_needed` | boolean | default false |

## Profile (`profile.schema.ts` — 181 lines)

### `artist_affinities`

Pre-computed per-artist affinity scores.

| Column | Type | Key Fields |
|--------|------|------------|
| `user_id` | text | FK → user.id |
| `artist` | text | Artist name |
| `affinity_score` | real | Computed score |
| `play_count` | integer | Total plays |
| `liked_count` | integer | Starred songs |
| `skip_count` | integer | Skipped songs |

### `temporal_preferences`

Genre preferences by time slot.

| Column | Type | Key Fields |
|--------|------|------------|
| `user_id` | text | FK → user.id |
| `time_slot` | text | morning/afternoon/evening/night |
| `genre` | text | Genre name |
| `weight` | real | Preference weight |

## Explicit Content (`explicit-content.schema.ts` — 21 lines)

### `explicit_content_cache`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK |
| `artist` | text | NOT NULL |
| `title` | text | NOT NULL |
| `is_explicit` | boolean | NOT NULL |
| `source` | text | NOT NULL, default 'deezer' |
| `confidence` | real | default 1.0 |
| `checked_at` | timestamp | NOT NULL |

**Unique index**: artist + title

## Other Tables (summary)

| Table | Schema File | Purpose |
|-------|-------------|---------|
| `mood_snapshots` | mood-history | Aggregated mood/preference snapshots per period |
| `mood_transitions` | mood-history | Mood shift tracking between periods |
| `music_identity_summaries` | music-identity | Yearly/monthly Wrapped-style summaries |
| `discovery_suggestions` | background-discovery | Background discovery pending approval |
| `discovery_rejections` | background-discovery | Rejection history (re-suggest after 30 days) |
| `discovery_job_state` | background-discovery | Scheduler state and failure tracking |
| `listening_patterns` | discovery-feed | Time-slot listening pattern aggregates |
| `discovery_feed_items` | discovery-feed | Personalized feed items |
| `feed_notifications` | discovery-feed | Smart notification scheduling |
| `library_sync_state` | library-sync | Sync progress and checkpoints |
| `library_sync_items` | library-sync | Individual synced items |
| `library_sync_errors` | library-sync | Sync error logs |
| `lyrics_cache` | lyrics-cache | Cached lyrics (30-day expiry) |
| `saved_cover_art` | saved-cover-art | User-approved album/artist artwork |
| `playlist_export_jobs` | playlist-export | Export/import job tracking |
| `export_song_matches` | playlist-export | Song matching for import |
| `playlist_collaboration_settings` | collaborative-playlists | Privacy, suggestion limits |
| `playlist_collaborators` | collaborative-playlists | Collaborator roles |
| `song_suggestions` | collaborative-playlists | Suggested songs for playlists |
| `suggestion_votes` | collaborative-playlists | Votes on suggestions |

## Entity Relationships

```
user (1) ──→ (many) session
user (1) ──→ (many) account
user (1) ──→ (1) user_preferences
user (1) ──→ (1) navidrome_users
user (1) ──→ (1) library_profiles
user (1) ──→ (1) playback_sessions
user (1) ──→ (many) devices
user (1) ──→ (many) user_playlists ──→ (many) playlist_songs
user (1) ──→ (many) recommendation_feedback
user (1) ──→ (many) listening_history
user (1) ──→ (many) compound_scores
user (1) ──→ (many) artist_affinities
user (1) ──→ (many) temporal_preferences
user (1) ──→ (many) mood_snapshots
user (1) ──→ (many) music_identity_summaries
user (1) ──→ (many) discovery_suggestions
recommendations_cache (1) ──→ (many) recommendation_feedback
user_playlists (1) ──→ (1) playlist_collaboration_settings
user_playlists (1) ──→ (many) playlist_collaborators
user_playlists (1) ──→ (many) song_suggestions
```

## Migrations

25 migration files in `drizzle/` directory. Run with `npm run db` (drizzle-kit generate) and `scripts/run-migration.ts`.

## How to Add a New Table

1. Create `src/lib/db/schema/your-feature.schema.ts`
2. Define table with `pgTable()`, use `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` for IDs
3. Add FK references: `.references(() => user.id, { onDelete: "cascade" })`
4. Export types: `export type YourTable = typeof yourTable.$inferSelect;`
5. Re-export from `src/lib/db/schema/index.ts`
6. Run `npm run db` to generate migration SQL
7. Run migration: `npx tsx scripts/run-migration.ts`
