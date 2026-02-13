# Epic 8 Story 8.4: Playback Controls & Lock Screen Integration

## Status
Draft

## Priority
High (Core feature - completes the music playback experience)

## Story
**As a** user,
**I want** full playback controls both in-app and on the iOS lock screen/Control Center,
**so that** I can control my music without unlocking my phone or switching apps.

## Acceptance Criteria

1. Create MiniPlayer component (persistent bottom bar):
   - Album artwork thumbnail (48x48)
   - Song title (truncate with ellipsis)
   - Artist name (smaller, muted)
   - Play/Pause button
   - Tap anywhere (except button) to expand to FullPlayer
   - Appears when a track is loaded/playing
   - Sits above tab bar navigation

2. Create FullPlayer screen (modal/sheet):
   - Large album artwork (full width, square)
   - Song title, artist, album name
   - Progress bar with:
     - Current position (mm:ss)
     - Seek scrubber (draggable)
     - Total duration (mm:ss)
   - Playback controls row:
     - Shuffle toggle
     - Previous track
     - Play/Pause (large, prominent)
     - Next track
     - Repeat toggle (off/all/one)
   - Swipe down to dismiss back to MiniPlayer
   - Background blur/gradient effect

3. Lock Screen / Control Center integration:
   - Album artwork displayed
   - Song title and artist
   - Play/pause, previous, next buttons work
   - Seek position updates in real-time
   - Scrubbing from lock screen works

4. Handle audio interruptions gracefully:
   - Phone call pauses playback, resumes after
   - Siri activation pauses, resumes after
   - Other app audio (video, game) pauses playback
   - AirPods disconnect pauses playback
   - AirPods reconnect resumes (if was playing)

5. Implement queue awareness:
   - Show "Up Next" preview in FullPlayer (optional)
   - Previous/Next buttons respect queue
   - Disable Previous if at start of queue
   - Disable Next if at end (unless repeat is on)

6. Visual feedback states:
   - Loading indicator when buffering
   - Error state if stream fails
   - "Now Playing" animation on MiniPlayer artwork

7. Shuffle and Repeat modes:
   - Shuffle: randomize remaining queue
   - Repeat Off: stop after last track
   - Repeat All: loop entire queue
   - Repeat One: loop current track
   - Persist preference

## Tasks / Subtasks

### MiniPlayer Component (AC: 1)
- [ ] Create `components/player/MiniPlayer.tsx`:
  ```typescript
  interface MiniPlayerProps {
    onExpand: () => void;
  }
  ```
- [ ] Subscribe to TrackPlayer state with hooks:
  ```typescript
  import { usePlaybackState, useActiveTrack, useProgress } from 'react-native-track-player';
  ```
- [ ] Layout: Row with artwork, text, play button
- [ ] Artwork: 48x48 rounded, use `getCoverArtUrl`
- [ ] Text: Title (bold), Artist (muted), both truncated
- [ ] Play/Pause button with loading state
- [ ] Pressable wrapper for expand action
- [ ] Animate appearance (slide up)
- [ ] Position above tab bar using absolute positioning or SafeAreaView

### FullPlayer Screen (AC: 2)
- [ ] Create `components/player/FullPlayer.tsx` as a modal/bottom sheet
- [ ] Use `@gorhom/bottom-sheet` or similar for gesture dismissal
- [ ] Create `components/player/AlbumArtwork.tsx`:
  - Full width square image
  - Rounded corners
  - Shadow/glow effect
  - Fallback placeholder
- [ ] Create `components/player/ProgressBar.tsx`:
  ```typescript
  interface ProgressBarProps {
    position: number;
    duration: number;
    onSeek: (position: number) => void;
  }
  ```
  - Use Slider or custom gesture handler
  - Time labels on left/right
- [ ] Create `components/player/PlaybackControls.tsx`:
  - Shuffle button (toggles, shows active state)
  - Previous button (with disabled state)
  - Play/Pause button (large, circular)
  - Next button (with disabled state)
  - Repeat button (cycles: off → all → one)
- [ ] Create `components/player/TrackInfo.tsx`:
  - Title (large, bold)
  - Artist (medium, tappable → artist detail)
  - Album (small, muted)
- [ ] Implement swipe-down to dismiss
- [ ] Add background gradient/blur

### TrackPlayer Hooks Integration (AC: 1, 2, 3)
- [ ] Create `hooks/usePlayer.ts` custom hook:
  ```typescript
  export function usePlayer() {
    const playbackState = usePlaybackState();
    const activeTrack = useActiveTrack();
    const progress = useProgress();
    const playerStore = usePlayerStore();

    const isPlaying = playbackState.state === State.Playing;
    const isBuffering = playbackState.state === State.Buffering;
    const isLoading = playbackState.state === State.Loading;

    return {
      isPlaying,
      isBuffering,
      isLoading,
      currentTrack: activeTrack,
      position: progress.position,
      duration: progress.duration,
      buffered: progress.buffered,
      // Actions
      play: () => TrackPlayer.play(),
      pause: () => TrackPlayer.pause(),
      seekTo: (pos: number) => TrackPlayer.seekTo(pos),
      skipToNext: () => TrackPlayer.skipToNext(),
      skipToPrevious: () => TrackPlayer.skipToPrevious(),
    };
  }
  ```
