# Server-Owned Queue & Multi-Device Sync Architecture

## Status: Draft / Design Phase

## Problem Statement

AIDJ currently stores all playback state client-side in localStorage via Zustand persist:

- `audio-player-storage`: playlist + originalPlaylist + AI DJ state (~2-10MB with large queues)
- `set-builder-storage`: unbounded DJ set history
- `discovery-queue-storage`: 7-day cleanup only on rehydration

This causes:
1. **localStorage bloat** — multi-MB serialization of full Song arrays on every state change
2. **No cross-device continuity** — state is trapped in one browser tab
3. **No multi-user isolation** — liked songs, feedback, and queue are not separated per user
4. **Browser tab fragility** — backgrounding loses audio resources, and state can't recover from another device

## Goals

1. Move queue/playlist state to the server (single source of truth)
2. Real-time sync across devices via WebSocket
3. Per-user data isolation (liked songs, queue, preferences)
4. Navidrome ecosystem compatibility (Subsonic clients can participate)
5. Incremental adoption — existing audio pipeline stays client-side

---

## Architecture Overview

```
┌────────────────────────────────────────────────────┐
│                    AIDJ Server                      │
│                                                     │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Queue State  │  │ WebSocket│  │   Subsonic    │ │
│  │   Service    │◄─┤  Hub     │◄─┤   Bridge      │ │
│  │ (per-user)   │  │          │  │  (polling)    │ │
│  └──────┬───────┘  └────┬─────┘  └──────┬────────┘ │
│         │               │               │          │
│  ┌──────▼───────┐       │               │          │
│  │  PostgreSQL   │       │               │          │
│  │  (persisted)  │       │               │          │
│  └───────────────┘       │               │          │
└──────────────────────────┼───────────────┼──────────┘
                           │               │
              ┌────────────┼────────┐      │
              │            │        │      │
        ┌─────▼─────┐ ┌───▼───┐ ┌──▼──┐ ┌─▼──────────┐
        │ Phone     │ │Laptop │ │ Pad │ │ DSub /      │
        │ (remote)  │ │(ACTV) │ │(rem)│ │ Symfonium   │
        └───────────┘ └───────┘ └─────┘ └─────────────┘
         WebSocket     WebSocket  WS     Subsonic REST
```

### Separation of Concerns

| Layer | Owns | Protocol |
|-------|------|----------|
| **Queue State Service** | What to play, in what order, at what position | Internal (in-process) |
| **WebSocket Hub** | Real-time bidirectional sync between devices | WebSocket (JSON) |
| **Subsonic Bridge** | Compatibility with DSub, Symfonium, etc. | Subsonic REST (polling) |
| **Client Audio Engine** | Actual `<audio>` playback, crossfade, Media Session | Existing PlayerBar.tsx |

The client's audio engine stays exactly as-is. The server just tells it *what* to play.

---

## Why WebSocket (Not SSE + REST)

SSE + REST works for low-frequency discrete events. Multi-device playback sync requires **high-frequency bidirectional** communication:

| Interaction | Updates/sec | SSE+REST overhead | WebSocket overhead |
|---|---|---|---|
| Seek scrubbing | 15-30 | 15-30 HTTP POSTs/sec (200-800 bytes headers each) | 15-30 frames/sec (6 bytes overhead each) |
| Volume sliding | 10-20 | Same HTTP overhead | Same tiny frames |
| Position heartbeat | 0.1-0.2 | Awkward (which direction?) | Natural bidirectional ping |
| Play/pause/skip | <1 | Acceptable | Better |

**Latency comparison:**
- REST + SSE: ~72ms (LAN) to ~170ms (internet) per action
- WebSocket: ~5ms (LAN) to ~52ms (internet) per action

For real-time scrubbing and volume control across devices, WebSocket is required. Starting with WebSocket avoids a future migration from SSE.

### Implementation Choice

| Option | Decision | Rationale |
|--------|----------|-----------|
| `ws` vs Socket.IO | **`ws`** | Socket.IO adds 10.4KB bundle + unnecessary rooms/namespaces for 1-10 devices |
| JSON vs Protobuf | **JSON** | Protobuf adds 40KB bundle + build step; not justified for personal server |
| Redis pub/sub | **No** | Single instance handles 1-10 connections in-memory |
| Nitro `defineWebSocketHandler` | **Preferred** | Native support via crossws; fallback to separate port if TanStack Start integration isn't ready |

