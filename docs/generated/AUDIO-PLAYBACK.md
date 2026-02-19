<!-- Generated: 2026-02-18 -->

# Audio Playback System

## Component Hierarchy

```
PlayerBar.tsx (main UI — ~700 lines)
├── useDualDeckAudio (137 lines) — creates 2 HTMLAudioElement instances
│   └── deckA, deckB: HTMLAudioElement refs
├── useCrossfade (271 lines) — fade pipeline + equal power curves
│   └── crossfadeInProgressRef (shared with PlayerBar)
├── usePlaybackSync (366 lines) — WebSocket cross-device sync
├── usePlaybackStateSync (324 lines) — visibility/stall recovery
├── useStallRecovery (300 lines) — audio stall detection + recovery
├── useMediaSession (388 lines) — Media Session API (lock screen)
└── usePlayerKeyboardShortcuts (74 lines) — keyboard controls
```

## AudioStore State Shape (`src/lib/stores/audio.ts` — 1,859 lines)

### Core Playback

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `playlist` | `Song[]` | `[]` | Current queue |
| `currentSongIndex` | `number` | `-1` | Active song position |
| `isPlaying` | `boolean` | `false` | Playback state |
| `currentTime` | `number` | `0` | Current position (seconds) |
| `duration` | `number` | `0` | Song duration (seconds) |
| `volume` | `number` | `0.5` | Volume level (0-1) |
| `isShuffled` | `boolean` | `false` | Shuffle active |
| `originalPlaylist` | `Song[]` | `[]` | Pre-shuffle order |

### AI DJ State

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `aiDJEnabled` | `boolean` | `false` | AI DJ master toggle |
| `aiDJLastQueueTime` | `number` | `0` | Last auto-queue timestamp |
| `aiQueuedSongIds` | `Set<string>` | `new Set()` | IDs of AI-queued songs |
| `aiDJIsLoading` | `boolean` | `false` | Loading recommendations |
| `aiDJError` | `string\|null` | `null` | Last error message |
| `aiDJRecentlyRecommended` | `Array<{songId, timestamp, artist}>` | `[]` | Recent recs for diversity |
| `aiDJArtistBatchCounts` | `Map<string, {count, lastQueued}>` | `new Map()` | Per-artist batch tracking |
| `aiDJArtistFatigueCooldowns` | `Map<string, number>` | `new Map()` | Fatigue cooldown timestamps |
| `aiDJUserActionInProgress` | `boolean` | `false` | Block auto-refresh during user action |
| `songsPlayedSinceLastRec` | `number` | `0` | Drip-feed counter |
| `aiDJConsecutiveSkips` | `number` | `0` | Transient: consecutive skip count |
| `aiDJSessionGenreCounts` | `Record<string, number>` | `{}` | Transient: genre distribution this session |
| `aiDJRecommendationReasons` | `Record<string, string>` | `{}` | Transient: why each song was recommended |

### Crossfade & Autoplay

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `crossfadeEnabled` | `boolean` | `true` | Crossfade toggle |
| `crossfadeDuration` | `number` | `0` | Duration in seconds (0 = off) |
| `autoplayEnabled` | `boolean` | `false` | Queue more songs when playlist ends |
| `autoplayBlendMode` | `'crossfade'\|'silence'\|'reverb_tail'` | `'crossfade'` | Transition style |
| `autoplayTransitionDuration` | `number` | `3` | Transition seconds |
| `autoplaySmartTransitions` | `boolean` | `false` | AI-chosen transition type |
| `autoplayIsLoading` | `boolean` | `false` | Loading autoplay songs |
| `autoplayTransitionActive` | `boolean` | `false` | Transition in progress |
| `autoplayLastQueueTime` | `number` | `0` | Last autoplay queue time |
| `autoplayQueuedSongIds` | `Set<string>` | `new Set()` | Autoplay-queued song IDs |

