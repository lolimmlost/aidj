# AIDJ Product Requirements Document (PRD) - Epic 8: iOS Companion App

## Epic Goal

Build a native iOS companion app using React Native (Expo) that provides reliable background audio playback for the AIDJ music library. This app solves the critical limitation of iOS Safari PWA background audio restrictions by leveraging native audio APIs and lock screen integration.

## Background

### Current State (AIDJ Web App)
The web app provides:
- Full Navidrome integration with streaming proxy
- LastFM-powered recommendation engine
- Smart playlist generation with genre/mood translation
- Lidarr integration for download management
- Extensive iOS workarounds in `audio-player.tsx` (Media Session API, interruption handling, preloading)

### Problem Statement
iOS Safari PWAs have fundamental limitations:
- Background audio is unreliable (stops when app is backgrounded)
- Lock screen controls are inconsistent
- No true background execution for continuous playback
- Audio session handling is limited

### Solution
A native React Native app using `react-native-track-player` which provides:
- True iOS background audio mode (`UIBackgroundModes: ["audio"]`)
- Native Control Center / Lock Screen integration
- Reliable audio session management
- CarPlay support (future)

## User Personas

### Mobile-First Listener
- Primarily listens on iPhone
- Wants background playback while using other apps
- Expects lock screen controls to work like Spotify/Apple Music
- Values battery efficiency

### Commuter
- Listens during travel (car, transit)
- Needs offline capability (future)
- Uses CarPlay or Bluetooth audio
- Wants queue management on the go

### Existing AIDJ User
- Already uses AIDJ web app for discovery and playlist creation
- Wants companion app for playback
- Expects playlists/preferences to sync
- Uses Lidarr downloads triggered from mobile

## Tech Stack

| Category | Technology | Version | Rationale |
|----------|------------|---------|-----------|
| Framework | Expo | SDK 54 | Modern RN tooling, easy iOS builds |
| Navigation | expo-router | v6 | File-based routing (familiar from aidj) |
| Audio | react-native-track-player | Latest | Best iOS background audio support |
| State | Zustand | v5 | Consistent with aidj web app |
| Data Fetching | TanStack Query | v5 | Consistent with aidj web app |
| Styling | NativeWind | v4 | Tailwind for RN (familiar patterns) |
| Storage | AsyncStorage | Latest | Credentials & preferences |
| HTTP | Native fetch | N/A | Navidrome/AIDJ API calls |

## Reference Implementation

Use PaletaApp (`/home/default/Desktop/dev/PaletaApp/apps/mobile`) as structural reference for:
- Expo 54 + expo-router setup
- Zustand store patterns
- TanStack Query integration
- NativeWind styling

Reuse patterns from AIDJ web (`/home/default/Desktop/dev/aidj/src`) for:
- Navidrome service layer (`lib/services/navidrome.ts`)
- LastFM client (`lib/services/lastfm/client.ts`)
- Lidarr integration (`lib/services/lidarr.ts`)
- Audio store patterns (`lib/stores/audio.ts`)
- UI component patterns (library browser, player controls)

---

## Story 8.1: Project Setup & Native Audio Foundation

**Priority**: Critical (Foundation for all other stories)

As a developer,
I want to set up an Expo React Native project with react-native-track-player configured,
so that we have a foundation for iOS background audio playback.

### Acceptance Criteria

1. Create new Expo project with SDK 54 using expo-router
2. Configure project structure mirroring PaletaApp patterns:
   ```
   aidj-mobile/
   ├── app/                    # expo-router screens
   │   ├── _layout.tsx         # Root layout with providers
   │   ├── index.tsx           # Entry/splash
   │   ├── (auth)/             # Auth screens
   │   └── (main)/             # Main app screens
   ├── components/             # Reusable components
   ├── lib/
   │   ├── api.ts              # API client setup
   │   ├── services/           # Navidrome, LastFM, Lidarr
   │   └── stores/             # Zustand stores
   ├── hooks/                  # Custom hooks
   └── types/                  # TypeScript types
   ```
3. Install and configure react-native-track-player:
   - Add package with Expo config plugin
   - Configure iOS background audio mode in app.json
   - Set up TrackPlayer service
4. Create minimal audio playback proof-of-concept:
   - Initialize TrackPlayer on app start
   - Play a test audio URL
   - Verify background playback works (app backgrounded)
   - Verify lock screen controls appear
5. Set up development environment:
   - iOS Simulator testing
   - Physical device testing via Expo Go or dev build
6. Configure TanStack Query and Zustand providers
7. Set up NativeWind with base theme (dark mode, purple accent - matching aidj)

### Technical Notes

**react-native-track-player setup:**
```json
// app.json
{
  "expo": {
    "plugins": [
      ["react-native-track-player"]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["audio"]
      }
    }
  }
}
```