- [ ] Sync TrackPlayer events to Zustand store for global state

### Lock Screen Integration (AC: 3)
- [ ] Verify TrackPlayer metadata updates lock screen automatically
- [ ] Ensure artwork URL is accessible (not blocked by auth)
- [ ] Handle `Event.RemoteSeek` for lock screen scrubbing:
  ```typescript
  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
  });
  ```
- [ ] Test Control Center on iOS Simulator and device
- [ ] Test CarPlay display (if available)

### Audio Interruption Handling (AC: 4)
- [ ] Handle `Event.RemoteDuck` for interruptions:
  ```typescript
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      // Another app requested audio focus
      await TrackPlayer.pause();
    } else if (event.permanent) {
      // Permanent loss (e.g., phone call on some devices)
      await TrackPlayer.stop();
    } else {
      // Temporary duck ended, can resume
      await TrackPlayer.play();
    }
  });
  ```
- [ ] Handle `Event.PlaybackError` gracefully
- [ ] Test with phone call simulation
- [ ] Test with Siri activation
- [ ] Test AirPods disconnect/reconnect

### Queue Awareness (AC: 5)
- [ ] Get queue with `TrackPlayer.getQueue()`
- [ ] Get current index with `TrackPlayer.getActiveTrackIndex()`
- [ ] Disable Previous when index === 0 (unless repeat on)
- [ ] Disable Next when index === queue.length - 1 (unless repeat on)
- [ ] Optional: Show next track preview in FullPlayer

### Visual States (AC: 6)
- [ ] Show spinner overlay on artwork when buffering
- [ ] Show error toast/banner when stream fails
- [ ] Add "Now Playing" animation (equalizer bars) on MiniPlayer
- [ ] Animate play/pause button transition

### Shuffle & Repeat (AC: 7)
- [ ] Implement shuffle toggle:
  ```typescript
  const toggleShuffle = async () => {
    const queue = await TrackPlayer.getQueue();
    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    if (shuffleEnabled) {
      // Restore original order (need to track this)
    } else {
      // Shuffle remaining tracks after current
      const remaining = queue.slice(currentIndex + 1);
      const shuffled = shuffleArray(remaining);
      await TrackPlayer.removeUpcomingTracks();
      await TrackPlayer.add(shuffled);
    }
    setShuffleEnabled(!shuffleEnabled);
  };
  ```
- [ ] Implement repeat modes:
  ```typescript
  await TrackPlayer.setRepeatMode(RepeatMode.Off);    // Stop at end
  await TrackPlayer.setRepeatMode(RepeatMode.Queue);  // Loop queue
  await TrackPlayer.setRepeatMode(RepeatMode.Track);  // Loop track
  ```
- [ ] Persist shuffle/repeat to AsyncStorage
- [ ] Load preferences on app start

### Integration with App Layout
- [ ] Add MiniPlayer to `app/(main)/_layout.tsx`
- [ ] Position above TabBar
- [ ] Create FullPlayer modal route or overlay
- [ ] Handle safe area insets

## Dev Notes

### react-native-track-player Hooks

**Built-in hooks (v4+):**
```typescript
import {
  usePlaybackState,   // Current playback state
  useActiveTrack,     // Currently playing track metadata
  useProgress,        // Position, duration, buffered
  useIsPlaying,       // Simple boolean
} from 'react-native-track-player';
```

**PlaybackState values:**
```typescript
import { State } from 'react-native-track-player';

State.None       // No track loaded
State.Ready      // Track loaded, not playing
State.Playing    // Playing
State.Paused     // Paused
State.Stopped    // Stopped
State.Buffering  // Buffering
State.Loading    // Loading track
State.Error      // Error occurred
```

### Progress Bar Implementation

**Using useProgress:**
```typescript
const { position, duration, buffered } = useProgress(200); // Update interval ms

// Format time
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
```

**Seek with Slider:**
```typescript
import Slider from '@react-native-community/slider';

<Slider
  style={{ flex: 1, height: 40 }}
  minimumValue={0}
  maximumValue={duration}
  value={position}
  onSlidingComplete={async (value) => {
    await TrackPlayer.seekTo(value);
  }}
  minimumTrackTintColor="#7c3aed"
  maximumTrackTintColor="#333"
  thumbTintColor="#7c3aed"
/>
```

### Remote Events (Lock Screen)

These are already registered in Story 8.1's PlaybackService. Verify they work:
```typescript
// Already in playbackService.ts
Event.RemotePlay       // Lock screen play
Event.RemotePause      // Lock screen pause
Event.RemoteNext       // Lock screen next
Event.RemotePrevious   // Lock screen previous
Event.RemoteSeek       // Lock screen scrub
Event.RemoteDuck       // Audio interruption
```

### Metadata for Lock Screen