### Cross-Device Sync

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `queueUpdatedAt` | `string` | ISO timestamp | Queue change timestamp |
| `positionUpdatedAt` | `string` | ISO timestamp | Seek position timestamp |
| `playStateUpdatedAt` | `string` | ISO timestamp | Play/pause timestamp |
| `remoteDevice` | `object\|null` | `null` | Active remote device info |

### Recovery & Undo

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `wasPlayingBeforeUnload` | `boolean` | `false` | Persisted: playback intent before page unload |
| `pendingPlaybackResume` | `boolean` | `false` | Transient: resume after rehydration |
| `lastKnownPosition` | `number` | `0` | Last position for skip detection |
| `lastKnownDuration` | `number` | `0` | Last duration for skip detection |
| `_userPauseAt` | `number` | `0` | Transient: user pause timestamp (stall guard) |
| `_rehydratedCurrentTime` | `number` | `0` | Transient: position snapshot on rehydrate |
| `lastClearedQueue` | `object\|null` | `null` | Undo data for clear queue |
| `queuePanelOpen` | `boolean` | `false` | Queue panel visibility |
| `recentlyPlayedIds` | `string[]` | `[]` | Shuffle "fewer repeats" history |
| `skipCounts` | `Record<string, number>` | `{}` | Per-song skip counts (persisted) |

### Persistence

- Storage: `localStorage` key `"audio-storage"`
- Uses `createJSONStorage` with custom serializer for `Set` and `Map` types
- Transient fields (`aiDJConsecutiveSkips`, `aiDJSessionGenreCounts`, `_userPauseAt`, `pendingPlaybackResume`, etc.) are reset on rehydrate

## Dual-Deck Crossfade Flow

```
Song ending (timeRemaining <= crossfadeDuration)
  │
  ├─ PlayerBar timeupdate handler detects threshold
  │   └─ Guard: crossfadeInProgressRef must be false
  │   └─ Guard: cooldown (10s after any abort)
  │
  ├─ startCrossfade(nextSong, duration) called
  │   ├─ Set crossfadeInProgressRef = true
  │   ├─ Load next song on INACTIVE deck
  │   ├─ Wait for canplaythrough event (or 5s timeout)
  │   │
  │   ├─ [SUCCESS] canplaythrough fires:
  │   │   ├─ Start 50ms interval for volume curves
  │   │   │   ├─ Active deck: volume = cos(progress * π/2) — fade out
  │   │   │   └─ Inactive deck: volume = sin(progress * π/2) — fade in
  │   │   ├─ When progress >= 1.0:
  │   │   │   ├─ Swap activeDeckRef (A↔B)
  │   │   │   ├─ Pause old deck, set src to silent
  │   │   │   ├─ crossfadeInProgressRef = false
  │   │   │   └─ onCrossfadeComplete → advance queue
  │   │   │
  │   │   └─ Safety timeout: duration + 3s → force complete
  │   │
  │   └─ [TIMEOUT] 5s with no canplaythrough:
  │       ├─ abortCrossfade() — reset inactive deck
  │       ├─ crossfadeInProgressRef = false
  │       ├─ crossfadeAbortedAtRef = Date.now()
  │       └─ onCrossfadeAbort → nextSong() (useEffect loads next)
  │
  └─ onEnded event (natural end of song):
      └─ Guard: skip if crossfadeAbortedAtRef < 3s ago
      └─ nextSong() if not recently aborted
```

### Equal Power Crossfade Curve

```
Active deck:   volume = targetVolume * cos(progress * π/2)
Inactive deck: volume = targetVolume * sin(progress * π/2)

progress = elapsed / duration (0.0 → 1.0)
interval = 50ms
```

This maintains constant perceived loudness during the transition (equal power law).

## Stall Recovery (`useStallRecovery.ts`)

Detects when audio playback stalls (buffering, network issues) and applies recovery strategies:

1. **Detection**: Monitors `timeupdate` events. If `currentTime` hasn't changed for >3s while `isPlaying`, declares stall
2. **Strategy 1**: Seek forward by 0.1s to unstick the buffer
3. **Strategy 2**: Reload current source URL
4. **Strategy 3**: Skip to next song
5. **Guard**: Respects `_userPauseAt` — won't trigger recovery within 5s of user-initiated pause

