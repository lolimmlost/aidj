<!-- Generated: 2026-02-15 -->

# External Integrations Reference

All external service integrations used by AIDJ, derived from codebase inspection.

---

## Integration Overview

| Service | Required | Protocol | Auth Method | Primary File | Lines |
|---------|----------|----------|-------------|--------------|-------|
| Navidrome | Yes | Subsonic REST API | Salt+token MD5 hash | `src/lib/services/navidrome.ts` | 1,955 |
| Last.fm | No | Last.fm REST API | API key (read-only) | `src/lib/services/lastfm/client.ts` | 682 |
| LLM (multi-provider) | Yes | Provider-specific | Provider-specific | `src/lib/services/llm/factory.ts` | 172 |
| Lidarr | No | Lidarr REST API v3 | API key header | `src/lib/services/lidarr.ts` | 1,075 |
| MeTube | No | MeTube REST API | None | `src/lib/services/metube.ts` | 338 |
| Spotify | No | Spotify Web API | Client credentials OAuth | `src/lib/services/spotify.ts` | 496 |
| YouTube Music | No | YouTube Data API | API key + OAuth | `src/lib/services/youtube-music.ts` | 646 |
| Deezer | No | Deezer public API | None | `src/lib/services/deezer.ts` | 96 |
| better-auth | Yes | Internal | Email/password, OAuth | `src/lib/auth/auth.ts` | 69 |

---

## Navidrome (Required)

All music data (songs, albums, artists, playlists, streaming) flows through Navidrome. If Navidrome is unavailable, the application is non-functional. Song IDs throughout the app are Navidrome IDs.

### Configuration

| Variable | Source | Required |
|----------|--------|----------|
| `NAVIDROME_URL` | Env / `db/config.json` | Yes |
| `NAVIDROME_USERNAME` | Env / `db/config.json` | Yes |
| `NAVIDROME_PASSWORD` | Env / `db/config.json` | Yes |

### Authentication

Subsonic API auth pattern: random salt, `token = md5(password + salt)`, passes `u`, `t`, `s`, `v`, `c`, `f` query params per request. Uses pure-JS MD5 (no Node crypto dependency).

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `search(query)` | Search songs by query |
| `getSongsGlobal(start, limit)` | All songs paginated |
| `getRandomSongs(count)` | Random songs |
| `getArtists()` / `getArtistDetail(id)` | List/get artists |
| `getAlbumDetail(id)` | Album metadata |
| `getSongs(albumId)` / `getSongsByArtist(artistId)` | Songs by album/artist |
| `getSongsByIds(songIds)` | Batch song lookup |
| `starSong(songId)` / `unstarSong(songId)` | Star/unstar |
| `getStarredSongs()` | Starred songs list |
| `scrobbleSong(songId)` | Scrobble a play |
| `getPlaylists()` / `createPlaylist()` / `updatePlaylist()` / `deletePlaylist()` | Playlist CRUD |
| `getSimilarSongs(songId, count)` | Subsonic similar songs |
| `searchSongsByCriteria(criteria)` | Multi-field search |
| `getTopArtists(limit)` / `getMostPlayedSongs(limit)` | Play count rankings |
| `getRecentlyPlayedSongs(limit)` | Recently played |
| `getSongWithExtendedMetadata(songId)` | Extended metadata |
| `checkNavidromeConnectivity()` | Health check |
| `resolveSongByArtistTitle(artistTitle)` | Fuzzy song lookup |

### API Proxy Routes

Streaming and API calls are proxied through the app server to handle auth transparently.

| Route | Purpose |
|-------|---------|
| `api/navidrome/stream/$id` | Stream audio (proxied with auth) |
| `api/navidrome/api/song` | Song list |
| `api/navidrome/api/album` / `api/navidrome/api/album/$id` | Album list/detail |
| `api/navidrome/api/artist` / `api/navidrome/api/artist/$id` | Artist list/detail |
| `api/navidrome/rest/$` | Catch-all for Subsonic REST (scrobble, etc.) |
| `api/navidrome/star` | Star/unstar songs |
| `api/navidrome/search` | Search proxy |
| `api/navidrome/auth/login` | Auth token exchange |
| `api/navidrome/[...path]` | Catch-all fallback |

### Gotchas

- All song IDs are Navidrome/Subsonic IDs -- they propagate into recommendations, history, and queue.
- Streaming proxies full audio through the app server.
- Auth tokens (salt+md5) are generated per-request; no session caching with Navidrome.

---

## Last.fm (Optional)

