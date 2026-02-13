# Epic 7 Story 7.2: Last.fm Integration

## Status
Ready for Development

## Priority
High (Required for discovery mode)

## Story
As a user,
I want the AI to suggest music from outside my library using Last.fm,
so that I can discover new artists and tracks that match my taste.

## Acceptance Criteria

1. Create Last.fm service layer with API key authentication

2. Implement core API methods:
   - `getSimilarTracks(artist, track)` - tracks similar to a given track
   - `getSimilarArtists(artist)` - artists similar to a given artist
   - `getTopTracks(artist)` - top tracks by an artist
   - `searchTrack(query)` - search for tracks by name

3. Cache Last.fm responses (5 minute TTL) to reduce API calls

4. Cross-reference results with Navidrome to identify what's not in library:
   - For each Last.fm result, search Navidrome
   - Mark as `inLibrary: true/false`
   - Return library song ID if found

5. Return enriched recommendations with:
   - Track name
   - Artist name
   - Album name
   - Last.fm URL (for user reference)
   - Match score (similarity percentage from Last.fm)
   - `inLibrary` boolean flag
   - Navidrome song ID (if in library)

6. Handle rate limiting gracefully:
   - Last.fm limit: 5 requests/second
   - Implement request queue with delays
   - Show user-friendly message if rate limited

7. Provide fallback if Last.fm unavailable:
   - Return empty results with error flag
   - Don't break the overall recommendation flow

8. Add Last.fm API key to application configuration

## Tasks / Subtasks

### Service Layer
- [ ] Create `src/lib/services/lastfm.ts`
- [ ] Implement `LastFmClient` class with:
  - API key authentication
  - Base request handler with error handling
  - Rate limiting (max 5 req/sec)
- [ ] Implement `getSimilarTracks(artist: string, track: string)`
- [ ] Implement `getSimilarArtists(artist: string)`
- [ ] Implement `getTopTracks(artist: string, limit?: number)`
- [ ] Implement `searchTrack(query: string)`
- [ ] Add response caching (5 min TTL)
- [ ] Add cross-reference with Navidrome search

### API Routes
- [ ] Create `src/routes/api/lastfm/similar-tracks.ts`
- [ ] Create `src/routes/api/lastfm/similar-artists.ts`
- [ ] Create `src/routes/api/lastfm/top-tracks.ts`
- [ ] Create `src/routes/api/lastfm/search.ts`
- [ ] Add authentication check to routes

### Configuration
- [ ] Add `lastfmApiKey` to config schema
- [ ] Add Last.fm settings to services settings page
- [ ] Add connection test button

### Types
- [ ] Create `src/lib/services/lastfm/types.ts` with:
  - `LastFmTrack`
  - `LastFmArtist`
  - `LastFmSimilarResult`
  - `EnrichedTrack` (with library status)

### Testing
- [ ] Unit tests for Last.fm service methods
- [ ] Unit tests for rate limiting
- [ ] Unit tests for caching
- [ ] Integration tests with mock API responses
- [ ] Test cross-reference with Navidrome

## API Reference

### Last.fm API Endpoints

```
Base URL: https://ws.audioscrobbler.com/2.0/

# Similar Tracks
GET /?method=track.getsimilar
    &artist={artist}
    &track={track}
    &api_key={API_KEY}
    &format=json
    &limit=20

# Similar Artists
GET /?method=artist.getsimilar
    &artist={artist}
    &api_key={API_KEY}
    &format=json
    &limit=20

# Top Tracks by Artist
GET /?method=artist.gettoptracks
    &artist={artist}
    &api_key={API_KEY}
    &format=json
    &limit=10

# Search Tracks
GET /?method=track.search
    &track={query}
    &api_key={API_KEY}
    &format=json
    &limit=10
```

### Response Types

```typescript
interface LastFmTrack {
  name: string;
  artist: {
    name: string;
    url: string;
  };
  url: string;
  playcount?: number;
  match?: number; // 0-1 similarity score
  image?: Array<{ '#text': string; size: string }>;
}

interface LastFmArtist {
  name: string;
  url: string;
  match?: number;
  image?: Array<{ '#text': string; size: string }>;
}

interface EnrichedTrack extends LastFmTrack {
  inLibrary: boolean;
  navidromeId?: string;
  navidromeUrl?: string;
}
```

## Service Implementation

```typescript
// src/lib/services/lastfm.ts

export class LastFmClient {
  private apiKey: string;
  private baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private cache: Map<string, { data: unknown; expires: number }>;
  private requestQueue: Promise<unknown>[];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cache = new Map();
    this.requestQueue = [];
  }

  async getSimilarTracks(artist: string, track: string): Promise<EnrichedTrack[]> {
    const cacheKey = `similar-tracks:${artist}:${track}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const response = await this.request({
      method: 'track.getsimilar',
      artist,
      track,
      limit: 20,
    });

    const tracks = response.similartracks?.track || [];
    const enriched = await this.enrichWithLibraryStatus(tracks);

    this.setCache(cacheKey, enriched);
    return enriched;
  }

  async getSimilarArtists(artist: string): Promise<LastFmArtist[]> {
    // Similar implementation
  }

  async getTopTracks(artist: string, limit = 10): Promise<EnrichedTrack[]> {
    // Similar implementation
  }

  private async enrichWithLibraryStatus(tracks: LastFmTrack[]): Promise<EnrichedTrack[]> {
    // Cross-reference with Navidrome
    return Promise.all(tracks.map(async (track) => {
      const navidromeMatch = await searchNavidrome(`${track.artist.name} ${track.name}`);
      return {
        ...track,
        inLibrary: navidromeMatch.length > 0,
        navidromeId: navidromeMatch[0]?.id,
        navidromeUrl: navidromeMatch[0]?.url,
      };
    }));
  }
}
```

## UI Integration Points

This service will be used by:
- Story 7.1 (Source Mode) - Discovery mode recommendations
- Story 7.3 (Discovery Pipeline) - Find songs to download
- Recommendation cards - "Similar to this" feature

## Dependencies

- Navidrome search service (existing)
- Mobile optimization caching (existing)
- Config service (existing)

## Dev Notes

### File Locations
- Service: `src/lib/services/lastfm.ts`
- Types: `src/lib/services/lastfm/types.ts`
- API routes: `src/routes/api/lastfm/`
- Tests: `src/lib/services/__tests__/lastfm.test.ts`

### Rate Limiting Strategy
```typescript
// Implement token bucket or sliding window
class RateLimiter {
  private tokens = 5;
  private lastRefill = Date.now();

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    // Refill 5 tokens per second
    this.tokens = Math.min(5, this.tokens + (elapsed / 1000) * 5);
    this.lastRefill = now;

    if (this.tokens < 1) {
      // Wait for token
      await new Promise(r => setTimeout(r, (1 - this.tokens) * 200));
      this.tokens = 1;
    }

    this.tokens -= 1;
  }
}
```

### Error Handling
- API key invalid: prompt user to check settings
- Rate limited: queue requests, show "Loading..." state
- Network error: retry with exponential backoff
- Service unavailable: return empty with error flag

## Testing Requirements

- Mock Last.fm API responses
- Test caching behavior
- Test rate limiting under load
- Test Navidrome cross-reference
- Test error scenarios

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
