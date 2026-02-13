# Epic 8 Story 8.3: Music Library Browser

## Status
Draft

## Priority
High (Core feature - enables music discovery and playback)

## Story
**As a** user,
**I want** to browse my music library by artists, albums, and songs,
**so that** I can find and play music from my Navidrome collection on my iPhone.

## Acceptance Criteria

1. Create bottom tab navigation with three library tabs:
   - Artists (alphabetically sorted with index)
   - Albums (grid/list view with artwork)
   - Songs (searchable flat list)

2. Implement Artists screen:
   - Alphabetically sorted list with section index (A-Z sidebar)
   - Artist name display
   - Album count badge
   - Tap to navigate to artist's albums
   - Pull-to-refresh

3. Implement Albums screen:
   - Grid view (2 columns) as default
   - Album artwork with fallback placeholder
   - Album title and artist name
   - Sort options: Recent, Alphabetical, Year
   - Tap to view album tracks
   - Pull-to-refresh
   - Infinite scroll pagination (20 albums per page)

4. Implement Songs screen:
   - Flat list of all songs
   - Search/filter input at top
   - Song title, artist, duration display
   - Tap to play immediately
   - Long-press for context menu (Play, Play Next, Add to Queue)
   - Pull-to-refresh

5. Implement Artist Detail screen:
   - Artist name header
   - List of artist's albums with artwork
   - Tap album to view tracks

6. Implement Album Detail screen:
   - Large album artwork header
   - Album title, artist, year, track count
   - "Play All" and "Shuffle" action buttons
   - Track list with:
     - Track number
     - Title
     - Duration
     - Now playing indicator
   - Tap track to play album starting from that track

7. Loading and empty states:
   - Skeleton loaders during data fetch
   - Empty state graphics when no content
   - Error states with retry button

8. Performance optimizations:
   - Image caching for artwork
   - List virtualization (FlatList)
   - Memoized list items

## Tasks / Subtasks

### Navigation Setup (AC: 1)
- [ ] Update `app/(main)/_layout.tsx` with bottom tab navigator
- [ ] Configure three tabs: Artists, Albums, Songs
- [ ] Add tab icons (lucide-react-native or expo vector icons)
- [ ] Style active/inactive tab states with aidj theme

### Artists Screen (AC: 2)
- [ ] Create `app/(main)/artists/index.tsx`
- [ ] Create `components/library/ArtistListItem.tsx`:
  ```typescript
  interface ArtistListItemProps {
    artist: Artist;
    onPress: () => void;
  }
  ```
- [ ] Implement TanStack Query fetch for artists:
  ```typescript
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['artists'],
    queryFn: () => navidromeClient.getArtists(),
  });
  ```
- [ ] Add SectionList with alphabetical sections
- [ ] Implement alphabet sidebar index (optional, stretch goal)
- [ ] Add pull-to-refresh with RefreshControl
- [ ] Add loading skeleton state
- [ ] Add empty state component

### Albums Screen (AC: 3)
- [ ] Create `app/(main)/albums/index.tsx`
- [ ] Create `components/library/AlbumCard.tsx`:
  ```typescript
  interface AlbumCardProps {
    album: Album;
    onPress: () => void;
  }
  ```
- [ ] Implement FlatList with numColumns={2} for grid
- [ ] Add sort selector (Recent, A-Z, Year)
- [ ] Implement infinite scroll with `onEndReached`:
  ```typescript
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['albums', sortBy],
    queryFn: ({ pageParam = 0 }) =>
      navidromeClient.getAlbumList(sortBy, 20, pageParam * 20),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === 20 ? pages.length : undefined,
  });
  ```
- [ ] Add pull-to-refresh
- [ ] Add loading skeleton grid
- [ ] Add artwork Image component with fallback

### Songs Screen (AC: 4)
- [ ] Create `app/(main)/songs/index.tsx`
- [ ] Create `components/library/SongListItem.tsx`:
  ```typescript
  interface SongListItemProps {
    song: Song;
    isPlaying?: boolean;
    onPress: () => void;
    onLongPress: () => void;
  }
  ```
- [ ] Add search input with debounced filtering
- [ ] Implement song list with FlatList
- [ ] Create context menu (ActionSheet) for long-press:
  - Play Now
  - Play Next
  - Add to Queue
  - (Future: Add to Playlist)