Provides similar-track/artist discovery and metadata enrichment. Recommendations still work without it (compound scoring + genre matching), but quality degrades.

### Configuration

| Variable | Source |
|----------|--------|
| `lastfmApiKey` | `db/config.json` |
| `LASTFM_API_KEY` | Env |

API key only (read-only). Base URL: `https://ws.audioscrobbler.com/2.0/`

### Key Class Methods (`LastFmClient`)

| Method | Purpose |
|--------|---------|
| `getSimilarTracks(artist, track, limit)` | Similar tracks enriched with Navidrome library status |
| `getSimilarArtists(artist, limit)` | Similar artists enriched with library status |
| `getTopTracks(artist, limit)` | Top tracks by artist |
| `getTopTracksByTag(tag, limit)` | Top tracks by genre tag |
| `searchTracks(query, limit)` | Search Last.fm tracks |
| `getTrackInfo(artist, track)` | Detailed track info (tags, play count) |
| `getRecentTracks(user, limit)` | Recent listening history |
| `testConnection()` | Validate API key |

Helpers: `getLastFmClient(apiKey?)` (singleton), `isLastFmConfigured()`.

### API Routes

| Route | Purpose |
|-------|---------|
| `api/lastfm/similar-tracks` | Similar tracks |
| `api/lastfm/similar-artists` | Similar artists |
| `api/lastfm/top-tracks` | Top tracks |
| `api/lastfm/search` | Search |
| `api/lastfm/test` | Connection test |
| `api/lastfm/backfill` | Backfill listening history |

### Gotchas

- Rate limited: token bucket at 5 req/s. Results cached 5 min.
- Used by recommendation scorer at ~25% weight in blended scoring.

---

## LLM Providers (Factory Pattern)

AI features (mood translation, playlist generation, discovery) use an abstracted LLM provider system.

### Configuration

| Config Key | Env Override | Default |
|------------|-------------|---------|
| `llmProvider` | `LLM_PROVIDER` | `ollama` |
| `ollamaUrl` | `OLLAMA_URL` | `http://10.0.0.30:30068` |
| `ollamaModel` | `OLLAMA_MODEL` | `llama2` |
| `openrouterApiKey` | `OPENROUTER_API_KEY` | (empty) |
| `openrouterModel` | `OPENROUTER_MODEL` | `anthropic/claude-3.5-sonnet` |
| `glmApiKey` | `GLM_API_KEY` | (empty) |
| `glmModel` | `GLM_MODEL` | `glm-4-plus` |
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | (empty) |
| `anthropicModel` | `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250514` |
| `anthropicBaseUrl` | `ANTHROPIC_BASE_URL` | `https://api.anthropic.com/v1` |

### Supported Providers

| Provider | Type | Auth | File |
|----------|------|------|------|
| Ollama | Local | None (URL only) | `src/lib/services/llm/providers/ollama.ts` |
| OpenRouter | Cloud | API key | `src/lib/services/llm/providers/openrouter.ts` |
| GLM | Cloud | API key | `src/lib/services/llm/providers/glm.ts` |
| Anthropic | Cloud | API key | `src/lib/services/llm/providers/anthropic.ts` |

### Provider Interface (`LLMProvider`)

| Method | Purpose |
|--------|---------|
| `generate(request, timeoutMs?)` | Generate text completion |
| `checkModelAvailability(model)` | Verify model is available |
| `getMetadata()` | Provider capabilities |
| `isConfigured()` | Configuration validation |

Factory: `getLLMProvider()` (singleton, recreated on config change), `createLLMProvider(type)`, `resetLLMProvider()`, `getProviderInfo()`.

API route: `api/ai-dj/recommendations` (AI-powered song recommendations).

### Gotchas

- Singleton cached; only recreated when `llmProvider` changes.
- Anthropic supports z.ai proxy via `anthropicBaseUrl`.
- Ollama is default; requires a running instance on the network.

---

## Lidarr (Optional)

Music acquisition -- search for and request new music to be added to Navidrome.

### Configuration

| Variable | Source | Note |
|----------|--------|------|
| `LIDARR_URL` | Env / `db/config.json` | Validated as required in `src/env/server.ts` |
| `LIDARR_API_KEY` | Env / `db/config.json` | Validated as required in `src/env/server.ts` |
| `lidarrQualityProfileId` | Config | Optional |
| `lidarrRootFolderPath` | Config | Optional |

