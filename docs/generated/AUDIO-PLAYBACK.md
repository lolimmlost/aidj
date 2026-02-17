<!-- Generated: 2026-02-15 -->

# Audio Playback System

Deep-dive reference for the dual-deck audio engine, crossfade pipeline, mobile recovery, AI DJ drip-feed, cross-device sync, and related subsystems.

---

## 1. Component & Hook Hierarchy

`PlayerBar.tsx` (`src/components/layout/`) is the sole owner of the two `<audio>` elements and orchestrates all playback through seven hooks.

| Hook | File | Responsibility |
|---|---|---|
| `useDualDeckAudio` | `src/lib/hooks/useDualDeckAudio.ts` | Creates Deck A + Deck B HTMLAudioElements, tracks active deck, mobile priming |
| `useCrossfade` | `src/lib/hooks/useCrossfade.ts` | Equal-power crossfade between decks (cos/sin curves, 50 ms interval) |
| `usePlaybackStateSync` | `src/lib/hooks/usePlaybackStateSync.ts` | Syncs Zustand `isPlaying` with actual audio element state; visibility/unload recovery |
| `useStallRecovery` | `src/lib/hooks/useStallRecovery.ts` | Detects stalls via watchdog; escalating recovery strategies |
| `useMediaSession` | `src/lib/hooks/useMediaSession.ts` | Media Session API for lock-screen / Bluetooth controls |
| `usePlaybackSync` | `src/lib/hooks/usePlaybackSync.ts` | WebSocket + REST cross-device sync (Spotify Connect style) |
| `usePlayerKeyboardShortcuts` | `src/lib/hooks/usePlayerKeyboardShortcuts.ts` | Desktop keyboard shortcuts |

All hooks share refs (`deckARef`, `deckBRef`, `activeDeckRef`, `crossfadeInProgressRef`) and read/write the Zustand `useAudioStore` (persisted to localStorage).

---

## 2. AudioStore State Shape

Source: `src/lib/stores/audio.ts` (1,824 lines). Uses Zustand `persist` middleware with `localStorage`.

### Core Playback State

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `playlist` | `Song[]` | `[]` | Yes | Current playback queue |
| `currentSongIndex` | `number` | `-1` | Yes | Index of currently playing song |
| `isPlaying` | `boolean` | `false` | No | Whether audio is playing (reset to `false` on rehydration) |
| `currentTime` | `number` | `0` | Yes | Playback position in seconds |
| `duration` | `number` | `0` | No | Duration of current song |
| `volume` | `number` | `0.5` | Yes | Volume level (0-1) |

### Shuffle State

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `isShuffled` | `boolean` | `false` | Yes | Whether queue is currently shuffled |
| `originalPlaylist` | `Song[]` | `[]` | Yes | Pre-shuffle order for unshuffle restore |
| `recentlyPlayedIds` | `string[]` | `[]` | Yes | LRU list (max 200) for "fewer repeats" shuffle |
| `skipCounts` | `Record<string, number>` | `{}` | Yes | Per-song skip counts for shuffle deprioritization (LRU top 500) |

### Crossfade & Autoplay

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `crossfadeEnabled` | `boolean` | `true` | Yes | Master crossfade toggle |
| `crossfadeDuration` | `number` | `0` | Yes | Seconds before song end to start crossfade (0 = disabled) |
| `autoplayEnabled` | `boolean` | `false` | Yes | Auto-queue songs when playlist ends |
| `autoplayBlendMode` | `'crossfade' \| 'silence' \| 'reverb_tail'` | `'crossfade'` | Yes | Transition style for autoplay |
| `autoplayTransitionDuration` | `number` | `4` | Yes | Duration of autoplay transition (seconds) |
| `autoplaySmartTransitions` | `boolean` | `true` | Yes | Enable BPM/energy-aware transitions |
| `autoplayIsLoading` | `boolean` | `false` | No | Whether autoplay fetch is in flight |
| `autoplayTransitionActive` | `boolean` | `false` | No | Whether an autoplay transition is running |
| `autoplayLastQueueTime` | `number` | `0` | No | Timestamp of last autoplay queue (30s cooldown) |
| `autoplayQueuedSongIds` | `Set<string>` | `new Set()` | No | Song IDs queued by autoplay |

