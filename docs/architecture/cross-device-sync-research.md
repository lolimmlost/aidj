# Cross-Device Sync Implementation Plan

**Date:** 2025-12-30 (research) / 2026-02-13 (revised implementation plan)
**Branch:** `feat/cross-device-sync`
**Architecture:** Hybrid WebSocket + REST (Option B + D combined)

---

## Existing Infrastructure Audit

Before implementing, the codebase already has significant scaffolding in place.

### Already Built

| Component | File | Status |
|---|---|---|
| WebSocket server | `src/lib/services/playback-websocket.ts` | Handles `state_update`, `command`, `transfer`, `sync_request`, `heartbeat` messages. Tracks connections per userId. |
| WS production entry | `server.ts` | HTTP server + WSS on `/ws/playback` with proper auth via `ws-session.ts` |
| WS dev plugin | `vite-ws-plugin.ts` | Registered in `vite.config.ts`. Dev-mode auth via session cookie. |
| WS auth | `src/lib/auth/ws-session.ts` | `getUserIdFromRequest()` validates better-auth session cookies. |
| Reconnecting WS client | `src/lib/utils/websocket.ts` | `createReconnectingWebSocket()` with exponential backoff, message queue, proxy pattern. |
| Device identification | `src/lib/utils/device.ts` | `getDeviceId()`, `getDeviceName()`, `getDeviceType()`, `getDeviceInfo()`. Persistent localStorage device IDs. |
| Listening history DB | `src/lib/db/schema/listening-history.schema.ts` | `listeningHistory` table with full metadata (artist, title, album, genre, duration, skip detection). |
| Record plays API | `src/routes/api/listening-history/record.ts` | `POST /api/listening-history/record` — already called when songs finish. |
| Audio store | `src/lib/stores/audio.ts` | Zustand + `persist` to localStorage. Manages playlist, index, volume, shuffle, AI DJ, crossfade, autoplay. |
| RecentlyPlayed UI | `src/components/layout/AppLayout.tsx` | `RecentlyPlayedSection` component (line ~896). Currently reads `recentlyPlayedIds` from audio store — **broken** because it can only resolve IDs that exist in the current playlist. |
| Song type | `src/lib/types/song.ts` | `{ id, name, title?, albumId, album?, duration, track, url, artist?, genre?, bpm?, key?, energy? }` |
| Stream proxy | Various | Songs stream via `/api/navidrome/stream/${song.id}` — all devices with valid app auth can stream. No Navidrome credential sharing needed. |

### Not Yet Built

| Component | Needed For | Phase |
|---|---|---|
| `GET /api/listening-history/recent` endpoint | Recently played sidebar fix | 1 |
| RecentlyPlayedSection DB fetch | Cross-device recently played | 1 |
| `playback_sessions` Drizzle schema + migration | Server-side state persistence | 2 |
| `devices` Drizzle schema + migration | Device registry | 2 |
| `GET/POST /api/playback/state` endpoints | State sync REST API | 2 |
| `usePlaybackSync` hook | Client-side WS consumer + sync logic | 2 |
| Audio store sync integration | Debounced state push, server state pull | 2 |
| Transfer playback UI | "Continue on this device?" prompt | 3 |
| Device switcher UI | Show/select active devices in player | 3 |
| Remote control handling | Apply incoming WS commands to local player | 3 |

---

## Decisions (Resolving Open Questions)

These were open in the original research. Decided now:

| Question | Decision | Rationale |
|---|---|---|
| Transfer vs automatic sync? | **Explicit transfer** (Spotify model) | Prevents jarring interruptions. User controls when playback moves. |
| How real-time? | **WebSocket** (already built) | Infrastructure exists. No polling needed. |
| Queue size limit? | **500 songs max** in `playback_sessions` | Covers all realistic use. Truncate oldest on overflow. |
| Sync playback position? | **Yes, to the second** | Small overhead, big UX win for resume. |
| Offline queue changes? | **Last-write-wins per field** with timestamp | Simple, predictable. See conflict resolution section. |
| Multiple devices playing? | **One active device at a time** | Spotify model. Other devices show "Playing on [Device]" and can remote control. |
| `isPlaying` on transfer? | **User gesture required** — transfer button click counts as gesture | Browsers block autoplay. Transfer button click = user interaction = can call `audio.play()`. |