**TrackPlayer service pattern:**
```typescript
// lib/services/track-player.ts
import TrackPlayer, { Capability, Event } from 'react-native-track-player';

export async function setupPlayer() {
  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
}
```

### Tasks

- [ ] Initialize Expo project with TypeScript template
- [ ] Configure expo-router navigation structure
- [ ] Install react-native-track-player and configure plugin
- [ ] Add UIBackgroundModes to app.json
- [ ] Create TrackPlayer setup service
- [ ] Implement basic play/pause/skip controls
- [ ] Test background playback on iOS Simulator
- [ ] Test background playback on physical device
- [ ] Set up Zustand store for player state
- [ ] Set up TanStack Query client
- [ ] Configure NativeWind with aidj theme colors
- [ ] Create README with setup instructions

### Definition of Done

- App builds and runs on iOS
- Audio plays and continues in background
- Lock screen shows playback controls
- Basic play/pause/skip works from lock screen

---

## Story 8.2: Navidrome Authentication & API Client

**Priority**: Critical (Required for library access)

As a user,
I want to log in with my Navidrome credentials,
so that I can access my music library from the mobile app.

### Acceptance Criteria

1. Create login screen with server URL, username, password fields
2. Implement Navidrome authentication:
   - Support both direct Navidrome connection AND AIDJ API proxy
   - Generate Subsonic API token (salt + MD5 hash)
   - Validate credentials with `ping.view` endpoint
3. Securely store credentials:
   - Use expo-secure-store for sensitive data
   - Store server URL, username, token (not password)
4. Create Navidrome API client service:
   - Base request handler with auth params
   - Error handling for auth failures
   - Auto-retry on token expiration
5. Implement logout functionality:
   - Clear stored credentials
   - Reset player state
   - Navigate to login screen
6. Add connection status indicator
7. Support multiple server configurations (future-ready)

### Technical Notes

**Subsonic API auth pattern (from aidj):**
```typescript
// Reuse pattern from src/lib/services/navidrome.ts
const salt = crypto.randomBytes(6).toString('hex');
const token = md5(password + salt);
const params = `u=${username}&t=${token}&s=${salt}&v=1.16.1&c=aidj-mobile&f=json`;
```

**API endpoints needed:**
- `GET /rest/ping.view` - Auth validation
- `GET /rest/getArtists.view` - Artist list
- `GET /rest/getAlbumList2.view` - Album list
- `GET /rest/getAlbum.view` - Album details with tracks
- `GET /rest/stream.view` - Audio streaming
- `GET /rest/getCoverArt.view` - Album artwork

### Tasks

- [ ] Create login screen UI
- [ ] Implement Navidrome auth token generation
- [ ] Create secure credential storage
- [ ] Build Navidrome API client service
- [ ] Implement ping/validation endpoint
- [ ] Add error handling for auth failures
- [ ] Create logout flow
- [ ] Add connection status component
- [ ] Unit tests for auth logic
- [ ] Test with real Navidrome server

---

## Story 8.3: Music Library Browser

**Priority**: High (Core feature)

As a user,
I want to browse my music library by artists, albums, and songs,
so that I can find and play music from my collection.

### Acceptance Criteria

1. Create tabbed navigation: Artists | Albums | Songs
2. Implement Artists screen:
   - Alphabetically sorted list with index
   - Artist artwork (if available)
   - Tap to view artist's albums
3. Implement Albums screen:
   - Grid or list view toggle
   - Album artwork with title/artist
   - Sort options (recent, alphabetical, year)
   - Tap to view album tracks
4. Implement Songs screen:
   - Searchable list of all songs
   - Song title, artist, duration
   - Tap to play, long-press for options
5. Implement Album Detail screen:
   - Album artwork (large)
   - Track list with numbers, durations
   - "Play All" and "Shuffle" buttons
   - Individual track play
6. Add pull-to-refresh for all lists
7. Implement infinite scroll / pagination
8. Add loading skeletons and empty states

### Technical Notes

**Reuse Navidrome API patterns from aidj:**
- `getArtists()` - `/rest/getArtists.view`
- `getAlbumList2()` - `/rest/getAlbumList2.view?type=recent&size=50`
- `getAlbum()` - `/rest/getAlbum.view?id={albumId}`
- `search3()` - `/rest/search3.view?query={query}`

**UI Components to create:**
- `ArtistCard` / `ArtistListItem`
- `AlbumCard` / `AlbumListItem`
- `SongListItem`
- `AlbumHeader`

### Tasks

- [ ] Create bottom tab navigation (Artists, Albums, Songs)
- [ ] Implement Artists list with TanStack Query
- [ ] Implement Albums grid/list view
- [ ] Implement Songs searchable list
- [ ] Create Album Detail screen
- [ ] Add artwork loading with placeholders
- [ ] Implement pull-to-refresh
- [ ] Add pagination/infinite scroll
- [ ] Create loading skeletons
- [ ] Add empty state components
- [ ] Unit tests for list rendering

