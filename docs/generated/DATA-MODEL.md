<!-- Generated: 2026-02-15 -->
# Data Model Reference

PostgreSQL via Drizzle ORM. Schema: `src/lib/db/schema/` (re-exported from `index.ts`). Casing: `snake_case`. Migrations: `./drizzle/` (23 files, 0000-0018).

## Authentication & Users (`auth.schema.ts`)

### `user`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| name | text | |
| email | text | UNIQUE |
| emailVerified | boolean | |
| image | text | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `session`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| expiresAt | timestamp | |
| token | text | UNIQUE |
| createdAt, updatedAt | timestamp | |
| ipAddress, userAgent | text | |
| userId | text | FK -> user.id |

### `account`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| accountId, providerId | text | |
| userId | text | FK -> user.id |
| accessToken, refreshToken, idToken | text | |
| accessTokenExpiresAt, refreshTokenExpiresAt | timestamp | |
| scope, password | text | |
| createdAt, updatedAt | timestamp | |

### `verification`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| identifier, value | text | |
| expiresAt, createdAt, updatedAt | timestamp | |

### `recommendations_cache`
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, autoincrement |
| userId | text | FK -> user.id |
| mode, prompt | text | |
| response | jsonb | |
| createdAt, expiresAt | timestamp | |

## User Preferences (`preferences.schema.ts`)

### `user_preferences`
| Column | Type | Default |
|--------|------|---------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| crossfadeEnabled | integer | 0 |
| crossfadeDuration | integer | 5 |
| autoplayEnabled | integer | 0 |
| playbackQuality | text | 'high' |
| theme | text | 'system' |
| showLyrics | integer | 1 |
| showVisualizer | integer | 0 |
| lastfmScrobbling | integer | 0 |
| lastfmApiKey | text | |
| lidarrEnabled | integer | 0 |
| metubeEnabled | integer | 0 |
| createdAt, updatedAt | timestamp | |

## Recommendations & Feedback (`recommendations.schema.ts`)

### `recommendation_feedback`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| recommendationCacheId | integer | FK -> recommendations_cache.id (ON DELETE SET NULL) |
| songArtistTitle, songId | text | |
| feedbackType | text | enum: `thumbs_up` / `thumbs_down` |
| source | text | enum: `recommendation` / `playlist` / `playlist_generator` / `search` / `library` / `nudge` / `ai_dj` / `autoplay` / `ai_dj_skip` / `ai_dj_listen_through` |
| timestamp | timestamp | |
| month | integer | 1-12 |
| season | text | enum (seasonal) |
| dayOfWeek | integer | 1-7 |
| hourOfDay | integer | 0-23 |

**Indexes:** userId, timestamp, cacheId, user+feedbackType+timestamp, month, season, user+season, user+month, songId, user+songId

## Playlists (`playlists.schema.ts`)

### `playlists`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| name, description | text | |
| isPublic | integer | default 0 |
| shareCode | text | UNIQUE |
| createdAt, updatedAt | timestamp | |

### `playlist_songs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| playlistId | text | FK -> playlists.id |
| songId | text | |
| position | integer | |
| addedAt | timestamp | |

## Collaborative Playlists (`collaborative-playlists.schema.ts`)

### `playlist_collaborators`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| playlistId | text | FK -> playlists.id |
| userId | text | FK -> user.id |
| role | text | enum: `owner` / `editor` / `viewer` |
| addedBy | text | FK -> user.id |
| joinedAt, lastActiveAt | timestamp | |

### `playlist_activity`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| playlistId | text | FK -> playlists.id |
| userId | text | FK -> user.id |
| action | text | enum (action types) |
| songId | text | |
| metadata | jsonb | |
| createdAt | timestamp | |

### `playlist_suggestions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| playlistId | text | FK -> playlists.id |
| suggestedBy | text | FK -> user.id |
| songId, songTitle, songArtist | text | |
| note | text | |
| status | text | enum: `pending` / `approved` / `rejected` |
| reviewedBy | text | FK -> user.id |
| reviewedAt, createdAt | timestamp | |