When adding tracks, include all metadata:
```typescript
await TrackPlayer.add({
  id: song.id,
  url: getStreamUrl(song.id),
  title: song.title,
  artist: song.artist,
  album: song.album,
  artwork: getCoverArtUrl(song.coverArt, 512), // Higher res for lock screen
  duration: song.duration,
});
```

### Bottom Sheet for FullPlayer

**Using @gorhom/bottom-sheet:**
```bash
npx expo install @gorhom/bottom-sheet react-native-reanimated react-native-gesture-handler
```

```typescript
import BottomSheet from '@gorhom/bottom-sheet';

const snapPoints = useMemo(() => ['100%'], []);

<BottomSheet
  ref={bottomSheetRef}
  index={-1}
  snapPoints={snapPoints}
  enablePanDownToClose
  backgroundStyle={{ backgroundColor: '#0a0a0a' }}
  handleIndicatorStyle={{ backgroundColor: '#666' }}
>
  <FullPlayerContent />
</BottomSheet>
```

### MiniPlayer Positioning

Position MiniPlayer above the tab bar:
```typescript
// In (main)/_layout.tsx
<View style={{ flex: 1 }}>
  <Tabs ... />
  <MiniPlayer onExpand={() => bottomSheetRef.current?.expand()} />
</View>
```

Or use absolute positioning:
```typescript
<View style={{ position: 'absolute', bottom: TAB_BAR_HEIGHT, left: 0, right: 0 }}>
  <MiniPlayer ... />
</View>
```

### UI Pattern from aidj Web

**MiniPlayer layout (from audio-player.tsx:872-956):**
```
┌─────────────────────────────────────────────────────┐
│ [Artwork] Title                    [◀] [▶/❚❚] [▶▶] │
│  48x48   Artist                                     │
└─────────────────────────────────────────────────────┘
```

**FullPlayer layout:**
```
┌─────────────────────────────────────────────────────┐
│              ─── (drag handle)                      │
│                                                     │
│         ┌─────────────────────┐                     │
│         │                     │                     │
│         │      ARTWORK        │                     │
│         │      300x300        │                     │
│         │                     │                     │
│         └─────────────────────┘                     │
│                                                     │
│              Song Title                             │
│              Artist Name                            │
│              Album Name                             │
│                                                     │
│    0:00  ━━━━━━━━━━○━━━━━━━━━━  3:45               │
│                                                     │
│         🔀    ◀◀    ▶/❚❚    ▶▶    🔁               │
│       shuffle prev  play   next  repeat            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### File Structure

```
components/player/
├── MiniPlayer.tsx        # Collapsed player bar
├── FullPlayer.tsx        # Expanded modal player
├── AlbumArtwork.tsx      # Artwork with loading/fallback
├── ProgressBar.tsx       # Seek slider with times
├── PlaybackControls.tsx  # Play/pause/skip buttons
├── TrackInfo.tsx         # Title/artist/album text
├── ShuffleButton.tsx     # Shuffle toggle
├── RepeatButton.tsx      # Repeat mode toggle
└── index.ts              # Re-exports

hooks/
├── usePlayer.ts          # Combined player state hook
└── usePlayerPreferences.ts # Shuffle/repeat persistence
```

### Dependencies to Add

```bash
npx expo install @gorhom/bottom-sheet
npx expo install @react-native-community/slider
# react-native-reanimated and react-native-gesture-handler should already be installed
```

## Testing

### Test Cases

1. **MiniPlayer**
   - Appears when track is loaded
   - Shows correct track info
   - Play/pause button works
   - Tap expands to FullPlayer
   - Hides when queue is empty

2. **FullPlayer**
   - Opens as bottom sheet
   - Swipe down dismisses
   - All track info displays correctly
   - Artwork loads and shows fallback

3. **Progress Bar**
   - Position updates in real-time
   - Dragging seeks to position
   - Times format correctly

4. **Playback Controls**
   - Play/pause toggles playback
   - Next/previous skip tracks
   - Buttons disable appropriately at queue ends

5. **Lock Screen**
   - Artwork shows on lock screen
   - Track info shows
   - Play/pause works
   - Skip buttons work
   - Seek scrubber works

6. **Interruptions**
   - Phone call pauses playback
   - Playback resumes after call
   - AirPods disconnect pauses

7. **Shuffle/Repeat**
   - Shuffle randomizes queue
   - Repeat All loops queue
   - Repeat One loops track
   - Preferences persist

## Definition of Done

- [ ] MiniPlayer shows when track is loaded
- [ ] MiniPlayer shows correct track info and artwork
- [ ] Tap MiniPlayer expands to FullPlayer
- [ ] FullPlayer shows all track info
- [ ] Progress bar updates and seeking works
- [ ] Play/pause/skip buttons work
- [ ] Lock screen shows artwork and controls
- [ ] Lock screen controls work correctly
- [ ] Audio interruptions handled gracefully
- [ ] Shuffle mode works
- [ ] Repeat modes work (off/all/one)
- [ ] Preferences persist across app restarts

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
