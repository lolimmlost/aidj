# Epic 7 Story 7.3: Discovery-to-Download Pipeline

## Status
Ready for Development

## Priority
High (Completes the discovery loop)

## Story
As a user,
I want discovered songs to automatically download via Lidarr and appear in my queue,
so that I can seamlessly add new music while listening (like Spotify's AI DJ).

## Acceptance Criteria

1. For discovery recommendations, show "Download" action button (instead of Queue)

2. When user clicks "Download":
   - Search Lidarr for the artist
   - If artist not in Lidarr: add artist with all albums monitored
   - If artist exists: ensure target album is monitored
   - Show confirmation toast with status
   - Add to discovery tracking queue

3. Create discovery queue tracker that:
   - Tracks all pending discoveries with status
   - Stores: artist, album, track, requestedAt, status
   - Persists across sessions (localStorage + optional DB sync)

4. Monitor download progress:
   - Poll Lidarr queue for download status
   - Poll Navidrome for new songs (or use library scan trigger)
   - Update discovery queue status in real-time

5. When download completes and song appears in Navidrome:
   - Update discovery item status to "ready"
   - Show notification: "'{Song}' is now available!"
   - If auto-queue enabled: add to playback queue
   - Update recommendation card to show "Queue" instead of "Download"

6. Show discovery queue panel in UI:
   - List of pending/downloading/ready items
   - Progress indicators
   - Cancel/retry actions
   - Clear completed items

7. Settings for discovery behavior:
   - Auto-queue completed downloads (toggle)
   - Notification preferences
   - Discovery scan interval

## Tasks / Subtasks

### Discovery Queue Service
- [ ] Create `src/lib/services/discovery-queue.ts`
- [ ] Define `DiscoveryItem` interface:
  ```typescript
  interface DiscoveryItem {
    id: string;
    artist: string;
    album?: string;
    track: string;
    requestedAt: string;
    status: 'pending' | 'searching' | 'downloading' | 'ready' | 'failed';
    lidarrArtistId?: string;
    navidromeSongId?: string;
    error?: string;
  }
  ```
- [ ] Implement `addToDiscoveryQueue(artist, track)`
- [ ] Implement `getDiscoveryQueue()`
- [ ] Implement `updateDiscoveryStatus(id, status)`
- [ ] Implement `removeFromQueue(id)`
- [ ] Persist to localStorage
- [ ] Optional: Sync to DB for cross-device

### Lidarr Integration
- [ ] Implement `searchAndAddArtist(artistName)`:
  - Search Lidarr for artist
  - If not found in Lidarr DB, search MusicBrainz via Lidarr
  - Add artist with monitoring enabled
  - Return artist ID
- [ ] Implement `monitorAlbum(artistId, albumName)`:
  - Find album by artist
  - Enable monitoring for download
- [ ] Implement `getDownloadStatus(artistId)`:
  - Check Lidarr queue for artist's downloads
  - Return progress percentage

### Navidrome Monitoring
- [ ] Implement `checkForNewSong(artist, track)`:
  - Search Navidrome for the track
  - Return song if found
- [ ] Implement polling mechanism:
  - Check pending discoveries every 30 seconds
  - Or trigger on Navidrome library scan webhook
- [ ] Handle scan trigger after Lidarr download

### UI Components
- [ ] Create `DiscoveryQueuePanel` component:
  - Expandable sidebar or modal
  - List of discovery items with status
  - Progress bars for downloading
  - Action buttons (cancel, retry, play)
- [ ] Create `DownloadButton` component:
  - Shows on discovery recommendations
  - Loading state while adding
  - Success/error feedback
- [ ] Update recommendation cards:
  - Detect if song is in discovery queue
  - Show appropriate button state
- [ ] Add discovery queue indicator to header/nav

### Notifications
- [ ] Implement download complete notification
- [ ] Implement download failed notification
- [ ] Add notification preferences to settings

### Background Processing
- [ ] Create discovery monitor background task
- [ ] Implement polling with configurable interval
- [ ] Handle app lifecycle (pause when hidden)

### Testing
- [ ] Unit tests for discovery queue service
- [ ] Unit tests for Lidarr integration
- [ ] Unit tests for Navidrome monitoring
- [ ] Integration test: full discovery flow with mocks
- [ ] E2E test: add discovery, mock download, verify queue update

## User Flow

```
┌─────────────────────────────────────────────────────────────┐
│  AI Recommendation (Discovery Mode)                         │
│                                                              │
│  "Based on your taste, you might like:"                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ "Dreams" by Fleetwood Mac                               ││
│  │ [Not in Library]                    [⬇️ Download]       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ User clicks Download
┌─────────────────────────────────────────────────────────────┐
│  Toast: "Adding Fleetwood Mac to download queue..."         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ Background process
┌─────────────────────────────────────────────────────────────┐
│  1. Search Lidarr for "Fleetwood Mac"                       │
│  2. Artist not found → Add from MusicBrainz                 │
│  3. Enable monitoring for "Rumours" album                   │
│  4. Lidarr searches indexers and downloads                  │
│  5. Poll Lidarr queue: 45% complete...                      │
│  6. Download finishes, Navidrome scans                      │
│  7. Song found in Navidrome!                                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ Discovery complete
┌─────────────────────────────────────────────────────────────┐
│  Notification: "Dreams by Fleetwood Mac is ready!"          │
│                                              [Play Now]      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ Card updates
┌─────────────────────────────────────────────────────────────┐
│  │ "Dreams" by Fleetwood Mac                               ││
│  │ [In Library] ✓                      [Queue ▼]           ││
└─────────────────────────────────────────────────────────────┘
```

## Discovery Queue Panel

```
┌─────────────────────────────────────────────────────────────┐
│  Discovery Queue                                    [Hide]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ⬇️ Downloading (2)                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Dreams - Fleetwood Mac                                  ││
│  │ ████████████░░░░░░░░ 65%                    [Cancel]    ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Bohemian Rhapsody - Queen                               ││
│  │ ██░░░░░░░░░░░░░░░░░░ 12%                    [Cancel]    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ✅ Ready to Play (1)                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Hotel California - Eagles                               ││
│  │ Downloaded 5 min ago              [▶️ Play] [Clear]     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ⏳ Pending (1)                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Stairway to Heaven - Led Zeppelin                       ││
│  │ Waiting for download slot...               [Cancel]     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Polling Strategy

```typescript
// Check every 30 seconds when there are pending items
const POLL_INTERVAL = 30000;

async function pollDiscoveryQueue() {
  const queue = getDiscoveryQueue();
  const pending = queue.filter(item =>
    ['pending', 'searching', 'downloading'].includes(item.status)
  );

  if (pending.length === 0) return;

  for (const item of pending) {
    if (item.status === 'downloading') {
      // Check Lidarr for progress
      const progress = await getLidarrProgress(item.lidarrArtistId);
      updateProgress(item.id, progress);
    }

    // Check if song now exists in Navidrome
    const found = await checkNavidrome(item.artist, item.track);
    if (found) {
      updateStatus(item.id, 'ready', { navidromeSongId: found.id });
      showNotification(`${item.track} is ready!`);
      if (autoQueueEnabled) {
        addToQueue(found);
      }
    }
  }
}
```

### State Persistence

```typescript
// localStorage key
const DISCOVERY_QUEUE_KEY = 'aidj:discovery-queue';

// Load on init
const queue = JSON.parse(localStorage.getItem(DISCOVERY_QUEUE_KEY) || '[]');

// Save on change
localStorage.setItem(DISCOVERY_QUEUE_KEY, JSON.stringify(queue));
```

## Dependencies

- Story 7.1 (Source Mode) - Discovery mode triggers this
- Story 7.2 (Last.fm) - Provides discovery recommendations
- Epic 4 (Lidarr) - Download functionality
- Navidrome service - Library checks

## Dev Notes

### File Locations
- Discovery queue: `src/lib/services/discovery-queue.ts`
- UI components: `src/components/discovery/`
- Stores: `src/lib/stores/discovery.ts`
- API routes: `src/routes/api/discovery/`

### Edge Cases
- Artist name mismatch between Last.fm and Lidarr/MusicBrainz
- Album not available for download
- Download stuck or failed
- Navidrome not scanning new files
- Multiple users requesting same song

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