---

## Story 8.4: Playback Controls & Lock Screen Integration

**Priority**: High (Core feature)

As a user,
I want full playback controls both in-app and on the lock screen,
so that I can control my music without unlocking my phone.

### Acceptance Criteria

1. Create MiniPlayer component (bottom bar):
   - Album art thumbnail
   - Song title, artist (marquee if too long)
   - Play/pause button
   - Tap to expand to full player
2. Create FullPlayer screen:
   - Large album artwork
   - Song title, artist, album
   - Progress bar with seek
   - Play/pause, previous, next buttons
   - Shuffle and repeat toggles
   - Volume slider (optional - iOS has system volume)
3. Lock screen / Control Center integration:
   - Album artwork
   - Song metadata
   - Play/pause, previous, next
   - Seek position sync
4. Handle audio interruptions:
   - Phone calls pause playback
   - Resume after interruption ends
   - Handle AirPods disconnect/reconnect
5. Implement playback queue:
   - View upcoming songs
   - Reorder queue (drag and drop)
   - Remove from queue
6. Add "Now Playing" indicator in library lists

### Technical Notes

**react-native-track-player events:**
```typescript
TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
  // Update UI based on state
});

TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
```

**Track metadata for lock screen:**
```typescript
await TrackPlayer.add({
  id: song.id,
  url: streamUrl,
  title: song.title,
  artist: song.artist,
  album: song.album,
  artwork: coverArtUrl,
  duration: song.duration,
});
```

### Tasks

- [ ] Create MiniPlayer component
- [ ] Create FullPlayer screen with gestures
- [ ] Implement progress bar with seek
- [ ] Add shuffle and repeat toggles
- [ ] Configure lock screen metadata
- [ ] Handle Remote* events for lock screen controls
- [ ] Implement audio interruption handling
- [ ] Create queue view component
- [ ] Add drag-to-reorder queue
- [ ] Add "Now Playing" indicators
- [ ] Test on physical device with lock screen

---

## Story 8.5: Queue & Playlist Management

**Priority**: Medium (Enhanced feature)

As a user,
I want to manage playback queues and access my Navidrome playlists,
so that I can organize my listening sessions.

### Acceptance Criteria

1. Implement queue management:
   - View current queue
   - Add songs to queue (play next, add to end)
   - Remove from queue
   - Clear queue
   - Save queue as playlist
2. Fetch and display Navidrome playlists:
   - List all playlists
   - Playlist detail view with tracks
   - Play playlist (replace queue or add)
3. Create playlist actions:
   - Play All / Shuffle
   - Add to Queue
   - (Future: Edit playlist from mobile)
4. Implement "Play Next" and "Add to Queue" actions:
   - From song long-press menu
   - From album actions
   - From playlist actions
5. Queue persistence:
   - Save queue state on app background
   - Restore queue on app launch

### Technical Notes

**Navidrome playlist endpoints:**
- `GET /rest/getPlaylists.view` - List playlists
- `GET /rest/getPlaylist.view?id={id}` - Playlist details

**TrackPlayer queue methods:**
```typescript
await TrackPlayer.add(tracks); // Add to end
await TrackPlayer.add(tracks, insertBeforeIndex); // Insert at position
await TrackPlayer.remove(indices); // Remove tracks
await TrackPlayer.reset(); // Clear queue
```

### Tasks

- [ ] Create Queue screen with track list
- [ ] Implement add to queue actions
- [ ] Add remove from queue functionality
- [ ] Create Playlists list screen
- [ ] Create Playlist detail screen
- [ ] Implement play playlist actions
- [ ] Add queue persistence
- [ ] Create long-press action menus
- [ ] Unit tests for queue operations

---

## Story 8.6: Search & Discovery

**Priority**: Medium (Enhanced feature)

As a user,
I want to search my library and discover new music recommendations,
so that I can find songs quickly and explore new music.

### Acceptance Criteria

1. Implement universal search:
   - Search box in header or dedicated screen
   - Search across artists, albums, songs
   - Debounced input (300ms)
   - Recent searches history
2. Display search results:
   - Categorized sections (Artists, Albums, Songs)
   - Tap to navigate or play
3. Integrate LastFM recommendations (from aidj):
   - "Similar Artists" on artist detail
   - "Similar Tracks" on now playing
   - Discovery mode (songs not in library)
4. Show recommendation source indicators:
   - "In Library" badge for playable songs
   - "Download" option for discovery items
5. Connect to AIDJ recommendation API:
   - Mood-based recommendations
   - Genre-based recommendations
   - Playlist generator prompts

### Technical Notes

**Navidrome search:**
```typescript
// /rest/search3.view?query={query}&artistCount=5&albumCount=5&songCount=10
```

