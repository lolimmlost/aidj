# Cross-Device Sync Architecture Research

**Date:** 2025-12-30
**Context:** Investigating how to sync playback state and recently played history across devices (phone, PC, tablet)

---

## Current State

### What We Have ✅
- `listeningHistory` table - records every song play with full metadata
- `recordSongPlay()` service - called when songs finish playing
- `/api/listening-history/record` endpoint - saves plays to DB
- Audio player already records plays automatically

### Current Limitations ❌
- Recently played uses `recentlyPlayedIds` in localStorage (device-specific)
- Queue stored in localStorage via Zustand persist (device-specific)
- Playback state (current song, position) is local only
- No cross-device sync at all

### Recently Played Sidebar Bug
The sidebar shows `recentlyPlayedIds` but can only display songs that exist in the current playlist/queue. If you clear the queue, the IDs can't be resolved to song metadata, so you only see 1-2 songs. The `listeningHistory` table stores full metadata, so fetching from DB would fix this.

---

## How Spotify Does It

### Research Summary

Based on Spotify's architecture and APIs, here's how they handle cross-device sync:

#### 1. Server-Side Playback State
- **All playback state lives on Spotify's servers**, not clients
- Clients fetch state on app open, send commands to server
- Server is the single source of truth
- [Source: Spotify Engineering Blog](https://engineering.atspotify.com/2020/05/spotify-modernizes-client-side-architecture-to-accelerate-service-on-all-devices/)

**State stored server-side:**
- Current queue (list of tracks)
- Current song index
- Playback position (milliseconds)
- Play/pause state
- Volume, shuffle, repeat settings

#### 2. Transfer Playback Model
- Only **ONE device plays at a time** per account
- Devices don't auto-sync - you explicitly **transfer** playback
- User chooses which device should be active
- Other devices can "remote control" the active device
- [Source: Spotify Transfer Playback API](https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback)

**How it works:**
```
Phone playing → User opens tablet app
Tablet: "Continue on this device?" → User clicks "Yes"
API: POST /transfer-playback { device_id: "tablet" }
Server: Moves queue + position to tablet
Phone: Stops playback, shows "Playing on Tablet"
```

#### 3. Recently Played History
- Stored on **server for months to years**
- API returns last 50 tracks via `/me/player/recently-played`
- **Cross-device on mobile only** - mobile app shows plays from all devices
- Desktop app doesn't always show cross-device history (UX inconsistency)
- [Source: Spotify Community](https://community.spotify.com/t5/Other-Podcasts-Partners-etc/shared-recently-played-song-data-across-devices-platforms/td-p/5617970)
- [Source: Spotify Recently Played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)

**Storage duration:**
- API: Last 50 tracks
- App UI: ~3 months
- Servers: Years of data (available in data export)

#### 4. Client-Side Optimization for Mobile
Despite server-side storage, Spotify optimizes mobile with client caching:
- **Pre-computes sorts** (by title, artist, album, date) and stores on disk
- **Pre-fetches metadata** when app opens
- Shows instant results without waiting for server
- Syncs new data in background
- [Source: Spotify Engineering](https://engineering.atspotify.com/2020/05/spotify-modernizes-client-side-architecture-to-accelerate-service-on-all-devices/)

#### 5. Offline Handling
- Queue changes offline are stored locally
- When back online, sync to server
- Listening history uploads when reconnected
- Metadata for "Liked Songs" pre-downloaded

#### 6. Real-Time Sync Architecture
- Uses **long-lived connections** (WebSocket-like proprietary protocol)
- Avoids polling overhead
- Server pushes state changes to connected clients
- [Source: Spotify Backend Performance Paper](https://www.diva-portal.org/smash/get/diva2:653969/FULLTEXT01.pdf)

#### 7. Spotify Connect (Hardware Devices)
- Uses **ZeroConf** protocol for device discovery
- Devices register themselves on local network
- Control device sends commands to Spotify servers
- Servers stream directly to target device (not through control device)
- Reduces battery drain and improves audio quality
- [Source: Spotify Connect Docs](https://developer.spotify.com/documentation/commercial-hardware/implementation/guides/connect-basics)

---

## Edge Cases & Considerations

### 1. Data Freshness vs Network Calls
- **Problem:** Fetching from DB on every load adds network latency
- **Mobile concern:** Slow connections = empty sidebar while loading
- **Current localStorage:** Instant display, zero network dependency
- **Spotify's solution:** Pre-fetch and cache, background sync

### 2. Conflict Resolution
- **Scenario:** Play songs on phone offline, open tablet before sync
- **Question:** Which device's state wins?
- **Options:**
  - Last write wins (timestamp-based)
  - Device currently playing wins
  - Ask user to choose
  - Merge by timestamp (complex)

### 3. Song Metadata Availability
- **Current issue:** `recentlyPlayedIds` only stores IDs, needs playlist to resolve
- **If song not in queue:** Can't display (current bug)
- **DB advantage:** `listeningHistory` has full metadata (artist, title, album)

### 4. Queue State vs Play History (Two Different Things)
- **Recently Played:** Songs you finished listening to (persistent, cross-device)
- **Current Queue:** What you're about to play (session-specific, device-specific?)

**Sidebar could show:**
- A) Just this session's plays (local)
- B) All recent plays across devices (from DB)
- C) Both in separate sections

### 5. Storage Limits
- **localStorage:** ~5-10MB, but IDs are tiny (fine)
- **DB:** Unlimited, but `listeningHistory` grows forever
- **Cleanup strategy:** Delete plays older than 6 months? 1 year?

### 6. Privacy/Multi-User
- **localStorage:** Device-specific, no auth needed
- **DB:** Tied to user account, requires authentication

### 7. Real-Time Updates Within Session
- **localStorage + Zustand:** Instant reactivity when song changes
- **DB fetch:** Requires refetch/invalidation, slight delay
- **Hybrid:** Local for instant UI, background sync to DB

### 8. Offline-First
- **Question:** How often offline without internet?
- **Should queue/plays persist locally and sync later?**
- **Spotify's approach:** Yes, queue locally, sync on reconnect

### 9. Queue Size
- Spotify queues ~50-100 songs typically
- Storing as JSONB in DB could get large if queue is huge
- Consider limits or pagination

### 10. Playback Position Within Song
- Worth syncing? (e.g., pause at 2:35 on phone, resume on tablet)
- Or just start from beginning?
- Spotify syncs position to the second

---

## Proposed Architecture Options

### Option A: Full Server-Side (Spotify Model)

```
┌─────────────────────────────────────────────────────────┐
│                   DATABASE (Postgres)                    │
├─────────────────────────────────────────────────────────┤
│  playback_sessions                                       │
│  ├── id (uuid)                                          │
│  ├── user_id (fk)                                       │
│  ├── active_device_id (nullable, string)                │
│  ├── queue (jsonb - array of song objects)              │
│  ├── current_index (integer)                            │
│  ├── current_position_ms (integer)                      │
│  ├── is_playing (boolean)                               │
│  ├── is_shuffled (boolean)                              │
│  ├── volume (float)                                     │
│  ├── updated_at (timestamp)                             │
│  └── device_last_seen_at (timestamp)                    │
│                                                          │
│  listening_history (already exists ✅)                   │
│  ├── user_id                                            │
│  ├── song_id, artist, title, album, genre               │
│  ├── played_at, play_duration, completed                │
│  └── ...                                                │
└─────────────────────────────────────────────────────────┘
```

**Flow:**
1. App opens → `GET /api/playback/state`
2. Returns: queue, current song, position, device info
3. User plays/skips → `POST /api/playback/action`
4. Server updates state, returns new state
5. Other devices poll or receive WebSocket push

**Pros:**
- True cross-device sync
- Server is source of truth
- Like Spotify

**Cons:**
- Network dependency for every action
- More complex server logic
- Higher server load

---

### Option B: Hybrid (Optimized for Mobile)

```
┌─────────────────┐     Sync      ┌─────────────────┐
│   localStorage  │──────────────▶│    Server DB    │
│   (fast cache)  │◀──────────────│ (source of truth)│
└─────────────────┘   Background  └─────────────────┘
```

**Strategy:**
- **On app open:** Fetch from server → update localStorage cache
- **During playback:** Update localStorage (instant UI) + debounced sync to server
- **On visibility change:** Sync to server when app backgrounds
- **Offline:** Use localStorage, queue syncs when back online
- **Other devices:** Poll server or use WebSocket for updates

**Sync triggers:**
- App open/focus: Fetch latest state
- Song changes: Debounced save (e.g., 2 seconds after last change)
- App blur/background: Immediate sync
- Periodic: Every 30 seconds if playing

**Pros:**
- Fast, responsive UI (like current)
- Works offline
- Cross-device sync when online
- Less network traffic than Option A

**Cons:**
- More complex conflict resolution
- Can desync if offline for long time

---

### Option C: Recently Played Only (Minimal Change)

Don't sync queue/playback state, only recently played history.

**Changes needed:**
1. Add `GET /api/listening-history/recent` endpoint
2. `RecentlyPlayedSection` fetches from DB with React Query
3. Shows plays from all devices with full metadata
4. Keep queue/playback local (current behavior)

**Pros:**
- Minimal changes
- Solves the "only seeing 1-2 songs" bug
- True cross-device history

**Cons:**
- Queue doesn't sync (can't "continue on another device")
- No playback position sync

---

### Option D: Transfer Playback UX (Advanced)

Full Spotify-like experience:

1. **Device Discovery:** Each device registers when app opens
2. **Active Session:** Only one device "owns" playback at a time
3. **Transfer UI:** "Continue on this device?" prompt
4. **Remote Control:** Other devices can control active device

**Additional tables needed:**
```sql
devices
├── id (uuid)
├── user_id
├── device_name (e.g., "iPhone", "Work Laptop")
├── device_type (mobile, desktop, tablet)
├── last_seen_at
└── is_active (boolean)
```

**UI/UX:**
- Show active device indicator: "Playing on iPhone"
- Show device list: "Available devices"
- Transfer button: Click to take over playback

**Pros:**
- Professional, polished UX
- Clear mental model for users
- Avoids conflicts

**Cons:**
- Most complex to implement
- Requires device management UI
- WebSocket or polling needed for real-time updates

---

## Technical Implementation Details

### Database Schema (Option A/B)

```sql
CREATE TABLE playback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Active device info
  active_device_id TEXT, -- nullable, identifies which device owns playback
  device_name TEXT,
  device_type TEXT, -- 'mobile', 'desktop', 'tablet'

  -- Queue state
  queue JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of song objects
  original_queue JSONB DEFAULT '[]'::jsonb, -- for unshuffle
  current_index INTEGER NOT NULL DEFAULT 0,

  -- Playback state
  current_position_ms INTEGER DEFAULT 0,
  is_playing BOOLEAN DEFAULT false,
  volume REAL DEFAULT 0.5,
  is_shuffled BOOLEAN DEFAULT false,

  -- Crossfade/AI DJ settings (sync from preferences)
  crossfade_enabled BOOLEAN DEFAULT true,
  crossfade_duration REAL DEFAULT 8.0,
  ai_dj_enabled BOOLEAN DEFAULT false,

  -- Timestamps
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  device_last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Ensure one session per user
  UNIQUE(user_id)
);

CREATE INDEX idx_playback_sessions_user_id ON playback_sessions(user_id);
CREATE INDEX idx_playback_sessions_updated_at ON playback_sessions(updated_at);
```

### API Endpoints

#### Get Playback State
```
GET /api/playback/state

Response:
{
  queue: Song[],
  currentIndex: number,
  currentPositionMs: number,
  isPlaying: boolean,
  volume: number,
  isShuffled: boolean,
  activeDevice: { id, name, type },
  updatedAt: string
}
```

#### Update Playback State
```
POST /api/playback/update

Body:
{
  queue?: Song[],
  currentIndex?: number,
  currentPositionMs?: number,
  isPlaying?: boolean,
  deviceId: string,
  deviceName: string
}

Response: Same as GET
```

#### Transfer Playback (Option D)
```
POST /api/playback/transfer

Body:
{
  deviceId: string,
  play: boolean // start playing on new device?
}
```

#### Get Recently Played (Option C minimum)
```
GET /api/listening-history/recent?limit=50

Response:
{
  history: [
    {
      songId: string,
      artist: string,
      title: string,
      album: string,
      playedAt: string,
      completed: boolean
    }
  ]
}
```

### Client-Side Sync Logic (Option B)

```typescript
// On app mount
useEffect(() => {
  fetchPlaybackState().then(serverState => {
    // Check if server state is newer than local
    const localUpdatedAt = localStorage.getItem('playback_updated_at');
    const serverUpdatedAt = new Date(serverState.updatedAt).getTime();

    if (!localUpdatedAt || serverUpdatedAt > parseInt(localUpdatedAt)) {
      // Server is newer, use server state
      useAudioStore.setState(serverState);
    } else {
      // Local is newer (offline changes), sync to server
      syncToServer(useAudioStore.getState());
    }
  });
}, []);

// Debounced sync on state changes
const debouncedSync = useDebouncedCallback(
  (state) => {
    fetch('/api/playback/update', {
      method: 'POST',
      body: JSON.stringify({
        queue: state.playlist,
        currentIndex: state.currentSongIndex,
        currentPositionMs: state.currentTime * 1000,
        isPlaying: state.isPlaying,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      }),
    });
  },
  2000 // 2 second debounce
);

// Subscribe to audio store changes
useAudioStore.subscribe(debouncedSync);

// Sync on app blur/background
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      // Sync immediately when app goes to background
      syncToServer(useAudioStore.getState());
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

### Device Identification

```typescript
// Generate stable device ID
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android Phone';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC';
  return 'Browser';
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|Android/.test(ua) && !/iPad|Tablet/.test(ua)) return 'mobile';
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  return 'desktop';
}
```

---

## Migration Strategy

### Phase 1: Recently Played (Low Risk)
1. Add `GET /api/listening-history/recent` endpoint
2. Update `RecentlyPlayedSection` to fetch from DB
3. Keep `recentlyPlayedIds` for shuffle algorithm
4. **Impact:** Fixes sidebar bug, shows cross-device history

### Phase 2: Playback State Sync (Medium Risk)
1. Add `playback_sessions` table
2. Add GET/POST endpoints for state
3. Update audio store to sync on app open/close
4. Keep localStorage as cache
5. **Impact:** Can resume on different device

### Phase 3: Transfer Playback UX (High Complexity)
1. Add device management
2. Build "Continue on this device?" UI
3. Add device switcher in player
4. Implement WebSocket for real-time updates
5. **Impact:** Full Spotify-like experience

---

## Open Questions

1. **Transfer playback UX or automatic sync?**
   - Explicit "Continue on this device?" (Spotify model)
   - Or automatic "last device wins"?

2. **How real-time should sync be?**
   - Polling every 30 seconds?
   - WebSocket for instant updates?
   - Just sync on app open/close?

3. **Queue size limits?**
   - Cap at 100 songs? 500?
   - Paginate if larger?

4. **Sync playback position within song?**
   - Resume at exact second (e.g., 2:35)?
   - Or just start from beginning?

5. **Offline queue changes?**
   - Merge or replace when back online?
   - Last write wins?

6. **Active playing enforcement?**
   - Allow multiple devices playing simultaneously?
   - Or enforce "one at a time" like Spotify?

---

## Recommendation

**Start with Phase 1 (Recently Played) + Option B (Hybrid sync)**

### Why:
1. **Fixes immediate bug** - Sidebar shows history from all devices
2. **Maintains performance** - LocalStorage cache keeps UI instant
3. **Progressive enhancement** - Can add transfer playback later
4. **Low risk** - Doesn't change core playback logic yet

### Implementation:
1. Add `GET /api/listening-history/recent` endpoint
2. `RecentlyPlayedSection` fetches from DB (shows all devices)
3. Add `playback_sessions` table
4. Sync queue to server on app blur/background (debounced)
5. Fetch queue from server on app open (if newer)
6. Keep localStorage for instant UI updates

### Future:
- Add device management UI
- Add "Continue on this device?" prompt
- WebSocket for real-time sync
- Smart conflict resolution

---

## References

- [Spotify Engineering - Client Architecture](https://engineering.atspotify.com/2020/05/spotify-modernizes-client-side-architecture-to-accelerate-service-on-all-devices/)
- [Spotify Transfer Playback API](https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback)
- [Spotify Recently Played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
- [Spotify Backend Performance Paper](https://www.diva-portal.org/smash/get/diva2:653969/FULLTEXT01.pdf)
- [Spotify Connect Architecture](https://developer.spotify.com/documentation/commercial-hardware/implementation/guides/connect-basics)
- [Spotify Community - Cross-Device History](https://community.spotify.com/t5/Other-Podcasts-Partners-etc/shared-recently-played-song-data-across-devices-platforms/td-p/5617970)