---

## WebSocket Protocol

### Connection Lifecycle

```
Client                          Server
  │                               │
  │──── WS Connect + auth ───────>│
  │<─── connection_ack ───────────│  (includes connection_id)
  │                               │
  │──── device_announce ─────────>│  (device name, type, capabilities)
  │<─── state_snapshot ───────────│  (full PlayerClusterState)
  │                               │
  │<─── device_joined ───────────>│  (broadcast to other devices)
  │                               │
  │──── ping (every 15s) ────────>│
  │<─── pong ─────────────────────│
  │                               │
  │──── command (play/pause/etc) ─>│
  │<─── state_delta ──────────────│  (broadcast to ALL devices)
  │                               │
  │ [disconnect / visibility hide] │
  │                               │
  │──── WS Reconnect + auth ─────>│
  │<─── state_snapshot ───────────│  (full state, reconcile)
```

### Message Types

**Client -> Server:**

```typescript
type ClientMessage =
  // Connection management
  | { type: 'ping'; timestamp: number }
  | { type: 'sync_request' }
  | { type: 'device_announce'; device: DeviceInfo }

  // Playback control
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionMs: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'volume'; level: number }
  | { type: 'shuffle'; enabled: boolean }
  | { type: 'repeat'; mode: 'off' | 'all' | 'one' }

  // Queue management
  | { type: 'load'; contextUri: string; trackIds: string[]; startIndex: number; positionMs: number }
  | { type: 'queue_add'; trackId: string; position?: number }
  | { type: 'queue_remove'; index: number }
  | { type: 'queue_reorder'; from: number; to: number }
  | { type: 'queue_clear' }

  // Device transfer
  | { type: 'transfer'; targetDeviceId: string }
  | { type: 'claim_active' }

  // Position reporting (from active device)
  | { type: 'position_report'; positionMs: number; timestamp: number }

  // Liked songs
  | { type: 'like'; trackId: string }
  | { type: 'unlike'; trackId: string }
```

**Server -> Client:**

```typescript
type ServerMessage =
  | { type: 'connection_ack'; connectionId: string; serverTime: number }
  | { type: 'pong'; timestamp: number; serverTime: number }
  | { type: 'state_snapshot'; state: PlayerClusterState }
  | { type: 'state_delta'; changes: Partial<PlayerClusterState>; seq: number }
  | { type: 'device_joined'; device: DeviceInfo }
  | { type: 'device_left'; deviceId: string }
  | { type: 'transfer_request'; fromDevice: string; positionMs: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'liked_update'; trackIds: string[] }
```

### Cluster State (Server-Side, Per-User)

```typescript
interface PlayerClusterState {
  userId: string;
  activeDeviceId: string | null;

  playerState: {
    contextUri: string | null;       // e.g. "playlist:abc123", "album:xyz"
    trackId: string | null;
    positionMs: number;
    durationMs: number;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: 'off' | 'all' | 'one';
    volume: number;                  // 0-100
    timestamp: number;               // server time when position was recorded
  };

  queue: QueueTrack[];               // track IDs + metadata refs (not full Song objects)
  originalQueue: QueueTrack[];       // pre-shuffle order

  devices: Record<string, DeviceInfo & {
    isActive: boolean;
    lastSeen: number;
  }>;

  // AI DJ state
  aiDJ: {
    enabled: boolean;
    recentlyRecommended: Array<{ trackId: string; artist: string; timestamp: number }>;
    songsPlayedSinceLastRec: number;
    artistBatchCounts: Record<string, number>;
  };

  seq: number;                       // monotonic sequence number
}

interface QueueTrack {
  trackId: string;
  source: 'user' | 'ai-dj' | 'autoplay';
  addedAt: number;
}

interface DeviceInfo {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'desktop';
  capabilities: {
    canPlayAudio: boolean;
    canControlVolume: boolean;
    supportsCrossfade: boolean;
  };
}
```

### State Reconciliation

**Last-write-wins with sequence numbers.** Music playback is a single-cursor problem, not collaborative editing. No CRDTs or vector clocks needed.