### AI DJ State

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `aiDJEnabled` | `boolean` | `false` | Yes | Master AI DJ toggle |
| `aiDJLastQueueTime` | `number` | `0` | No | Timestamp of last recommendation fetch |
| `aiQueuedSongIds` | `Set<string>` | `new Set()` | No | IDs of AI-queued songs (for skip tracking) |
| `aiDJIsLoading` | `boolean` | `false` | No | Whether recommendation fetch is in flight |
| `aiDJError` | `string \| null` | `null` | No | Last error message |
| `aiDJRecentlyRecommended` | `Array<{songId, timestamp, artist?}>` | `[]` | Yes | Prevents re-recommending (8h window) |
| `aiDJArtistBatchCounts` | `Map<string, {count, lastQueued}>` | `new Map()` | No | Cross-batch artist diversity (2h window) |
| `aiDJArtistFatigueCooldowns` | `Map<string, number>` | `new Map()` | No | Artist fatigue cooldown timestamps |
| `aiDJUserActionInProgress` | `boolean` | `false` | No | Suppresses auto-refresh during user actions |
| `songsPlayedSinceLastRec` | `number` | `0` | No | Drip-feed counter (reset on rehydration) |

### Adaptive DJ State (Transient -- Reset on Rehydration)

| Field | Type | Default | Description |
|---|---|---|---|
| `aiDJConsecutiveSkips` | `number` | `0` | Consecutive skips of AI recs |
| `aiDJSessionGenreCounts` | `Record<string, number>` | `{}` | Genre distribution in current session |
| `aiDJRecommendationReasons` | `Record<string, string>` | `{}` | Per-song "Why this song?" tooltip text |

### Cross-Device Sync State

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `queueUpdatedAt` | `string` (ISO) | `now` | Yes | Timestamp of last queue change |
| `positionUpdatedAt` | `string` (ISO) | `now` | Yes | Timestamp of last position change |
| `playStateUpdatedAt` | `string` (ISO) | `now` | Yes | Timestamp of last play/pause change |
| `remoteDevice` | `{deviceId, deviceName, isPlaying} \| null` | `null` | No | Active remote device indicator |

### Recovery State

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `wasPlayingBeforeUnload` | `boolean` | `false` | Yes | Saved before page unload / visibility hidden |
| `pendingPlaybackResume` | `boolean` | `false` | No | Signals PlayerBar to resume after rehydration |

### Queue Management

| Field | Type | Default | Persisted | Description |
|---|---|---|---|---|
| `lastClearedQueue` | `{songs, timestamp} \| null` | `null` | No | Undo support for clear queue (5-minute window) |
| `queuePanelOpen` | `boolean` | `false` | No | Queue panel visibility toggle |

---

## 3. Dual-Deck Audio Engine

### Architecture

Two hidden `<audio>` elements rendered at the bottom of PlayerBar:

```html
<audio ref={deckARef} preload="metadata" crossOrigin="anonymous" class="hidden" />
<audio ref={deckBRef} preload="metadata" crossOrigin="anonymous" class="hidden" />
```

### Deck Lifecycle

| Phase | Active Deck | Inactive Deck |
|---|---|---|
| Normal playback | Playing current song | Idle (silent data URL or empty) |
| Crossfade trigger | Fading out (cos curve) | Preloading next song, fading in (sin curve) |
| Crossfade complete | Paused, src cleared to silent data URL | Now active, playing at target volume |
| Mobile priming | Already activated | Plays silent MP3 data URL to satisfy autoplay policy |

### Event Listeners (Both Decks)

