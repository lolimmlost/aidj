# AIDJ - Product Requirements Document
## React Native Mobile App Rebuild

**Version:** 1.0
**Date:** December 2024
**Source:** Reverse-engineered from existing TanStack Start web app

---

## 1. Executive Summary

AIDJ is a personal music streaming and DJ assistant application that integrates with self-hosted Navidrome servers. The app provides intelligent music recommendations, playlist management, and advanced DJ tools powered by AI.

**Why React Native?**
The current web app has iOS Safari limitations for background audio playback. React Native with `react-native-track-player` provides native background audio, lock screen controls, and gapless playback.

---

## 2. Core Integrations

### 2.1 Navidrome (Primary Music Source)
- **Purpose:** Self-hosted music server (Subsonic API compatible)
- **Features:**
  - Stream audio files
  - Browse library (artists, albums, tracks)
  - Manage playlists
  - Star/favorite tracks
  - Scrobble plays
  - Get album artwork

### 2.2 Last.fm
- **Purpose:** Music metadata and recommendations
- **Features:**
  - Similar artists lookup
  - Similar tracks lookup
  - Top tracks by artist
  - Search functionality
  - Scrobbling (play tracking)

### 2.3 Lidarr
- **Purpose:** Music acquisition/download management
- **Features:**
  - Search for artists/albums
  - Add to download queue
  - Monitor download status
  - Check availability
  - Download history

### 2.4 LLM Providers (AI Features)
- **Supported:** OpenRouter, Anthropic, GLM (ZhipuAI)
- **Purpose:** Natural language music recommendations
- **Features:**
  - Mood-based playlist generation
  - Conversational music discovery
  - Context-aware suggestions

---

## 3. Feature Inventory

### 3.1 Audio Playback
| Feature | Description | Priority |
|---------|-------------|----------|
| Stream from Navidrome | Play audio via Subsonic API | P0 |
| Background playback | Continue when app backgrounded | P0 |
| Lock screen controls | Play/pause/skip from iOS Control Center | P0 |
| Queue management | Add, remove, reorder songs | P0 |
| Shuffle mode | Randomize playlist order | P1 |
| Gapless playback | No silence between tracks | P1 |
| Scrobbling | Track plays to Navidrome/Last.fm | P1 |
| Volume control | Adjust playback volume | P1 |

### 3.2 Library Browsing
| Feature | Description | Priority |
|---------|-------------|----------|
| Artists list | Browse all artists | P0 |
| Albums list | Browse all albums | P0 |
| Tracks list | Browse all songs | P0 |
| Artist detail | View artist's albums | P0 |
| Album detail | View album's tracks | P0 |
| Search | Search artists/albums/tracks | P0 |
| Most played | View listening statistics | P1 |
| Top artists | Ranked by play count | P1 |

### 3.3 Playlists
| Feature | Description | Priority |
|---------|-------------|----------|
| Create playlist | New playlist with name | P0 |
| Add songs | Add tracks to playlist | P0 |
| Remove songs | Remove tracks from playlist | P0 |
| Reorder songs | Drag to reorder | P1 |
| Delete playlist | Remove entire playlist | P0 |
| Sync with Navidrome | Two-way playlist sync | P1 |
| Smart playlists | Rule-based dynamic playlists | P2 |
| Liked songs sync | Sync starred songs from Navidrome | P1 |

### 3.4 Recommendations & AI
| Feature | Description | Priority |
|---------|-------------|----------|
| Mood-based recommendations | "Play something energetic" | P1 |
| Similar tracks | Based on current song | P1 |
| Similar artists | Based on library | P1 |
| AI DJ mode | Auto-queue recommendations | P2 |
| Feedback system | Thumbs up/down on recommendations | P1 |
| Listening history analysis | Track patterns over time | P2 |
| Seasonal insights | Time-based listening patterns | P3 |
| Compound scoring | Multi-factor song ranking | P2 |

### 3.5 DJ Tools (Advanced)
| Feature | Description | Priority |
|---------|-------------|----------|
| Playlist generator | AI-powered playlist creation | P2 |
| Energy analyzer | Track energy levels | P3 |
| Harmonic mixer | Key-based mixing suggestions | P3 |
| Beat sync | BPM matching | P3 |
| Transition effects | Crossfade, echo, etc. | P3 |
| Set planner | Plan DJ sets | P3 |
| Genre analyzer | Categorize tracks | P3 |

