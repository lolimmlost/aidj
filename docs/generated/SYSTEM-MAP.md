<!-- Generated: 2026-02-18 -->

# System Map — "Where Is Everything?"

## Zustand Stores (`src/lib/stores/`)

| Store | File | Lines | Persistence | Purpose |
|-------|------|------:|:-----------:|---------|
| `useAudioStore` | `audio.ts` | 1,859 | localStorage | ALL playback state, queue, AI DJ, crossfade, autoplay, cross-device sync |
| `useDiscoveryFeedStore` | `discovery-feed.ts` | 588 | localStorage | Time-based discovery feed items and patterns |
| `useDiscoverySuggestionsStore` | `discovery-suggestions.ts` | 581 | localStorage | Background discovery suggestion management |
| `useLibrarySyncStore` | `library-sync.ts` | 365 | localStorage | Library indexing progress, sync state |
| `useDiscoveryQueueStore` | `discovery-queue.ts` | 283 | localStorage | Discovery queue state and management |
| `usePreferencesStore` | `preferences.ts` | 228 | API-backed | User preferences (fetched from server, cached) |
| `useSetBuilderStore` | `set-builder.ts` | 209 | localStorage | DJ set builder state |

## Custom Hooks (`src/lib/hooks/`)

| Hook | File | Lines | Purpose |
|------|------|------:|---------|
| `useMediaSession` | `useMediaSession.ts` | 388 | Media Session API integration (lock screen controls) |
| `usePlaybackSync` | `usePlaybackSync.ts` | 366 | WebSocket cross-device sync (send/receive state) |
| `usePlaybackStateSync` | `usePlaybackStateSync.ts` | 324 | Visibility/stall recovery, iOS screen lock |
| `useStallRecovery` | `useStallRecovery.ts` | 300 | Audio stall detection and recovery strategies |
| `useCrossfade` | `useCrossfade.ts` | 271 | Dual-deck crossfade pipeline, equal power curves |
| `useEruda` | `useEruda.ts` | 244 | Mobile debug console (dev only) |
| `useOfflineStatus` | `useOfflineStatus.ts` | 212 | Online/offline detection, PWA support |
| `useServiceWorker` | `useServiceWorker.ts` | 138 | Service worker registration and updates |
| `useDualDeckAudio` | `useDualDeckAudio.ts` | 137 | Two HTMLAudioElement deck management |
| `usePlayerKeyboardShortcuts` | `usePlayerKeyboardShortcuts.ts` | 74 | Space, arrows, M for playback control |
| `useSongFeedback` | `useSongFeedback.ts` | 34 | Thumbs up/down feedback submission |

## DB Schemas (`src/lib/db/schema/`)

