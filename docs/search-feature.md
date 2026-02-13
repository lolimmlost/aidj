# Search Feature Documentation

## Overview

The search feature enables users to discover music in their Navidrome library by entering text queries. It supports searching across albums, artists, and individual songs, providing a seamless way to find and play music.

## User Experience

- Located at `/library/search`
- Simple text input field
- Real-time search results as you type
- Results displayed as a list of songs with track number, title, duration, and play button
- Error handling with user-friendly messages
- Loading states and empty states

## Technical Implementation

### Frontend Components

- **Route**: `src/routes/library/search.tsx`
  - React component using TanStack Router
  - State management for query input
  - React Query for data fetching and caching
  - Error boundaries and loading states

### Backend Services

- **Service Layer**: `src/lib/services/navidrome.ts`
  - `search()` function implements complex search prioritization
  - Authentication handling with token refresh
  - Multiple API fallback strategies

- **API Endpoint**: `src/routes/api/search.ts`
  - Protected POST endpoint (requires authentication)
  - JSON request/response format
  - Error handling and logging

## Search Algorithm

The search function uses a hierarchical approach to maximize relevant results:

1. **Album Search**: First attempts to find albums whose names contain the query
   - If albums found, returns all songs from those albums
   - Prioritizes complete album discovery

2. **Artist Search**: If no albums match, searches for artists
   - Returns top songs from matching artists
   - Enables discovery of artist catalogs

3. **Song Search**: Falls back to direct song search
   - Uses Subsonic API `/rest/search.view` endpoint
   - Parses song results with proper metadata

4. **Native Fallback**: Final fallback to native Navidrome API
   - Uses `/api/song?fullText=` endpoint
   - Ensures compatibility across Navidrome versions

## Data Models

### Song Object
```typescript
interface Song {
  id: string;
  name: string;
  artist?: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  // ... additional fields
}
```

## Error Handling

- Service errors are caught and transformed into user-friendly messages
- Authentication failures trigger token refresh attempts
- Network timeouts are handled with retry logic
- Graceful degradation when services are unavailable

## Performance Considerations

- React Query caching reduces repeated API calls
- Pagination support for large result sets
- Debounced search input to prevent excessive requests
- Optimized rendering with virtual scrolling for large lists

## Known Issues and Limitations

- Complex fallback logic can sometimes return inconsistent results
- Intermittent failures due to Navidrome API instability
- No advanced search filters (genre, year, etc.)
- Limited to text-based queries

## Future Enhancements

- Implement advanced search filters
- Add search result sorting options
- Improve search result relevance scoring
- Add search history and suggestions
- Implement search result caching
- Add bulk actions (add to playlist, etc.)

## Testing

- Unit tests for search service functions
- Component tests for search UI
- E2E tests for complete search workflows
- Mock data for offline testing

## Dependencies

- Navidrome service (authenticated)
- React Query for state management
- TanStack Router for navigation
- Audio store for playback integration