# AIDJ Technical Requirements

## PostgreSQL & Better Auth Setup

### Overview
PostgreSQL stores user authentication data via Better Auth. Schema auto-managed.

### Configuration
- **DATABASE_URL:** postgresql://user:pass@localhost:5432/aidj
- **Schema:** src/lib/db/schema/auth.schema.ts (users, sessions)
- **Migrations:** Drizzle-kit (pnpm db:push)

### Implementation
- Better Auth handles user registration/login
- Session middleware in API routes
- Per-user Navidrome tokens stored in planned user_configs table

### Considerations
- Secure password hashing (built-in)
- Session expiration handling
- Backup/restore for local DB

## Navidrome Integration (Implemented)

### Overview
Navidrome provides music library browsing and streaming. App proxies requests to handle auth/CORS.

### API Endpoints (Proxied)
- **Base URL:** Configurable via .env (default: http://localhost:4533)
- **Auth:** POST /api/v1/auth/login (user creds -> token)
- **Artists:** GET /api/v1/artists (list, with pagination)
- **Albums:** GET /api/v1/albums?artistId={id}
- **Songs:** GET /api/v1/songs?albumId={id}
- **Search:** GET /api/v1/search (unified)
- **Stream:** GET /api/v1/stream/{trackId} (audio/mp3)

### Authentication
- Per-user tokens obtained on config save
- Proxy adds Authorization: Bearer {token} header
- Token refresh via re-login if expired

### Data Format Examples
- **Artists Response:**
  ```json
  {
    "data": [
      {"id": "123", "name": "Artist", "albumCount": 5, "image": "url"}
    ],
    "next": "pagination_token"
  }
  ```
- **Stream:** Direct audio stream response (Range requests supported)

### Implementation Details
- **Proxy:** src/routes/api/navidrome/[...path].ts - forwards requests with auth
- **Streaming:** src/routes/api/navidrome/stream/$id.ts - ReadableStream passthrough
- **Caching:** TanStack Query caches metadata (artists/albums); streams uncached
- **Error Handling:** 401 -> token refresh prompt; 404 -> empty state
- **Pagination:** Infinite query for large libraries
- **Search:** Unified endpoint; results by type (artists/albums/tracks)

### Considerations
- Handle large libraries (virtual scrolling)
- Album art optimization (thumbnails)
- Offline detection for streaming

## Ollama Integration (Planned)

### Overview
Local LLM for AI music recommendations based on listening history, mood, etc.

### API Endpoints
- **Base URL:** http://localhost:11434/api
- **Generate:** POST /generate
  - Prompt: "Recommend 5 upbeat tracks similar to [current playlist]"
  - Models: llama3, mistral (music-tuned if available)

### Authentication
- None (local access only)

### Data Format
- **Request:**
  ```json
  {
    "model": "llama3",
    "prompt": "Based on [user history], suggest tracks from library",
    "stream": false,
    "options": {"temperature": 0.7}
  }
  ```
- **Response:**
  ```json
  {
    "model": "llama3",
    "response": "1. Artist - Song (reason)\n2. ...",
    "done": true
  }
  ```

### Implementation Considerations
- Parse recommendations to match Navidrome library
- Cache results per user/session
- Fallback to random/genre-based if Ollama down
- User feedback loop (like/dislike -> fine-tune prompts)
- Model loading time handling (progress indicator)

## General Requirements

### Error Handling
- API proxy: Retry 3x on 5xx; show toasts for 4xx
- Auth: Clear messages (invalid creds, expired token)
- Streaming: Buffer display, auto-reconnect
- Logging: Console in dev; structured (Pino) in prod

### Security
- Better Auth: Secure sessions, CSRF protection
- Navidrome tokens: Encrypt in DB (planned)
- Input validation: Zod in forms/API
- No client-side service URLs/creds exposure

### Performance
- TanStack Query: Stale-while-revalidate for metadata
- Vite: Tree-shaking, code-splitting
- Streaming: Chunked transfer, no full track preload
- Images: Lazy load album art, WebP format

### Configuration
- Per-user Navidrome creds in config UI
- .env for global settings (DB, service defaults)
- Theme/user prefs in localStorage/DB

### Data Flow
1. User logs in -> Better Auth -> session
2. Config Navidrome -> Test auth -> Save token
3. Browse library -> Proxy API calls -> Cache results
4. Play track -> Proxy stream -> Audio store updates
5. Planned: Get recs -> Ollama prompt -> Filter by library -> Display

## Data Flow

Current flow:
1. Login -> Auth -> Dashboard
2. Config -> Test Navidrome -> Save token
3. Library browse -> Proxy metadata -> Display cards
4. Search -> Proxy query -> Filter results
5. Play -> Proxy stream -> Audio player
Planned: AI recs integration