<!-- Generated: 2026-02-18 -->

# External Integrations

## Overview

| Service | Protocol | Auth | Config Key | Purpose |
|---------|----------|------|------------|---------|
| Navidrome | Subsonic REST + Native REST | Subsonic token (md5) + Bearer JWT | `navidromeUrl`, `navidromeUsername`, `navidromePassword` | Music library, streaming, stars, playlists |
| Last.fm | REST | API key | `lastfmApiKey` | Similar artists/tracks, scrobbling metadata |
| LLM (Ollama/OpenRouter/GLM/Anthropic) | REST | API key per provider | `llmProvider`, `ollamaUrl`, `openrouterApiKey`, etc. | Mood translation, playlist generation |
| Lidarr | REST | API key | `lidarrUrl`, `lidarrApiKey` | Music download management |
| MeTube | REST | None | `metubeUrl` | YouTube audio downloads |
| Spotify | REST | Client credentials | `spotifyClientId`, `spotifyClientSecret` | Metadata lookup (no streaming) |
| YouTube Music | Scraping/API | None | — | Metadata lookup |
| Deezer | REST | None (public API) | — | Metadata, explicit content, cover art |
| LRCLIB | REST | None | — | Lyrics lookup |
| better-auth | Library | Session cookies | `BETTER_AUTH_SECRET` | Authentication |

## Navidrome (`navidrome.ts` — 2,069 lines)

### Subsonic API (shared operations)

Used for library browsing, search, and streaming. These use the admin account credentials.

**Auth**: `token = md5(password + salt)`, params: `u`, `t`, `s`, `v=1.16.1`, `c=aidj`, `f=json`

| Function | Subsonic Endpoint | Purpose |
|----------|------------------|---------|
| `search(query)` | `/rest/search3` | Full-text search |
| `getRandomSongs()` | `/rest/getRandomSongs` | Random song selection |
| `getSimilarSongs(id)` | `/rest/getSimilarSongs2` | Similar song lookup |
| `getArtists()` | `/rest/getArtists` | Artist index |
| `getArtist(id)` | `/rest/getArtist` | Artist details |
| `getAlbum(id)` | `/rest/getAlbum` | Album details |
| `getAlbumList2()` | `/rest/getAlbumList2` | Album listing |
| `getCoverArt(id)` | `/rest/getCoverArt` | Cover art image |
| `stream(id)` | `/rest/stream` | Audio stream URL |

### Subsonic API (per-user operations)

These accept optional `SubsonicCreds` for per-user Navidrome accounts. Falls back to admin if no creds provided.

| Function | Subsonic Endpoint | Purpose |
|----------|------------------|---------|
| `starSong(id, creds?)` | `/rest/star` | Star a song |
| `unstarSong(id, creds?)` | `/rest/unstar` | Unstar a song |
| `getStarredSongs(creds?)` | `/rest/getStarred2` | Get starred songs |
| `getPlaylists(creds?)` | `/rest/getPlaylists` | List playlists |
| `getPlaylist(id, creds?)` | `/rest/getPlaylist` | Playlist details |
| `createPlaylist(name, ids?, creds?)` | `/rest/createPlaylist` | Create playlist |
| `updatePlaylist(id, ..., creds?)` | `/rest/updatePlaylist` | Update playlist |
| `deletePlaylist(id, creds?)` | `/rest/deletePlaylist` | Delete playlist |

### Native Navidrome API

Used for user management (admin-only operations).

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getAuthToken()` | `POST /auth/login` | Get admin JWT token |
| `createNavidromeUser()` | `POST /api/user` | Create user account |

**Auth**: `x-nd-authorization: Bearer {jwt}` header

### Gotchas

- The Subsonic `createUser` endpoint is NOT implemented in Navidrome. Use the native REST API instead.
- `apiFetch()` (line ~510) is the core function that adds auth to all Navidrome requests
- Module-level `token`, `subsonicToken`, `subsonicSalt` variables store admin credentials
- Smart playlist evaluation: `evaluateRule()` is called by Navidrome to filter songs based on criteria

## Per-User Navidrome Accounts (`navidrome-users.ts` — 227 lines)

Each AIDJ user gets their own Navidrome account for user-scoped operations.

### SubsonicCreds Type

```ts
interface SubsonicCreds {
  username: string;
  token: string;  // md5(password + salt)
  salt: string;
}
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `createNavidromeUser(userId, name, email)` | Create Navidrome account via native API |
| `getNavidromeUserCreds(userId)` | Get cached creds from DB |
| `ensureNavidromeUser(userId, name, email)` | Idempotent: create if not exists, return creds |
| `buildSubsonicParams(creds)` | Build URL params from creds |

### Caching

In-memory `Map<userId, { creds, expiresAt }>` with 1-hour TTL.

## Last.fm (`lastfm/client.ts` — 402 lines)

**Auth**: API key passed as `api_key` query parameter. No OAuth needed (read-only operations).

| Method | Last.fm Endpoint | Purpose |
|--------|-----------------|---------|
| `getSimilarTracks(artist, track)` | `track.getSimilar` | Find similar tracks |
| `getSimilarArtists(artist)` | `artist.getSimilar` | Find similar artists |
| `getArtistTopTracks(artist)` | `artist.getTopTracks` | Top tracks by artist |
| `getTrackInfo(artist, track)` | `track.getInfo` | Track metadata |
| `getArtistInfo(artist)` | `artist.getInfo` | Artist metadata |

**Gotcha**: Rate limited. The blended scorer uses 100ms throttle between searches. Last.fm API sometimes returns empty results for less popular tracks.

