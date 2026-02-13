# Epic 8 Story 8.2: Navidrome Authentication & API Client

## Status
Draft

## Priority
Critical (Required for library access - blocks Stories 8.3+)

## Story
**As a** user,
**I want** to log in with my Navidrome server credentials,
**so that** I can access my music library from the mobile app.

## Acceptance Criteria

1. Create login screen with required fields:
   - Server URL input (with https:// prefix helper)
   - Username input
   - Password input (secure entry)
   - "Remember me" toggle
   - Login button with loading state
   - Error display for failed auth

2. Implement Navidrome authentication:
   - Support direct Navidrome connection (not via aidj API)
   - Generate Subsonic API token using MD5(password + salt) pattern
   - Validate credentials with `ping.view` endpoint
   - Handle various error states (network, invalid credentials, server unreachable)

3. Securely store credentials:
   - Use `expo-secure-store` for sensitive data (password/token)
   - Store: serverUrl, username, subsonicToken, subsonicSalt
   - Never store raw password after initial auth
   - Implement credential retrieval on app launch

4. Create Navidrome API client service:
   - Base request handler with auth params injection
   - Common error handling (401 → re-auth, network errors, timeouts)
   - Request timeout handling (10s default)
   - Auto-retry on transient failures (1 retry with backoff)

5. Implement key API endpoints:
   - `ping.view` - Auth validation
   - `getArtists.view` - Artist list
   - `getAlbumList2.view` - Album list
   - `getAlbum.view` - Album with tracks
   - `stream.view` - Audio streaming URL generation
   - `getCoverArt.view` - Artwork URL generation

6. Implement logout functionality:
   - Clear stored credentials from secure store
   - Reset player state (stop playback, clear queue)
   - Navigate to login screen
   - Clear TanStack Query cache

7. Add connection status indicator:
   - Show connected/disconnected state in UI
   - Server name display when connected
   - Tap to view connection details

8. Handle offline/reconnection scenarios:
   - Detect network state changes
   - Auto-reconnect when network returns
   - Queue requests during brief disconnections (optional)

## Tasks / Subtasks

### Login Screen UI (AC: 1)
- [ ] Create `app/(auth)/login.tsx` screen
- [ ] Create `components/auth/LoginForm.tsx` component:
  - Server URL input with validation
  - Username input
  - Password input (secureTextEntry)
  - Remember me switch
  - Submit button with loading state
- [ ] Add form validation (URL format, required fields)
- [ ] Create error message component for auth failures
- [ ] Style with NativeWind matching aidj theme
- [ ] Handle keyboard avoiding view for iOS

### Navidrome Service Layer (AC: 2, 4, 5)
- [ ] Create `lib/services/navidrome/client.ts`:
  ```typescript
  // Core API client with auth
  export class NavidromeClient {
    private serverUrl: string;
    private username: string;
    private subsonicToken: string;
    private subsonicSalt: string;

    async request<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
    getStreamUrl(songId: string): string;
    getCoverArtUrl(id: string, size?: number): string;
  }
  ```
- [ ] Create `lib/services/navidrome/auth.ts`:
  - `generateSubsonicAuth(password: string)` - returns { token, salt }
  - `validateCredentials(serverUrl, username, password)` - calls ping.view
- [ ] Create `lib/services/navidrome/md5.ts` - Pure JS MD5 implementation (copy from aidj)
- [ ] Create `lib/services/navidrome/types.ts` - API response types
- [ ] Implement endpoint wrappers:
  - `getArtists()`
  - `getAlbumList(type, size, offset)`
  - `getAlbum(id)`
  - `search(query)`
  - `getSong(id)`
- [ ] Add request timeout handling (AbortController)
- [ ] Add retry logic with exponential backoff

### Secure Storage (AC: 3)
- [ ] Install expo-secure-store: `npx expo install expo-secure-store`
- [ ] Create `lib/services/auth-storage.ts`:
  ```typescript
  export async function saveCredentials(creds: NavidromeCredentials): Promise<void>;
  export async function getCredentials(): Promise<NavidromeCredentials | null>;
  export async function clearCredentials(): Promise<void>;
  export async function hasStoredCredentials(): Promise<boolean>;
  ```
- [ ] Store structure:
  ```typescript
  interface NavidromeCredentials {
    serverUrl: string;
    username: string;
    subsonicToken: string;
    subsonicSalt: string;
    serverName?: string; // from ping response
  }
  ```
- [ ] Implement credential migration if format changes

### Auth Store & Flow (AC: 2, 6)
- [ ] Create `lib/stores/auth.ts` Zustand store:
  ```typescript
  interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    credentials: NavidromeCredentials | null;
    error: string | null;

    login: (serverUrl: string, username: string, password: string, remember: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<boolean>;
  }
  ```
- [ ] Implement login flow:
  1. Validate inputs
  2. Generate subsonic auth (MD5)
  3. Call ping.view to validate
  4. Save credentials if "remember me"
  5. Update store state
- [ ] Implement logout flow:
  1. Clear secure storage
  2. Reset auth store
  3. Reset player store
  4. Clear query cache
  5. Navigate to login

### Auto-Login on Launch (AC: 3)
- [ ] In `app/_layout.tsx`, check for stored credentials
- [ ] If found, validate with ping.view
- [ ] If valid, navigate to main app
- [ ] If invalid/expired, navigate to login
- [ ] Show splash during check

### Connection Status (AC: 7, 8)
- [ ] Create `components/ConnectionStatus.tsx`:
  - Green dot = connected
  - Red dot = disconnected
  - Tap to show server details modal
- [ ] Create `hooks/useNetworkStatus.ts`:
  - Use `@react-native-community/netinfo` or expo equivalent
  - Track online/offline state
- [ ] Add to header/settings area
- [ ] Handle reconnection attempts

### Testing
- [ ] Unit test: MD5 implementation matches expected hashes
- [ ] Unit test: Auth token generation
- [ ] Unit test: Credential storage/retrieval
- [ ] Unit test: Auth store state transitions
- [ ] Integration test: Mock ping.view response
- [ ] Manual test: Login with real Navidrome server
- [ ] Manual test: Login persistence across app restarts
- [ ] Manual test: Logout clears all data

## Dev Notes

### Subsonic API Authentication Pattern

The Subsonic API (which Navidrome implements) uses a token-based auth where:
```
token = MD5(password + salt)
```

Every API request includes these query params:
```
u={username}&t={token}&s={salt}&v=1.16.1&c=aidj-mobile&f=json
```

**From aidj web (`src/lib/services/navidrome.ts:407-412`):**
```typescript
// Generate Subsonic API auth token/salt
const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
const md5Token = md5Pure(password + salt);
subsonicToken = md5Token;
subsonicSalt = salt;
```

### MD5 Implementation

Copy the pure JS MD5 implementation from aidj (`src/lib/services/navidrome.ts:6-151`). This is required because:
- React Native doesn't have Node's `crypto` module
- We need cross-platform MD5 that works on iOS/Android
- The implementation is self-contained with no dependencies

### API Endpoint Patterns

**Base URL format:**
```
{serverUrl}/rest/{endpoint}?{authParams}&{additionalParams}
```

**Ping endpoint (auth validation):**
```
GET /rest/ping.view?u={user}&t={token}&s={salt}&v=1.16.1&c=aidj-mobile&f=json
```

**Success response:**
```json
{
  "subsonic-response": {
    "status": "ok",
    "version": "1.16.1",
    "type": "navidrome",
    "serverVersion": "0.53.0"
  }
}
```

**Error response:**
```json
{
  "subsonic-response": {
    "status": "failed",
    "error": {
      "code": 40,
      "message": "Wrong username or password"
    }
  }
}
```

### Subsonic Error Codes
| Code | Meaning |
|------|---------|
| 0 | Generic error |
| 10 | Required parameter missing |
| 20 | Incompatible client version |
| 30 | Incompatible server version |
| 40 | Wrong username or password |
| 41 | Token authentication not supported |
| 50 | User not authorized for operation |
| 60 | Trial expired |
| 70 | Data not found |

### Secure Storage Keys

```typescript
const STORAGE_KEYS = {
  SERVER_URL: 'navidrome_server_url',
  USERNAME: 'navidrome_username',
  SUBSONIC_TOKEN: 'navidrome_subsonic_token',
  SUBSONIC_SALT: 'navidrome_subsonic_salt',
  SERVER_NAME: 'navidrome_server_name',
};
```

### Stream URL Generation

For TrackPlayer, we need full stream URLs:
```typescript
function getStreamUrl(songId: string): string {
  const params = new URLSearchParams({
    id: songId,
    u: this.username,
    t: this.subsonicToken,
    s: this.subsonicSalt,
    v: '1.16.1',
    c: 'aidj-mobile',
    f: 'json',
  });
  return `${this.serverUrl}/rest/stream.view?${params.toString()}`;
}
```

### Cover Art URL Generation

```typescript
function getCoverArtUrl(id: string, size: number = 300): string {
  const params = new URLSearchParams({
    id,
    size: size.toString(),
    u: this.username,
    t: this.subsonicToken,
    s: this.subsonicSalt,
    v: '1.16.1',
    c: 'aidj-mobile',
  });
  return `${this.serverUrl}/rest/getCoverArt.view?${params.toString()}`;
}
```

### Type Definitions (from aidj)

```typescript
// lib/services/navidrome/types.ts

export interface SubsonicResponse<T> {
  'subsonic-response': {
    status: 'ok' | 'failed';
    version: string;
    type?: string;
    serverVersion?: string;
    error?: {
      code: number;
      message: string;
    };
  } & T;
}

export interface Artist {
  id: string;
  name: string;
  albumCount?: number;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  coverArt?: string;
  songCount: number;
  duration: number;
  year?: number;
  genre?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId: string;
  duration: number;
  track?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
}

export interface ArtistsResponse {
  artists: {
    index: Array<{
      name: string;
      artist: Artist[];
    }>;
  };
}

export interface AlbumListResponse {
  albumList2: {
    album: Album[];
  };
}

export interface AlbumResponse {
  album: Album & {
    song: Song[];
  };
}
```

### File Structure

```
lib/
├── services/
│   ├── navidrome/
│   │   ├── index.ts          # Re-exports
│   │   ├── client.ts         # NavidromeClient class
│   │   ├── auth.ts           # Auth helpers
│   │   ├── md5.ts            # MD5 implementation
│   │   └── types.ts          # TypeScript types
│   └── auth-storage.ts       # Secure credential storage
├── stores/
│   └── auth.ts               # Auth Zustand store
└── hooks/
    └── useNetworkStatus.ts   # Network state hook
```

### Dependencies to Add

```bash
npx expo install expo-secure-store
npx expo install @react-native-community/netinfo  # or expo-network
```

## Testing

### Testing Standards
- Jest + React Native Testing Library
- Mock expo-secure-store for unit tests
- Mock fetch for API tests
- Test files: `__tests__/*.test.ts`

### Test Cases

1. **MD5 Implementation**
   - Known input/output pairs match
   - Empty string handling
   - Unicode character handling

2. **Auth Token Generation**
   - Token format is valid hex
   - Salt is sufficiently random
   - Same password + different salt = different token

3. **Credential Storage**
   - Save and retrieve credentials
   - Clear credentials removes all keys
   - hasStoredCredentials returns correct boolean

4. **Auth Store**
   - Initial state is unauthenticated
   - Successful login updates state
   - Failed login sets error
   - Logout clears state

5. **API Client**
   - Requests include correct auth params
   - 401 triggers re-auth attempt
   - Network errors are handled gracefully
   - Timeout aborts request

## Definition of Done

- [ ] Login screen renders with all required fields
- [ ] Can successfully authenticate with Navidrome server
- [ ] Credentials are securely stored (expo-secure-store)
- [ ] Auto-login works on app restart (if remembered)
- [ ] Logout clears all stored data
- [ ] API client can make authenticated requests
- [ ] Stream URLs are generated correctly
- [ ] Cover art URLs work
- [ ] Connection status indicator shows state
- [ ] Error states are handled gracefully
- [ ] All unit tests pass

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