## Playlist Export (`playlist-export.schema.ts`)

### `playlist_exports`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| playlistId | text | FK -> playlists.id |
| format, status, fileUrl | text | |
| metadata | jsonb | |
| createdAt, completedAt | timestamp | |

### `playlist_download_queue`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| songId, status | text | |
| metadata | jsonb | |
| createdAt, completedAt | timestamp | |

## Listening History & Scoring (`listening-history.schema.ts`)

### `listening_history`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| songId, artist, title, album, genre | text | |
| duration | integer | |
| playedAt | timestamp | |
| completionPercentage | real | |
| source | text | |
| skipped | integer | default 0 |

### `track_similarities`
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK |
| songId, similarSongId | text | UNIQUE together |
| matchScore | real | |
| source | text | |
| updatedAt | timestamp | |

Self-referential song similarity. No FK to external table (songs live in Navidrome).

### `compound_scores`
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK |
| userId | text | FK -> user.id |
| songId, artist, title | text | |
| compoundScore | real | |
| sourceCount | integer | |
| recencyWeightedScore | real | |
| calculatedAt | timestamp | |

## Library (`library-profiles.schema.ts`, `library-sync.schema.ts`)

### `library_profiles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| profileData | jsonb | |
| analyzedAt | timestamp | |
| songCount, artistCount, albumCount | integer | |

### `library_sync_state`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| totalSongs, syncedSongs | integer | |
| status | text | |
| startedAt, completedAt | timestamp | |
| lastSyncedSongId, error | text | |

### `sync_tasks`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| syncStateId | text | FK -> library_sync_state.id |
| taskType, status | text | |
| metadata | jsonb | |
| createdAt, completedAt | timestamp | |

## Mood & Taste Analytics (`mood-history.schema.ts`)

### `taste_snapshots`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| name, description | text | |
| capturedAt, periodStart, periodEnd | timestamp | |
| profileData, exportFormats | jsonb | |
| isAutoGenerated | integer | |

### `mood_snapshots`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| periodStart, periodEnd | timestamp | |
| periodType | text | |
| moodDistribution, topGenres, topArtists, topTracks | jsonb | |
| totalListens, totalFeedback, thumbsUpCount, thumbsDownCount | integer | |
| acceptanceRate, diversityScore | real | |
| season | text | |
| month | integer | |
| createdAt | timestamp | |

### `recommendation_history`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| generatedAt | timestamp | |
| recommendedSongs, reasoningFactors, tasteProfileSnapshot | jsonb | |
| source, moodContext | text | |

## Discovery Feed (`discovery-feed.schema.ts`)

### `discovery_feed_items`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| songId, artist, title, album, genre | text | |
| coverArt, discoverySource, personalNote, status | text | |
| matchScore | real | |
| matchReasons, relatedArtists, audioFeatures | jsonb | |
| createdAt, expiresAt | timestamp | |

### `discovery_feed_interactions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| feedItemId | text | FK -> discovery_feed_items.id |
| userId | text | FK -> user.id |
| interactionType | text | |
| metadata | jsonb | |
| createdAt | timestamp | |

### `discovery_feed_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| feedEnabled | integer | |
| feedFrequency | text | |
| maxItemsPerBatch | integer | |
| discoveryPreferences | jsonb | |
| createdAt, updatedAt | timestamp | |

### `notification_preferences`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| enabled | integer | |
| frequency | text | |
| channels, quietHours | jsonb | |
| createdAt, updatedAt | timestamp | |

## Background Discovery (`background-discovery.schema.ts`)

### `discovery_suggestions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| songId, artist, title, album, genre | text | |
| matchScore | real | |
| source, status | text | |
| reasons | jsonb | |
| createdAt, reviewedAt | timestamp | |

### `discovery_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| enabled | integer | |
| frequency | text | |
| maxSuggestions | integer | |
| preferences | jsonb | |
| createdAt, updatedAt | timestamp | |

## Music Identity (`music-identity.schema.ts`)

### `music_identity_snapshots`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| name | text | |
| periodStart, periodEnd | timestamp | |
| snapshotData | jsonb | |
| createdAt | timestamp | |