```typescript
// On reconnect: server sends full snapshot
// Client discards local state if server seq is higher
function reconcile(local: PlayerClusterState, server: PlayerClusterState): PlayerClusterState {
  if (server.seq >= local.seq) {
    // Interpolate position if playing
    if (server.playerState.isPlaying) {
      const elapsed = Date.now() - server.playerState.timestamp;
      server.playerState.positionMs += elapsed;
    }
    return server;
  }
  return local;
}
```

**Conflict handling:** If two devices send commands simultaneously (phone says "pause", tablet says "next"), server processes in arrival order. Both devices receive the final authoritative state. This matches Spotify's approach.

---

## Multi-User Model

### Current State

- **AIDJ auth**: better-auth with per-user sessions (`session.user.id`)
- **Navidrome**: Single shared account (`config.navidromeUsername`)
- **Stars**: Shared — `starSong()` uses the shared Navidrome credential
- **Feedback**: Per-user in AIDJ's DB (`recommendation_feedback` table)
- **Playlists**: Per-user in AIDJ's DB (`userPlaylists` table with `userId`)

### What Changes

| Data | Current Owner | New Owner | Isolation |
|------|--------------|-----------|-----------|
| Queue/playlist | localStorage (global) | Server (per-user) | Full |
| Playback position | localStorage (global) | Server (per-user) | Full |
| AI DJ state | localStorage (global) | Server (per-user) | Full |
| Liked songs | Shared Navidrome stars | Per-user hidden playlist | Full |
| Feedback/ratings | AIDJ DB (per-user) | No change | Already isolated |
| Navidrome library | Shared account | No change | Shared (read-only) |

---

## Per-User Liked Songs via Hidden Playlists

### Problem

Currently `starSong()` / `unstarSong()` uses the shared Navidrome credential. All AIDJ users share the same star list. User A liking a song makes it appear liked for User B.

### Solution: Per-User Hidden Playlist

Instead of using Navidrome's native star/unstar, each AIDJ user gets a dedicated Navidrome playlist that acts as their personal "liked songs" collection.

```
Navidrome playlists:
├── _aidj_liked_user_abc123    (User A's likes, hidden)
├── _aidj_liked_user_def456    (User B's likes, hidden)
├── My Custom Playlist          (normal user-visible playlist)
└── ...
```

### How It Works

**On first login / first like:**
1. AIDJ creates a Navidrome playlist via Subsonic API: `createPlaylist(name="_aidj_liked_{userId}")`
2. Store the Navidrome playlist ID in AIDJ's DB linked to the user
3. Playlist uses `_aidj_` prefix convention to identify managed playlists

**On like (thumbs up):**
1. Add track to the user's hidden playlist: `updatePlaylist(playlistId, songIdToAdd)`
2. Record in AIDJ's `recommendation_feedback` table (existing behavior)
3. Optionally: still call `starSong()` if this user is the "primary" Navidrome user (preserves existing behavior for the account owner)

**On unlike (thumbs down / remove):**
1. Remove track from the user's hidden playlist: `updatePlaylist(playlistId, songIndexToRemove)`
2. Update AIDJ's feedback table

**On sync / page load:**
1. Fetch the user's hidden playlist contents from Navidrome
2. This becomes their "liked songs" in the UI
3. Other Subsonic clients (DSub, Symfonium) can see and play these playlists

### Schema Addition

```sql
-- Map AIDJ users to their Navidrome liked playlist
CREATE TABLE user_navidrome_playlists (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  playlist_type TEXT NOT NULL DEFAULT 'liked',  -- 'liked', 'queue', etc.
  navidrome_playlist_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, playlist_type)
);
```

### Visibility

Navidrome's Subsonic API supports playlist visibility:
- `public=false` on `createPlaylist` makes it private to the creating user
- Since all AIDJ users share one Navidrome account, "private" means private to that account (all AIDJ users can technically see it via Subsonic)
- The `_aidj_` prefix convention lets the UI filter these out of normal playlist views
- True per-user visibility requires per-user Navidrome accounts (future enhancement)

### Migration Path

1. **Phase 1**: Create hidden playlists for new likes. Keep existing star-based sync as fallback.
2. **Phase 2**: Migrate existing `recommendation_feedback` thumbs_up entries into per-user playlists.
3. **Phase 3**: (Optional) Remove star-based sync entirely, or keep it for the primary/admin user.

---

## Navidrome Bridge (Subsonic Compatibility)