---

## Phase 1: Recently Played from DB (Bug Fix)

**Goal:** Fix the broken `RecentlyPlayedSection` sidebar. Show cross-device play history with full metadata.

### 1.1 Add `GET /api/listening-history/recent` endpoint

**File:** `src/routes/api/listening-history/recent.ts`

```
GET /api/listening-history/recent?limit=20

Response:
{
  history: [
    {
      id: string,           // listening_history row ID
      songId: string,       // Navidrome song ID
      artist: string,
      title: string,
      album: string | null,
      genre: string | null,
      playedAt: string,     // ISO timestamp
      completed: boolean,
      albumId?: string      // For cover art resolution
    }
  ]
}
```

Implementation:
- Auth check via `auth.api.getSession()`
- Query `listeningHistory` table: `WHERE userId = ? ORDER BY playedAt DESC LIMIT ?`
- Default limit 20, max 50
- Deduplicate by songId (show most recent play only) — `DISTINCT ON (song_id)` or application-level dedup

### 1.2 Update `RecentlyPlayedSection` in `AppLayout.tsx`

Current code (broken):
```typescript
const { recentlyPlayedIds } = useAudioStore();
const recentSongs = recentlyPlayedIds
  .slice(0, 5)
  .map(id => songMap.get(id))  // Can only resolve songs in current playlist!
  .filter(Boolean);
```

New approach:
```typescript
// Fetch from DB via React Query
const { data: recentHistory } = useQuery({
  queryKey: ['listening-history', 'recent'],
  queryFn: () => fetch('/api/listening-history/recent?limit=10').then(r => r.json()),
  staleTime: 30_000,       // Refetch every 30s
  refetchOnWindowFocus: true,
});

// Map DB records to displayable songs
const recentSongs = recentHistory?.history ?? [];
```

- Keep `recentlyPlayedIds` in audio store for shuffle algorithm (it serves a different purpose)
- Invalidate the query when a new song play is recorded (after `recordSongPlay` succeeds)
- Show album art via existing `getCoverArtUrl(albumId)` helper
- Show "played 5 min ago" relative timestamps

### 1.3 Song play recording already works

`POST /api/listening-history/record` is already called by the player. No changes needed here.

### Phase 1 Files Changed

| File | Change |
|---|---|
| `src/routes/api/listening-history/recent.ts` | **New** — GET endpoint |
| `src/components/layout/AppLayout.tsx` | Update `RecentlyPlayedSection` to use React Query |

---

## Phase 2: Playback State Sync (Hybrid Model)

**Goal:** Persist playback state to server. Resume on any device. Real-time sync via existing WebSocket.

### 2.1 Database Schema

**File:** `src/lib/db/schema/playback-session.schema.ts`