## Playback State Sync (`usePlaybackStateSync.ts`)

Handles browser lifecycle events that interrupt playback:

- **`visibilitychange`**: When tab/app goes to background, saves position. On return, validates position hasn't drifted
- **iOS screen lock**: Detects via `visibilitychange` + `pagehide`. On resume, reloads audio source and seeks to saved position
- **WiFi reconnect**: If `wasPlayingBeforeUnload` is set on rehydration, sets `pendingPlaybackResume` flag for the deck loader to pick up

## Cross-Device Sync Protocol

### WebSocket Server (`playback-websocket.ts` — 196 lines)

```
Client connects → ws://host/ws?token=session_token
  ├─ Server authenticates via session token
  ├─ Registers connection in Map<userId, Set<WebSocket>>
  └─ Heartbeat: 60s timeout, 30s check interval
```

### Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| `state_update` | Client → Server → Other clients | Queue, position, play state + per-field timestamps |
| `transfer` | Client → Server → Target | Transfer playback to another device |
| `command` | Client → Server → Other clients | play, pause, next, previous, seek, volume, shuffle |
| `sync_request` | Client → Server → Active device | Request current state from active device |
| `heartbeat` | Client → Server | Keep-alive ping |

### Per-Field Conflict Resolution

Each state domain has its own timestamp:
- `queueUpdatedAt` — covers queue, originalQueue, currentIndex, isShuffled
- `positionUpdatedAt` — covers currentPositionMs
- `playStateUpdatedAt` — covers isPlaying, activeDeviceId

On receiving a `state_update`, the client compares timestamps field-by-field and only applies updates that are newer than local state.

## Media Session (`useMediaSession.ts`)

Integrates with the browser Media Session API for:
- Lock screen / notification area controls (play, pause, next, previous, seek)
- Now-playing metadata (title, artist, album, artwork)
- Updates artwork URL from Navidrome cover art endpoint
- Position state updates for progress bar in system UI

## Keyboard Shortcuts (`usePlayerKeyboardShortcuts.ts`)

| Key | Action |
|-----|--------|
| Space | Play/pause |
| ArrowRight | Next song |
| ArrowLeft | Previous song |
| ArrowUp | Volume up |
| ArrowDown | Volume down |
| M | Mute/unmute |

## Listening History Recording

Playback events are recorded to the server in two paths:

1. **Scrobble**: `navidrome/rest/scrobble.ts` — sent on song play with per-user Navidrome creds
2. **Listening history**: `listening-history.ts` service — records play events and skip data for the recommendation engine's compound scoring

## AI DJ Drip-Feed Model

Instead of batch-loading many songs at once, the AI DJ adds 1 recommendation every N songs played:

1. `songsPlayedSinceLastRec` increments on each `nextSong()`
2. When it reaches the threshold (from `aiDJQueueThreshold` preference, default 3), triggers `monitorQueueForAIDJ()`
3. `monitorQueueForAIDJ()` calls the `/api/ai-dj/recommendations` endpoint
4. Songs are appended to the end of the queue
5. Cooldown: 30s between queue operations (`checkCooldown`)

## Store Persistence Details

```ts
persist(storeCreator, {
  name: 'audio-storage',
  storage: createJSONStorage(() => localStorage, {
    replacer: (key, value) => {
      // Serialize Set → Array, Map → Array of entries
    },
    reviver: (key, value) => {
      // Deserialize back to Set/Map
    },
  }),
  partialize: (state) => ({
    // Persists: playlist, currentSongIndex, volume, isShuffled, originalPlaylist,
    //   crossfadeEnabled, crossfadeDuration, aiDJEnabled, aiQueuedSongIds,
    //   recentlyPlayedIds, skipCounts, autoplay*, wasPlayingBeforeUnload
    // Excludes: isPlaying, currentTime, duration, all transient _ fields
  }),
})
```
