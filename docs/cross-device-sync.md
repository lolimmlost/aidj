# Cross-Device Playback Sync

Real-time playback synchronization between devices, similar to Spotify Connect. Uses WebSocket for instant updates and PostgreSQL for persistent state recovery.

## Architecture

```
┌──────────────┐         ┌──────────────┐
│   Device A   │         │   Device B   │
│  (iPhone)    │         │  (Desktop)   │
│              │         │              │
│ usePlayback  │         │ usePlayback  │
│   Sync.ts    │         │   Sync.ts    │
│      │       │         │      │       │
│  ┌───┴───┐   │         │  ┌───┴───┐   │
│  │ Audio  │   │         │  │ Audio  │   │
│  │ Store  │   │         │  │ Store  │   │
│  └───┬───┘   │         │  └───┬───┘   │
└──────┼───────┘         └──────┼───────┘
       │    WebSocket (real-time)│
       │  ┌─────────────────┐   │
       ├──►  WS Server      ◄───┤
       │  │  (relay only)   │   │
       │  └─────────────────┘   │
       │                        │
       │   REST API (persist)   │
       │  ┌─────────────────┐   │
       ├──►  /api/playback/ ◄───┤
       │  │    state        │   │
       │  └───────┬─────────┘   │
       │          │             │
       │  ┌───────▼─────────┐   │
       └──►   PostgreSQL    ◄───┘
          │ playback_       │
          │   sessions      │
          └─────────────────┘
```

## Components

### 1. Client: `usePlaybackSync.ts` (hook)

The main orchestration hook, mounted once at app level (in PlayerBar). Manages all sync concerns:

- **Store subscription** — watches Zustand audio store for meaningful changes (queue, play state, volume, shuffle). Stamps per-field timestamps on change.
- **Debounced sync** — queue/volume changes are debounced (2s) before pushing to server + broadcasting via WS. Play/pause changes are sent immediately.
- **WS message handling** — processes incoming `state`, `remote_command`, `transfer`, `sync_request`, and `feedback_update` messages.
- **Lifecycle handlers** — `visibilitychange`, `beforeunload`, `pagehide` for saving state on tab hide/close.

### 2. Client: `websocket.ts` (utility)

Reconnecting WebSocket wrapper using a `Proxy` object. Features:
- Exponential backoff with jitter (1s base, 30s max, 10 retries)
- Message queue (up to 100) for messages sent while disconnected
- Stable API across reconnections — callers hold one reference

### 3. Server: `playback-websocket.ts` (WS handler)

Stateless relay server. No playback logic — just routes messages between a user's devices:
- `state_update` → broadcast to other devices (not sender)
- `command` → broadcast to all devices (including sender)
- `transfer` → broadcast to all devices
- `sync_request` → broadcast to other devices
- `feedback_update` → broadcast to other devices
- `heartbeat` → acknowledge (60s timeout for dead connections)

Connection registry: `Map<userId, Set<WebSocket>>`

### 4. Server: `vite-ws-plugin.ts` (dev) / `server.ts` (prod)

Hooks into the HTTP server's `upgrade` event for `/ws/playback`. Resolves the `better-auth.session_token` cookie to a `userId` via direct DB query so multiple sessions for the same user are grouped.

### 5. Server: `/api/playback/state` (REST)

- **GET** — returns the user's `playback_sessions` row (or creates an empty one)
- **POST** — upserts with per-field timestamp conflict resolution (queue, position, play state each have independent timestamps; volume always accepted)

### 6. Database: `playback_sessions` table

One row per user. Stores queue (JSONB), position, play state, active device, and three timestamps for conflict resolution:

| Timestamp field | Covers |
|----------------|--------|
| `queue_updated_at` | queue, originalQueue, currentIndex, isShuffled |
| `position_updated_at` | currentPositionMs |
| `play_state_updated_at` | isPlaying, activeDeviceId |

## Conflict Resolution

All state merges use **per-field last-writer-wins** with ISO 8601 timestamps:

```
server.queueUpdatedAt >= local.queueUpdatedAt → apply server queue
server.positionUpdatedAt >= local.positionUpdatedAt → apply server position
```

Additional guards:
- **Local is playing** → never overwrite queue or position from server (local is authoritative)
- **Never auto-set isPlaying=true** → browser autoplay policy prevents it; only remote commands can start playback
- **Playback takeover** → if remote device starts playing and has a newer `playStateUpdatedAt`, local device pauses