| Event | Handler | Deck Guard |
|---|---|---|
| `timeupdate` | Update `currentTime` in store, trigger crossfade check, update stall tracking | Only active deck (auto-corrects `activeDeckRef` on desync) |
| `loadedmetadata` | Update `duration` in store | Only active deck |
| `canplay` | Clear loading spinner | Only active deck |
| `waiting` | Show loading spinner | Only active deck |
| `stalled` | Trigger stall recovery (10s debounce, must be past 2s, check buffer) | Only active deck, not during crossfade |
| `ended` | Record listening history, scrobble, load next song directly on same deck | Only active deck, ignored if crossfade in progress |

The `timeupdate` handler auto-corrects `activeDeckRef` on desync (inactive deck playing with `currentTime > 1`). In debug mode, a 10s interval safety-stops any unexpected inactive deck playback.

---

## 4. Crossfade Pipeline

### Trigger Condition

Checked on every `timeupdate` of the active deck:

```
timeRemaining <= crossfadeDuration AND timeRemaining > 0.5 AND !crossfadeInProgress
```

### Equal-Power Crossfade Curves

```
progress = elapsed / crossfadeDuration   (clamped to [0, 1])
gainA = cos(progress * PI/2) * targetVolume
gainB = sin(progress * PI/2) * targetVolume
```

The crossfade loop runs via `setInterval` at 50ms intervals.

### Crossfade Sequence

| Step | Action |
|---|---|
| 1 | Guard: return if crossfade already in progress or no next song |
| 2 | Clear any existing crossfade interval |
| 3 | Set `crossfadeInProgressRef = true`, capture `targetVolume` |
| 4 | Preload next song on inactive deck (`src`, `load()`, `volume = 0`) |
| 5 | Listen for `canplaythrough` on inactive deck |
| 6 | Call `inactiveDeck.play()` -- if fails, abort crossfade |
| 7 | Start 50ms interval: apply equal-power curves each tick |
| 8 | On each tick: check if user paused (abort) or inactive deck stopped (abort) |
| 9 | When `fadeProgress >= 1`: complete crossfade |
| 10 | Completion: pause old deck, clear its src, swap `activeDeckRef`, notify callback |

### Abort Scenarios

| Scenario | Behavior |
|---|---|
| User pauses during crossfade | Both decks paused, abort, restore active deck volume |
| Inactive deck `play()` fails | Abort, restore active deck, fallback transition if song ended |
| Inactive deck stops mid-fade | Abort and clean up |
| `canplaythrough` never fires | 5s timeout -- force fire if `readyState >= 3`, else abort |
| Total crossfade exceeds `duration + 5s` | Safety timeout -- complete if incoming deck has progress, else abort |

### Post-Crossfade Cleanup

- Old deck: pause, `currentTime = 0`, src set to silent data URL
- `crossfadeJustCompletedRef` set to `true` for 100ms (prevents duplicate `loadSong` calls)
- Media Session playbackState reinforced at 500ms, 1500ms, and 3000ms after completion
- `canplay`/`error` handlers removed from old deck before changing its src

---

## 5. Stall Recovery

### Watchdog

Runs via `setInterval` every 2 seconds when `isPlaying` is true.

| Parameter | Value |
|---|---|
| Check interval | 2,000ms |
| Stall threshold | 5,000ms of no progress |
| Minimum progress delta | 0.5s |
| Max recovery attempts | 3 per song (then skip) |

The watchdog also handles desync: if `store.isPlaying` but `audio.paused` with `readyState >= 2`, it restores saved position and calls `play()`, falling back to `attemptStallRecovery`.

### Escalating Recovery Strategies

| Attempt | Strategy | Details |
|---|---|---|
| 1 | Simple `play()` | Kicks the browser into continuing to buffer |
| 2 | Seek back + play | `currentTime = savedTime - 3s`, then `play()` |
| 3 | Full reload | Clear `src`, `load()`, set `src` again, wait for `canplay`, seek to `savedTime - 5s`, `play()` (5s timeout) |
| >3 | Skip to next song | Reset counter, call `nextSong()`, attempt `play()` after 500ms |

