# Epic 8 Story 8.5: Queue & Playlist Management

## Status
Draft

## Priority
Medium (Enhanced feature - improves listening experience)

## Story
**As a** user,
**I want** to manage my playback queue and access my Navidrome playlists,
**so that** I can organize my listening sessions and enjoy curated music collections.

## Acceptance Criteria

1. Queue View screen:
   - Access from FullPlayer (queue icon button)
   - Show currently playing track highlighted
   - List of upcoming tracks with artwork, title, artist
   - Drag-to-reorder tracks
   - Swipe-to-remove individual tracks
   - "Clear Queue" action
   - Track count and total duration header

2. Add to Queue actions:
   - "Play Next" - insert after current track
   - "Add to Queue" - append to end
   - Available from: song long-press, album actions, playlist actions
   - Toast confirmation on add

3. Playlists List screen:
   - Fetch and display all Navidrome playlists
   - Playlist name, track count, total duration
   - Artwork (first album art or placeholder)
   - Pull-to-refresh

4. Playlist Detail screen:
   - Playlist header with name, description, track count
   - Track list with artwork, title, artist, duration
   - "Play All" button - replaces queue
   - "Shuffle" button - replaces queue with shuffled order
   - "Add to Queue" button - appends all tracks
   - Individual track actions (play, add next, add to queue)

5. Queue persistence:
   - Save queue state when app backgrounds
   - Restore queue on app launch
   - Resume from last position (optional)

6. Now Playing context:
   - Show "Playing from: [Playlist Name]" or "Playing from: [Album Name]"
   - In FullPlayer and MiniPlayer

## Tasks / Subtasks

### Queue View Screen (AC: 1)
- [ ] Create `components/player/QueueView.tsx`
- [ ] Add queue button to FullPlayer header
- [ ] Fetch queue with `TrackPlayer.getQueue()`
- [ ] Display with FlatList, highlight current track
- [ ] Implement drag-to-reorder with `react-native-draggable-flatlist`:
  ```typescript
  import DraggableFlatList from 'react-native-draggable-flatlist';

  const onDragEnd = async ({ data, from, to }) => {
    await TrackPlayer.move(from, to);
  };
  ```
- [ ] Implement swipe-to-remove with gesture handler
- [ ] Add "Clear Queue" button with confirmation
- [ ] Show track count and total duration in header

### Add to Queue Actions (AC: 2)
- [ ] Create `hooks/useQueueActions.ts`:
  ```typescript
  export function useQueueActions() {
    const playNext = async (track: Track) => {
      const currentIndex = await TrackPlayer.getActiveTrackIndex();
      await TrackPlayer.add(track, currentIndex + 1);
      toast.show('Added to play next');
    };

    const addToQueue = async (track: Track) => {
      await TrackPlayer.add(track);
      toast.show('Added to queue');
    };

    return { playNext, addToQueue };
  }
  ```
- [ ] Add actions to song context menu (from Story 8.3)
- [ ] Add actions to album detail screen
- [ ] Add actions to playlist detail screen
- [ ] Show toast confirmations