## Message Flow: Key Scenarios

### Device Opens (fresh load / reconnect)

```
Device B (new)                    WS Server              Device A (existing)
     │                               │                         │
     │──── WS connect ──────────────►│                         │
     │◄─── onOpen ──────────────────│                         │
     │                               │                         │
     │──── sync_request ────────────►│──── sync_request ──────►│
     │                               │                         │
     │──── GET /api/playback/state ─────────────── (DB fetch) ──┤
     │                               │                         │
     │                               │◄── state_update ────────│ (if queue.length > 0)
     │◄─── state ───────────────────│                         │
     │                               │     POST /api/playback/state
     │                               │                         │
     │── applyServerState() ──       │                         │
```

Both WS and REST paths fire concurrently. `applyServerState` handles whichever arrives first (or both — idempotent via timestamps).

### Play/Pause (immediate broadcast)

```
Device A (user presses pause)     WS Server              Device B
     │                               │                         │
     │ store.setIsPlaying(false)     │                         │
     │ → subscription fires          │                         │
     │ → stamp playStateUpdatedAt    │                         │
     │                               │                         │
     │──── state_update ────────────►│──── state ─────────────►│
     │──── POST /api/playback/state  │                         │
     │                               │      applyServerState() │
```

### Queue Change (debounced)

```
Device A (adds song to queue)     WS Server              Device B
     │                               │                         │
     │ store.addToPlaylist()         │                         │
     │ → subscription fires          │                         │
     │ → stamp queueUpdatedAt        │                         │
     │ → debouncedSync.trigger()     │                         │
     │                               │                         │
     │ ─── (2 second debounce) ───   │                         │
     │                               │                         │
     │──── state_update ────────────►│──── state ─────────────►│
     │──── POST /api/playback/state  │                         │
```

### Tab Close / App Kill

```
Device A (closing)
     │
     │ beforeunload / pagehide fires
     │ → debouncedSync.cancel()
     │ → pushStateViaBeacon()
     │     └── navigator.sendBeacon('/api/playback/state', blob)
     │
     │ (fire-and-forget — browser sends even during teardown)
     │
     │ NOTE: iOS app-drawer swipe may kill process before
     │       these events fire. The last debounced push or
     │       play-state-change push is the fallback.
```

### Tab Hidden (visibility change)

```
Device A (tab goes to background)
     │
     │ visibilitychange → hidden
     │ → debouncedSync.flush()          ← always (saves pending queue changes)
     │ → pushStateToServer()            ← only if isPlaying (fresh position)
     │
     │ visibilitychange → visible
     │ → fetchAndReconcileState()       ← check for updates from other devices
```

## State Persistence

### What is persisted where

| Data | localStorage (Zustand persist) | PostgreSQL |
|------|-------------------------------|------------|
| Queue / position / timestamps | NO | YES |
| Volume | YES | YES |
| AI DJ prefs, crossfade, autoplay | YES | NO |
| Skip counts, recently played | YES | NO |

The Zustand `partialize` config explicitly excludes queue/position/timestamps from localStorage. The DB is the sole source of truth for playback state.

### Initial state timestamps

On fresh load, `queueUpdatedAt`, `positionUpdatedAt`, and `playStateUpdatedAt` initialize to empty strings (`''`). This ensures any server timestamp wins the comparison in `applyServerState`, so the DB queue is always applied on mount.

## File Reference

| File | Role |
|------|------|
| `src/lib/hooks/usePlaybackSync.ts` | Client orchestration hook |
| `src/lib/hooks/usePlaybackStateSync.ts` | Local playback recovery (screen lock, stall) |
| `src/lib/stores/audio.ts` | Zustand store with `applyServerState` |
| `src/lib/utils/websocket.ts` | Reconnecting WebSocket wrapper |
| `src/lib/services/playback-websocket.ts` | Server-side WS relay |
| `vite-ws-plugin.ts` | Dev server WS setup |
| `server.ts` | Production WS setup |
| `src/routes/api/playback/state.ts` | REST API for DB persistence |
| `src/lib/db/schema/playback-session.schema.ts` | DB schema |
| `src/lib/types/sync.ts` | Shared types (SyncSong, PlaybackStateResponse) |
