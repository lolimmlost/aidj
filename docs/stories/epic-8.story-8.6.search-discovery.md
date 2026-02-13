# Epic 8 Story 8.6: Search & Discovery

## Status
Draft

## Priority
Medium (Enhanced feature - improves music discovery)

## Story
**As a** user,
**I want** to search my library and discover new music recommendations,
**so that** I can quickly find songs and explore music that matches my taste.

## Acceptance Criteria

1. Universal Search screen:
   - Search input with clear button
   - Debounced search (300ms delay)
   - Search across artists, albums, songs simultaneously
   - Recent searches history (last 10)
   - Clear history option

2. Search Results display:
   - Categorized sections: Artists, Albums, Songs
   - Show top 5 results per category initially
   - "See All" expands to full results
   - Tap result navigates to detail or plays

3. Similar Artists (Discovery):
   - On Artist Detail screen, show "Similar Artists" section
   - Fetch from LastFM API (via aidj backend or direct)
   - Indicate which are in library vs not
   - Tap to view artist or trigger search

4. Similar Tracks (Discovery):
   - On FullPlayer, show "Similar Tracks" option
   - Fetch from LastFM based on current track
   - Show mix of in-library and discovery tracks
   - "In Library" badge for playable tracks
   - "Not in Library" shows Lidarr download option (Story 8.7)

5. Mood/Genre Recommendations:
   - Quick access buttons: Chill, Energetic, Focus, Party
   - Connect to aidj recommendation API
   - Display recommended tracks
   - Filter to library-only by default

6. Voice Search (stretch goal):
   - Microphone button on search
   - Speech-to-text for search query

## Tasks / Subtasks

### Search Screen (AC: 1, 2)
- [ ] Create `app/(main)/search.tsx` or add Search tab
- [ ] Create `components/search/SearchInput.tsx`:
  - TextInput with search icon
  - Clear button when has text
  - Cancel button to dismiss keyboard
- [ ] Implement debounced search with `useDebounce` hook
- [ ] Create `components/search/RecentSearches.tsx`:
  - Store in AsyncStorage
  - Show when input is empty/focused
  - Tap to search, X to remove
- [ ] Implement Navidrome search3 API call:
  ```typescript
  const { data } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => navidromeClient.search(debouncedQuery, {
      artistCount: 5,
      albumCount: 5,
      songCount: 10,
    }),
    enabled: debouncedQuery.length >= 2,
  });
  ```
- [ ] Create `components/search/SearchResults.tsx`:
  - Artists section with ArtistListItem
  - Albums section with AlbumCard (horizontal scroll)
  - Songs section with SongListItem
  - "See All" buttons per section
- [ ] Implement navigation from results

### Recent Searches Persistence
- [ ] Create `lib/services/search-history.ts`:
  ```typescript
  const SEARCH_HISTORY_KEY = 'search_history';
  const MAX_HISTORY = 10;

  export async function addToSearchHistory(query: string) {
    const history = await getSearchHistory();
    const updated = [query, ...history.filter(q => q !== query)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  }

  export async function getSearchHistory(): Promise<string[]> {
    const data = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  }

  export async function clearSearchHistory() {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  }
  ```

### Similar Artists (AC: 3)
- [ ] Create `components/discovery/SimilarArtists.tsx`
- [ ] Add to Artist Detail screen (Story 8.3)
- [ ] Fetch from LastFM or aidj API:
  ```typescript
  // Option A: Direct LastFM
  GET https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist={name}&api_key={key}&format=json

  // Option B: Via aidj API
  GET /api/lastfm/similar-artists?artist={name}
  ```
- [ ] Cross-reference with Navidrome library
- [ ] Display with "In Library" / "Not in Library" badges
- [ ] Tap action: navigate if in library, show download prompt if not

### Similar Tracks (AC: 4)
- [ ] Create `components/discovery/SimilarTracks.tsx`
- [ ] Add to FullPlayer (as expandable section or separate screen)
- [ ] Fetch based on current track:
  ```typescript
  GET /api/lastfm/similar-tracks?artist={artist}&track={title}
  ```