| Schema File | Table(s) | Lines | Key Columns |
|-------------|----------|------:|-------------|
| `auth.schema.ts` | `user`, `session`, `account`, `verification`, `recommendationsCache` | 75 | user.id, session.token, account.providerId |
| `discovery-feed.schema.ts` | `listeningPatterns`, `discoveryFeedItems`, `feedNotifications` | 416 | timeSlot, context, genreDistribution |
| `playlist-export.schema.ts` | `playlistExportJobs`, `exportSongMatches` | 275 | format, platform, matchConfidence |
| `mood-history.schema.ts` | `moodSnapshots`, `moodTransitions` | 258 | periodType, moodDistribution, topGenres |
| `music-identity.schema.ts` | `musicIdentitySummaries` | 231 | periodType, topArtists, topGenres, aiInsight |
| `listening-history.schema.ts` | `listeningHistory`, `trackSimilarities`, `compoundScores` | 185 | songId, playedAt, skipRate, matchScore |
| `background-discovery.schema.ts` | `discoverySuggestions`, `discoveryRejections`, `discoveryJobState` | 182 | source, status, seed info |
| `profile.schema.ts` | `artistAffinities`, `temporalPreferences` | 181 | affinityScore, playCount, timeSlot |
| `collaborative-playlists.schema.ts` | `playlistCollaborationSettings`, `playlistCollaborators`, `songSuggestions`, `suggestionVotes` | 171 | privacy, role, shareCode |
| `library-sync.schema.ts` | `librarySyncState`, `librarySyncItems`, `librarySyncErrors` | 164 | status, phase, processedItems |
| `preferences.schema.ts` | `userPreferences` | 100 | recommendationSettings, playbackSettings, notificationSettings |
| `recommendations.schema.ts` | `recommendationFeedback` | 65 | feedbackType, songId, source, temporal fields |
| `playlists.schema.ts` | `userPlaylists`, `playlistSongs` | 58 | navidromeId, songCount, smartPlaylistCriteria |
| `playback-session.schema.ts` | `playbackSessions` | 51 | queue (JSONB), activeDeviceId, per-field timestamps |
| `library-profiles.schema.ts` | `libraryProfiles` | 43 | genreDistribution, topKeywords, totalSongs |
| `lyrics-cache.schema.ts` | `lyricsCache` | 33 | artist, title, lyrics, syncedLyrics, source |
| `saved-cover-art.schema.ts` | `savedCoverArt` | 32 | entityId, entityType, imageUrl, source |
| `navidrome-users.schema.ts` | `navidromeUsers` | 26 | userId, navidromeUsername, navidromeToken, navidromeSalt |
| `devices.schema.ts` | `devices` | 25 | deviceName, deviceType, lastSeenAt |
| `explicit-content.schema.ts` | `explicitContentCache` | 21 | artist, title, isExplicit, source |

## API Routes (`src/routes/api/`)

### Auth

| Route | Methods | Purpose |
|-------|---------|---------|
| `auth/login.ts` | POST | Email/password login |
| `auth/register.ts` | POST | Registration + Navidrome account creation |
| `auth/$.ts` | * | better-auth catch-all (OAuth callbacks, session) |

### Recommendations

| Route | Methods | Purpose |
|-------|---------|---------|
| `recommendations.ts` | POST | Mood-based recommendations |
| `recommendations/feedback.ts` | GET, POST | Fetch/submit thumbs up/down feedback |
| `ai-dj/recommendations.ts` | POST | AI DJ queue recommendations |

### Playlists

| Route | Methods | Purpose |
|-------|---------|---------|
| `playlists/index.ts` | GET | List user playlists |
| `playlists/$id.ts` | GET, DELETE | Playlist details, delete |
| `playlists/sync.ts` | POST | Sync playlists from Navidrome |
| `playlists/generate.ts` | POST | AI playlist generation |
| `playlists/import/` | POST (match, create, download) | Import playlists from Spotify/YouTube |
| `playlists/liked-songs/sync.ts` | POST | Sync starred songs to Liked Songs playlist |
| `playlists/collaboration/` | POST, GET, DELETE | Collaborative playlist management |
| `playlists/export.ts` | POST | Export playlists (M3U, XSPF, JSON, CSV) |

### Navidrome Proxy

| Route | Methods | Purpose |
|-------|---------|---------|
| `navidrome/rest/$.ts` | * | Subsonic API proxy (browsing, search, stream) |
| `navidrome/rest/scrobble.ts` | POST | Scrobble with per-user creds |
| `navidrome/star.ts` | POST | Star/unstar with per-user creds |

### Settings & Preferences

| Route | Methods | Purpose |
|-------|---------|---------|
| `preferences.ts` | GET, POST | User preference CRUD |

### Playback & Sync

| Route | Methods | Purpose |
|-------|---------|---------|
| `playback/state.ts` | GET, POST | Server-side playback state (cross-device sync) |
| `devices/index.ts` | GET, POST | Device registration and listing |
| `devices/$deviceId.ts` | DELETE | Remove device |

### Library & Discovery

| Route | Methods | Purpose |
|-------|---------|---------|
| `library/sync.ts` | POST, GET | Library sync trigger and status |
| `library/search.ts` | GET | Search with library profile boosting |
| `library/profile.ts` | GET, POST | Library genre/keyword profile |
| `discovery/feed.ts` | GET | Personalized discovery feed |
| `discovery/analytics.ts` | GET | Discovery analytics dashboard data |

