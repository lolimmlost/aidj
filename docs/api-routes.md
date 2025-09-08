# API Routes Implementation

Based on the architecture document, the following API routes need to be implemented:

## Authentication Routes
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout

## Recommendation Routes
- GET /api/recommendations - Get music recommendations

## Library Routes
- GET /api/library/artists - Get list of artists
- GET /api/library/albums - Get list of albums
- GET /api/library/songs - Get list of songs

## Download Routes
- GET /api/downloads - Get download requests
- POST /api/downloads - Create download request
- GET /api/downloads/{id} - Get download request status

## Implementation Notes

These routes should be implemented as TanStack Start API routes in the `src/routes/api/` directory. Each route should:

1. Use proper authentication middleware
2. Validate input parameters
3. Handle errors appropriately
4. Return data in the format specified in the OpenAPI specification
5. Integrate with the external services (Ollama, Navidrome, Lidarr)

## Navidrome Integration (Implemented in Service Layer)

The Navidrome integration is handled through the service layer in [`src/lib/services/navidrome.ts`](src/lib/services/navidrome.ts). This service manages authentication and makes direct API calls to the Navidrome instance configured via [`src/lib/config/defaults.json`](src/lib/config/defaults.json) (navidromeUrl, navidromeUsername, navidromePassword).

### Authentication
- **Endpoint**: POST [`{navidromeUrl}/auth/login`]({navidromeUrl}/auth/login)
- **Method**: POST
- **Headers**: Content-Type: application/json
- **Body**: JSON with `username` and `password`
- **Response**: JSON with `token` (Bearer token) and `id` (client ID)
- **Timeout**: 5 seconds
- **Error Handling**: Throws on invalid credentials or timeout
- **Token Management**: Tokens are cached and refreshed 5 minutes before expiry (assumes 1-hour validity). On 401, token is invalidated and retried once.

All subsequent API calls use:
- **Headers**: `x-nd-authorization: Bearer {token}`, `x-nd-client-unique-id: {clientId}`

### API Fetch Utility
- Generic function [`apiFetch(endpoint, options)`](src/lib/services/navidrome.ts:77) for calls
- Supports retries on 401 (max 1 retry)
- Timeout: 5 seconds per request
- Parses JSON responses; falls back to text for non-JSON
- Error Handling: Throws descriptive errors for failures, timeouts, or max retries

### Specific Endpoints and Functions

#### Get Artists
- **Function**: [`getArtists(start=0, limit=50, genre?, year?)`](src/lib/services/navidrome.ts:135)
- **Endpoint**: GET [`{navidromeUrl}/api/artist?_start={start}&_end={start+limit-1}`]({navidromeUrl}/api/artist?_start={start}&_end={start+limit-1})
- **Optional Params**: `&genre={genre}`, `&year={year}`
- **Response**: Array of Artist objects `{id, name}`
- **Usage**: In [`src/routes/library/artists.tsx`](src/routes/library/artists.tsx) with filters and alphabetical sorting

#### Get Albums
- **Function**: [`getAlbums(artistId, start=0, limit=50)`](src/lib/services/navidrome.ts:147)
- **Endpoint**: GET [`{navidromeUrl}/api/album?artist_id={artistId}&_start={start}&_end={start+limit-1}`]({navidromeUrl}/api/album?artist_id={artistId}&_start={start}&_end={start+limit-1})
- **Response**: Array of Album objects `{id, name, artistId, year?, artwork?}`
- **Usage**: In [`src/routes/library/artists/[id].tsx`](src/routes/library/artists/[id].tsx) with grid view, lazy loading artwork, sorted alphabetically

#### Get Songs
- **Function**: [`getSongs(albumId, start=0, limit=50)`](src/lib/services/navidrome.ts:156)
- **Endpoint**: GET [`{navidromeUrl}/api/song?album_id={albumId}&_start={start}&_end={start+limit-1}`]({navidromeUrl}/api/song?album_id={albumId}&_start={start}&_end={start+limit-1})
- **Response**: Array of Song objects `{id, name, albumId, duration, track, url}`
- **Usage**: In [`src/routes/library/artists/[id]/albums/[albumId].tsx`](src/routes/library/artists/[id]/albums/[albumId].tsx) with track sorting and duration display

#### Search Songs
- **Function**: [`search(query, start=0, limit=50)`](src/lib/services/navidrome.ts:165)
- **Endpoint**: GET [`{navidromeUrl}/api/song?name={query}&_start={start}&_end={start+limit-1}`]({navidromeUrl}/api/song?name={query}&_start={start}&_end={start+limit-1})
- **Response**: Array of Song objects (as above)
- **Usage**: In [`src/routes/library/search.tsx`](src/routes/library/search.tsx) for song name search, displays track and duration

### Notes
- Pagination uses `_start` and `_end` for offset-based fetching.
- Data models: Artist, Album, Song defined in service.
- Proxy Route: [`/api/navidrome/[...path]`](src/routes/api/navidrome/[...path].ts) exists for CORS/proxying but not currently used by service (direct fetches).
- Integration: All calls use TanStack Query for caching/loading states in UI routes.
- Future: Route through planned /api/library/* endpoints for abstraction.