All attempts start with `checkAndResumeAudioContext()` which creates/resumes `AudioContext` (or `webkitAudioContext`) with a 2s timeout. iOS suspends the context when backgrounded.

---

## 6. Mobile Considerations

### Audio Priming

| Step | Detail |
|---|---|
| Trigger | First user tap on play button (`togglePlayPause`) |
| Action | `primeBothDecks()` plays silent MP3 data URL on inactive deck |
| Purpose | Satisfies iOS autoplay policy so crossfade can work later |
| Guard | `decksPrimedRef` prevents double-priming |

### iOS Screen Lock Recovery

When iOS destroys the audio element (`readyState=0`, `currentTime=0`, `paused=true`):

| Step | Detail |
|---|---|
| Detection | `usePlaybackStateSync` checks `wasPlayingBeforeUnload` flag + `readyState === 0` |
| Action | Registers one-shot `canplay` listener that seeks to saved position and calls `play()` |
| Fallback | Visibility change handler also checks `wasPlayingBeforeUnload` when page becomes visible |

### State Preservation

| Event | Action |
|---|---|
| `beforeunload` | Saves `currentTime` and sets `wasPlayingBeforeUnload` |
| `visibilitychange` (hidden) | Same as beforeunload |
| `visibilitychange` (visible) | 200ms debounce, corrects `activeDeckRef`, attempts resume or stall recovery |

### Visibility Recovery Order

1. Fix `activeDeckRef` based on which deck has actual progress
2. If stalled: delegate to `attemptStallRecovery`
3. If audio paused but store says playing: resume AudioContext, then `play()`
4. iOS recovery (`wasPlayingBeforeUnload`, `readyState >= 2`): seek to saved time, resume
5. State mismatch: sync store to match audio reality

---

## 7. Media Session (Lock Screen Controls)

### iOS-Specific Requirements

| Requirement | Implementation |
|---|---|
| Set handlers inside `playing` event, not on mount | `handlePlaying` callback registered on both decks |
| Do NOT set `seekbackward`/`seekforward` | Only `play`, `pause`, `previoustrack`, `nexttrack`, `seekto` |
| Handle Infinity duration from streaming | `getUsableDuration()` falls back to store duration |

### Registered Action Handlers

| Action | Behavior |
|---|---|
| `play` | Debounced (300ms), plays active deck, sets `isPlaying = true` |
| `pause` | Debounced (300ms), pauses active deck, sets `isPlaying = false` |
| `previoustrack` | Calls `previousSong()`, then `play()` after 100ms |
| `nexttrack` | Calls `handleNextSong()`, then `play()` after 100ms |
| `seekto` | Sets `activeDeck.currentTime` to the requested position |

### Debounce & Glitch Protection

| Mechanism | Value | Purpose |
|---|---|---|
| Debounce | 300ms | Coalesce rapid Bluetooth disconnect/reconnect events |
| Cooldown | 500ms | Prevent rapid play/pause toggling |
| Glitch window | 2,000ms | Ignore spurious pause during recent action |
| Network stall rejection | `NETWORK_LOADING` check | Reject browser-initiated pause from buffering |

Position state updated on every `timeupdate` via `setPositionState()` and re-pushed on visibility return (iOS stops `timeupdate` in background).

---

## 8. Keyboard Shortcuts

| Key | Action | Guard |
|---|---|---|
| Space | Toggle play/pause | Ignored when focus is in INPUT/TEXTAREA |
| ArrowLeft | Seek back 5 seconds | Same |
| ArrowRight | Seek forward 5 seconds | Same |
| M | Toggle mute (0 / 0.5) | Same |
| L | Toggle like (thumbs_up feedback) | Same |
| S | Toggle shuffle | Same |

---

## 9. Listening History Recording

Three code paths record a listen to `POST /api/listening-history/record`:

