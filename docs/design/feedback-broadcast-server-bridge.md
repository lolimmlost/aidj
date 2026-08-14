# Server-authoritative feedback broadcast — design ideation

Status: **ideation** (2026-08-14). Follows #138 (client-emit star/unstar over WS) and
#139 (refetch feedback on focus/reconnect).

## Goal

When a user's like/star state changes, push it to **all their connected devices**
live — even when the change does **not** originate from a browser that's currently
holding a WebSocket:

- API-only callers (scripts, integrations, `scripts/*`).
- Server-side background changes: reconcile-on-open (PR D), `/api/playlists/liked-songs/sync`,
  `syncLikedSongsToFeedback`, onboarding artist-select seeding.
- Removes the current reliance on the *initiating browser* to emit (#138), which fails
  if that tab is closed or offline.

Non-goal: changes made **directly in the Navidrome client** never touch the app server,
so nothing here can push them. #139 (refetch on focus/reconnect) stays the backstop for
those. This bridge only covers **app-server-mediated** changes.

## The core obstacle: module-instance boundary in prod

The WS connection registry is a module-level `Map<userId, Set<WebSocket>>` in
`src/lib/services/playback-websocket.ts`. Who instantiates it differs by environment:

| Env | WS server created by | API/SSR handlers run in | Share the registry? |
|-----|----------------------|-------------------------|---------------------|
| dev (`vite dev`) | `vite-ws-plugin.ts` (Vite SSR module graph) | same Vite SSR graph | **Yes** — Vite dedupes to one module instance |
| prod (`tsx server.ts`) | `server.ts`, importing **source** via tsx | the **bundled** `dist/server/server.js` | **No** — two separate module copies, one process |

So in prod the live sockets live in the *source-loaded* module (server.ts), while an API
route importing `playback-websocket` would get the *bundled* copy with an **empty** Map.
A naive `export broadcastToAllDevices()` called from `star.ts` **silently no-ops in prod**
and *works in dev* — the worst kind of bug. Any bridge must cross this boundary.

Note: the WS runs only under the node-server path (`server.ts`) and the dev plugin. The
`build:cloudflare` output has no WS server at all (Workers need Durable Objects), so this
is a Coolify/node-server-only feature — not a regression to worry about.

## Options

### Option 1 — `globalThis` broadcast bridge (recommended first step)

`setupPlaybackWebSocket` installs a broadcast fn on `globalThis` once, at boot:

```ts
// in playback-websocket.ts, inside setupPlaybackWebSocket
globalThis.__aidjBroadcastToUser = broadcastToAllDevices; // (userId, message, log)
```

API routes / services call it defensively:

```ts
globalThis.__aidjBroadcastToUser?.(userId, { type: 'feedback_update', payload: { songId, liked } }, 'feedback_update');
```

- **Why it works in prod:** `globalThis` is shared across every module instance in the one
  Node process. The registry stays private to the WS module; only the fn is shared.
- **Pros:** ~30 lines, no infra, no-ops safely when WS isn't up (dev SSR, cloudflare, tests).
- **Cons:** single-process only — breaks if aidj ever runs >1 replica. "Global" smell.

### Option 2 — Postgres `LISTEN`/`NOTIFY` (future-proof)

The WS server `LISTEN feedback_events` on boot (it already holds a pg `sql` client for
`clearActiveDeviceIfMatches`). API routes `pg_notify('feedback_events', json)`; the WS
process delivers to the matching user's sockets.

- **Pros:** survives multi-replica (every replica LISTENs; whichever holds the user's socket
  delivers); clean process separation; no globals.
- **Cons:** more moving parts; a dedicated listen connection; 8KB payload cap (fine here).

### Option 3 — internal loopback HTTP — rejected (overkill in one process).

## Recommendation

Ship **Option 1** now, but put the call behind one helper —
`broadcastFeedbackChange(userId, { songId, liked })` — so the transport can be swapped to
Option 2 later without touching call sites. Wire the helper into the **single choke point
`setSongLiked()`** (PR A), so every server-side star write pushes automatically.

## Decisions (locked 2026-08-14)

1. **Transport:** `globalThis` bridge now, behind a `broadcastFeedbackChange()` helper so the
   transport can later swap to Postgres `NOTIFY` without touching call sites.
2. **Server-authoritative:** remove the client-side `sendPlaybackMessage('feedback_update', …)`
   emits (the ones #138 added *and* PlayerBar's original). The browser keeps its optimistic
   update and trusts the server push; #139 focus/reconnect refetch is the backstop. One source
   of truth, less UI plumbing.
3. **Granularity:** single-song `setSongLiked` emits `{ type:'feedback_update', songId, liked }`;
   bulk paths emit **one coalesced** `{ type:'feedback_refresh' }` when finished. Clients keep
   invalidating `feedback.all()` on either message.

## Implementation plan

**New module `src/lib/services/feedback-broadcast.ts`** (the swap-point; imports nothing from
`playback-websocket`, only touches `globalThis`, so it never bundles a second registry copy):

```ts
declare global {
  // installed by setupPlaybackWebSocket in the process that owns the sockets
  var __aidjBroadcastToUser: ((userId: string, message: Record<string, unknown>, log: string) => void) | undefined;
}
export function broadcastFeedbackChange(userId: string, songId: string, liked: boolean) {
  globalThis.__aidjBroadcastToUser?.(userId, { type: 'feedback_update', payload: { songId, liked } }, 'feedback_update');
}
export function broadcastFeedbackRefresh(userId: string) {
  globalThis.__aidjBroadcastToUser?.(userId, { type: 'feedback_refresh' }, 'feedback_refresh');
}
```

1. **Install the bridge** — `playback-websocket.ts` `setupPlaybackWebSocket()` sets
   `globalThis.__aidjBroadcastToUser = broadcastToAllDevices`. Both `server.ts` (prod) and the
   dev plugin call this, so the socket-owning process installs it; API routes in the same
   process read it. No-ops safely where WS isn't up.
2. **Emit from the choke point** — `setSongLiked()` (`liked-songs-sync.ts`) calls
   `broadcastFeedbackChange(userId, songId, liked)` after its writes succeed. Bulk owners
   (`rebuildLikedSongsPlaylist`, `syncLikedSongsToFeedback`) call `broadcastFeedbackRefresh(userId)`
   once at the end. (Confirm bulk paths don't loop through `setSongLiked` — they operate on the
   DB directly, so no per-song storm.)
3. **Client receiver** — `usePlaybackSync.handleIncomingMessage` handles `feedback_refresh` the
   same as `feedback_update` (dispatch `playback-feedback-update`). The server now *originates*
   these via `broadcastToAllDevices` (all devices, initiator included — refetch is idempotent).
4. **Remove client emits** — drop `sendPlaybackMessage('feedback_update', …)` from `HeartButton`,
   the playlist star toggle, and `PlayerBar` (keep optimistic updates). The inbound
   `feedback_update` relay case in `broadcastToUser` becomes dead but harmless.
5. **Tests** — `setSongLiked` calls `broadcastFeedbackChange` (mock the global fn); receiver
   dispatches on `feedback_refresh`.

Deploys only under node-server (`server.ts`) — no WS under `build:cloudflare`, unchanged.

## Scope note

This does not obsolete #139 — direct-in-Navidrome changes still need the focus/reconnect
refetch. It complements it by covering everything that flows through the app server.