Auth: API key as `X-Api-Key` header.

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `search(query)` | Combined artist + album search |
| `searchArtists(query)` / `searchAlbums(query)` | Type-specific search |
| `addArtist(artist, options?)` | Add artist to library |
| `ensureArtistMonitored(id)` / `monitorAlbum(id)` | Monitoring control |
| `getDownloadQueue()` / `getDownloadHistory()` | Download tracking |
| `cancelDownload(id)` / `retryDownload(id)` | Download management |
| `getWantedMissing()` | Missing wanted albums |
| `getDownloadStats()` | Statistics |

### API Routes

| Route | Purpose |
|-------|---------|
| `api/lidarr/search` / `search-album` | Search |
| `api/lidarr/add` | Add artist |
| `api/lidarr/cancel` / `unmonitor` | Cancel/unmonitor |
| `api/lidarr/availability` / `status` / `history` | Status & history |

### Gotchas

- Retry with exponential backoff: max 3 retries, base 1s, max 10s. Retryable codes: 408, 429, 500, 502, 503, 504.

---

## MeTube (Optional)

YouTube video/audio downloading via MeTube instance.

### Configuration

`metubeUrl` in `db/config.json`. No auth required.

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `addDownload(request)` | Queue a download |
| `getQueue()` / `getHistory()` | Queue and history |
| `deleteDownloads(ids)` / `startDownloads(ids)` | Manage downloads |
| `checkConnection()` / `getVersion()` | Health check |
| `downloadMusic()` / `downloadVideo()` / `downloadPlaylist()` | Convenience wrappers |

Quality: `best`, `worst`, `1080`, `720`, `480`, `360`. Formats: `mp4`, `mp3`, `any`.

API routes: `api/metube/add`, `api/metube/delete`, `api/metube/status`.

---

## Spotify (Metadata Only -- Not for Playback)

Metadata enrichment and playlist import/export.

### Configuration

| Config Key | Default |
|------------|---------|
| `spotifyClientId` | (empty) |
| `spotifyClientSecret` | (empty) |
| `spotifyRedirectUri` | `http://localhost:3000/api/auth/spotify/callback` |

Auth: Client credentials for search; user OAuth for playlists. Per-user token storage with refresh.

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `isSpotifyConfigured()` | Check credentials |
| `getAuthorizationUrl()` / `exchangeCodeForTokens()` / `refreshAccessToken()` | OAuth flow |
| `searchTracks(query)` / `searchByIsrc(userId, isrc)` | Catalog search |
| `getUserPlaylists()` / `getPlaylist()` / `createPlaylist()` / `addTracksToPlaylist()` | Playlist ops |
| `createSpotifySearcher(userId)` | `PlatformSearcher` adapter |

No dedicated API routes; used internally by playlist export service.

---

## YouTube Music (Metadata Only -- Not for Playback)

Metadata enrichment and playlist import/export.

### Configuration

| Config Key | Default |
|------------|---------|
| `youtubeApiKey` | (empty) |
| `youtubeClientId` | (empty) |
| `youtubeClientSecret` | (empty) |
| `youtubeRedirectUri` | `http://localhost:3000/api/auth/youtube/callback` |

Auth: API key for search; user OAuth for playlists. Per-user token storage with refresh.

### Key Exported Functions

| Function | Purpose |
|----------|---------|
| `isYouTubeMusicConfigured()` | Check credentials |
| `getAuthorizationUrl()` / `exchangeCodeForTokens()` / `refreshAccessToken()` | OAuth flow |
| `searchVideos(query)` | Music search |
| `getUserPlaylists()` / `getPlaylist()` / `createPlaylist()` / `addVideosToPlaylist()` | Playlist ops |
| `createYouTubeMusicSearcher(userId)` | `PlatformSearcher` adapter |

No dedicated API routes; used internally by playlist export service.

---

## Deezer (Metadata Only)

Free, no-auth image fallback for artist/album artwork when Navidrome/Last.fm images are missing. Base URL: `https://api.deezer.com`. No API key required.

| Function | Purpose |
|----------|---------|
| `getDeezerArtistImage(artistName)` | Artist image (largest available) |
| `getDeezerAlbumImage(artist, album)` | Album cover image |

Cached 7 days via `getCacheService()`. No API routes; called server-side only. Returns `null` on error (silent failure).

---

## Auth System (better-auth)

### Configuration

| Variable | Required | Note |
|----------|----------|------|
| `BETTER_AUTH_SECRET` | Yes | Min 32 chars |
| `VITE_BASE_URL` | Yes | Base URL for auth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | Enables GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Enables Google OAuth (requires GitHub also set) |

### Auth Methods