```typescript
export const playbackSessions = pgTable("playback_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),  // One session per user

  // Active device
  activeDeviceId: text("active_device_id"),
  activeDeviceName: text("active_device_name"),
  activeDeviceType: text("active_device_type"),  // 'mobile' | 'tablet' | 'desktop'

  // Queue state — store minimal Song fields only (see SyncSong type)
  queue: jsonb("queue").notNull().$type<SyncSong[]>().default([]),
  originalQueue: jsonb("original_queue").$type<SyncSong[]>().default([]),
  currentIndex: integer("current_index").notNull().default(0),

  // Playback state
  currentPositionMs: integer("current_position_ms").default(0),
  isPlaying: boolean("is_playing").default(false),
  volume: real("volume").default(0.5),
  isShuffled: boolean("is_shuffled").default(false),

  // Per-field timestamps for conflict resolution
  queueUpdatedAt: timestamp("queue_updated_at").notNull().defaultNow(),
  positionUpdatedAt: timestamp("position_updated_at").notNull().defaultNow(),
  playStateUpdatedAt: timestamp("play_state_updated_at").notNull().defaultNow(),

  // Overall timestamp
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

**File:** `src/lib/db/schema/devices.schema.ts`

```typescript
export const devices = pgTable("devices", {
  id: text("id").primaryKey(),  // Client-generated device ID from getDeviceId()
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull(),  // 'mobile' | 'tablet' | 'desktop'
  userAgent: text("user_agent"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("devices_user_id_idx").on(table.userId),
}));
```

### 2.2 SyncSong Type (Minimal Song for Queue Serialization)

**File:** `src/lib/types/sync.ts`

Only store what's needed to reconstruct the queue. Omit derived/large fields.

```typescript
/** Minimal song data stored in playback_sessions.queue JSONB */
export type SyncSong = {
  id: string;        // Navidrome song ID
  name: string;      // Song name
  title?: string;    // Alternative title
  albumId: string;   // For cover art
  album?: string;    // Album name
  duration: number;  // Song duration in seconds
  track: number;     // Track number
  artist?: string;   // Artist name
  genre?: string;    // Genre
  bpm?: number;      // For DJ matching
  key?: string;      // Musical key
  energy?: number;   // Energy level
};
// Note: `url` is omitted — reconstructed client-side as `/api/navidrome/stream/${id}`
```

Convert `Song <-> SyncSong`:
```typescript
function toSyncSong(song: Song): SyncSong {
  const { url, ...rest } = song;
  return rest;
}

function fromSyncSong(sync: SyncSong): Song {
  return { ...sync, url: `/api/navidrome/stream/${sync.id}` };
}
```

### 2.3 REST API Endpoints

**File:** `src/routes/api/playback/state.ts`

```
GET /api/playback/state
→ Returns current playback session for authenticated user
→ Creates empty session if none exists (upsert)

POST /api/playback/state
Body: {
  queue?: SyncSong[],
  originalQueue?: SyncSong[],
  currentIndex?: number,
  currentPositionMs?: number,
  isPlaying?: boolean,
  volume?: number,
  isShuffled?: boolean,
  deviceId: string,
  deviceName: string,
  deviceType: string,
  // Per-field timestamps from client
  queueUpdatedAt?: string,
  positionUpdatedAt?: string,
  playStateUpdatedAt?: string,
}
→ Upserts session with per-field conflict resolution
→ Returns merged state
```

**File:** `src/routes/api/playback/devices.ts`

```
GET /api/playback/devices
→ Returns list of user's devices (last seen < 30 days)

POST /api/playback/devices/register
Body: { deviceId, deviceName, deviceType, userAgent }
→ Upserts device record, updates lastSeenAt

POST /api/playback/transfer
Body: { targetDeviceId: string, play: boolean }
→ Updates activeDeviceId in playback_sessions
→ Broadcasts transfer event via WebSocket
```

### 2.4 Per-Field Conflict Resolution

The key insight: different fields change at different rates and for different reasons. Whole-state replacement loses data.

```
Scenario: Phone is offline, plays songs. Tablet changes volume.
Phone comes online, pushes state.