### 3.6 Downloads (Lidarr Integration)
| Feature | Description | Priority |
|---------|-------------|----------|
| Search music | Find artists/albums to download | P2 |
| Add to Lidarr | Queue for download | P2 |
| Download status | Monitor progress | P2 |
| Download history | View past downloads | P3 |

### 3.7 Settings & Configuration
| Feature | Description | Priority |
|---------|-------------|----------|
| Navidrome connection | Server URL, credentials | P0 |
| Last.fm connection | API key configuration | P1 |
| Lidarr connection | Server URL, API key | P2 |
| LLM provider setup | API keys for AI features | P2 |
| Playback settings | Quality, crossfade | P1 |
| Notification settings | What alerts to show | P2 |
| Theme settings | Light/dark mode | P1 |

### 3.8 Authentication
| Feature | Description | Priority |
|---------|-------------|----------|
| User registration | Create account | P0 |
| Login | Email/password auth | P0 |
| Session management | Stay logged in | P0 |
| Profile management | Update user info | P2 |

---

## 4. Data Models

### 4.1 Song
```typescript
interface Song {
  id: string;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  genre?: string;
}
```

### 4.2 Playlist
```typescript
interface Playlist {
  id: string;
  name: string;
  description?: string;
  songCount: number;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
  songs: PlaylistSong[];
}

interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
}
```

### 4.3 Artist
```typescript
interface Artist {
  id: string;
  name: string;
  albumCount: number;
  songCount: number;
  playCount?: number;
}
```

### 4.4 Album
```typescript
interface Album {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  year?: number;
  genre?: string;
  songCount: number;
  duration: number;
  coverArt?: string;
}
```

### 4.5 Recommendation Feedback
```typescript
interface SongFeedback {
  id: string;
  songId: string;
  songArtistTitle: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  source: 'library' | 'recommendation' | 'ai_dj' | 'playlist_generator';
  createdAt: Date;
}
```

### 4.6 Listening History
```typescript
interface ListeningRecord {
  id: string;
  songId: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  duration: number;
  playDuration: number;
  playedAt: Date;
}
```

---

## 5. API Endpoints (Backend)

### 5.1 Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/session` - Get current session

