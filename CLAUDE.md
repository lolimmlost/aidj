<!-- Generated: 2026-02-18 -->

# AIDJ Music Interface — AI Agent Context

## Quick Facts

| Item | Value |
|------|-------|
| Name | aidj-music-interface |
| Stack | React 19 + TanStack Start/Router + Vite + Drizzle ORM + PostgreSQL + Zustand |
| UI | Radix UI + Tailwind CSS 4 + shadcn/ui + Lucide icons |
| Auth | better-auth (email/password + GitHub/Google OAuth) |
| Dev port | 3003 (`npm run dev`) |
| WS port | same server (vite plugin) |
| Build | `npm run build` (node-server target) or `npm run build:cloudflare` |
| Test | `npm test` (vitest), `npm run test:e2e` (playwright) |
| DB | `npm run db` (drizzle-kit), `npm run db:studio` |
| Deploy target | Node.js (`node-server`) or Cloudflare Pages |

## Architecture Overview

- TanStack Start full-stack React framework (SSR + API routes)
- API routes in `src/routes/api/` — file-based routing via TanStack Router
- Page routes in `src/routes/` — file-based, lazy-loaded
- State management via Zustand stores in `src/lib/stores/`
- DB: PostgreSQL via Drizzle ORM, schemas in `src/lib/db/schema/`
- Navidrome is the music server (Subsonic-compatible API). ALL music data comes from Navidrome
- Per-user Navidrome accounts: each AIDJ user gets their own Navidrome account for stars/playlists/scrobbles; admin account used for shared ops (library browse, search, stream)
- Audio playback: dual-deck crossfade system in browser (2 HTMLAudioElement instances)
- Cross-device sync: WebSocket-based (Spotify Connect-style), server in `vite-ws-plugin.ts` + `src/lib/services/playback-websocket.ts`
- Recommendation engine: multi-signal scoring (Last.fm, compound, DJ match, feedback, skip, temporal, diversity)
- Background discovery: generates suggestions offline via `src/lib/services/background-discovery/`
- PWA with offline support via service worker (`public/sw.js`) + IndexedDB adapters (`src/lib/services/offline/`)

## Critical Systems

| System | Key Files | Risk |
|--------|-----------|------|
| Audio store | `src/lib/stores/audio.ts` (1,859 lines) | Manages ALL playback state, queue, AI DJ, crossfade, autoplay, cross-device sync timestamps |
| Dual-deck audio | `src/lib/hooks/useDualDeckAudio.ts`, `useCrossfade.ts` | Two HTMLAudioElement instances for gapless crossfade. Break = no playback |
| Playback state sync | `usePlaybackStateSync.ts` | iOS screen lock recovery, visibility change handling, stall recovery |
| Cross-device sync | `playback-websocket.ts`, `usePlaybackSync.ts` | WebSocket per-field timestamp conflict resolution |
| Recommendation engine | `blended-recommendation-scorer.ts` (orchestrator), `compound-scoring.ts`, `skip-scoring.ts`, `dj-match-scorer.ts` | Multi-signal scoring, artist fatigue, blocklists |
| Navidrome service | `src/lib/services/navidrome.ts` (2,069 lines) | ALL library data, search, streaming. Break = app is useless |
| Per-user Navidrome | `src/lib/services/navidrome-users.ts` | Per-user account creation via native REST API, credential caching |

## Auth & Session Handling

- Uses `better-auth` library with Drizzle adapter
- Session auth pattern in API routes:
  ```ts
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  ```
- Cookie config: sameSite=none, secure=true, httpOnly=true (for Cloudflare tunnel support)
- Social providers: GitHub, Google (optional, only if env vars set)
- Auth routes: `src/routes/api/auth/` (login, register, `$.ts` catch-all for better-auth)

## Config & Feature Flags

- **Service config**: `src/lib/config/config.ts` — loads from `db/config.json` + env var overrides + localStorage (client)
  - LLM providers: ollama (default), openrouter, glm, anthropic
  - Service URLs: navidrome, lidarr, metube, lastfm, spotify, youtube-music
  - `getConfig()` sync, `getConfigAsync()` async (ensures file loaded)
