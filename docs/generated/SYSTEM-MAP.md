<!-- Generated: 2026-02-15 -->

# System Map

Structural inventory of the aidj codebase.

---

## Stores

| Store | File | Lines | Purpose | Persisted |
|-------|------|------:|---------|-----------|
| Audio | `src/lib/stores/audio.ts` | 1,824 | Playback state, queue, AI DJ, crossfade, autoplay, cross-device sync | Yes (localStorage) |
| Discovery Feed | `src/lib/stores/discovery-feed.ts` | 588 | Personalized discovery feed state | Yes |
| Discovery Queue | `src/lib/stores/discovery-queue.ts` | 283 | Discovery queue management | Yes |
| Discovery Suggestions | `src/lib/stores/discovery-suggestions.ts` | 581 | Background discovery suggestions | Yes |
| Library Sync | `src/lib/stores/library-sync.ts` | 365 | Navidrome library sync progress | Yes |
| Preferences | `src/lib/stores/preferences.ts` | 227 | User preferences (theme, UI settings) | Yes |
| Set Builder | `src/lib/stores/set-builder.ts` | 209 | DJ set builder state | Yes |

**Total: 4,077 lines across 7 stores. All persisted.**

---

## Schemas (Database Tables)

| Schema File | Lines | Tables |
|-------------|------:|--------|
| `auth.schema.ts` | 75 | user, session, account, verification |
| `background-discovery.schema.ts` | 182 | discovery_suggestions, discovery_settings |
| `collaborative-playlists.schema.ts` | 171 | playlist_collaborators, playlist_activity, playlist_suggestions |
| `devices.schema.ts` | 25 | devices |
| `discovery-feed.schema.ts` | 416 | discovery_feed_items, discovery_feed_interactions, discovery_feed_settings, notification_preferences |
| `library-profiles.schema.ts` | 43 | library_profiles |
| `library-sync.schema.ts` | 164 | library_sync_state, sync_tasks |
| `listening-history.schema.ts` | 185 | listening_history, track_similarities, compound_scores |
| `lyrics-cache.schema.ts` | 33 | lyrics_cache |
| `mood-history.schema.ts` | 258 | taste_snapshots, mood_snapshots, recommendation_history |
| `music-identity.schema.ts` | 231 | music_identity_snapshots, music_identity_share_tokens |
| `playback-session.schema.ts` | 51 | playback_sessions |
| `playlist-export.schema.ts` | 275 | playlist_exports, playlist_download_queue |
| `playlists.schema.ts` | 58 | playlists, playlist_songs |
| `preferences.schema.ts` | 99 | user_preferences, recommendations_cache |
| `profile.schema.ts` | 181 | user_profiles, user_profile_stats |
| `recommendations.schema.ts` | 65 | recommendation_feedback |
| `saved-cover-art.schema.ts` | 32 | saved_cover_art |

**Total: 2,544 lines across 18 schema files.**

---

## API Routes

### Auth & Config

| Route | Path |
|-------|------|
| login, register, `$.ts` (catch-all), storage | `api/auth/` |
| cache management | `api/cache.ts` |
| runtime config | `api/config.ts` |

### Discovery & Recommendations

| Route | Path |
|-------|------|
| status, settings, trigger, suggestions, suggestions.$id | `api/background-discovery/` |
| index, analytics, interactions, notifications/preferences | `api/discovery-feed/` |
| index, analytics, export, clear, seasonal-insights, mood-timeline, feedback | `api/recommendations/` |

### Library & Listening