| Path | Trigger | What Is Recorded |
|---|---|---|
| `onEnded` event | Song plays to natural completion | Full listen (`currentTime`, `duration`) |
| Crossfade complete | `onCrossfadeComplete` callback | Outgoing song (`currentTime`, `duration`) |
| Manual skip / next | `handleNextSong` wrapper | Partial listen if `!hasScrobbled` |

### Payload

| Field | Source |
|---|---|
| `songId` | `currentSongIdRef.current` |
| `artist` | `song.artist` |
| `title` | `song.name \|\| song.title` |
| `album` | `song.album` |
| `genre` | `song.genre` |
| `duration` | `audio.duration` |
| `playDuration` | `audio.currentTime` |

### Scrobble Tracking

| Ref | Purpose |
|---|---|
| `hasScrobbledRef` | Prevents double-scrobble per song |
| `scrobbleThresholdReachedRef` | Set when `playedPercentage >= 50%` |
| `currentSongIdRef` | Tracks which song ID is loaded (survives store re-renders) |

---

## 10. AI DJ Drip-Feed System

### Trigger Model

Two trigger paths, checked after each `nextSong()`:

| Trigger | Condition | Batch Size |
|---|---|---|
| Drip-feed | `songsPlayedSinceLastRec >= dripInterval` | 1 (inserted after current) |
| Queue threshold | `remainingSongs <= threshold` | `aiDJBatchSize` (appended to end) |

### Drip Interval Adaptation

| Consecutive Skips | Interval Multiplier | User Notification |
|---|---|---|
| 0-2 | 1x (base interval) | None |
| 3-4 | 2x | None |
| 5+ | 3x | Toast: "AI DJ is backing off" (once at threshold) |

### Skip Detection

| Classification | Criteria | Feedback Sent |
|---|---|---|
| Skip | `currentTime > 5s` AND `currentTime / duration < 0.3` | `thumbs_down` (source: `ai_dj_skip`) |
| Listen-through | `currentTime / duration >= 0.8` | `thumbs_up` (source: `ai_dj_listen_through`) |

### Diversity Enforcement

| Mechanism | Window | Detail |
|---|---|---|
| Recently recommended songs | 4 hours | Excluded from API request via `excludeSongIds` |
| Recently played songs | 20 songs back + 5 ahead | Excluded from API request |
| Recently recommended artists | 8 hours | Excluded via `excludeArtists` |
| Artist fatigue cooldowns | Per-artist timestamp | Server-returned cooldown end times |
| Upcoming queue artists | Next 10 songs | Artists already in queue excluded |
| Artist batch counts | 2 hours | Tracks per-artist count across batches |
| Session genre counts | Current session | Passed to API for diversity scoring |

### Cooldown

| Parameter | Value |
|---|---|
| Minimum time between recommendations | 10,000ms (10 seconds) |
| Recent recommendation cleanup | 8 hours |
| Artist batch count cleanup | 2 hours |

### Nudge Mode ("More Like This")

| Step | Detail |
|---|---|
| 1 | Records `thumbs_up` feedback for current song (source: `nudge`) |
| 2 | Fetches similar songs (batch size: max of configured or 5) |
| 3 | Shuffles recommendations randomly |
| 4 | Inserts at random positions in upcoming queue (first within 1-3, rest scattered) |
| 5 | Bypasses normal AI DJ cooldown |

### Queue Seeding

| Step | Detail |
|---|---|
| Trigger | AI DJ enabled with `aiDJSeedQueueEnabled` preference |
| Density | `10 / density` = songs between recommendations (e.g., density 2 = every 5 songs) |
| Method | One API call per seed point, inserted after each seed song |
| Sorting | Insertions sorted descending by index to avoid position shifting |

---

## 11. Cross-Device Sync Protocol

### Transport

| Layer | Detail |
|---|---|
| REST | `POST /api/playback/state` (push), `GET /api/playback/state` (pull) |
| WebSocket | `ws(s)://host/ws/playback` with auto-reconnect |
| Device registration | `POST /api/playback/devices` on mount |

### WebSocket Message Types