- [ ] Format duration as mm:ss
- [ ] Add "Now Playing" indicator for current song
- [ ] Implement search with `useQuery`:
  ```typescript
  const { data } = useQuery({
    queryKey: ['songs', 'search', debouncedQuery],
    queryFn: () => navidromeClient.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });
  ```

### Artist Detail Screen (AC: 5)
- [ ] Create `app/(main)/artists/[id].tsx`
- [ ] Display artist name in header
- [ ] Fetch and display artist's albums
- [ ] Reuse AlbumCard component in list view
- [ ] Add back navigation

### Album Detail Screen (AC: 6)
- [ ] Create `app/(main)/albums/[id].tsx`
- [ ] Create `components/library/AlbumHeader.tsx`:
  - Large artwork (300x300)
  - Album title
  - Artist name (tappable to artist detail)
  - Year, track count, total duration
- [ ] Create action buttons row:
  - Play All button
  - Shuffle button
- [ ] Create track list with `SongListItem`
- [ ] Implement "Play All" - loads album tracks into queue, starts playing
- [ ] Implement "Shuffle" - loads shuffled album tracks
- [ ] Highlight currently playing track

### Loading & Empty States (AC: 7)
- [ ] Create `components/ui/Skeleton.tsx` (NativeWind styled)
- [ ] Create `components/library/ArtistListSkeleton.tsx`
- [ ] Create `components/library/AlbumGridSkeleton.tsx`
- [ ] Create `components/library/SongListSkeleton.tsx`
- [ ] Create `components/ui/EmptyState.tsx`:
  ```typescript
  interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onPress: () => void };
  }
  ```
- [ ] Create `components/ui/ErrorState.tsx` with retry button

### Performance (AC: 8)
- [ ] Use `expo-image` or `FastImage` for artwork caching
- [ ] Implement `getItemLayout` for FlatList optimization
- [ ] Memoize list item components with `React.memo`
- [ ] Use `keyExtractor` properly
- [ ] Implement `windowSize` and `maxToRenderPerBatch` tuning

### Integration with Player (Story 8.1, 8.4)
- [ ] Connect "Play" actions to player store
- [ ] Connect "Add to Queue" to TrackPlayer queue
- [ ] Show MiniPlayer at bottom when track is playing (if implemented)

## Dev Notes

### Navidrome API Endpoints Used

**Get Artists (alphabetically indexed):**
```
GET /rest/getArtists.view?...auth...
```
Response:
```json
{
  "subsonic-response": {
    "artists": {
      "index": [
        {
          "name": "A",
          "artist": [
            { "id": "ar-1", "name": "Artist Name", "albumCount": 5 }
          ]
        }
      ]
    }
  }
}
```

**Get Album List:**
```
GET /rest/getAlbumList2.view?type={type}&size={size}&offset={offset}&...auth...
```
Types: `recent`, `alphabeticalByName`, `byYear`, `frequent`, `random`

**Get Album Detail (with tracks):**
```
GET /rest/getAlbum.view?id={albumId}&...auth...
```

**Search:**
```
GET /rest/search3.view?query={query}&artistCount=0&albumCount=0&songCount=50&...auth...
```

### Component Patterns from aidj Web

**Artist List Item pattern (`src/components/library/ArtistsList.tsx`):**
- Display name prominently
- Show album count as secondary info
- Chevron right icon indicating navigation

**Album Card pattern:**
- Square artwork (use `aspectRatio: 1`)
- Title below artwork (truncate to 2 lines)
- Artist name smaller, muted color

**Song List Item pattern (`src/routes/library/artists/$id/albums/$albumId.tsx`):**
- Track number (fixed width)
- Title (flex grow)
- Duration (fixed width, right aligned)
- Subtle tap feedback

### React Native Specific Patterns

**FlatList with Grid:**
```typescript
<FlatList
  data={albums}
  numColumns={2}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => (
    <AlbumCard album={item} onPress={() => handleAlbumPress(item)} />
  )}
  columnWrapperStyle={{ gap: 12 }}
  contentContainerStyle={{ padding: 16 }}
/>
```