### Playlists List Screen (AC: 3)
- [ ] Create `app/(main)/playlists/index.tsx`
- [ ] Add Playlists tab to bottom navigation (or as nested screen)
- [ ] Fetch playlists: `GET /rest/getPlaylists.view`
- [ ] Create `components/library/PlaylistCard.tsx`:
  - Artwork (first track's album art)
  - Playlist name
  - Track count, duration
- [ ] Implement pull-to-refresh
- [ ] Add loading skeleton
- [ ] Add empty state

### Playlist Detail Screen (AC: 4)
- [ ] Create `app/(main)/playlists/[id].tsx`
- [ ] Fetch playlist with tracks: `GET /rest/getPlaylist.view?id={id}`
- [ ] Create `components/library/PlaylistHeader.tsx`:
  - Artwork mosaic or single image
  - Playlist name
  - Owner, track count, duration
- [ ] Action buttons row: Play All, Shuffle, Add to Queue
- [ ] Track list with SongListItem
- [ ] Implement play actions:
  ```typescript
  const playPlaylist = async (shuffle = false) => {
    await TrackPlayer.reset();
    const tracks = playlist.entry.map(songToTrack);
    if (shuffle) shuffleArray(tracks);
    await TrackPlayer.add(tracks);
    await TrackPlayer.play();
  };
  ```

### Queue Persistence (AC: 5)
- [ ] Create `lib/services/queue-persistence.ts`:
  ```typescript
  export async function saveQueueState() {
    const queue = await TrackPlayer.getQueue();
    const position = await TrackPlayer.getPosition();
    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    await AsyncStorage.setItem('queue_state', JSON.stringify({
      queue, position, currentIndex
    }));
  }

  export async function restoreQueueState() {
    const saved = await AsyncStorage.getItem('queue_state');
    if (saved) {
      const { queue, position, currentIndex } = JSON.parse(saved);
      await TrackPlayer.add(queue);
      await TrackPlayer.skip(currentIndex);
      await TrackPlayer.seekTo(position);
    }
  }
  ```
- [ ] Call `saveQueueState` on app background (AppState listener)
- [ ] Call `restoreQueueState` on app launch

### Now Playing Context (AC: 6)
- [ ] Track source in player store:
  ```typescript
  interface PlayerState {
    playingFrom: {
      type: 'album' | 'playlist' | 'artist' | 'search';
      name: string;
      id: string;
    } | null;
  }
  ```
- [ ] Set context when starting playback from album/playlist
- [ ] Display in MiniPlayer and FullPlayer

## Dev Notes

### Navidrome Playlist Endpoints

**Get all playlists:**
```
GET /rest/getPlaylists.view?...auth...
```
Response:
```json
{
  "subsonic-response": {
    "playlists": {
      "playlist": [
        {
          "id": "pl-1",
          "name": "My Playlist",
          "songCount": 25,
          "duration": 4500,
          "owner": "user",
          "public": false,
          "created": "2024-01-01T00:00:00Z",
          "changed": "2024-01-15T00:00:00Z"
        }
      ]
    }
  }
}
```

**Get playlist with tracks:**
```
GET /rest/getPlaylist.view?id={playlistId}&...auth...
```
Response includes `entry` array with full track objects.

### react-native-draggable-flatlist

```bash
npx expo install react-native-draggable-flatlist
```

```typescript
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';

<DraggableFlatList
  data={queue}
  keyExtractor={(item) => item.id}
  onDragEnd={({ data }) => reorderQueue(data)}
  renderItem={({ item, drag, isActive }) => (
    <ScaleDecorator>
      <TouchableOpacity onLongPress={drag} disabled={isActive}>
        <QueueItem track={item} isActive={isActive} />
      </TouchableOpacity>
    </ScaleDecorator>
  )}
/>
```

### TrackPlayer Queue Methods

```typescript
// Get queue
const queue = await TrackPlayer.getQueue();

// Add tracks
await TrackPlayer.add(tracks);                    // Add to end
await TrackPlayer.add(tracks, insertBeforeIndex); // Insert at position

// Remove tracks
await TrackPlayer.remove(index);          // Remove single
await TrackPlayer.remove([0, 2, 4]);      // Remove multiple
await TrackPlayer.removeUpcomingTracks(); // Remove all after current

// Reorder
await TrackPlayer.move(fromIndex, toIndex);

// Clear
await TrackPlayer.reset(); // Stops playback and clears queue
```

### File Structure

```
app/(main)/
├── playlists/
│   ├── index.tsx         # Playlists list
│   └── [id].tsx          # Playlist detail

components/
├── player/
│   └── QueueView.tsx     # Queue management modal
├── library/
│   ├── PlaylistCard.tsx
│   └── PlaylistHeader.tsx

hooks/
└── useQueueActions.ts    # Play next, add to queue

lib/services/
└── queue-persistence.ts  # Save/restore queue state
```

## Testing

### Test Cases

1. **Queue View**
   - Shows current and upcoming tracks
   - Drag reorder updates queue
   - Swipe remove deletes track
   - Clear queue empties all

2. **Add to Queue**
   - Play Next inserts correctly
   - Add to Queue appends
   - Toast confirms action

3. **Playlists**
   - Lists all playlists
   - Shows correct track counts
   - Pull to refresh works

4. **Playlist Detail**
   - Shows all tracks
   - Play All replaces queue and plays
   - Shuffle randomizes order

5. **Persistence**
   - Queue saved on background
   - Queue restored on launch
   - Position restored correctly

## Definition of Done

- [ ] Queue view accessible from FullPlayer
- [ ] Drag to reorder works
- [ ] Swipe to remove works
- [ ] Play Next and Add to Queue work from all contexts
- [ ] Playlists list displays all Navidrome playlists
- [ ] Playlist detail shows tracks with actions
- [ ] Play All and Shuffle work correctly
- [ ] Queue persists across app restarts
- [ ] Now Playing context shows source

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial story draft | SM Agent |