### `music_identity_share_tokens`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| snapshotId | text | FK -> music_identity_snapshots.id |
| token | text | UNIQUE |
| expiresAt | timestamp | |
| viewCount | integer | |
| createdAt | timestamp | |

## User Profile (`profile.schema.ts`)

### `user_profiles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| displayName, bio | text | |
| avatarUrl, bannerUrl | text | |
| createdAt, updatedAt | timestamp | |

### `user_profile_stats`
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id, UNIQUE |
| totalListens, uniqueArtists, uniqueGenres | integer | |
| totalMinutes | real | |
| topGenre | text | |
| listenStreak | integer | |
| lastListenedAt, updatedAt | timestamp | |

## Playback & Devices

### `playback_sessions` (`playback-session.schema.ts`)
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| deviceId, deviceName | text | |
| startedAt, lastActiveAt | timestamp | |
| isActive | integer | |
| metadata | jsonb | |

### `devices` (`devices.schema.ts`)
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| userId | text | FK -> user.id |
| deviceName, deviceType | text | |
| lastSeenAt, createdAt | timestamp | |

## Media Cache

### `lyrics_cache` (`lyrics-cache.schema.ts`)
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| songId | text | UNIQUE |
| lyrics, source | text | |
| createdAt | timestamp | |

### `saved_cover_art` (`saved-cover-art.schema.ts`)
| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| songId | text | |
| imageUrl, source | text | |
| createdAt | timestamp | |

---

## Entity Relationships

All user-scoped tables FK to `user.id` with `ON DELETE CASCADE` unless noted otherwise.

| Parent | Child | FK Column | On Delete |
|--------|-------|-----------|-----------|
| user | session, account, recommendations_cache | userId | CASCADE |
| user | user_preferences, recommendation_feedback | userId | CASCADE |
| user | playlists, playlist_collaborators | userId | CASCADE |
| user | listening_history, compound_scores | userId | CASCADE |
| user | library_profiles, library_sync_state | userId | CASCADE |
| user | taste_snapshots, mood_snapshots, recommendation_history | userId | CASCADE |
| user | discovery_feed_items, discovery_feed_interactions | userId | CASCADE |
| user | discovery_feed_settings, notification_preferences | userId | CASCADE |
| user | discovery_suggestions, discovery_settings | userId | CASCADE |
| user | music_identity_snapshots | userId | CASCADE |
| user | user_profiles, user_profile_stats | userId | CASCADE |
| user | playback_sessions, devices | userId | CASCADE |
| user | playlist_exports, playlist_download_queue | userId | CASCADE |
| recommendations_cache | recommendation_feedback | recommendationCacheId | SET NULL |
| playlists | playlist_songs, playlist_collaborators | playlistId | -- |
| playlists | playlist_activity, playlist_suggestions | playlistId | -- |
| playlists | playlist_exports | playlistId | -- |
| library_sync_state | sync_tasks | syncStateId | -- |
| music_identity_snapshots | music_identity_share_tokens | snapshotId | -- |
| discovery_feed_items | discovery_feed_interactions | feedItemId | -- |

---

## Maintenance Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `scripts/run-migration.ts` | `npx tsx scripts/run-migration.ts` | Creates missing tables (taste_snapshots, mood_snapshots, recommendation_history) |
| `scripts/backfill-temporal-data.ts` | `npx tsx scripts/backfill-temporal-data.ts` | Backfills month/season/dayOfWeek/hourOfDay on recommendation_feedback |
| `scripts/check-tables.ts` | `npx tsx scripts/check-tables.ts` | Verifies database tables exist |

## Adding a New Table

1. Create `src/lib/db/schema/your-table.schema.ts`
2. Define table with `pgTable()`, add columns and indexes
3. Export inferred types: `export type YourTable = typeof yourTable.$inferSelect;`
4. Re-export from `src/lib/db/schema/index.ts`
5. Generate migration: `npx drizzle-kit generate`
6. Apply migration: `npx drizzle-kit push`