### Downloads

| Route | Methods | Purpose |
|-------|---------|---------|
| `downloads/lidarr.ts` | POST | Trigger Lidarr download |
| `downloads/youtube.ts` | POST, GET | MeTube YouTube downloads |
| `downloads/status.ts` | GET | Download progress |

### Other

| Route | Methods | Purpose |
|-------|---------|---------|
| `music-identity/` | GET, POST | Music identity summaries |
| `lyrics.ts` | GET | Lyrics fetch (LRCLIB + Navidrome) |
| `tasks/index.ts` | GET | Background task status |
| `analytics/` | GET | Recommendation analytics |
| `cover-art/` | GET, POST | Album art resolution and saving |
| `config.ts` | GET, POST | Server config management |

## Services (`src/lib/services/`)

| Service | Lines | Domain |
|---------|------:|--------|
| `navidrome.ts` | 2,069 | Navidrome/Subsonic API (library, search, stream, stars, playlists) |
| `recommendations.ts` | 603 | Recommendation pipeline entry (mood, ai_dj, similar, random) |
| `library-sync/sync-service.ts` | 567 | Incremental library indexing |
| `blended-recommendation-scorer.ts` | 535 | Multi-signal scoring orchestrator |
| `playback-websocket.ts` | 196 | Cross-device WebSocket server |
| `music-identity.ts` | 525 | Yearly/monthly music summaries |
| `preferences.ts` | 512 | Preference management + caching |
| `playlist-sync.ts` | 510 | Bidirectional Navidrome playlist sync |
| `listening-history.ts` | 433 | Play/skip tracking, skip rates |
| `library-sync/background-sync.ts` | 420 | Background sync scheduler |
| `lidarr.ts` | 429 | Lidarr music download integration |
| `lastfm/client.ts` | 402 | Last.fm API (similar artists, track info) |
| `web-audio-processor.ts` | 387 | Web Audio API analysis |
| `recommendation-analytics.ts` | 375 | Recommendation performance analytics |
| `profile-recommendations.ts` | 371 | Profile-based zero-API recommendations |
| `audio-buffer-analyzer.ts` | 367 | Audio buffer BPM/energy analysis |
| `audio-analysis.ts` | 356 | Server-side audio analysis |
| `discovery-manager.ts` | 343 | Background discovery scheduler |
| `energy-flow-analyzer.ts` | 341 | Energy flow analysis for DJ transitions |
| `discovery-analytics.ts` | 341 | Discovery analytics |
| `discovery-generator.ts` | 328 | Background discovery feed generation |
| `dj-set-planner.ts` | 310 | DJ set ordering and planning |
| `time-based-discovery.ts` | 305 | Temporal pattern recommendations |
| `cache-service.ts` | 304 | Generic caching service |
| `mood-timeline-analytics.ts` | 302 | Mood timeline visualization data |
| `dj-match-scorer.ts` | 298 | BPM/Energy/Key scoring |
| `seasonal-patterns.ts` | 296 | Seasonal pattern detection |
| `compound-scoring.ts` | ~300 | Compound recommendation scoring |
| `collaborative-playlists.ts` | 287 | Collaborative playlist features |
| `lidarr-navidrome.ts` | 283 | Lidarr ↔ Navidrome integration |
| `task-aggregator.ts` | 277 | Background task management |
| `advanced-discovery-analytics.ts` | 277 | Advanced discovery metrics |
| `liked-songs-sync.ts` | 274 | Liked Songs playlist sync |
| `playlist-export.ts` | 272 | Playlist export (M3U, XSPF, etc.) |
| `harmonic-mixer.ts` | 267 | Camelot wheel key matching |
| `lyrics.ts` | 243 | Lyrics fetching (LRCLIB) |
| `image-resolver.ts` | 242 | Album/artist image resolution |
| `notification-scheduler.ts` | 235 | Push notification scheduling |
| `lastfm-backfill.ts` | 233 | Last.fm history backfill |
| `playlist-download.ts` | 232 | Playlist song downloading |
| `navidrome-users.ts` | 227 | Per-user Navidrome account management |
| `cache-store.ts` | 215 | Cache store adapter |
| `explicit-content.ts` | 201 | Deezer explicit content detection |
| `transition-effects.ts` | 198 | Audio transition effects |
| `energy-estimator.ts` | 167 | Song energy estimation |
| `mood-criteria-fallback.ts` | 159 | Hardcoded mood → criteria mappings |
| `mood-translator.ts` | ~160 | AI mood → playlist query translation |