### Purpose

Allow Subsonic clients (DSub, Symfonium, Substreamer) to participate in the queue sync — not real-time, but eventually consistent.

### How It Works

```typescript
class SubsonicBridge {
  // When WebSocket state changes -> persist to Navidrome
  async onStateChange(state: PlayerClusterState) {
    await navidromeApi.savePlayQueue({
      id: state.queue.map(t => t.trackId),
      current: state.playerState.trackId,
      position: Math.floor(state.playerState.positionMs / 1000),
    });
  }

  // Poll Navidrome for changes from external Subsonic clients
  startPolling(userId: string, intervalMs = 5000) {
    setInterval(async () => {
      const queue = await navidromeApi.getPlayQueue();
      if (this.hasChanged(queue, userId)) {
        syncEngine.applyExternalChange(userId, {
          type: 'load',
          trackIds: queue.entries.map(e => e.id),
          startIndex: queue.currentIndex,
          positionMs: queue.position * 1000,
        });
      }
    }, intervalMs);
  }
}
```

### Limitations

- Subsonic clients experience 5-10s latency (polling interval)
- No real-time scrubbing or volume control from Subsonic clients
- Queue changes from Subsonic clients are detected on next poll
- Subsonic API's `savePlayQueue` is per-authenticated-user — with a shared Navidrome account, all AIDJ users overwrite the same queue (per-user Navidrome accounts would fix this)

---

## Client-Side Changes

### What Gets Removed from localStorage

| Current Key | Size | Replacement |
|---|---|---|
| `audio-player-storage` (playlist, originalPlaylist, AI DJ state) | 2-10MB | Server-owned queue state |
| `set-builder-storage` (unbounded history) | Variable | Server DB |
| `songCache` in generate.tsx | Variable | Server-side cache or TanStack Query |

### What Stays Client-Side

| Data | Reason |
|---|---|
| Audio elements, crossfade logic | Browser-only concern |
| Media Session / lock screen controls | Browser API |
| Theme, debug flags | Trivial, device-specific |
| TanStack Query cache | Framework-managed, auto-evicts |

### New Client Architecture

```typescript
// Before: Zustand store with localStorage persist
const useAudioStore = create(persist(
  (set, get) => ({ playlist: [], currentSongIndex: 0, ... }),
  { name: 'audio-player-storage', storage: localStorage }
));

// After: Zustand store backed by WebSocket
const useAudioStore = create((set, get) => ({
  // State comes FROM the server via WebSocket
  cluster: null as PlayerClusterState | null,

  // Commands go TO the server via WebSocket
  play: () => ws.send({ type: 'play' }),
  pause: () => ws.send({ type: 'pause' }),
  next: () => ws.send({ type: 'next' }),
  seek: (ms) => ws.send({ type: 'seek', positionMs: ms }),
  like: (id) => ws.send({ type: 'like', trackId: id }),

  // Server pushes state updates back
  _onStateSnapshot: (state) => set({ cluster: state }),
  _onStateDelta: (delta) => set(prev => ({
    cluster: { ...prev.cluster, ...delta }
  })),
}));

// PlayerBar.tsx reads from cluster instead of local state
const trackId = cluster?.playerState.trackId;
const isPlaying = cluster?.playerState.isPlaying;
const queue = cluster?.queue;
```

### Optimistic Updates

For responsive UI, show changes immediately before server confirms:

```typescript
const play = () => {
  // Optimistic: update UI immediately
  set(prev => ({
    cluster: {
      ...prev.cluster,
      playerState: { ...prev.cluster.playerState, isPlaying: true }
    }
  }));
  // Send to server (server will broadcast authoritative state)
  ws.send({ type: 'play' });
};
```

---

## iOS / Mobile Considerations

### Background WebSocket Behavior