| Type | Direction | Purpose |
|---|---|---|
| `state_update` | Outbound | Broadcast current state to all other devices |
| `state` | Inbound | Another device pushed state (updates `remoteDevice` indicator) |
| `remote_command` | Inbound | Command from another device (`play`, `pause`, `next`, `previous`, `seek`, `volume`) |
| `transfer` | Inbound | Playback transfer between devices |
| `sync_request` | Both | Request state from other devices (sent on WS connect) |
| `heartbeat` | Outbound | Keep connection alive (every 30s) |
| `heartbeat_ack` | Inbound | Server response to heartbeat (ignored) |

### Conflict Resolution

Per-field timestamp comparison -- local state only updated if server timestamp is newer:

| Field Group | Timestamp Key | Fields Governed |
|---|---|---|
| Queue | `queueUpdatedAt` | `playlist`, `originalPlaylist`, `currentSongIndex`, `isShuffled` |
| Position | `positionUpdatedAt` | `currentTime` (converted from `currentPositionMs`) |
| Play state | `playStateUpdatedAt` | Never auto-sets `isPlaying = true` (browser autoplay policy) |
| Volume | (always accepted) | `volume` |

### Sync Lifecycle

| Event | Action |
|---|---|
| Hook mount | Register device, connect WS, send `sync_request`, fetch server state |
| Store change (queue/play/volume) | Debounced push (2s) to REST + WS broadcast |
| Visibility hidden | Flush pending sync, push state immediately |
| Visibility visible | Fetch and reconcile server state |
| WS `transfer` (to this device) | Fetch full state from server |
| WS `transfer` (away from this) | Pause local playback, show remote device indicator |

---

## 12. Store Persistence & Rehydration

Storage key: `audio-player-storage` via `zustand/middleware` `persist` with `localStorage`. The "Persisted" column in Section 2 tables indicates which fields survive page reload.

### Rehydration Logic

| Action | Detail |
|---|---|
| `isPlaying` | Always reset to `false` (browser autoplay policy) |
| `pendingPlaybackResume` | Set to `true` if `wasPlayingBeforeUnload && currentTime > 0` |
| `aiQueuedSongIds`, `autoplayQueuedSongIds` | Reinitialized as empty `Set` (not JSON-serializable) |
| `aiDJRecentlyRecommended` | Cleaned of entries older than 8 hours |
| `skipCounts` | LRU eviction: keeps top 500 by count if exceeding 500 entries |
| Adaptive DJ state | All reset (`aiDJConsecutiveSkips`, `aiDJSessionGenreCounts`, `aiDJRecommendationReasons`) |

---

## 13. Key Store Actions

| Action | Behavior |
|---|---|
| `setPlaylist(songs)` | Replace queue, reset to index 0, clear shuffle |
| `playSong(id, playlist?)` | Find song in playlist (or provided), set index, `isPlaying = true` |
| `playNow(id, song)` | Replace current song in queue, keep rest intact, preserve shuffle |
| `nextSong()` | Advance index, track recently played, detect skip/listen-through, trigger AI DJ, auto-reshuffle at end |
| `previousSong()` | Decrement index (wraps around) |
| `addToQueueNext(songs)` | Insert after current song, update `originalPlaylist` if shuffled |
| `addToQueueEnd(songs)` | Append to end, update `originalPlaylist` if shuffled |
| `clearQueue()` | Keep current song only, save cleared songs for undo (5-min window) |
| `undoClearQueue()` | Restore cleared songs if within 5-minute window |
| `reorderQueue(from, to)` | Move song, adjust `currentSongIndex` if affected |
| `toggleShuffle()` | Shuffle upcoming via `selectBestShuffle` (multi-candidate scoring with `recentlyPlayedIds` + `skipCounts`) |
| `applyServerState(server)` | Per-field timestamp merge for cross-device sync |

---

## 14. Debug Mode

Enabled via `localStorage.debug = 'true'`. Logs all 15 audio events on both decks, periodic state snapshots (10s), online/offline recovery, inactive deck safety stops, and store state changes.