### 5.2 Playlists
- `GET /api/playlists` - List all playlists
- `POST /api/playlists` - Create playlist
- `GET /api/playlists/:id` - Get playlist details
- `PUT /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist
- `POST /api/playlists/:id/songs` - Add song to playlist
- `DELETE /api/playlists/:id/songs/:songId` - Remove song
- `PUT /api/playlists/:id/reorder` - Reorder songs
- `POST /api/playlists/sync` - Sync with Navidrome
- `POST /api/playlists/smart` - Create smart playlist
- `POST /api/playlists/smart/preview` - Preview smart playlist

### 5.3 Recommendations
- `GET /api/recommendations` - Get recommendations
- `POST /api/recommendations/feedback` - Submit feedback
- `GET /api/recommendations/analytics` - Get analytics
- `POST /api/recommendations/clear` - Clear history
- `GET /api/recommendations/seasonal-insights` - Seasonal data
- `POST /api/recommendations/seasonal-playlist` - Generate seasonal playlist
- `GET /api/recommendations/export` - Export data

### 5.4 Library
- `GET /api/library/most-played` - Most played tracks
- `GET /api/library/top-artists` - Top artists by plays
- `POST /api/library-profile/analyze` - Analyze library

### 5.5 Listening History
- `POST /api/listening-history/record` - Record a play
- `GET /api/listening-history/compound-scores` - Get scores

### 5.6 AI DJ
- `POST /api/ai-dj/recommendations` - Get AI recommendations

### 5.7 Last.fm Proxy
- `GET /api/lastfm/similar-artists` - Similar artists
- `GET /api/lastfm/similar-tracks` - Similar tracks
- `GET /api/lastfm/top-tracks` - Top tracks
- `GET /api/lastfm/search` - Search

### 5.8 Lidarr Proxy
- `GET /api/lidarr/search` - Search for music
- `POST /api/lidarr/add` - Add to download
- `GET /api/lidarr/status` - Check status
- `GET /api/lidarr/availability` - Check if available
- `GET /api/lidarr/history` - Download history
- `POST /api/lidarr/cancel` - Cancel download

### 5.9 Navidrome Proxy
- `GET /api/navidrome/rest/*` - Proxy Subsonic API calls
- `GET /api/navidrome/stream/:id` - Stream audio file

### 5.10 Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences

---

## 6. State Management (Zustand Stores)

### 6.1 Audio Store
```typescript
interface AudioState {
  // Playback
  playlist: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffled: boolean;

  // AI DJ
  aiDJEnabled: boolean;
  aiDJLastQueueTime: number;
  aiQueuedSongIds: Set<string>;

  // Actions
  playSong: (songId: string, playlist?: Song[]) => void;
  nextSong: () => void;
  previousSong: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  toggleShuffle: () => void;
  addToQueue: (songs: Song[]) => void;
  // ... more actions
}
```

### 6.2 Preferences Store
```typescript
interface PreferencesState {
  navidromeUrl: string;
  navidromeUsername: string;
  navidromePassword: string;
  lastfmApiKey: string;
  lidarrUrl: string;
  lidarrApiKey: string;
  llmProvider: string;
  llmApiKey: string;
  theme: 'light' | 'dark' | 'system';
  // ... more preferences
}
```

---

## 7. React Native Specific Considerations

### 7.1 Required Packages
```json
{
  "react-native-track-player": "^4.x",
  "@react-native-async-storage/async-storage": "^2.x",
  "zustand": "^5.x",
  "@tanstack/react-query": "^5.x",
  "expo-router": "^6.x",
  "nativewind": "^4.x"
}
```

### 7.2 Background Audio Setup
- Configure `react-native-track-player` service
- Set up playback capabilities for lock screen
- Handle audio interruptions (calls, other apps)
- Implement queue management

### 7.3 Offline Support (Future)
- Cache album artwork
- Download tracks for offline playback
- Sync playlists when online

---

## 8. Migration Path

### Phase 1: Core Playback (MVP)
- [ ] Project setup (Expo + NativeWind)
- [ ] Navidrome authentication
- [ ] Library browsing (artists, albums, tracks)
- [ ] Audio playback with react-native-track-player
- [ ] Background audio & lock screen controls
- [ ] Basic queue management

### Phase 2: Playlist & Library
- [ ] Playlist CRUD
- [ ] Add/remove songs from playlists
- [ ] Search functionality
- [ ] Favorites/liked songs

### Phase 3: Recommendations
- [ ] Last.fm integration
- [ ] Similar tracks/artists
- [ ] Feedback system (thumbs up/down)
- [ ] Mood-based recommendations

### Phase 4: AI Features
- [ ] LLM provider integration
- [ ] AI DJ mode
- [ ] Playlist generator
- [ ] Listening analytics

### Phase 5: Advanced DJ Tools
- [ ] Energy analyzer
- [ ] Harmonic mixing
- [ ] Transition effects
- [ ] Set planner

### Phase 6: Downloads
- [ ] Lidarr integration
- [ ] Download queue
- [ ] Status monitoring

---

## 9. Technical Architecture

### 9.1 Frontend (React Native)
```
apps/mobile/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth screens
│   ├── (tabs)/            # Main tab navigator
│   │   ├── index.tsx      # Home/Dashboard
│   │   ├── library/       # Library screens
│   │   ├── playlists/     # Playlist screens
│   │   ├── dj/            # DJ tools
│   │   └── settings/      # Settings
│   └── _layout.tsx        # Root layout
├── components/            # Shared components
├── hooks/                 # Custom hooks
├── lib/
│   ├── api/              # API client
│   ├── services/         # Business logic
│   └── stores/           # Zustand stores
└── services/
    └── playback.ts       # Track player service
```

### 9.2 Backend (Keep Existing)
The existing TanStack Start backend can be reused as-is:
- Serves API endpoints
- Proxies Navidrome/Last.fm/Lidarr
- Manages user data
- Handles authentication

---

## 10. Success Metrics

- Background audio works reliably on iOS
- Lock screen controls functional
- Gapless playback between tracks
- <2s cold start to playback
- Feature parity with web app (core features)

---

## Appendix: Existing Service Files

For implementation reference, key service files from web app:
- `src/lib/services/navidrome.ts` - Navidrome API client
- `src/lib/services/lastfm/` - Last.fm integration
- `src/lib/services/lidarr.ts` - Lidarr integration
- `src/lib/services/recommendations.ts` - Recommendation engine
- `src/lib/services/mood-translator.ts` - NLP mood parsing
- `src/lib/services/ai-dj/` - AI DJ logic
- `src/lib/stores/audio.ts` - Audio state management
