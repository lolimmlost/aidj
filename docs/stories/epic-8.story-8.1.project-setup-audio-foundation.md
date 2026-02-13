# Epic 8 Story 8.1: Project Setup & Native Audio Foundation

## Status
Draft

## Priority
Critical (Foundation for all other Epic 8 stories)

## Story
**As a** developer,
**I want** to set up an Expo React Native project with react-native-track-player configured for iOS background audio,
**so that** we have a foundation for building the AIDJ iOS companion app with reliable background playback.

## Acceptance Criteria

1. Create new Expo project with SDK 54 using expo-router for navigation:
   - TypeScript template
   - File-based routing structure matching aidj web patterns
   - Dark theme matching aidj web (purple accent on dark background)

2. Configure project structure:
   ```
   aidj-mobile/
   ├── app/                    # expo-router screens
   │   ├── _layout.tsx         # Root layout with providers
   │   ├── index.tsx           # Entry/splash redirect
   │   ├── (auth)/             # Auth flow screens (future)
   │   │   └── _layout.tsx
   │   └── (main)/             # Main app screens
   │       ├── _layout.tsx     # Tab navigation
   │       └── player.tsx      # Test player screen
   ├── components/             # Reusable components
   │   ├── ui/                 # Base UI components
   │   └── player/             # Player-specific components
   ├── lib/
   │   ├── api.ts              # TanStack Query setup
   │   ├── services/           # Service layer
   │   │   └── track-player.ts # TrackPlayer setup
   │   └── stores/             # Zustand stores
   │       └── player.ts       # Player state
   ├── hooks/                  # Custom hooks
   ├── constants/              # Colors, config
   └── types/                  # TypeScript types
   ```

3. Install and configure react-native-track-player:
   - Add package with Expo config plugin
   - Configure iOS background audio mode in app.json (`UIBackgroundModes: ["audio"]`)
   - Create TrackPlayer service with setup function
   - Register playback service for background execution

4. Create minimal audio playback proof-of-concept:
   - Test screen with play/pause button
   - Load a test audio URL (public domain or Navidrome stream)
   - Verify audio plays when app is in foreground
   - Verify audio continues when app is backgrounded
   - Verify lock screen controls appear (play/pause, track info)

5. Set up core dependencies and providers:
   - TanStack Query v5 with QueryClientProvider
   - Zustand for player state management
   - NativeWind v4 with Tailwind config
   - expo-secure-store for future credential storage

6. Configure development environment:
   - iOS Simulator builds work
   - Physical device testing documented
   - README with setup instructions

7. Create base theme matching aidj web:
   - Background: `#0a0a0a` (near black)
   - Primary/Accent: `#7c3aed` (purple-600)
   - Text: white/gray scale
   - Component styling via NativeWind

## Tasks / Subtasks

### Project Initialization (AC: 1, 2)
- [ ] Create new Expo project: `npx create-expo-app@latest aidj-mobile --template tabs`
- [ ] Remove default template content
- [ ] Configure app.json with correct name, slug, scheme
- [ ] Set up TypeScript strict mode in tsconfig.json
- [ ] Create folder structure as specified in AC 2
- [ ] Initialize git repository

### Audio Player Setup (AC: 3)
- [ ] Install react-native-track-player: `npx expo install react-native-track-player`
- [ ] Add config plugin to app.json:
  ```json
  "plugins": [
    "expo-router",
    "react-native-track-player"
  ]
  ```
- [ ] Add iOS background mode to app.json:
  ```json
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["audio"]
    }
  }
  ```
- [ ] Create `lib/services/track-player.ts` with:
  - `setupPlayer()` function
  - Capability configuration (play, pause, skip, seek)
  - Playback service registration
- [ ] Create `playbackService.ts` for background event handling
- [ ] Initialize TrackPlayer in root layout on app start

### Proof of Concept Player (AC: 4)
- [ ] Create `app/(main)/player.tsx` test screen
- [ ] Add test track loading (use public domain audio URL)
- [ ] Implement play/pause button with state
- [ ] Add track progress display
- [ ] Test foreground playback
- [ ] Test background playback (minimize app)
- [ ] Verify lock screen controls appear
- [ ] Test lock screen play/pause functionality

### State Management (AC: 5)
- [ ] Install Zustand: `npx expo install zustand`
- [ ] Create `lib/stores/player.ts` with:
  - `isPlaying` state
  - `currentTrack` state
  - `queue` state
  - Actions: play, pause, skipNext, skipPrevious
- [ ] Sync Zustand state with TrackPlayer events
- [ ] Install TanStack Query: `npx expo install @tanstack/react-query`
- [ ] Create `lib/api.ts` with QueryClient setup
- [ ] Wrap app in QueryClientProvider

### Styling Setup (AC: 7)
- [ ] Install NativeWind: `npx expo install nativewind tailwindcss`
- [ ] Create `tailwind.config.js` with aidj theme:
  ```js
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        primary: '#7c3aed',
        // ... rest of theme
      }
    }
  }
  ```
- [ ] Create `global.css` with Tailwind directives
- [ ] Configure babel.config.js for NativeWind
- [ ] Create `constants/Colors.ts` with theme values
- [ ] Style test player screen with theme

### Development Environment (AC: 6)
- [ ] Create development build: `npx expo prebuild`
- [ ] Test on iOS Simulator
- [ ] Document physical device testing steps
- [ ] Create README.md with:
  - Prerequisites
  - Setup instructions
  - Running the app
  - Testing background audio
  - Known issues

### Additional Setup
- [ ] Install expo-secure-store for future auth
- [ ] Set up ESLint + Prettier matching aidj config
- [ ] Create .gitignore appropriate for Expo project
- [ ] Add VS Code workspace settings

