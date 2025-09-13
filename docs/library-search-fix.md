# Library Search Bug Fix: Song Names Not Displaying

## Issue Description
The library search functionality in `/library/search` only displays track numbers and durations, but not song names. This occurs because the current API call uses `/api/song?title=${query}`, which performs a title-only like query and often returns incomplete results where the `title` field is empty or mismatched.

## Root Cause
- Navidrome's `/api/song` endpoint supports `title` for exact/like matching but does not perform full-text search across artist and album fields.
- For comprehensive search (titles, artists, albums), the Subsonic-compatible `/rest/search2` endpoint is required.

## Solution Overview
Update the `search` function in `src/lib/services/navidrome.ts` to use `/rest/search2?f=song&q=${query}` with Subsonic authentication headers. Parse the response from `searchResult.song` array and map to the existing `Song` type (where `title` becomes `name`).

## Detailed Changes

### 1. Update src/lib/services/navidrome.ts

**Location:** Lines 222-234 (search function)

**Current Code:**
```
export async function search(query: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?title=${encodeURIComponent(query)}&_start=${start}&_end=${start + limit - 1}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    console.log('Search API response:', songs);
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**New Code:**
```
export async function search(query: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    if (!subsonicToken || !subsonicSalt || !getConfig().navidromeUsername) {
      throw new Error('Subsonic authentication not available. Please ensure login has been performed.');
    }

    const config = getConfig();
    const end = start + limit - 1;
    const searchUrl = `${config.navidromeUrl}/rest/search2?f=song&q=${encodeURIComponent(query)}&startIndex=${start}&size=${limit}&format=json&c=ai-dj-app&v=1.16.1&u=${encodeURIComponent(config.navidromeUsername)}&t=${subsonicToken}&s=${subsonicSalt}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.searchResult || !Array.isArray(data.searchResult.song)) {
      return [];
    }

    const rawSongs = data.searchResult.song as any[];
    const songs = rawSongs.map((song) => {
      const songData: RawSong = {
        id: song.id,
        name: song.title || song.name || 'Unknown Title', // Fallback for title mapping
        albumId: song.albumId,
        duration: song.duration || 0,
        track: song.trackNumber || song.track || 0,
      };
      return {
        ...songData,
        url: `/api/navidrome/stream/${song.id}`,
      } as Song;
    });

    console.log('Search2 API response:', songs);
    return songs;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Search request timed out (5s limit)');
    }
    throw new Error(`Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

### Key Changes Explained
1. **Endpoint Switch:** From `/api/song?title=` to `/rest/search2?f=song&q=...` for full-text search.
2. **Subsonic Auth:** Uses `u`, `t` (token), `s` (salt), `c` (client), `v` (version), `f=json` parameters instead of Bearer token.
3. **Pagination:** Uses `startIndex` and `size` instead of `_start`/`_end`.
4. **Response Parsing:** Extracts from `data.searchResult.song` and maps `title` to `name` for consistency with existing Song type.
5. **Error Handling:** Maintains 5s timeout and proper error messages.
6. **Fallbacks:** Handles missing `title`/`name` with 'Unknown Title'.

### 2. Update RawSong Type (if needed)
Ensure `RawSong` interface supports additional fields from search2:
```
export interface RawSong {
  id: string;
  name: string;
  title?: string; // From search2 response
  albumId: string;
  duration: number;
  track: number;
  trackNumber?: number; // From search2
}
```

### 3. No Changes Needed in src/routes/library/search.tsx
The rendering logic already uses `song.name`, which will now be populated correctly from the updated search function.

## Testing Steps
1. Ensure Navidrome is running and authenticated via the app.
2. Navigate to `/library/search`.
3. Enter a query matching a song title, artist, or album name.
4. Verify song names display alongside track numbers and durations.
5. Test with queries that previously failed (e.g., artist names only).
6. Check console for 'Search2 API response' logs to confirm data structure.
7. Test pagination by searching with many results.

## Acceptance Criteria
- [ ] Song names display correctly for title, artist, and album searches.
- [ ] Search returns relevant results across all fields (not just titles).
- [ ] No regressions in existing search UI or audio player integration.
- [ ] Error handling works for invalid queries or network issues.
- [ ] Performance remains acceptable (<2s response per PRD NFR3).

## Story Points
3 points (API integration change + testing + documentation)

## Related PRD Reference
Epic 2: Music Library Integration  
Story 2.2: Music Library Browser  
Acceptance Criteria #4: Implement search functionality across the entire library with proper error handling

## Implementation Notes
- The search2 endpoint is Subsonic-compatible and more robust for music search.
- Ensure subsonicToken/salt are available post-login (already handled in getAuthToken).
- Version `v=1.16.1` is compatible with current Navidrome; update if needed.
- This fix maintains backward compatibility with existing Song type and UI.