**LastFM endpoints (from aidj):**
- `artist.getSimilar`
- `track.getSimilar`
- `artist.getTopTracks`

**AIDJ recommendation API:**
- `GET /api/recommendations?mood={mood}`
- `POST /api/playlist` - Generate playlist

### Tasks

- [ ] Create search screen with input
- [ ] Implement Navidrome search3 integration
- [ ] Display categorized search results
- [ ] Add recent searches storage
- [ ] Create Similar Artists component
- [ ] Create Similar Tracks component
- [ ] Integrate LastFM client from aidj
- [ ] Connect to AIDJ recommendation API
- [ ] Add discovery indicators
- [ ] Unit tests for search logic

---

## Story 8.7: Lidarr Integration

**Priority**: Low (Advanced feature)

As a user,
I want to search for and download new music via Lidarr from the mobile app,
so that I can expand my library on the go.

### Acceptance Criteria

1. Search Lidarr for artists/albums:
   - Search input with results
   - Show availability status
   - Display quality profiles
2. Trigger downloads:
   - Add artist to Lidarr
   - Request specific album
   - Show confirmation
3. View download status:
   - Pending downloads list
   - Progress indicators
   - Completion notifications
4. Link to aidj web for advanced management
5. Settings for Lidarr connection:
   - Server URL
   - API key
   - Quality profile preferences

### Technical Notes

**Reuse Lidarr service from aidj:**
- `searchArtist()` - Search for artists
- `addArtist()` - Add artist to library
- `getQueue()` - Get download queue

**API endpoints:**
- `GET /api/lidarr/search?term={term}`
- `POST /api/lidarr/add`
- `GET /api/lidarr/status`

### Tasks

- [ ] Create Lidarr search screen
- [ ] Implement artist search
- [ ] Add download trigger flow
- [ ] Create download status view
- [ ] Add Lidarr settings screen
- [ ] Implement push notifications for completions (future)
- [ ] Unit tests for Lidarr integration

---

## Story 8.8: Settings & Preferences

**Priority**: Low (Polish feature)

As a user,
I want to configure app settings and sync preferences with the web app,
so that I have a consistent experience across platforms.

### Acceptance Criteria

1. Create Settings screen with sections:
   - Account (server info, logout)
   - Playback (crossfade, gapless, audio quality)
   - Appearance (theme, now playing style)
   - Storage (cache size, clear cache)
   - About (version, licenses)
2. Implement playback settings:
   - Audio quality selection (if Navidrome supports transcoding)
   - Crossfade duration
   - Gapless playback toggle
3. Cache management:
   - Show cache size
   - Clear cache option
   - Auto-cleanup settings
4. Sync preferences with AIDJ web (future):
   - Read preferences from AIDJ API
   - Write preferences to AIDJ API
5. Deep linking support:
   - Open album/artist from web share
   - Handle `aidj://` URL scheme

### Tasks

- [ ] Create Settings screen layout
- [ ] Implement account section
- [ ] Add playback settings
- [ ] Create cache management
- [ ] Add about/version info
- [ ] Implement deep linking
- [ ] Add preference sync (future story)

---

## Dependencies

```
Story 8.1 (Setup) ──────┬──→ Story 8.2 (Auth)
                        │
                        └──→ Story 8.4 (Playback) ←── Story 8.3 (Library)
                                    │
                                    └──→ Story 8.5 (Queue/Playlists)

Story 8.2 (Auth) ───────→ Story 8.3 (Library) ──→ Story 8.6 (Search)
                                                         │
                                                         └──→ Story 8.7 (Lidarr)

Story 8.1 (Setup) ──────→ Story 8.8 (Settings) [can start after 8.1]
```

## Recommended Implementation Order

1. **Story 8.1**: Project Setup & Audio Foundation (CRITICAL)
2. **Story 8.2**: Navidrome Authentication (CRITICAL)
3. **Story 8.3**: Music Library Browser (HIGH)
4. **Story 8.4**: Playback Controls & Lock Screen (HIGH)
5. **Story 8.5**: Queue & Playlist Management (MEDIUM)
6. **Story 8.6**: Search & Discovery (MEDIUM)
7. **Story 8.8**: Settings & Preferences (LOW)
8. **Story 8.7**: Lidarr Integration (LOW)

## Success Metrics

- Background audio plays reliably for 1+ hour without interruption
- Lock screen controls work consistently
- Library browsing feels responsive (<500ms load times)
- Memory usage stays under 200MB during playback
- Battery impact is minimal compared to Spotify/Apple Music

## Future Considerations (Epic 9+)

- Offline mode with track downloads
- CarPlay integration
- Widget support
- Apple Watch companion
- Handoff between web and mobile
- Scrobbling to Last.fm
- Lyrics display

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial Epic 8 PRD - iOS Companion App | SM Agent |