| Route | Path |
|-------|------|
| most-played, top-artists, sync/* (start, status, pause, resume, abort, settings) | `api/library/` |
| analyze | `api/library-profile/` |
| record, stats, sessions, by-hour, compound-scores, interest-over-time, album-ages, full | `api/listening-history/` |

### External Services

| Route | Path |
|-------|------|
| similar-artists, similar-tracks, search, top-tracks, test, backfill | `api/lastfm/` |
| search, search-album, add, cancel, unmonitor, availability, status, history | `api/lidarr/` |
| auth/login, api/* (song, album, artist, etc.), rest/* (scrobble), stream/$id, star, search, [...path] | `api/navidrome/` |
| add, delete, status | `api/metube/` |

### Playlists & Media

| Route | Path |
|-------|------|
| index, $id, sync, join, download, smart/*, $id/songs/*, $id/reorder, $id/collaboration/*, $id/collaborators/*, $id/suggestions/*, $id/activity, $id/events, liked-songs/sync | `api/playlists/` |
| queue | `api/downloads/` |
| save | `api/cover-art/` |
| index | `api/lyrics/` |

### Identity, Profile & Misc

| Route | Path |
|-------|------|
| index, $id, share.$token | `api/music-identity/` |
| update | `api/profile/` |
| global search | `api/search.ts` |
| integrated search | `api/integrated/` |
| task aggregator | `api/tasks/` |
| logs, debug-library | `api/debug/` |

---

## Services

### Core Services

| Domain | Key Files | Lines |
|--------|-----------|------:|
| Navidrome | `navidrome.ts` | 1,955 |
| Music Identity | `music-identity.ts` | 1,126 |
| Listening History | `listening-history.ts` | 713 |
| Playback | `playback-websocket.ts` | 196 |

### Recommendations & Scoring

| File | Lines |
|------|------:|
| `recommendations.ts` | 1,350 |
| `blended-recommendation-scorer.ts` | 800+ |
| `profile-recommendations.ts` | 551 |
| `compound-scoring.ts` | 340 |
| `skip-scoring.ts` | 261 |

### Audio Processing

| File | Lines |
|------|------:|
| `transition-effects.ts` | 995 |
| `media-flow-manager.ts` | 732 |
| `web-audio-processor.ts` | 699 |

### Mood & Discovery

| File | Lines |
|------|------:|
| `mood-translator.ts` | 1,100 |
| `mood-timeline-analytics.ts` | 1,003 |
| `time-based-discovery.ts` | 790 |
| `seasonal-patterns.ts` | 247 |
| `mood-criteria-fallback.ts` | 183 |

### Background Discovery

| File | Lines |
|------|------:|
| `discovery-generator.ts` | 684 |
| `discovery-manager.ts` | 488 |

### DJ

| File | Lines |
|------|------:|
| `dj-match-scorer.ts` | 400+ |
| `dj-set-planner.ts` | 400+ |
| `harmonic-mixer.ts` | 300+ |
| `ai-dj/core.ts` | 191 |

### Playlists

| File | Lines |
|------|------:|
| `playlist-export.ts` | 899 |
| `playlist-download.ts` | 507 |
| `liked-songs-sync.ts` | 314 |
| `smart-playlist-evaluator.ts` | 272 |
| `playlist-sync.ts` | 217 |

### External APIs

| File | Lines |
|------|------:|
| `youtube-music.ts` | 646 |
| `spotify.ts` | 496 |
| `lastfm/client.ts` | 500+ |
| `metube.ts` | 338 |
| `deezer.ts` | 300+ |
| `lidarr.ts` | 250+ |

### LLM & Offline

| File | Purpose |
|------|---------|
| `llm/factory.ts` | Factory pattern for ollama/openrouter/glm/anthropic |
| `offline/indexed-db.ts` | IndexedDB storage |
| `offline-adapters.ts` | Offline data adapters |
| `sync-queue.ts` | Offline sync queue |

### Other Services

| File | Purpose |
|------|---------|
| `song-matcher.ts` | Song matching across sources |
| `genre-hierarchy.ts` | Genre taxonomy |
| `genre-matcher.ts` | Genre matching logic |
| `genre-audio-analyzer.ts` | Genre from audio features |
| `energy-estimator.ts` | Track energy estimation |
| `notification-scheduler.ts` | Scheduled notifications (470 lines) |
| `discovery-analytics.ts` | Discovery analytics |
| `recommendation-analytics.ts` | Recommendation analytics |
| `advanced-discovery-analytics.ts` | Advanced discovery analytics |
| `audio-analysis.ts` | Audio feature analysis |
| `audio-buffer-analyzer.ts` | Audio buffer analysis |
| `lyrics.ts` | Lyrics fetching |
| `image-resolver.ts` | Cover art resolution |
| `preferences.ts` | Preferences service |
| `task-aggregator.ts` | Background task aggregation |
| `artist-affinity.ts` | Artist preference scoring |
| `artist-fatigue.ts` | Artist overplay detection |
| `artist-blocklist.ts` | Artist blocklist management |
| `lastfm-backfill.ts` | Last.fm history backfill |

---

## Hooks

| Hook | File | Lines | Purpose |
|------|------|------:|---------|
| useCrossfade | `useCrossfade.ts` | 271 | Equal-power crossfade between dual decks |
| useDualDeckAudio | `useDualDeckAudio.ts` | 137 | Manages 2 HTMLAudioElement instances for gapless playback |
| useEruda | `useEruda.ts` | 244 | Mobile debug console |
| useMediaSession | `useMediaSession.ts` | 389 | Media Session API (lock screen controls, metadata) |
| useOfflineStatus | `useOfflineStatus.ts` | 212 | Online/offline detection, PWA connectivity |
| usePlaybackStateSync | `usePlaybackStateSync.ts` | 278 | Store-to-audio state sync, iOS recovery, visibility changes |
| usePlaybackSync | `usePlaybackSync.ts` | 348 | Cross-device WebSocket sync (Spotify Connect-style) |
| usePlayerKeyboardShortcuts | `usePlayerKeyboardShortcuts.ts` | 74 | Keyboard shortcuts for player controls |
| useServiceWorker | `useServiceWorker.ts` | 138 | Service worker registration and update management |
| useSongFeedback | `useSongFeedback.ts` | 34 | Thumbs up/down feedback API calls |
| useStallRecovery | `useStallRecovery.ts` | 300 | Audio stall detection + escalating recovery strategies |

---

## Component Directories

| Directory | Purpose |
|-----------|---------|
| `dashboard/` | Dashboard page components (analytics, DJ features, recommendations) |
| `debug/` | Debug tools |
| `discovery/` | Discovery queue panel |
| `discovery-feed/` | Discovery feed UI |
| `dj/` | DJ mode components (mix compatibility badges, set builder) |
| `downloads/` | Download manager UI |
| `landing/` | Landing page |
| `layout/` | App layout (PlayerBar, AppLayout, sidebar, mobile nav) |
| `library/` | Library browser (artist/album/song lists) |
| `lyrics/` | Lyrics display |
| `music-identity/` | Music Wrapped/Identity feature |
| `playlist/` | Single playlist view components |
| `playlists/` | Playlist list/management |
| `recommendations/` | Recommendation display, preference insights |
| `ui/` | shadcn/ui primitives (button, dialog, slider, etc.) |
| `visualizer/` | Audio visualizer |

---

## Page Routes

| Route | Page |
|-------|------|
| `/` | Landing page |
| `/login` | Login |
| `/signup` | Sign up |
| `/dashboard` | Main dashboard |
| `/dashboard/analytics` | Listening analytics |
| `/dashboard/discover` | Discovery page |
| `/dashboard/discovery-analytics` | Discovery analytics |
| `/dashboard/generate` | Playlist generator |
| `/dashboard/history` | Listening history |
| `/dashboard/library-growth` | Library growth charts |
| `/dashboard/mood-timeline` | Mood timeline |
| `/dashboard/recommendations/$id` | Recommendation detail |
| `/dj` | DJ mode |
| `/dj/set-builder` | DJ set builder |
| `/dj/settings` | DJ settings |
| `/downloads` | Download manager |
| `/library/artists` | Artist browser |
| `/library/search` | Library search |
| `/music-identity` | Music Wrapped |
| `/playlists` | Playlist list |
| `/playlists/$id` | Playlist detail |
| `/settings/*` | Settings pages (services, playback, profile, recommendations, notifications) |
| `/tasks` | Background tasks |

---

## Background Processing

| System | Mechanism | Location |
|--------|-----------|----------|
| Discovery feed generation | Background generator, periodic | `background-discovery/discovery-generator.ts` (684 lines) |
| Discovery manager | Coordinates discovery runs | `background-discovery/discovery-manager.ts` (488 lines) |
| AI DJ drip-feed | Inject 1 rec every N songs played | `src/lib/stores/audio.ts` (in-store logic) |
| Notification scheduler | Scheduled notifications | `notification-scheduler.ts` (470 lines) |
| Library sync | Progress tracking, pausable | `library-sync.ts` store + `api/library/sync/*` routes |
| WebSocket heartbeat | 60s timeout, 30s check interval | `playback-websocket.ts` |
| Similarity cache refresh | Compound scoring recalculation | `compound-scoring.ts` |

---

## Scripts

| Script | Lines | Purpose | Run |
|--------|------:|---------|-----|
| `backfill-temporal-data.ts` | 51 | Backfill temporal metadata on recommendation feedback | `npx tsx scripts/backfill-temporal-data.ts` |
| `run-migration.ts` | 157 | Create missing tables (taste_snapshots, mood_snapshots, recommendation_history) | `npx tsx scripts/run-migration.ts` |
| `check-tables.ts` | 16 | Verify database tables exist | `npx tsx scripts/check-tables.ts` |
| `capture-readme-screenshots.ts` | 365 | Playwright-based screenshot capture for README | `npm run readme:screenshots` |
| `update-readme-with-screenshots.ts` | 374 | Update README with captured screenshots | `npm run readme:update` |
| `test-coverage-report.js` | 322 | Generate test coverage report | `node scripts/test-coverage-report.js` |