- [ ] Match against Navidrome library
- [ ] Display results with availability indicator
- [ ] Actions: Play (if in library), Download (if not, links to 8.7)

### Mood Recommendations (AC: 5)
- [ ] Create `components/discovery/MoodButtons.tsx`:
  ```typescript
  const MOODS = [
    { id: 'chill', label: 'Chill', icon: '😌' },
    { id: 'energetic', label: 'Energetic', icon: '⚡' },
    { id: 'focus', label: 'Focus', icon: '🎯' },
    { id: 'party', label: 'Party', icon: '🎉' },
  ];
  ```
- [ ] Add to Search screen or Dashboard
- [ ] Connect to aidj recommendation API:
  ```typescript
  GET /api/recommendations?mood={mood}&sourceMode=library
  ```
- [ ] Display recommended tracks
- [ ] Allow playing recommendations

### Discovery Integration
- [ ] Create `lib/services/lastfm.ts` (if not using aidj API):
  - `getSimilarArtists(artistName)`
  - `getSimilarTracks(artist, track)`
  - Rate limiting (5 req/sec)
  - Caching (5 min TTL)
- [ ] Or connect to aidj web API endpoints

## Dev Notes

### Navidrome Search API

```
GET /rest/search3.view?query={query}&artistCount=5&albumCount=5&songCount=10&...auth...
```

Response:
```json
{
  "subsonic-response": {
    "searchResult3": {
      "artist": [...],
      "album": [...],
      "song": [...]
    }
  }
}
```

### LastFM API (from aidj)

**Similar Artists:**
```
GET https://ws.audioscrobbler.com/2.0/
  ?method=artist.getsimilar
  &artist=Radiohead
  &api_key={API_KEY}
  &format=json
  &limit=10
```

**Similar Tracks:**
```
GET https://ws.audioscrobbler.com/2.0/
  ?method=track.getsimilar
  &artist=Radiohead
  &track=Creep
  &api_key={API_KEY}
  &format=json
  &limit=10
```

### AIDJ Recommendation API

If connecting to aidj web backend:
```
GET {AIDJ_URL}/api/recommendations?mood={mood}&sourceMode=library
```

Requires aidj server URL in mobile app settings.

### Cross-Reference Pattern

```typescript
async function enrichWithLibraryStatus(items: LastFMItem[]) {
  const libraryArtists = await navidromeClient.getArtists();
  const libraryMap = new Map(libraryArtists.map(a => [a.name.toLowerCase(), a]));

  return items.map(item => ({
    ...item,
    inLibrary: libraryMap.has(item.name.toLowerCase()),
    libraryId: libraryMap.get(item.name.toLowerCase())?.id,
  }));
}
```

### File Structure

```
app/(main)/
└── search.tsx              # Search screen (or tab)

components/
├── search/
│   ├── SearchInput.tsx
│   ├── SearchResults.tsx
│   └── RecentSearches.tsx
└── discovery/
    ├── SimilarArtists.tsx
    ├── SimilarTracks.tsx
    └── MoodButtons.tsx

lib/services/
├── search-history.ts       # Recent searches persistence
└── lastfm.ts               # LastFM API client (optional)
```

## Testing

### Test Cases

1. **Search**
   - Debounce delays API call
   - Results categorized correctly
   - Navigation from results works
   - Recent searches saved/loaded

2. **Similar Artists**
   - Fetches for current artist
   - Shows library status correctly
   - Tap navigates or prompts download

3. **Similar Tracks**
   - Fetches for current track
   - Library tracks are playable
   - Non-library shows download option

4. **Mood Recommendations**
   - Each mood button fetches recommendations
   - Results are playable

## Definition of Done

- [ ] Search screen with debounced input
- [ ] Results show artists, albums, songs
- [ ] Recent searches persist
- [ ] Similar Artists on artist detail
- [ ] Similar Tracks in FullPlayer
- [ ] Mood buttons generate recommendations
- [ ] Library status indicated on discovery items

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial story draft | SM Agent |