- iOS suspends web apps when backgrounded — WebSocket connections drop
- On return to foreground: `visibilitychange` event fires, reconnect + full state sync
- If the device is the **active player** with `<audio>` playing, the tab stays alive (audio keeps WebSocket alive indirectly)
- Zombie connection detection: ping with 3s timeout on visibility change

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (ws.readyState !== WebSocket.OPEN) {
      reconnect();
    } else {
      // Zombie detection
      ws.send({ type: 'ping', timestamp: Date.now() });
      zombieTimeout = setTimeout(() => {
        ws.close();
        reconnect();
      }, 3000);
    }
  }
});
```

### Reconnection Strategy

Exponential backoff with jitter (prevents reconnection storms):

```
Attempt 1: 1s + random(0-0.5s)
Attempt 2: 2s + random(0-1s)
Attempt 3: 4s + random(0-2s)
Attempt 4: 8s + random(0-4s)
...
Cap: 30s + random(0-15s)
```

---

## Database Schema Additions

```sql
-- Per-user queue state (persistent across server restarts)
CREATE TABLE player_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) UNIQUE,
  context_uri TEXT,
  current_track_id TEXT,
  position_ms INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  is_playing BOOLEAN DEFAULT FALSE,
  shuffle BOOLEAN DEFAULT FALSE,
  repeat_mode TEXT DEFAULT 'off',
  volume INTEGER DEFAULT 80,
  active_device_id TEXT,
  seq BIGINT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Queue tracks (ordered)
CREATE TABLE player_queue_tracks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id TEXT NOT NULL REFERENCES player_queue(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  source TEXT DEFAULT 'user',        -- 'user', 'ai-dj', 'autoplay'
  position INTEGER NOT NULL,
  added_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_queue_tracks_queue_position ON player_queue_tracks(queue_id, position);

-- Connected devices
CREATE TABLE player_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'web',
  is_active BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_player_devices_user ON player_devices(user_id);

-- Per-user Navidrome playlist mapping
CREATE TABLE user_navidrome_playlists (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  playlist_type TEXT NOT NULL DEFAULT 'liked',
  navidrome_playlist_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, playlist_type)
);
```

---

## Implementation Phases

### Phase 1: Server Queue State + REST API

Move queue/playlist from localStorage to server. No WebSocket yet — just REST endpoints.

- `GET /api/player/queue` — get current queue state
- `PUT /api/player/queue` — replace queue (load playlist/album)
- `POST /api/player/queue/tracks` — add tracks
- `DELETE /api/player/queue/tracks/:index` — remove track
- `PUT /api/player/playback` — play/pause/seek/next/prev
- `PUT /api/player/position` — position heartbeat from active client

**Client changes:** Replace Zustand persist with API-backed state. On page load, fetch queue from server. Report position every 5-10s.

**Result:** localStorage bloat eliminated. Resume-where-you-left-off works across tabs/devices.

### Phase 2: WebSocket Real-Time Sync

Add WebSocket hub alongside REST endpoints.

- Client connects to `wss://host/ws/player`
- Server pushes state changes to all connected devices
- Client sends commands over WebSocket instead of REST
- Reconnection with full state snapshot

**Result:** Multi-device remote control. See what's playing on other devices. Control playback from any device.

### Phase 3: Per-User Liked Songs

Implement hidden playlist model for per-user likes.

- Create `_aidj_liked_{userId}` playlist in Navidrome on first like
- Like/unlike modifies the hidden playlist instead of star/unstar
- Sync endpoint reads from per-user playlist
- UI filters `_aidj_` playlists from normal playlist views

**Result:** Multiple users can have independent liked songs on a shared Navidrome instance.

### Phase 4: Subsonic Bridge + Active Device Transfer

- Bridge WebSocket state to Navidrome's `savePlayQueue`/`getPlayQueue`
- Poll for changes from external Subsonic clients
- Device transfer ("play on this device") with position handoff
- AI DJ state per-user on server

**Result:** Full ecosystem compatibility. DSub/Symfonium can resume where AIDJ left off.

---

## References

- [Spotify Connect / SPIRC Protocol](https://github.com/librespot-org/spotify-connect-resources) — protobuf definitions
- [Spotify Dealer WebSocket API](https://gist.github.com/EricRabil/2f8cf09068274dd6c84500b1181db361) — reverse-engineered docs
- [librespot SPIRC implementation](https://github.com/librespot-org/librespot/blob/dev/connect/src/spirc.rs) — open-source reference
- [Navidrome Subsonic API](https://www.navidrome.org/docs/developers/subsonic-api/) — savePlayQueue/getPlayQueue
- [Nitro WebSocket Guide](https://nitro.build/guide/websocket) — server implementation
- [crossws](https://github.com/h3js/crossws) — cross-platform WebSocket for Nitro