With whole-state replacement: Phone overwrites tablet's volume change.
With per-field resolution: Phone's queue wins (newer), tablet's volume wins (newer).
```

**Strategy:** Each sync field group has its own timestamp:
- `queueUpdatedAt` — covers `queue`, `originalQueue`, `currentIndex`, `isShuffled`
- `positionUpdatedAt` — covers `currentPositionMs`
- `playStateUpdatedAt` — covers `isPlaying`, `activeDeviceId`

Server compares incoming timestamps against stored timestamps. For each group, the newer timestamp wins. Response returns the merged result.

### 2.5 `usePlaybackSync` Hook (Client-Side WS Consumer)

**File:** `src/lib/hooks/usePlaybackSync.ts`

This is the missing piece that connects the existing WebSocket infrastructure to the audio store.

```typescript
export function usePlaybackSync() {
  const wsRef = useRef<WebSocket | null>(null);
  const deviceInfo = useMemo(() => getDeviceInfo(), []);

  useEffect(() => {
    // 1. Register device on mount
    fetch('/api/playback/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(deviceInfo),
    });

    // 2. Connect to WebSocket
    const ws = createReconnectingWebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/playback`,
      {
        onOpen: () => {
          // Request current state from other devices
          ws.send(JSON.stringify({
            type: 'sync_request',
            deviceId: deviceInfo.deviceId,
          }));
        },
        onMessage: (event) => {
          const msg = JSON.parse(event.data);
          handleIncomingMessage(msg);
        },
      }
    );
    wsRef.current = ws;

    // 3. Fetch server state on mount (REST fallback if no other devices online)
    fetchAndReconcileState();

    // 4. Subscribe to audio store — debounced push to server + WS broadcast
    const unsub = useAudioStore.subscribe(
      debounce((state) => {
        pushStateToServer(state);
        broadcastStateViaWS(ws, state);
      }, 2000)
    );

    // 5. Immediate sync on visibility change (app backgrounding)
    const onVisChange = () => {
      if (document.hidden) {
        const state = useAudioStore.getState();
        pushStateToServer(state);  // Immediate, not debounced
      } else {
        fetchAndReconcileState();   // Coming back — check for updates
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    // 6. Heartbeat every 30s to keep WS alive
    const heartbeat = setInterval(() => {
      ws.send(JSON.stringify({ type: 'heartbeat', deviceId: deviceInfo.deviceId }));
    }, 30000);

    return () => {
      unsub();
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisChange);
      ws.close();
    };
  }, []);
}
```

### 2.6 Audio Store Integration Points

The audio store (`src/lib/stores/audio.ts`) needs these additions:

1. **Add `updatedAt` timestamp tracking** — set on every state mutation that should sync:
   - `queueUpdatedAt`: updated by `setPlaylist`, `addToQueueNext`, `addToQueueEnd`, `removeFromQueue`, `clearQueue`, `reorderQueue`, `shufflePlaylist`, `unshufflePlaylist`, `nextSong`
   - `positionUpdatedAt`: updated by `setCurrentTime` (but only written to server on debounce/visibility change, not every tick)
   - `playStateUpdatedAt`: updated by `setIsPlaying`

2. **Add `applyServerState(serverState)` action** — called by `usePlaybackSync` when server state is newer:
   ```typescript
   applyServerState: (server: PlaybackSessionState) => {
     const local = get();
     const merged: Partial<AudioState> = {};

     // Per-field merge: only apply fields where server is newer
     if (server.queueUpdatedAt > local.queueUpdatedAt) {
       merged.playlist = server.queue.map(fromSyncSong);
       merged.originalPlaylist = server.originalQueue.map(fromSyncSong);
       merged.currentSongIndex = server.currentIndex;
       merged.isShuffled = server.isShuffled;
     }
     if (server.positionUpdatedAt > local.positionUpdatedAt) {
       merged.currentTime = server.currentPositionMs / 1000;
     }
     // isPlaying: never auto-set to true (browser autoplay policy)
     // Only show "Playing on [Device]" indicator if another device is active

     set(merged);
   }
   ```

3. **Integrate with existing `wasPlayingBeforeUnload` recovery** — the existing WiFi reconnect mechanism should coexist:
   - `wasPlayingBeforeUnload` handles same-device page refresh recovery
   - Cross-device transfer handles different-device resume
   - Both use `pendingPlaybackResume` but with different triggers

### 2.7 Queue Size Enforcement

In `POST /api/playback/state`, before saving:
```typescript
if (queue.length > 500) {
  // Keep current song + next 499
  queue = queue.slice(currentIndex, currentIndex + 500);
  currentIndex = 0;
}
```

### Phase 2 Files Changed/Created

| File | Change |
|---|---|
| `src/lib/db/schema/playback-session.schema.ts` | **New** — Drizzle schema |
| `src/lib/db/schema/devices.schema.ts` | **New** — Drizzle schema |
| `src/lib/db/schema/index.ts` | Add exports for new schemas |
| `drizzle/XXXX_playback_sessions.sql` | **New** — Migration |
| `src/lib/types/sync.ts` | **New** — SyncSong type + converters |
| `src/routes/api/playback/state.ts` | **New** — GET/POST state endpoint |
| `src/routes/api/playback/devices.ts` | **New** — Device registry endpoints |
| `src/routes/api/playback/transfer.ts` | **New** — Transfer playback endpoint |
| `src/lib/hooks/usePlaybackSync.ts` | **New** — Client WS consumer + sync orchestration |
| `src/lib/stores/audio.ts` | Add timestamp fields, `applyServerState`, sync metadata to `partialize` |
| `src/components/layout/PlayerBar.tsx` | Mount `usePlaybackSync` hook |

---

## Phase 3: Transfer Playback UX

**Goal:** Spotify Connect-like device management. "Continue on this device?" prompt. Remote control.

### 3.1 WebSocket Message Handling (extend existing)

The existing `playback-websocket.ts` already handles these message types:
- `state_update` — broadcast state to other devices
- `command` — forward play/pause/next/prev/seek/volume/shuffle commands
- `transfer` — notify all devices about transfer
- `sync_request` — request state from other devices

**New client-side handling needed** in `usePlaybackSync`:

```typescript
function handleIncomingMessage(msg: WSMessage) {
  switch (msg.type) {
    case 'state':
      // Another device pushed state — update server indicator
      // DON'T auto-apply to local player (would interrupt playback)
      setRemotePlaybackState(msg.payload);
      break;

    case 'remote_command':
      // Another device sent a command — apply to local player
      applyRemoteCommand(msg.payload);
      break;

    case 'transfer':
      // Playback transferred TO this device
      if (msg.payload.targetDeviceId === deviceInfo.deviceId) {
        applyTransferredState(msg.payload);
      } else {
        // Transferred AWAY from this device
        pauseAndShowRemoteIndicator(msg.payload);
      }
      break;

    case 'sync_request':
      // Another device wants current state — send it
      if (useAudioStore.getState().isPlaying) {
        sendCurrentState();
      }
      break;
  }
}
```

### 3.2 `isPlaying` and Browser Autoplay Policy

Browsers block `audio.play()` without user interaction. The transfer flow handles this:

1. User clicks "Continue on this device" button on Device B
2. Button click = user gesture = browser allows `audio.play()`
3. `POST /api/playback/transfer` sets Device B as active
4. Server broadcasts `transfer` event via WS
5. Device A receives transfer, pauses playback, shows "Playing on [Device B name]"
6. Device B applies queue + position, calls `audio.play()` (allowed because user clicked)

For `sync_request` responses (app open, no explicit transfer):
- Apply queue and position silently
- Show "Resume playback?" mini-prompt in player bar if another device was recently playing
- User taps prompt = user gesture = can play

### 3.3 Transfer Playback UI Components

**Device indicator in PlayerBar:**
```
┌─────────────────────────────────────────────┐
│ ▶  Song Name - Artist     [🔊] [📱 iPhone] │
│    ━━━━━━━━━━━━━○──────   Playing on iPhone │
└─────────────────────────────────────────────┘
```

Clicking the device indicator opens a device picker dropdown:

```
┌──────────────────────────┐
│  Available Devices       │
│  ──────────────────────  │
│  📱 iPhone      ● Active │
│  💻 Mac Desktop          │
│  📱 Android Tablet       │
│                          │
│  [Transfer to this device]│
└──────────────────────────┘
```

**Files:**
- `src/components/layout/DeviceIndicator.tsx` — device icon + name in player bar
- `src/components/layout/DevicePicker.tsx` — dropdown with device list + transfer button

### 3.4 Remote Control

When another device is active, the local player shows remote control mode:
- Play/pause/next/prev buttons send WS `command` messages instead of local actions
- Volume slider sends WS `command` with `action: 'volume'`
- Seek slider sends WS `command` with `action: 'seek'`

### Phase 3 Files Changed/Created

| File | Change |
|---|---|
| `src/lib/hooks/usePlaybackSync.ts` | Add remote command handling, transfer logic |
| `src/components/layout/DeviceIndicator.tsx` | **New** — device status in player bar |
| `src/components/layout/DevicePicker.tsx` | **New** — device list dropdown |
| `src/components/layout/PlayerBar.tsx` | Add DeviceIndicator, remote control mode |
| `src/lib/stores/audio.ts` | Add `remoteDevice` state, `isRemoteControlMode` |

---

## Edge Cases & Error Handling

### Server Restart

WebSocket connections are in-memory (`Map<string, Set<WebSocket>>`). On server restart:
- All WS connections drop
- `createReconnectingWebSocket` auto-reconnects with exponential backoff
- Client re-sends `sync_request` on reconnect
- No data loss because state is persisted in DB via REST

This is acceptable for a single-instance self-hosted app.

### Stale Device Cleanup

Devices table entries with `lastSeenAt` older than 30 days are excluded from `GET /api/playback/devices`. A periodic cleanup (or lazy cleanup on device list fetch) removes entries older than 90 days.

### Race Conditions

Two devices both change the queue simultaneously:
- Per-field timestamps prevent full overwrites
- Last write wins within a field group
- WS broadcasts ensure both devices converge quickly (within 2s debounce window)

### Offline Recovery

- Device goes offline while playing
- Zustand persist saves state to localStorage (existing behavior)
- On reconnect, `usePlaybackSync` pushes state to server via REST
- Per-field merge ensures offline changes don't clobber online changes from other devices

### Large Queue Performance

- Queue JSONB capped at 500 songs
- `SyncSong` type is ~200 bytes per song (vs ~300+ for full `Song`)
- 500 songs = ~100KB JSONB — well within Postgres limits
- WS broadcasts send full state on queue change — for 500 songs this is ~100KB per broadcast, acceptable for LAN/WiFi

---

## Migration Plan

### Drizzle Migration

```sql
CREATE TABLE playback_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  active_device_id TEXT,
  active_device_name TEXT,
  active_device_type TEXT,
  queue JSONB NOT NULL DEFAULT '[]',
  original_queue JSONB DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  current_position_ms INTEGER DEFAULT 0,
  is_playing BOOLEAN DEFAULT false,
  volume REAL DEFAULT 0.5,
  is_shuffled BOOLEAN DEFAULT false,
  queue_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  position_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  play_state_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX devices_user_id_idx ON devices(user_id);
```

### Rollback Strategy

All new features are additive. Rollback = revert the branch. Existing localStorage-based playback continues working without the server sync layer.

---

## Implementation Order

```
Phase 1 (bug fix, standalone value):
  1.1  GET /api/listening-history/recent endpoint
  1.2  Update RecentlyPlayedSection to use React Query

Phase 2 (core sync):
  2.1  Drizzle schemas + migration (playback_sessions, devices)
  2.2  SyncSong type + converters
  2.3  REST endpoints (state, devices, transfer)
  2.4  usePlaybackSync hook (WS consumer + sync orchestration)
  2.5  Audio store additions (timestamps, applyServerState)
  2.6  Mount usePlaybackSync in PlayerBar

Phase 3 (UX polish):
  3.1  DeviceIndicator component
  3.2  DevicePicker dropdown
  3.3  Remote command handling in usePlaybackSync
  3.4  Remote control mode in PlayerBar
  3.5  "Resume playback?" prompt
```

Each phase is independently deployable and provides value on its own.

---

## References

- [Spotify Engineering - Client Architecture](https://engineering.atspotify.com/2020/05/spotify-modernizes-client-side-architecture-to-accelerate-service-on-all-devices/)
- [Spotify Transfer Playback API](https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback)
- [Spotify Recently Played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
- [Spotify Connect Architecture](https://developer.spotify.com/documentation/commercial-hardware/implementation/guides/connect-basics)
