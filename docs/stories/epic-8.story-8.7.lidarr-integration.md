# Epic 8 Story 8.7: Lidarr Integration

## Status
Draft

## Priority
Low (Advanced feature - extends discovery capabilities)

## Story
**As a** user,
**I want** to search for and download new music via Lidarr from the mobile app,
**so that** I can expand my library when I discover new music on the go.

## Acceptance Criteria

1. Lidarr Search screen:
   - Search input for artist/album name
   - Display search results with:
     - Artist/album artwork (from external source)
     - Name, type (artist/album)
     - Availability status in Lidarr
   - Debounced search

2. Download trigger flow:
   - "Add to Lidarr" button on discovery items (from Story 8.6)
   - Confirmation dialog with quality profile info
   - Progress indication during add
   - Success/failure toast

3. Download Queue view:
   - List of pending downloads
   - Download status: Queued, Downloading, Importing
   - Progress percentage where available
   - Cancel download option
   - Pull-to-refresh

4. Completion notifications:
   - Push notification when download completes (optional)
   - "New music available" indicator
   - Quick action to play new content

5. Lidarr Settings:
   - Server URL input
   - API key input (secure storage)
   - Test connection button
   - Quality profile selection
   - Enable/disable Lidarr features toggle

## Tasks / Subtasks

### Lidarr Service Layer
- [ ] Create `lib/services/lidarr/client.ts`:
  ```typescript
  export class LidarrClient {
    private baseUrl: string;
    private apiKey: string;

    async search(term: string): Promise<LidarrSearchResult[]>;
    async addArtist(foreignArtistId: string, qualityProfileId: number): Promise<void>;
    async getQueue(): Promise<LidarrQueueItem[]>;
    async getQualityProfiles(): Promise<QualityProfile[]>;
    async testConnection(): Promise<boolean>;
  }
  ```
- [ ] Create `lib/services/lidarr/types.ts` for response types
- [ ] Implement API methods based on aidj patterns

### Lidarr Search (AC: 1)
- [ ] Create `app/(main)/lidarr/index.tsx` or as section in settings
- [ ] Create `components/lidarr/LidarrSearchInput.tsx`
- [ ] Create `components/lidarr/LidarrSearchResult.tsx`:
  - External artwork
  - Artist/album name
  - Status badge (Not Monitored, Monitored, Available)
- [ ] Implement search with debounce
- [ ] Show empty state when Lidarr not configured

### Add to Lidarr Flow (AC: 2)
- [ ] Create `components/lidarr/AddToLidarrModal.tsx`:
  - Artist/album info display
  - Quality profile selector
  - Root folder selector (if multiple)
  - Add button
- [ ] Implement add artist/album API call
- [ ] Show loading state during add
- [ ] Toast on success/failure
- [ ] Add "Download" button to discovery items (Similar Artists/Tracks)

### Download Queue (AC: 3)
- [ ] Create `app/(main)/lidarr/queue.tsx` or section
- [ ] Create `components/lidarr/QueueItem.tsx`:
  - Album/artist artwork
  - Title, artist
  - Status indicator
  - Progress bar (if downloading)
  - Cancel button
- [ ] Fetch queue: `GET /api/v1/queue`
- [ ] Auto-refresh every 30 seconds
- [ ] Pull-to-refresh

### Notifications (AC: 4)
- [ ] Set up expo-notifications for push
- [ ] Create background task to check for completed downloads
- [ ] Show local notification on completion
- [ ] Badge app icon with count (optional)

### Settings Screen (AC: 5)
- [ ] Add Lidarr section to Settings (Story 8.8)
- [ ] Server URL input with validation
- [ ] API key input (SecureStore)
- [ ] Test connection with feedback
- [ ] Quality profile dropdown
- [ ] Enable/disable toggle
- [ ] Create `lib/services/lidarr-settings.ts` for persistence

## Dev Notes

### Lidarr API Reference (from aidj)

**Base pattern:**
```
{LIDARR_URL}/api/v1/{endpoint}?apikey={API_KEY}
```

**Search artists:**
```
GET /api/v1/artist/lookup?term={searchTerm}
```

**Add artist:**
```
POST /api/v1/artist
Body: {
  "foreignArtistId": "mbid-xxx",
  "qualityProfileId": 1,
  "rootFolderPath": "/music",
  "monitored": true,
  "addOptions": {
    "searchForMissingAlbums": true
  }
}
```

**Get queue:**
```
GET /api/v1/queue?includeArtist=true&includeAlbum=true
```

**Quality profiles:**
```
GET /api/v1/qualityprofile
```

### aidj Lidarr Service Reference

From `src/lib/services/lidarr.ts`:
- `searchArtist(term)` - search for artists
- `addArtist(mbid, qualityProfileId)` - add to Lidarr
- `getQueue()` - get download queue
- `getQualityProfiles()` - list quality profiles
- `checkArtistAvailability(artistName)` - check if monitored

### Secure Storage for API Key

```typescript
import * as SecureStore from 'expo-secure-store';

const LIDARR_API_KEY = 'lidarr_api_key';
const LIDARR_URL = 'lidarr_url';

export async function saveLidarrConfig(url: string, apiKey: string) {
  await SecureStore.setItemAsync(LIDARR_URL, url);
  await SecureStore.setItemAsync(LIDARR_API_KEY, apiKey);
}

export async function getLidarrConfig() {
  const url = await SecureStore.getItemAsync(LIDARR_URL);
  const apiKey = await SecureStore.getItemAsync(LIDARR_API_KEY);
  return url && apiKey ? { url, apiKey } : null;
}
```

### File Structure

```
app/(main)/
└── lidarr/
    ├── index.tsx           # Search screen
    └── queue.tsx           # Download queue

components/lidarr/
├── LidarrSearchInput.tsx
├── LidarrSearchResult.tsx
├── AddToLidarrModal.tsx
├── QueueItem.tsx
└── LidarrSettings.tsx

lib/services/
├── lidarr/
│   ├── client.ts           # API client
│   └── types.ts            # Types
└── lidarr-settings.ts      # Config persistence
```

### Connection to Discovery (Story 8.6)

When showing "Similar Artists" or "Similar Tracks" that are NOT in library:
```typescript
const handleDiscoveryItemPress = (item: DiscoveryItem) => {
  if (item.inLibrary) {
    navigation.navigate('ArtistDetail', { id: item.libraryId });
  } else {
    // Show add to Lidarr modal
    setAddToLidarrItem(item);
    setShowAddModal(true);
  }
};
```

## Testing

### Test Cases

1. **Search**
   - Returns results from Lidarr
   - Shows correct availability status
   - Handles no results gracefully

2. **Add to Lidarr**
   - Modal shows correct info
   - Add request succeeds
   - Error handling works

3. **Queue**
   - Shows current downloads
   - Status updates correctly
   - Cancel removes item

4. **Settings**
   - Saves config securely
   - Test connection works
   - Invalid config shows error

## Definition of Done

- [ ] Can search Lidarr for artists
- [ ] Can add artist to Lidarr from discovery
- [ ] Download queue shows status
- [ ] Settings allow configuration
- [ ] Test connection validates setup
- [ ] Secure storage for API key

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial story draft | SM Agent |