**SectionList for Alphabetical Index:**
```typescript
const sections = useMemo(() => {
  const grouped = groupBy(artists, (a) => a.name[0].toUpperCase());
  return Object.entries(grouped).map(([letter, items]) => ({
    title: letter,
    data: items,
  }));
}, [artists]);

<SectionList
  sections={sections}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ArtistListItem artist={item} />}
  renderSectionHeader={({ section }) => (
    <Text className="bg-background px-4 py-2 font-bold">{section.title}</Text>
  )}
/>
```

**Debounced Search:**
```typescript
const [query, setQuery] = useState('');
const debouncedQuery = useDebounce(query, 300);

// hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

**ActionSheet for Context Menu:**
```typescript
import { ActionSheetIOS } from 'react-native';
// Or use @expo/react-native-action-sheet for cross-platform

const showSongOptions = (song: Song) => {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Cancel', 'Play Now', 'Play Next', 'Add to Queue'],
      cancelButtonIndex: 0,
    },
    (buttonIndex) => {
      switch (buttonIndex) {
        case 1: handlePlayNow(song); break;
        case 2: handlePlayNext(song); break;
        case 3: handleAddToQueue(song); break;
      }
    }
  );
};
```

### File Structure

```
app/(main)/
├── _layout.tsx           # Tab navigator
├── artists/
│   ├── index.tsx         # Artists list
│   └── [id].tsx          # Artist detail
├── albums/
│   ├── index.tsx         # Albums grid
│   └── [id].tsx          # Album detail
└── songs/
    └── index.tsx         # Songs list with search

components/library/
├── ArtistListItem.tsx
├── ArtistListSkeleton.tsx
├── AlbumCard.tsx
├── AlbumGridSkeleton.tsx
├── AlbumHeader.tsx
├── SongListItem.tsx
├── SongListSkeleton.tsx
└── index.ts              # Re-exports

hooks/
├── useDebounce.ts
└── useArtists.ts         # TanStack Query hooks (optional abstraction)
```

### Image Handling

**expo-image for better performance:**
```bash
npx expo install expo-image
```

```typescript
import { Image } from 'expo-image';

<Image
  source={{ uri: getCoverArtUrl(album.coverArt) }}
  style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }}
  placeholder={blurhash}
  contentFit="cover"
  transition={200}
/>
```

**Fallback placeholder:**
```typescript
const AlbumArtwork = ({ coverArt }: { coverArt?: string }) => {
  if (!coverArt) {
    return (
      <View className="w-full aspect-square bg-gray-800 rounded-lg items-center justify-center">
        <Disc size={48} color="#666" />
      </View>
    );
  }
  return <Image source={{ uri: getCoverArtUrl(coverArt) }} ... />;
};
```

### Duration Formatting

```typescript
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

## Testing

### Test Cases

1. **Artists Screen**
   - Renders loading skeleton initially
   - Displays artists after fetch
   - Groups artists by first letter
   - Pull-to-refresh triggers refetch
   - Tap navigates to artist detail

2. **Albums Screen**
   - Renders grid with 2 columns
   - Displays album artwork
   - Sort selector changes order
   - Infinite scroll loads more
   - Tap navigates to album detail

3. **Songs Screen**
   - Search input filters results
   - Debounce prevents excessive API calls
   - Tap plays song
   - Long-press shows action sheet

4. **Album Detail**
   - Displays album info correctly
   - Play All loads all tracks and plays
   - Shuffle randomizes track order
   - Tap track plays from that position

5. **Performance**
   - List scrolls smoothly (60fps)
   - Images load and cache properly
   - Memory usage stays reasonable

## Definition of Done

- [ ] Bottom tab navigation works (Artists, Albums, Songs)
- [ ] Artists screen displays alphabetically grouped list
- [ ] Albums screen displays grid with artwork
- [ ] Songs screen has working search
- [ ] Artist detail shows artist's albums
- [ ] Album detail shows tracks with Play All/Shuffle
- [ ] Tap to play works throughout
- [ ] Long-press context menu works on songs
- [ ] Loading skeletons display during fetch
- [ ] Empty states display when no data
- [ ] Pull-to-refresh works on all lists
- [ ] Scrolling is smooth (no jank)
- [ ] Images cache properly

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