- **Feature flags**: `src/lib/config/features.ts` — localStorage or env var overrides
  - `hlsStreaming` (disabled default), `serverPlaybackState` (disabled), `jukeboxMode` (disabled)
  - `isFeatureEnabled('hlsStreaming')` to check

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection URL |
| BETTER_AUTH_SECRET | Yes | Min 32 chars, session encryption |
| VITE_BASE_URL | Yes | Public URL (e.g., https://example.com) |
| NAVIDROME_URL | Yes | Navidrome server URL |
| NAVIDROME_USERNAME | Yes | Navidrome admin credentials |
| NAVIDROME_PASSWORD | Yes | Navidrome admin credentials |
| OLLAMA_URL | Yes | Ollama LLM server URL |
| LIDARR_URL | Yes | Lidarr music management URL |
| LIDARR_API_KEY | Yes | Lidarr API key |
| GITHUB_CLIENT_ID | No | GitHub OAuth |
| GITHUB_CLIENT_SECRET | No | GitHub OAuth |
| GOOGLE_CLIENT_ID | No | Google OAuth |
| GOOGLE_CLIENT_SECRET | No | Google OAuth |

## Conventions

- Import aliases: `~/` maps to `src/`, `@/` maps to `src/` (both equivalent; convention is `@/lib/` for lib, `~/` for everything else)
- DB: snake_case columns (drizzle `casing: "snake_case"`), schemas in separate `*.schema.ts` files, re-exported from `index.ts`
- API routes: TanStack Start `createAPIFileRoute` or `createFileRoute`, always check session first, return `Response` objects
- Stores: Zustand with `persist` middleware, custom serialization for Set/Map types
- Components: Radix primitives wrapped in shadcn/ui style, Tailwind for styling
- Testing: vitest for unit tests, playwright for e2e
- Service worker: `public/sw.js`, offline adapters in `src/lib/services/offline/`

## Known Pitfalls

### Radix ScrollArea breaks flex truncation (`display: table`)

Radix UI's `ScrollArea.Viewport` injects a child `<div style="display: table">` to measure content width for horizontal scrollbar calculations. This **breaks all flex-shrink-based layouts** inside the scroll area: `flex-shrink`, `min-w-0`, `truncate`, and `overflow-hidden` on flex items have no effect because the `display: table` context expands to fit ALL content, ignoring the viewport width.

**Symptom**: Flex columns (e.g. Artist/Album in playlist song rows) overflow the right edge of the screen instead of truncating with ellipsis, no matter how many flex/overflow fixes you apply to the rows or columns.

**Fix (already applied in two places)**:
1. **Component-level** (`src/components/ui/scroll-area.tsx`): `[&>div]:!block` on the Viewport className overrides the injected div to `display: block`
2. **CSS fallback** (`src/styles.css`): `main [data-radix-scroll-area-viewport] > div { display: block !important; }` catches any direct Radix usage outside the wrapper

**If you add flex layouts inside a ScrollArea and content overflows instead of truncating, this is almost certainly the cause.** Do NOT remove the `[&>div]:!block` override from the ScrollArea component.

## Do Not

- Do NOT modify `src/lib/stores/audio.ts` without understanding the full dual-deck crossfade + AI DJ + cross-device sync interaction
- Do NOT skip session auth checks in API routes
- Do NOT import server-only modules (db, services) in client-side code — use API routes
- Do NOT hardcode Navidrome URLs — always use config system
- Do NOT add new schema files without re-exporting from `src/lib/db/schema/index.ts`
- Do NOT use `require()` in client code (ESM-only, `"type": "module"`)
- Do NOT modify the WebSocket vite plugin without testing cross-device sync on multiple browsers
- Do NOT use Subsonic `createUser` endpoint — Navidrome does not implement it. Use native REST API (`POST /api/user`) via `navidrome-users.ts`