| Method | Condition |
|--------|-----------|
| Email/password | Always enabled |
| GitHub OAuth | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` set |
| Google OAuth | Above + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set |

### Cookie Config

`sameSite: none`, `secure: true`, `httpOnly: true`, `path: /`

### Files

- `src/lib/auth/auth.ts` -- server config (better-auth + Drizzle adapter, `pg` provider)
- `src/lib/auth/auth-client.ts` -- client helpers (better-auth/react)
- Plugin: `tanstackStartCookies()` for SSR cookie handling

### Session Pattern in API Routes

```typescript
const session = await auth.api.getSession({ headers: request.headers });
if (!session) return new Response('Unauthorized', { status: 401 });
const userId = session.user.id;
```

### API Routes

`api/auth/$` (catch-all), `api/auth/login`, `api/auth/register`, `api/auth/storage`

Trusted origins: `VITE_BASE_URL` + `localhost:3003` / `127.0.0.1:3003` in development.

---

## Config System

Files: `src/lib/config/config.ts` (192 lines), `src/lib/config/defaults.json` (18 lines).

### Load Order

**Server**: `defaults.json` -> `db/config.json` -> env vars (highest priority).
**Client**: `defaults.json` -> `localStorage` key `serviceConfig`.

### Functions

| Function | Purpose |
|----------|---------|
| `getConfig()` | Synchronous access |
| `getConfigAsync()` | Async (ensures server config loaded) |
| `setConfig(partial)` | Partial update (persists to localStorage on client) |
| `resetConfig()` | Reset to defaults |

API route: `api/config` (GET/PUT for runtime config changes).

---

## Feature Flags

File: `src/lib/config/features.ts` (146 lines).

### Flag Definitions

| Flag | Sub-key | Type | Default | Description |
|------|---------|------|---------|-------------|
| `hlsStreaming` | `enabled` | `boolean` | `false` | HLS streaming for network resilience |
| `hlsStreaming` | `fallbackOnError` | `boolean` | `true` | Fall back to direct stream on HLS errors |
| `serverPlaybackState` | `enabled` | `boolean` | `false` | Server-side playback state sync |
| `serverPlaybackState` | `syncInterval` | `number` | `5000` | ms between sync pushes |
| `jukeboxMode` | `enabled` | `boolean` | `false` | Multi-device jukebox mode |
| `jukeboxMode` | `allowMultipleDevices` | `boolean` | `true` | Allow multiple simultaneous devices |
| `jukeboxMode` | `showDeviceSelector` | `boolean` | `false` | Show device selector in UI |

### Env Overrides (Server-Side)

| Env Var | Enables |
|---------|---------|
| `FEATURE_HLS_STREAMING=true` | `hlsStreaming.enabled` |
| `FEATURE_SERVER_PLAYBACK=true` | `serverPlaybackState.enabled` |
| `FEATURE_JUKEBOX=true` | `jukeboxMode.enabled` + `showDeviceSelector` |

Client override: `localStorage` key `featureFlags` (JSON, deep-merged over defaults).

Functions: `getFeatureFlags()`, `isFeatureEnabled(feature)`, `setFeatureFlags(updates)` (client-only), `resetFeatureFlags()`.

---

## Environment Variables Summary

Validated at startup via `src/env/server.ts` (`@t3-oss/env-core` + Zod).

### Required

| Variable | Validation | Used By |
|----------|-----------|---------|
| `DATABASE_URL` | `z.string().url()` | Drizzle ORM / PostgreSQL |
| `BETTER_AUTH_SECRET` | `z.string().min(32)` | better-auth session signing |
| `VITE_BASE_URL` | `z.string().url()` | Auth, trusted origins |
| `NAVIDROME_URL` | `z.string().url()` | Navidrome |
| `NAVIDROME_USERNAME` | `z.string().min(1)` | Navidrome auth |
| `NAVIDROME_PASSWORD` | `z.string().min(1)` | Navidrome auth |
| `OLLAMA_URL` | `z.string().url()` | LLM (Ollama) |
| `LIDARR_URL` | `z.string().url()` | Lidarr |
| `LIDARR_API_KEY` | `z.string().min(1)` | Lidarr auth |

### Optional

| Variable | Used By |
|----------|---------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `LLM_PROVIDER` | LLM provider selection |
| `OLLAMA_MODEL` / `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | LLM config |
| `GLM_API_KEY` / `GLM_MODEL` | GLM config |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` | Anthropic config |
| `LASTFM_API_KEY` | Last.fm |
| `FEATURE_HLS_STREAMING` / `FEATURE_SERVER_PLAYBACK` / `FEATURE_JUKEBOX` | Feature flags |