## Dev Notes

### Reference Implementations

**PaletaApp Structure** (`/home/default/Desktop/dev/PaletaApp/apps/mobile`):
- Expo 54 + expo-router v6 setup
- Zustand store patterns in `stores/`
- TanStack Query in `lib/api.ts`
- NativeWind styling approach
- `app/_layout.tsx` provider structure

**AIDJ Web Audio Patterns** (`/home/default/Desktop/dev/aidj/src`):
- Audio store: `lib/stores/audio.ts` - state shape to mirror
- Player component: `components/ui/audio-player.tsx` - iOS workarounds reference
- Theme colors: `styles.css` - CSS variables to port

### react-native-track-player Setup

**Installation:**
```bash
npx expo install react-native-track-player
```

**app.json configuration:**
```json
{
  "expo": {
    "name": "AIDJ Mobile",
    "slug": "aidj-mobile",
    "scheme": "aidj",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "plugins": [
      "expo-router",
      "react-native-track-player"
    ],
    "ios": {
      "bundleIdentifier": "com.aidj.mobile",
      "supportsTablet": true,
      "infoPlist": {
        "UIBackgroundModes": ["audio"]
      }
    }
  }
}
```

**TrackPlayer Service (`lib/services/track-player.ts`):**
```typescript
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';

export async function setupPlayer() {
  let isSetup = false;
  try {
    await TrackPlayer.getActiveTrackIndex();
    isSetup = true;
  } catch {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      progressUpdateEventInterval: 2,
    });
    isSetup = true;
  }
  return isSetup;
}

export async function addTrack(track: {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
}) {
  await TrackPlayer.add(track);
}
```

**Playback Service (`playbackService.ts`):**
```typescript
import TrackPlayer, { Event } from 'react-native-track-player';

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
}
```

**Register in index.js/app entry:**
```typescript
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './playbackService';

TrackPlayer.registerPlaybackService(() => PlaybackService);
```

### Zustand Player Store Pattern

```typescript
// lib/stores/player.ts
import { create } from 'zustand';
import TrackPlayer, { State } from 'react-native-track-player';

interface Track {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration?: number;
}

interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  queue: Track[];
  position: number;
  duration: number;

  // Actions
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setQueue: (queue: Track[]) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;

  // Player controls
  play: () => Promise<void>;
  pause: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  currentTrack: null,
  queue: [],
  position: 0,
  duration: 0,

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTrack: (track) => set({ currentTrack: track }),
  setQueue: (queue) => set({ queue }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),

  play: async () => {
    await TrackPlayer.play();
    set({ isPlaying: true });
  },
  pause: async () => {
    await TrackPlayer.pause();
    set({ isPlaying: false });
  },
  skipNext: async () => {
    await TrackPlayer.skipToNext();
  },
  skipPrevious: async () => {
    await TrackPlayer.skipToPrevious();
  },
  seekTo: async (position) => {
    await TrackPlayer.seekTo(position);
    set({ position });
  },
}));
```

### Test Audio URLs

For proof-of-concept testing without Navidrome:
```typescript
const TEST_TRACKS = [
  {
    id: 'test-1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'Test Track 1',
    artist: 'SoundHelix',
    artwork: 'https://picsum.photos/200',
  },
  {
    id: 'test-2',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'Test Track 2',
    artist: 'SoundHelix',
    artwork: 'https://picsum.photos/200',
  },
];
```

### Project Location

Create new project at: `/home/default/Desktop/dev/aidj-mobile/`

This is a NEW separate project directory, not inside the aidj web project. The mobile app will:
- Connect to the aidj web API for recommendations
- Connect directly to Navidrome for streaming
- Share patterns/types but be independently deployable

## Testing

### Testing Standards
- Use Jest + React Native Testing Library
- Test files co-located: `__tests__/` folders or `.test.ts` suffix
- Minimum: unit tests for TrackPlayer service functions
- Integration: test player store state transitions

### Test Cases for Story 8.1

1. **TrackPlayer Setup**
   - `setupPlayer()` initializes without error
   - Capabilities are configured correctly
   - Multiple calls to setup are idempotent

2. **Track Loading**
   - `addTrack()` adds track to queue
   - Track metadata is preserved
   - Invalid URLs are handled gracefully

3. **Player Store**
   - Initial state is correct
   - `play()` updates isPlaying to true
   - `pause()` updates isPlaying to false
   - State syncs with TrackPlayer events

4. **Manual Testing (Required)**
   - [ ] Audio plays in foreground
   - [ ] Audio continues when app backgrounded
   - [ ] Lock screen shows track info
   - [ ] Lock screen play/pause works
   - [ ] Lock screen skip buttons work (if queue has multiple tracks)
   - [ ] Audio resumes after phone call
   - [ ] Audio resumes after notification

## Definition of Done

- [ ] Project builds successfully: `npx expo run:ios`
- [ ] Audio plays in foreground
- [ ] Audio continues playing when app is backgrounded
- [ ] Lock screen displays track metadata
- [ ] Lock screen controls (play/pause) work
- [ ] Zustand store tracks player state
- [ ] TanStack Query provider is set up
- [ ] NativeWind styling works with aidj theme
- [ ] README documents setup and testing
- [ ] All unit tests pass

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial story draft | SM Agent |

## Dev Agent Record

### Agent Model Used
(To be filled by dev agent)

### Debug Log References
(To be filled by dev agent)

### Completion Notes
(To be filled by dev agent)

### File List
(To be filled by dev agent)

## QA Results
(To be filled by QA agent)