## LLM Providers (`llm/factory.ts`)

**Supported providers**: `ollama` (default), `openrouter`, `glm`, `anthropic`

### Factory Pattern

```ts
function createLLMProvider(): LLMProvider {
  switch (getConfig().llmProvider) {
    case 'ollama': return new OllamaProvider(config.ollamaUrl);
    case 'openrouter': return new OpenRouterProvider(config);
    case 'glm': return new GlmProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
  }
}
```

Each provider implements the `LLMProvider` interface with `generate(prompt, options)` method.

### Usage

- **Mood translation**: Translates natural language mood → Navidrome smart playlist criteria (temperature 0.3, max 256 tokens, 5s timeout)
- **Playlist generation**: Generates playlists from descriptions
- **Music identity insights**: AI-generated insights for Wrapped-style summaries

## Lidarr (`lidarr.ts` — 429 lines)

**Protocol**: REST API with `X-Api-Key` header

| Function | Purpose |
|----------|---------|
| `searchArtists(term)` | Search for artists |
| `getArtist(id)` | Artist details |
| `getAlbums(artistId)` | Albums by artist |
| `addArtist(...)` | Add artist to monitored list |
| `searchAndAdd(artist, album)` | Search + add for download |

**Config**: `LIDARR_URL`, `LIDARR_API_KEY` (required env vars)

## MeTube (`metube.ts`)

**Protocol**: REST API, no authentication

| Function | Purpose |
|----------|---------|
| `addDownload(url, quality)` | Queue YouTube download |
| `getHistory()` | Download history |

**Config**: `metubeUrl` in config

## Metadata Services

### Spotify (`spotify.ts`)

- Client credentials OAuth flow (`client_id` + `client_secret`)
- Used only for metadata (track info, artist info, album art)
- No streaming or user library access

### YouTube Music (`youtube-music.ts`)

- Metadata search for song matching
- Used in playlist import for matching songs

### Deezer (`deezer.ts`)

- Public API (no auth needed)
- Used for:
  - Explicit content detection (`/search?q=artist:X track:Y`)
  - Cover art resolution
  - Track metadata

**Gotcha**: Deezer results are matched by artist + title string comparison. Fuzzy matching handles slight differences.

## Auth System (`auth.ts`)

### Setup

- Library: `better-auth` with Drizzle adapter
- Providers: email/password + GitHub OAuth + Google OAuth (optional)
- Cookie config: `sameSite: "none"`, `secure: true`, `httpOnly: true`
- Plugin: `tanstackStartCookies()` for SSR compatibility

### Session Check Pattern

```ts
const session = await auth.api.getSession({
  headers: request.headers,
  query: { disableCookieCache: true },
});
if (!session) return unauthorizedResponse();
```

### `withAuthAndErrorHandling` Wrapper

The standard pattern for authenticated API routes:

```ts
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    // session.user.id is available
    return successResponse(data);
  },
  {
    service: 'my-service',
    operation: 'my-operation',
    defaultCode: 'MY_ERROR_CODE',
    defaultMessage: 'Failed to do something',
  }
);
```

Handles: session validation, Zod validation errors, ServiceError, generic errors.

### Social Providers

Only included if env vars are set:
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`

## Config System (`config.ts`)

### Loading Order

1. `db/config.json` — file-based defaults (server-side)
2. Environment variables — override file values
3. `localStorage` — client-side overrides (for dev/testing)

### Key Config Values

| Key | Default | Description |
|-----|---------|-------------|
| `navidromeUrl` | env `NAVIDROME_URL` | Navidrome server URL |
| `navidromeUsername` | env `NAVIDROME_USERNAME` | Admin username |
| `navidromePassword` | env `NAVIDROME_PASSWORD` | Admin password |
| `ollamaUrl` | env `OLLAMA_URL` | Ollama LLM server |
| `llmProvider` | `'ollama'` | Active LLM provider |
| `lidarrUrl` | env `LIDARR_URL` | Lidarr server |
| `lidarrApiKey` | env `LIDARR_API_KEY` | Lidarr API key |
| `lastfmApiKey` | env `LASTFM_API_KEY` | Last.fm API key |
| `metubeUrl` | env `METUBE_URL` | MeTube server |

### Functions

- `getConfig()` — synchronous, returns cached config
- `getConfigAsync()` — async, ensures file is loaded first
- `setConfig(updates)` — update and persist to `db/config.json`

## Feature Flags (`features.ts`)

| Flag | Default | Env Override | Description |
|------|---------|-------------|-------------|
| `hlsStreaming.enabled` | `false` | `FEATURE_HLS_STREAMING=true` | HLS streaming for network resilience |
| `hlsStreaming.fallbackOnError` | `true` | — | Fall back to direct stream on HLS errors |
| `serverPlaybackState.enabled` | `false` | `FEATURE_SERVER_PLAYBACK=true` | Server-side playback state |
| `serverPlaybackState.syncInterval` | `5000` | — | Sync interval in ms |
| `jukeboxMode.enabled` | `false` | `FEATURE_JUKEBOX=true` | Device management / jukebox mode |
| `jukeboxMode.allowMultipleDevices` | `true` | — | Allow multiple devices |
| `jukeboxMode.showDeviceSelector` | `false` | — | Show device selector UI |

**Client-side**: stored in `localStorage` as `featureFlags` JSON
**Server-side**: read from env vars
**API**: `isFeatureEnabled('hlsStreaming')`, `setFeatureFlags(updates)`, `resetFeatureFlags()`