## Page Routes (`src/routes/`)

| Path | Page |
|------|------|
| `/` | Home/landing |
| `/dashboard/` | Dashboard home |
| `/dashboard/recommendations/$id` | Recommendation details |
| `/dashboard/generate` | Generate recommendations |
| `/dashboard/discover` | Discovery feed |
| `/dashboard/analytics` | Analytics dashboard |
| `/dashboard/discovery-analytics` | Discovery analytics |
| `/dashboard/mood-timeline` | Mood timeline |
| `/dashboard/history` | Listening history |
| `/dashboard/library-growth` | Library growth |
| `/dj/` | AI DJ page |
| `/dj/set-builder` | DJ set builder |
| `/dj/settings` | DJ settings |
| `/library/search` | Library search |
| `/library/artists/` | Artist list |
| `/library/artists/$id` | Artist details |
| `/library/artists/$id/albums/$albumId` | Album details |
| `/playlists/` | Playlist list |
| `/playlists/$id` | Playlist details |
| `/playlists/join/$shareCode` | Join collaborative playlist |
| `/downloads/` | Downloads |
| `/downloads/history` | Download history |
| `/downloads/youtube` | YouTube downloads |
| `/downloads/status` | Download status |
| `/music-identity/` | Music identity |
| `/music-identity/share.$token` | Shared identity card |
| `/settings/` | Settings home |
| `/settings/general` | General settings |
| `/settings/playback` | Playback settings |
| `/settings/recommendations` | Recommendation settings |
| `/settings/services` | Service connections |
| `/settings/notifications` | Notification settings |
| `/settings/album-art` | Album art manager |
| `/settings/profile` | Profile settings |
| `/tasks/` | Background tasks |

## Component Directories (`src/components/`)

| Directory | Files | Contents |
|-----------|------:|---------|
| `ui/` | 34 | shadcn/ui primitives (Button, Card, Dialog, ScrollArea, etc.) |
| `playlists/` | 9 | Playlist grid, cards, player integration |
| `playlists/import/` | 5 | Spotify/YouTube playlist import wizard |
| `playlists/collaboration/` | 4 | Collaborative playlist UI |
| `landing/` | 6 | Landing page sections |
| `recommendations/` | 6 | Recommendation cards, mood input |
| `dashboard/` | 5 | Dashboard widgets |
| `music-identity/` | 3 | Identity cards, share UI |
| `ai-dj/` | 2 | AI DJ controls, status |
| `discovery/` | 2 | Discovery feed UI |
| `library/` | 2 | Library browse UI |
| `layout/` | ~5 | PlayerBar, Sidebar, AppLayout |
| `debug/` | 1 | Debug panel |

## Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `run-migration.ts` | Run Drizzle database migrations |
| `backfill-temporal-data.ts` | Backfill temporal metadata for listening history |
| `check-tables.ts` | Verify database table integrity |
| `capture-readme-screenshots.ts` | Capture app screenshots for README |
| `update-readme-with-screenshots.ts` | Update README with captured screenshots |

## Migrations (`drizzle/`)

25 SQL migration files (`0000` through `0019`, some with manual names like `0007_listening-history.sql`, `0015_lyrics_cache.sql`, `0016_profile-tables.sql`, `0018_playback_sessions_devices.sql`).
