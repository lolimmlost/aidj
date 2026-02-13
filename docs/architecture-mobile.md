---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ['docs/prd-aidj-mobile.md', 'docs/analysis/product-brief-aidj-mobile-2025-12-14.md']
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2025-12-14'
project_name: 'AIDJ Mobile'
user_name: 'Dev Gansta'
date: '2025-12-14'
---

# Architecture Decision Document - AIDJ Mobile

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- 42 requirements across 8 functional areas
- 26 P0 (must have), 11 P1 (should have), 5 P2 (nice to have)
- Core areas: Auth (6), Library (6), Search (6), Playback (10), Queue (10), Now Playing (6), Scrobbling (3), Settings (4)

**Non-Functional Requirements:**
- 38 requirements across 7 NFR categories
- Critical: Background audio 99.9% uptime, <3s launch, 60fps scroll, 50k+ song support
- Security: Encrypted credentials via SecureStore, no plaintext secrets

**Additional NFRs (from team review):**
- First Meaningful Paint (Now Playing): <500ms
- Error display minimum duration: 2 seconds
- Clock drift tolerance: ±5 minutes for Subsonic auth

**Scale & Complexity:**
- Primary domain: Mobile (React Native/Expo)
- Complexity level: Medium
- Estimated architectural components: 12-15 (services, stores, screens, components)

### Technical Constraints & Dependencies

| Constraint | Impact |
|------------|--------|
| react-native-track-player required | Must register in index.js BEFORE expo-router |
| Expo SDK 54+ | Determines available APIs and build process |
| Subsonic API protocol | Fixed API contract with Navidrome |
| iOS 15.1+ / Android API 24+ | Platform feature availability |
| Better Auth | Authentication flow and session management |
| Device clock accuracy | Subsonic MD5 token auth requires ±5min accuracy |
| MMKV persistence | Survives app updates; requires schema versioning |

### Cross-Cutting Concerns

| Concern | Affected Components | Architectural Approach |
|---------|---------------------|------------------------|
| Background Audio Lifecycle | Playback, Lock Screen, State | Track Player as single source of truth |
| Network State | All API calls, Streaming | Centralized network status, TanStack Query |
| State Persistence | Queue, Credentials, Position | Zustand + MMKV hydration |
| Error Handling | All services | Error boundary + min 2s display duration |
| Platform Differences | Audio, Notifications | Platform-specific config in app.json |
| Initialization Sequencing | All stores, Track Player, Navigation | Boot orchestrator with explicit phases |
| Observability | Background audio, errors | Event logging for production debugging |
| Demo-Ready Performance | Now Playing, Album Art | Aggressive caching, render optimization |
| Graceful Degradation | Playback, Network, Errors | Defined state tiers with recovery paths |
| Schema Versioning | Queue, Preferences, Cache | Version field + migration utilities |
| Extensibility Seams | Next Song, Album Art, Events | Interface-based design for future swap |
| Local Analytics | All user actions | On-device event store for recaps |

### Architectural Principles

1. **Single Source of Truth for Playback**: Track Player IS the authority; Zustand observes and reflects
2. **Boot Sequence Orchestration**: Explicit phases - SecureStore → MMKV → Zustand → Track Player → Navigation
3. **State Hydration Before Audio**: Track Player initialization must await Zustand hydration completion
4. **Premium Feel Architecture**: No loading states on hero screens, aggressive album art caching
5. **Graceful Degradation Tiers**: Optimal → Degraded → Failed with defined UX per tier
6. **Schema Versioning**: All persisted data structures include version field with migration path
7. **Extensibility Without Scope Creep**: Interface seams for v1.1+ features (NextSongResolver, AlbumArtLoader)
8. **Privacy-First Analytics**: Local-only event store powers recaps; no external telemetry

### Graceful Degradation Tiers

| Tier | Condition | User Experience | Recovery |
|------|-----------|-----------------|----------|
| **Optimal** | Network stable, server responsive | Seamless playback | N/A |
| **Degraded** | Network unstable, buffering | Brief indicator, auto-retry | Exponential backoff |
| **Failed** | Server unreachable, auth failed | Clear message, manual retry | User-initiated reconnect |

### Extensibility Seams (for v1.1+)

```typescript
// NextSongResolver - swap queue-based for recommendation-based
interface NextSongResolver {
  getNextSong(context: PlaybackContext): Promise<Song | null>;
}

// AlbumArtLoader - caching + placeholder strategy
interface AlbumArtLoader {
  getArt(albumId: string): CachedArt | Placeholder | RemoteUrl;
}

// EventBus - local analytics for recaps
interface PlaybackEvent {
  type: 'play' | 'pause' | 'skip' | 'complete' | 'nudge';
  songId: string;
  timestamp: number;
}
```

### Story Dependency Matrix (Boot Sequence)

| Story | Depends On | Provides |
|-------|------------|----------|
| 1.5 Zustand Setup | - | Store structure |
| 1.6 TanStack Query | 1.5 | Query client |
| 2.5 SecureStore Credentials | - | Credential access |
| 2.6 Auto-login | 2.5, 1.5 | Auth state |
| 3.1 Track Player Integration | 2.6, 1.5 | Audio service |
| 4.8 Queue Persistence | 1.5, 3.1 | Hydrated queue |

**Boot Sequence**: 2.5 → 1.5 → 1.6 → 2.6 → 3.1 → 4.8 → App Interactive

### Testing Implications

| Area | Approach |
|------|----------|
| Background Audio Matrix | Real device testing required (cannot fully automate) |
| Large Library Performance | Synthetic data generation for 50k+ songs |
| Audio Session Debugging | Test mode with event logging |
| Performance Benchmarks | CI integration with mocked data |
| Schema Migration | Unit tests for version upgrade paths |
| Degradation Tiers | Simulated network conditions testing |

---

## Starter Template Evaluation

### Primary Technology Domain

Mobile App (React Native/Expo) based on project requirements analysis.

### Existing Project Status

**Project Location:** `/home/default/Desktop/dev/aidj-mobile`

### Security Advisory: CVE-2025-55182 (React2Shell)

**Critical vulnerability (CVSS 10.0)** in React 19.x requires update.

| Package | Current (Vulnerable) | Required (Patched) |
|---------|---------------------|-------------------|
| react | 19.1.0 | **19.1.4** |
| react-dom | 19.1.0 | **19.1.4** |
| expo | 54.0.27 | **54.0.29** |

**Source:** [React Security Advisory](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)

### React2Shell Non-Applicability Statement

AIDJ Mobile is a **client-only** React Native application. It does not use:
- React Server Components (RSC)
- Server-side rendering
- The Flight protocol

Therefore, CVE-2025-55182 does not provide an attack vector. However, we maintain patched versions for:
- App Store compliance (automated CVE scanning)
- Security scanner compatibility
- Defense in depth principle

### Technology Stack (Post-Update Targets)

| Layer | Technology | Target Version | Status |
|-------|------------|----------------|--------|
| Framework | Expo SDK | **54.0.29** | Update |
| Runtime | React | **19.1.4** | **CRITICAL** |
| Runtime | React Native | 0.81.x | Verify |
| Navigation | Expo Router | 6.0.x | Configured |
| Styling | NativeWind | 4.2.x | Configured |
| Audio | react-native-track-player | 4.1.x | Verify compat |
| UI State | Zustand | 5.x | Configured |
| Server State | TanStack Query | 5.x | Configured |
| Secure Storage | expo-secure-store | 15.x | Configured |
| Fast Storage | react-native-mmkv | Latest | **ADD** |
| Animations | react-native-reanimated | 4.1.x | Verify compat |

### Selected Approach: Update Existing Project

**Safe Update Sequence (Story 1.1):**

```bash
cd /home/default/Desktop/dev/aidj-mobile

# 1. Check current state
npx expo install --check

# 2. Update Expo explicitly
npm install expo@54.0.29

# 3. Fix all dependencies (patches React CVE)
npx expo install --fix

# 4. Add MMKV for queue persistence
npx expo install react-native-mmkv

# 5. Audit for remaining issues
npm audit

# 6. Clear all caches
npx expo start --clear

# 7. Rebuild native projects
npx expo prebuild --clean

# 8. Verify versions
npm list react expo react-native
```

### Update Verification Checklist (Story 1.1 AC)

- [ ] React version is 19.1.4 or higher
- [ ] Expo SDK is 54.0.29 or higher
- [ ] npm audit shows no critical/high vulnerabilities
- [ ] App launches successfully on iOS simulator
- [ ] App launches successfully on Android emulator
- [ ] react-native-track-player initializes without errors
- [ ] Animations (reanimated) function correctly
- [ ] MMKV is installed and importable

### Dependency Update Policy

| Severity | Response Time |
|----------|---------------|
| Critical (CVSS 9+) | 24 hours, regardless of sprint |
| High (CVSS 7-8.9) | Current sprint |
| Medium (CVSS 4-6.9) | Next sprint |
| Low (CVSS <4) | Quarterly maintenance |

### Architectural Decisions Provided by Setup

**Language & Runtime:**
- TypeScript 5.9.x with strict mode
- React 19.1.4+ (patched for CVE-2025-55182)
- React Native 0.81.x
- React Compiler enabled (SDK 54 default)

**Security:**
- All dependencies at latest patched versions
- Client-only architecture (no RSC exposure)
- Credentials in SecureStore (encrypted)
- Non-sensitive data in MMKV (fast, unencrypted)

**Build & Development:**
- Expo CLI with development client
- EAS Build for iOS/Android distribution
- Metro bundler with NativeWind transformer
- Cache clearing protocol for major updates

**Note:** Story 1.1 (Security Update) is a gate - blocks all other stories until verification passes.

---

## Core Architectural Decisions

### Decision Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1.1 | Library Caching | TanStack Query only | Simple MVP, fast enough |
| 1.2 | Album Art | expo-image + client-side color extraction | Premium feel, no extra API calls |
| 2.1 | Auth Flow | Sequential (Better Auth → Navidrome) | Public profiles, sharing, future social |
| 2.2 | Credential Storage | SecureStore (sensitive) + MMKV (prefs) | Security + performance split |
| 3.1 | API Client | Pragmatic singleton with test escape hatch | Ship fast + testable |
| 3.2 | Retry Strategy | Exponential backoff (1s, 2s, 4s) | Network resilience |
| 4.1 | Screen Organization | Route groups (auth)/(tabs)/(onboarding) | Expo Router best practice |
| 4.2 | Onboarding | Skippable, empty states with CTAs | Users can explore before setup |

### Data Architecture

**Library Data Caching:**
- Strategy: TanStack Query in-memory cache only
- Stale time: 5 minutes (library), 1 minute (now playing)
- Structured keys for future persistence: `['navidrome', 'artists']`

**Album Art with Dominant Color:**
```typescript
const AlbumArt = ({ album }) => {
  const [dominantColor, setDominantColor] = useCachedColor(album.id);

  return (
    <Image
      source={getCoverArtUrl(album.id)}
      placeholder={{ backgroundColor: dominantColor || '#1a0f2e' }}
      onLoad={(e) => {
        if (!dominantColor) extractAndCacheColor(e.nativeEvent.source, album.id);
      }}
    />
  );
};
```

### Authentication & Security

**Dual Auth Flow:**
```
Better Auth Login → App Access (profiles, sharing)
         ↓
Navidrome Setup (optional) → Music Features
         ↓
Skip → Empty states with setup CTAs
```

**Connection Status Management:**
```typescript
type NavidromeConnectionStatus =
  | 'not_configured' | 'connected' | 'auth_failed' | 'unreachable' | 'checking';
```

**Storage Pattern:**

| Data | Storage | Encrypted |
|------|---------|-----------|
| Better Auth session | SecureStore | Yes |
| Navidrome credentials | SecureStore | Yes |
| User preferences | MMKV | No |
| Queue state | MMKV | No |
| Dominant colors cache | MMKV | No |

### API & Communication

**Pragmatic Service Pattern:**
```typescript
// lib/services/navidrome.ts
let _service: NavidromeService | null = null;

export function initNavidrome(url: string, auth: SubsonicAuth) {
  _service = new NavidromeService(url, auth);
}

export function getNavidrome(): NavidromeService {
  if (!_service) throw new Error('Navidrome not initialized');
  return _service;
}

// Test escape hatch
export function __setTestService(service: NavidromeService | null) {
  if (__DEV__) _service = service;
}
```

**Retry Configuration:**
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
  retryableErrors: ['NetworkError', 'TimeoutError'],
  nonRetryableErrors: ['AuthError', '401', '404'],
};
```

### Frontend Architecture

**Screen Organization:**
```
app/
├── (auth)/           # Unauthenticated
│   ├── login.tsx
│   └── signup.tsx
├── (onboarding)/     # No-Navidrome flow
│   └── setup-guide.tsx
├── (tabs)/           # Main app
│   ├── index.tsx     # Now Playing
│   ├── search.tsx
│   └── library/
├── artist/[id].tsx
├── album/[id].tsx
└── queue.tsx
```

**Component Organization:**
```
components/
├── ui/           # Design primitives
├── player/       # Audio components
├── library/      # Library browsing
├── connection/   # Status banners
└── onboarding/   # Setup flow
```

### New Stories from Architecture

| Story | Description | Priority |
|-------|-------------|----------|
| 2.0 | Connection Status Management | P0 |
| 2.9 | Onboarding Flow (Skippable) | P1 |
| 2.10 | Empty States with Setup CTA | P1 |

### v1.1 Considerations (Not MVP)

- Deep linking for shareable profiles (`aidj://profile/[id]`)
- Demo mode with sample library
- MMKV persistence for TanStack Query cache

---

## Implementation Patterns & Consistency Rules

**Critical Conflict Points Identified:** 30 areas where AI agents could make different choices

### Naming Patterns

**File & Directory Naming:**
| Element | Pattern | Example |
|---------|---------|---------|
| Screen files | kebab-case.tsx | `now-playing.tsx`, `album-detail.tsx` |
| Component files | PascalCase.tsx | `AlbumArt.tsx`, `QueueItem.tsx` |
| Hook files | use-kebab-case.ts | `use-player-state.ts` |
| Service files | kebab-case.ts | `navidrome-service.ts` |
| Store files | use-{name}-store.ts | `use-queue-store.ts` |
| Type files | {name}.types.ts | `navidrome.types.ts` |
| Test files | {name}.test.ts | `navidrome-service.test.ts` |
| Index files | index.ts (barrel exports) | `lib/components/player/index.ts` |

**API & Query Naming:**
| Element | Pattern | Example |
|---------|---------|---------|
| Query keys | Structured arrays | `['navidrome', 'artists', { limit: 50 }]` |
| Query hooks | use{Entity}Query | `useArtistsQuery`, `useAlbumQuery` |
| Mutation hooks | use{Action}{Entity}Mutation | `useCreatePlaylistMutation` |
| API endpoints | Subsonic protocol | `/rest/getArtists.view` (fixed) |

**TypeScript Naming:**
| Element | Pattern | Example |
|---------|---------|---------|
| Interfaces | PascalCase (no I prefix) | `Artist`, `Album`, `Song` |
| Type aliases | PascalCase | `NavidromeConnectionStatus` |
| Enums | PascalCase + UPPER_SNAKE values | `PlayerState.PLAYING` |
| Functions | camelCase | `getNavidrome()`, `initTrackPlayer()` |
| Constants | UPPER_SNAKE_CASE | `RETRY_CONFIG`, `STALE_TIME` |
| Boolean variables | is/has/should prefix | `isPlaying`, `hasQueue`, `shouldRepeat` |

**Test Naming Convention:**
```typescript
// Use 'it' with 'should' for behavior description
describe('NavidromeService', () => {
  describe('getArtists', () => {
    it('should return paginated artists on success', async () => {});
    it('should throw AuthError when token expired', async () => {});
    it('should retry on network timeout', async () => {});
  });
});
```

### Structure Patterns

**Project Organization:**
```
lib/
├── __mocks__/              # Global mocks (react-native-track-player)
├── __fixtures__/           # Shared test data
│   ├── artists.ts          # Mock artist data
│   ├── songs.ts            # Mock song data (supports 50k generation)
│   └── factory.ts          # Data generation utilities
├── components/             # Reusable UI components
│   ├── ui/                 # Design primitives (Button, Input)
│   │   └── index.ts        # Barrel export
│   ├── player/             # Audio-related (PlayerControls, ProgressBar)
│   │   └── index.ts        # Barrel export
│   ├── library/            # Library browsing (ArtistCard, AlbumGrid)
│   │   └── index.ts        # Barrel export
│   ├── connection/         # Status components (ConnectionBanner)
│   └── empty-state/        # Standardized empty states
├── hooks/                  # Custom hooks (co-located tests)
│   ├── use-player-state.ts
│   └── use-player-state.test.ts
├── services/               # API and external services
│   ├── navidrome/
│   │   ├── __mocks__/      # Service-specific mocks
│   │   ├── navidrome-service.ts
│   │   ├── navidrome-service.test.ts
│   │   └── navidrome.types.ts
│   └── track-player/
├── stores/                 # Zustand stores
│   ├── use-queue-store.ts
│   ├── use-auth-store.ts
│   └── use-preferences-store.ts
├── utils/                  # Pure utility functions
│   ├── format.ts           # formatDuration, formatDate
│   └── subsonic-auth.ts
└── constants/              # App-wide constants
    └── config.ts
```

**Import Order Convention:**
```typescript
// 1. React/React Native
import { useState } from 'react';
import { View, Text } from 'react-native';

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query';

// 3. Internal aliases (@/)
import { useQueueStore } from '@/stores/use-queue-store';

// 4. Relative imports
import { formatDuration } from './utils';

// 5. Types (always last)
import type { Song } from '@/services/navidrome/navidrome.types';
```

**Index File / Barrel Export Pattern:**
```typescript
// lib/components/player/index.ts
export { PlayerControls } from './PlayerControls';
export { ProgressBar } from './ProgressBar';
export { AlbumArt } from './AlbumArt';

// Usage: import { PlayerControls, AlbumArt } from '@/components/player';
// NOT: import { PlayerControls } from '@/components/player/PlayerControls';
```

**Test & Mock Locations:**
- Co-located tests: `{name}.test.ts` next to `{name}.ts`
- Global mocks: `lib/__mocks__/` for third-party packages
- Service mocks: `lib/services/{service}/__mocks__/`
- Shared fixtures: `lib/__fixtures__/`
- Snapshots: `__snapshots__/` co-located with test (sparingly used)
- E2E tests: `e2e/` at project root

**Snapshot Testing Policy:**
- ONLY for complex UI components with significant visual structure
- Require explicit approval in PR review
- Never snapshot API responses or state objects

### Format Patterns

**API Response Handling:**
```typescript
// Navidrome/Subsonic responses always wrapped
interface SubsonicResponse<T> {
  'subsonic-response': {
    status: 'ok' | 'failed';
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: { code: number; message: string };
  } & T;
}

// Internal app errors use consistent structure
interface AppError {
  type: 'network' | 'auth' | 'server' | 'validation';
  message: string;       // User-facing message
  code?: string;         // Machine-readable code
  details?: unknown;     // Debug info (dev only)
}
```

**Date/Time Formats:**
| Context | Format | Example |
|---------|--------|---------|
| API transmission | ISO 8601 | `2025-12-14T10:30:00Z` |
| Display (duration) | mm:ss | `3:45` |
| Display (long duration) | h:mm:ss | `1:23:45` |
| Display (date) | Relative or locale | `Today`, `Yesterday`, `Dec 14` |
| Storage (timestamps) | Unix ms | `1734177000000` |

**Query Key Structure:**
```typescript
// Always follow this hierarchy
const queryKeys = {
  navidrome: {
    all: ['navidrome'] as const,
    artists: () => [...queryKeys.navidrome.all, 'artists'] as const,
    artist: (id: string) => [...queryKeys.navidrome.artists(), id] as const,
    albums: (filters?: AlbumFilters) => [...queryKeys.navidrome.all, 'albums', filters] as const,
    album: (id: string) => [...queryKeys.navidrome.all, 'album', id] as const,
    songs: (albumId: string) => [...queryKeys.navidrome.all, 'songs', albumId] as const,
  },
} as const;
```

### Communication Patterns

**Zustand Store Pattern:**
```typescript
// Standard store structure
interface QueueStore {
  // State
  queue: Song[];
  currentIndex: number;

  // Derived (computed in selectors, not stored)
  // currentSong: Song | null; // DON'T store derived state

  // Actions
  addToQueue: (songs: Song[]) => void;
  removeFromQueue: (index: number) => void;
  reorder: (from: number, to: number) => void;
  clear: () => void;
}

// Selector pattern for derived state
const useCurrentSong = () => useQueueStore((s) => s.queue[s.currentIndex] ?? null);
```

**Track Player Event Handling:**
```typescript
// Event handler naming: on{Event}
// Always in services/track-player/event-handlers.ts
export const onPlaybackState = async (event: Event) => { ... };
export const onPlaybackTrackChanged = async (event: Event) => { ... };
export const onPlaybackQueueEnded = async (event: Event) => { ... };
```

**State Update Patterns:**
```typescript
// Zustand: Always immutable with immer
set(produce((state) => {
  state.queue.splice(index, 1);
}));

// TanStack Query: Invalidate, don't manually update
queryClient.invalidateQueries({ queryKey: queryKeys.navidrome.artists() });
```

**Feedback Micro-interaction Pattern:**
```typescript
// Standardized feedback for user actions
const FEEDBACK_PATTERNS = {
  addToQueue: {
    haptic: 'light',           // expo-haptics ImpactFeedbackStyle
    toast: { message: 'Added to queue', duration: 2000 },
  },
  removeFromQueue: {
    haptic: 'medium',
    toast: { message: 'Removed from queue', duration: 2000 },
  },
  likedSong: {
    haptic: 'light',
    toast: null,               // Visual heart animation only
  },
  error: {
    haptic: 'error',           // NotificationFeedbackType.Error
    toast: { message: '{error.message}', duration: 5000, type: 'error' },
  },
} as const;
```

### Process Patterns

**Network-Aware Query Pattern:**
```typescript
// Network status integrated with queries
const { data, isOffline } = useNetworkAwareQuery({
  queryKey: queryKeys.navidrome.artists(),
  queryFn: () => getNavidrome().getArtists(),
  offlineBehavior: 'stale-while-offline', // 'error' | 'cached-only'
});

// Offline behavior options:
// - 'stale-while-offline': Show cached data + offline indicator
// - 'error': Show error state when offline
// - 'cached-only': Silent fail, show only cached
```

**Error Handling:**
```typescript
// Component-level error boundaries for non-critical
<ErrorBoundary fallback={<ErrorCard onRetry={refetch} />}>
  <AlbumGrid />
</ErrorBoundary>

// Service-level errors thrown as AppError
throw { type: 'auth', message: 'Session expired. Please reconnect.' };

// Display duration: minimum 2 seconds for user errors
// Auto-dismiss: Never for auth errors, 5s for transient errors
```

**Loading State Pattern:**
```typescript
// TanStack Query provides loading states - use them
const { data, isLoading, isPending, isError, error, refetch } = useArtistsQuery();

// Loading skeletons, not spinners (premium feel)
if (isPending) return <ArtistListSkeleton count={10} />;

// Hero screens (Now Playing): NO loading states
// Pre-cache data before navigation or show last-known state
```

**Empty State Component Pattern:**
```typescript
// Consistent empty state structure for all empty views
interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

// Usage consistent across all empty states
<EmptyState
  icon="music-note"
  title="No artists yet"
  description="Connect to Navidrome to see your music library"
  action={{ label: "Set Up", onPress: navigateToSetup }}
/>

// Standard empty states:
// - Library empty: icon="library", action="Set Up Navidrome"
// - Search empty: icon="search", no action (typing state)
// - Queue empty: icon="queue", action="Browse Library"
// - No results: icon="search-off", no action
```

**Retry Implementation:**
```typescript
// Service-level retry config (from architecture)
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
  retryableErrors: ['NetworkError', 'TimeoutError', 'ECONNREFUSED'],
  nonRetryableErrors: ['AuthError', '401', '403', '404'],
};

// TanStack Query retry
useQuery({
  queryKey: queryKeys.navidrome.artists(),
  queryFn: () => getNavidrome().getArtists(),
  retry: (failureCount, error) => {
    if (isNonRetryableError(error)) return false;
    return failureCount < 3;
  },
  retryDelay: (attempt) => RETRY_CONFIG.backoffMs[attempt] ?? 4000,
});
```

**Boot Sequence Enforcement:**
```typescript
// lib/boot/sequence.ts - Single orchestrator
export async function bootApp(): Promise<BootResult> {
  // Phase 1: Storage (blocking)
  await SecureStore.isAvailable();
  await initMMKV();

  // Phase 2: State hydration (blocking)
  await useQueueStore.persist.rehydrate();
  await useAuthStore.persist.rehydrate();

  // Phase 3: Services (blocking)
  const credentials = await loadNavidromeCredentials();
  if (credentials) initNavidrome(credentials);

  // Phase 4: Audio (blocking)
  await setupTrackPlayer();

  // Phase 5: Ready
  return { ready: true };
}
```

### Enforcement Guidelines

**All AI Agents MUST:**
- Use the exact naming conventions defined above
- Follow import order: React → Third-party → @/ aliases → Relative → Types
- Use barrel exports via index.ts for component directories
- Place files in the correct directories per structure patterns
- Follow the boot sequence - never initialize Track Player before Zustand hydration
- Use TanStack Query for all server state (no useState for API data)
- Use Zustand only for client state that persists or crosses component boundaries
- Never store derived state - compute in selectors
- Display errors for minimum 2 seconds
- Use skeleton loading, not spinners, on list screens
- Never show loading state on Now Playing screen
- Use EmptyState component for all empty views
- Apply haptic feedback per FEEDBACK_PATTERNS
- Test naming: `it('should {expected behavior}', ...)`

**Pattern Verification:**
- TypeScript strict mode catches most naming violations
- ESLint rules for import ordering and file naming
- Pre-commit hooks validate structure
- Story acceptance criteria reference patterns by name

### Pattern Examples

**Good Examples:**
```typescript
// ✅ Correct import order
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useQueueStore } from '@/stores/use-queue-store';
import { formatDuration } from './utils';
import type { Song } from '@/services/navidrome/navidrome.types';

// ✅ Correct query key structure
const { data: artists } = useQuery({
  queryKey: ['navidrome', 'artists'],
  queryFn: () => getNavidrome().getArtists(),
});

// ✅ Correct store selector
const currentSong = useQueueStore((s) => s.queue[s.currentIndex]);

// ✅ Correct barrel import
import { PlayerControls, AlbumArt } from '@/components/player';

// ✅ Correct test naming
it('should return paginated artists on success', async () => {});

// ✅ Correct empty state usage
<EmptyState
  icon="queue"
  title="Queue is empty"
  description="Add songs from your library"
  action={{ label: "Browse", onPress: goToLibrary }}
/>
```

**Anti-Patterns:**
```typescript
// ❌ Wrong: storing derived state
const useQueueStore = create((set) => ({
  queue: [],
  currentIndex: 0,
  currentSong: null, // DON'T DO THIS - derive it
}));

// ❌ Wrong: useState for server data
const [artists, setArtists] = useState([]);
useEffect(() => { fetchArtists().then(setArtists); }, []);

// ❌ Wrong: flat query keys
queryKey: ['artists'] // Missing 'navidrome' namespace

// ❌ Wrong: spinner on list screen
if (isLoading) return <ActivityIndicator />;

// ❌ Wrong: direct component import (skip barrel)
import { PlayerControls } from '@/components/player/PlayerControls';

// ❌ Wrong: mixed import order
import { useQueueStore } from '@/stores/use-queue-store';
import { useState } from 'react'; // Should be first!

// ❌ Wrong: test naming
test('getArtists works', () => {}); // Use 'it' + 'should'
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
aidj-mobile/
├── README.md
├── package.json
├── tsconfig.json
├── app.json                          # Expo configuration
├── eas.json                          # EAS Build configuration
├── metro.config.js                   # Metro bundler config
├── tailwind.config.js                # NativeWind configuration
├── babel.config.js
├── index.js                          # App entry (Track Player registered here)
├── .env.example
├── .gitignore
├── .eslintrc.js
├── .prettierrc
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, type-check, test
│       └── eas-build.yml             # EAS Build triggers
│
├── assets/
│   └── images/
│       ├── icon.png
│       ├── splash-icon.png
│       ├── adaptive-icon.png
│       └── favicon.png
│
├── app/                              # Expo Router screens
│   ├── _layout.tsx                   # Root layout (uses AppProviders)
│   │
│   ├── (auth)/                       # Unauthenticated routes
│   │   ├── _layout.tsx
│   │   ├── login.tsx                 # Epic 2: Story 2.1
│   │   └── signup.tsx                # Epic 2: Story 2.2
│   │
│   ├── (onboarding)/                 # No-Navidrome flow
│   │   ├── _layout.tsx
│   │   └── setup-guide.tsx           # Story 2.9
│   │
│   ├── (tabs)/                       # Main authenticated app
│   │   ├── _layout.tsx               # Uses TabBar from navigation/
│   │   ├── index.tsx                 # Now Playing (home) - Epic 5
│   │   ├── search.tsx                # Search - Epic 4
│   │   └── library/
│   │       ├── _layout.tsx
│   │       ├── index.tsx             # Library home - Epic 3
│   │       ├── artists.tsx           # Artist list - Story 3.1
│   │       ├── albums.tsx            # Album list - Story 3.2
│   │       └── playlists.tsx         # Playlist list - Story 3.5
│   │
│   ├── artist/
│   │   └── [id].tsx                  # Artist detail - Story 3.3
│   │
│   ├── album/
│   │   └── [id].tsx                  # Album detail - Story 3.4
│   │
│   ├── playlist/
│   │   └── [id].tsx                  # Playlist detail - Story 3.6
│   │
│   ├── queue.tsx                     # Full queue view - Epic 6
│   │
│   └── settings/
│       ├── index.tsx                 # Settings home - Epic 8
│       ├── navidrome.tsx             # Navidrome connection - Story 2.4
│       ├── scrobbling.tsx            # Scrobbling settings - Epic 7
│       └── about.tsx                 # About/version info
│
├── lib/
│   ├── __mocks__/                    # Global mocks
│   │   └── react-native-track-player.ts
│   │
│   ├── __fixtures__/                 # Shared test data
│   │   ├── artists.ts
│   │   ├── albums.ts
│   │   ├── songs.ts
│   │   ├── playlists.ts
│   │   └── factory.ts                # Data generation (50k+ support)
│   │
│   ├── __test-utils__/               # Test utilities
│   │   ├── render.tsx                # renderWithProviders
│   │   ├── query-helpers.ts          # waitForQuery, createQueryClient
│   │   ├── mock-factories.ts         # createMockNavidromeService, etc.
│   │   └── setup.ts                  # Global test setup
│   │
│   ├── boot/                         # App initialization
│   │   ├── sequence.ts               # Boot orchestrator
│   │   ├── sequence.test.ts
│   │   └── splash.tsx                # Splash screen controller
│   │
│   ├── providers/                    # React providers
│   │   ├── index.ts                  # Composed AppProviders export
│   │   ├── query-client.ts           # QueryClient instance
│   │   ├── gesture-handler.tsx       # GestureHandlerRootView wrapper
│   │   ├── toast-provider.tsx        # Toast configuration
│   │   └── network-provider.tsx      # Network status context
│   │
│   ├── components/
│   │   ├── ui/                       # Design primitives
│   │   │   ├── index.ts              # Barrel export
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── IconButton.tsx
│   │   │
│   │   ├── layout/                   # Layout components
│   │   │   ├── index.ts
│   │   │   ├── ScreenContainer.tsx   # Safe area + background
│   │   │   ├── TabBarBackground.tsx  # Custom tab bar styling
│   │   │   └── HeaderBackground.tsx  # Stack header styling
│   │   │
│   │   ├── navigation/               # Navigation components
│   │   │   ├── index.ts
│   │   │   ├── TabBar.tsx            # Custom tab bar
│   │   │   ├── TabBarIcon.tsx        # Tab icon component
│   │   │   └── MiniPlayerTabBar.tsx  # Tab bar + mini player
│   │   │
│   │   ├── player/                   # Audio components
│   │   │   ├── index.ts
│   │   │   ├── PlayerControls.tsx    # Story 5.2
│   │   │   ├── ProgressBar.tsx       # Story 5.3
│   │   │   ├── AlbumArt.tsx          # With dominant color
│   │   │   ├── MiniPlayer.tsx        # Tab bar player
│   │   │   └── VolumeSlider.tsx
│   │   │
│   │   ├── library/                  # Library browsing
│   │   │   ├── index.ts
│   │   │   ├── ArtistCard.tsx
│   │   │   ├── ArtistList.tsx
│   │   │   ├── ArtistListSkeleton.tsx
│   │   │   ├── AlbumCard.tsx
│   │   │   ├── AlbumGrid.tsx
│   │   │   ├── AlbumGridSkeleton.tsx
│   │   │   ├── SongRow.tsx
│   │   │   ├── SongList.tsx
│   │   │   └── PlaylistCard.tsx
│   │   │
│   │   ├── queue/                    # Queue components
│   │   │   ├── index.ts
│   │   │   ├── QueueItem.tsx         # Story 6.2
│   │   │   ├── QueueList.tsx         # Story 6.1
│   │   │   └── DraggableQueueItem.tsx # Story 6.4
│   │   │
│   │   ├── search/                   # Search components
│   │   │   ├── index.ts
│   │   │   ├── SearchBar.tsx         # Story 4.1
│   │   │   ├── SearchResults.tsx     # Story 4.2
│   │   │   └── SearchHistory.tsx     # Story 4.4
│   │   │
│   │   ├── connection/               # Status components
│   │   │   ├── index.ts
│   │   │   ├── ConnectionBanner.tsx  # Story 2.0
│   │   │   ├── OfflineIndicator.tsx
│   │   │   └── SyncStatus.tsx
│   │   │
│   │   ├── empty-state/              # Empty state components
│   │   │   ├── index.ts
│   │   │   └── EmptyState.tsx        # Story 2.10
│   │   │
│   │   └── auth/                     # Auth components
│   │       ├── index.ts
│   │       ├── LoginForm.tsx
│   │       ├── SignupForm.tsx
│   │       └── NavidromeSetup.tsx    # Story 2.4
│   │
│   ├── hooks/                        # Custom hooks
│   │   ├── use-player-state.ts       # Track Player state sync
│   │   ├── use-player-state.test.ts
│   │   ├── use-network-status.ts     # Network monitoring
│   │   ├── use-network-status.test.ts
│   │   ├── use-dominant-color.ts     # Uses lib/utils/image facade
│   │   ├── use-dominant-color.test.ts
│   │   ├── use-debounce.ts
│   │   └── use-debounce.test.ts
│   │
│   ├── services/
│   │   ├── navidrome/
│   │   │   ├── __mocks__/
│   │   │   │   └── navidrome-service.ts
│   │   │   ├── navidrome-service.ts  # Subsonic API client
│   │   │   ├── navidrome-service.test.ts
│   │   │   ├── navidrome.types.ts    # Subsonic response types
│   │   │   └── subsonic-auth.ts      # MD5 token generation
│   │   │
│   │   ├── track-player/
│   │   │   ├── setup.ts              # Track Player initialization
│   │   │   ├── setup.test.ts
│   │   │   ├── event-handlers.ts     # Playback events
│   │   │   ├── event-handlers.test.ts
│   │   │   └── track-player.types.ts
│   │   │
│   │   ├── auth/
│   │   │   ├── better-auth-client.ts # Better Auth SDK
│   │   │   ├── better-auth-client.test.ts
│   │   │   └── auth.types.ts
│   │   │
│   │   └── scrobbling/
│   │       ├── scrobbler.ts          # Epic 7: Scrobbling service
│   │       ├── scrobbler.test.ts
│   │       └── scrobbler.types.ts
│   │
│   ├── stores/                       # Zustand stores
│   │   ├── use-queue-store.ts        # Queue state + MMKV persistence
│   │   ├── use-queue-store.test.ts
│   │   ├── use-auth-store.ts         # Auth state
│   │   ├── use-auth-store.test.ts
│   │   ├── use-player-store.ts       # Playback UI state
│   │   ├── use-player-store.test.ts
│   │   ├── use-preferences-store.ts  # User preferences
│   │   ├── use-preferences-store.test.ts
│   │   └── use-search-store.ts       # Search history
│   │
│   ├── queries/                      # TanStack Query definitions
│   │   ├── query-keys.ts             # Centralized query key factory
│   │   ├── use-artists-query.ts
│   │   ├── use-albums-query.ts
│   │   ├── use-songs-query.ts
│   │   ├── use-playlists-query.ts
│   │   └── use-search-query.ts
│   │
│   ├── utils/
│   │   ├── format.ts                 # formatDuration, formatDate, etc.
│   │   ├── format.test.ts
│   │   ├── image.ts                  # Facade for expo-image operations
│   │   ├── image.test.ts
│   │   ├── color.ts                  # Color utilities (used by image.ts)
│   │   ├── color.test.ts
│   │   └── errors.ts                 # AppError utilities
│   │
│   ├── constants/
│   │   ├── config.ts                 # App-wide constants
│   │   ├── query-config.ts           # Stale times, retry config
│   │   ├── feedback-patterns.ts      # Haptic/toast patterns
│   │   └── theme.ts                  # Color tokens (NativeWind)
│   │
│   └── types/
│       ├── navigation.ts             # Typed routes
│       └── global.d.ts               # Global type declarations
│
├── e2e/                              # End-to-end tests
│   ├── fixtures/
│   │   ├── mock-server.ts            # MSW or similar for E2E
│   │   └── test-data.ts              # E2E-specific test data
│   ├── setup.ts
│   ├── auth.test.ts
│   ├── playback.test.ts
│   └── library.test.ts
│
├── ios/                              # Native iOS project (generated)
└── android/                          # Native Android project (generated)
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Location | Protocol |
|----------|----------|----------|
| Better Auth | `lib/services/auth/` | REST/OAuth |
| Navidrome/Subsonic | `lib/services/navidrome/` | Subsonic API |
| Track Player | `lib/services/track-player/` | Native bridge |
| Scrobbling | `lib/services/scrobbling/` | Last.fm/ListenBrainz API |

**Component Boundaries:**

| Layer | Allowed Imports | Cannot Import |
|-------|-----------------|---------------|
| `app/` screens | `lib/components/`, `lib/hooks/`, `lib/queries/`, `lib/stores/`, `lib/providers/` | `lib/services/` directly |
| `lib/components/` | `lib/hooks/`, `lib/stores/`, `lib/constants/`, `lib/types/`, `lib/utils/` | `lib/services/`, `lib/queries/` |
| `lib/hooks/` | `lib/stores/`, `lib/services/`, `lib/utils/` | `lib/components/` |
| `lib/queries/` | `lib/services/`, `lib/constants/` | `lib/components/`, `lib/stores/` |
| `lib/stores/` | `lib/constants/`, `lib/types/` | Everything else |
| `lib/services/` | `lib/utils/`, `lib/constants/`, `lib/types/` | All other `lib/` |
| `lib/providers/` | `lib/stores/`, `lib/services/`, `lib/constants/` | `lib/components/` |

**Data Flow:**
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Screens   │────▶│  TanStack    │────▶│   Navidrome     │
│  (app/)     │     │   Query      │     │   Service       │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                   │                      │
       ▼                   ▼                      │
┌─────────────┐     ┌──────────────┐              │
│  Providers  │────▶│   Zustand    │◀─────────────┘
│  (context)  │     │   Stores     │   (connection status)
└─────────────┘     └──────────────┘
                           │
                    ┌──────────────┐
                    │    MMKV      │
                    │ Persistence  │
                    └──────────────┘
```

### Requirements to Structure Mapping

**Epic 1: Foundation & Setup**

| Story | Location |
|-------|----------|
| 1.1 Security Update | `package.json`, CI/CD |
| 1.5 Zustand Setup | `lib/stores/` |
| 1.6 TanStack Query | `lib/queries/`, `lib/providers/query-client.ts` |

**Epic 2: Authentication & Connection**

| Story | Location |
|-------|----------|
| 2.0 Connection Status | `lib/components/connection/`, `lib/stores/use-auth-store.ts` |
| 2.1 Login | `app/(auth)/login.tsx`, `lib/components/auth/LoginForm.tsx` |
| 2.2 Signup | `app/(auth)/signup.tsx`, `lib/components/auth/SignupForm.tsx` |
| 2.4 Navidrome Setup | `app/settings/navidrome.tsx`, `lib/components/auth/NavidromeSetup.tsx` |
| 2.5 SecureStore | `lib/services/auth/` |
| 2.9 Onboarding | `app/(onboarding)/setup-guide.tsx` |
| 2.10 Empty States | `lib/components/empty-state/EmptyState.tsx` |

**Epic 3: Library Browsing**

| Story | Location |
|-------|----------|
| 3.1 Artist List | `app/(tabs)/library/artists.tsx`, `lib/components/library/ArtistList.tsx` |
| 3.2 Album List | `app/(tabs)/library/albums.tsx`, `lib/components/library/AlbumGrid.tsx` |
| 3.3 Artist Detail | `app/artist/[id].tsx` |
| 3.4 Album Detail | `app/album/[id].tsx` |
| 3.5 Playlist List | `app/(tabs)/library/playlists.tsx` |
| 3.6 Playlist Detail | `app/playlist/[id].tsx` |

**Epic 4: Search**

| Story | Location |
|-------|----------|
| 4.1 Search Bar | `lib/components/search/SearchBar.tsx` |
| 4.2 Search Results | `lib/components/search/SearchResults.tsx`, `lib/queries/use-search-query.ts` |
| 4.4 Search History | `lib/components/search/SearchHistory.tsx`, `lib/stores/use-search-store.ts` |

**Epic 5: Now Playing**

| Story | Location |
|-------|----------|
| 5.1 Now Playing Screen | `app/(tabs)/index.tsx` |
| 5.2 Player Controls | `lib/components/player/PlayerControls.tsx` |
| 5.3 Progress Bar | `lib/components/player/ProgressBar.tsx` |
| 5.4 Album Art | `lib/components/player/AlbumArt.tsx`, `lib/hooks/use-dominant-color.ts` |

**Epic 6: Queue Management**

| Story | Location |
|-------|----------|
| 6.1 Queue View | `app/queue.tsx`, `lib/components/queue/QueueList.tsx` |
| 6.2 Queue Item | `lib/components/queue/QueueItem.tsx` |
| 6.4 Drag Reorder | `lib/components/queue/DraggableQueueItem.tsx` |
| 6.8 Queue Persistence | `lib/stores/use-queue-store.ts` (MMKV) |

**Epic 7: Scrobbling**

| Story | Location |
|-------|----------|
| 7.x Scrobbling | `lib/services/scrobbling/`, `app/settings/scrobbling.tsx` |

**Epic 8: Settings**

| Story | Location |
|-------|----------|
| 8.x Settings | `app/settings/` |

### Cross-Cutting Stories

Stories that span multiple directories require coordination:

| Story | Spans | Primary Location | Secondary Locations |
|-------|-------|------------------|---------------------|
| 2.6 Auto-login | boot, stores, services | `lib/boot/sequence.ts` | `lib/stores/use-auth-store.ts`, `lib/services/auth/` |
| 4.8 Queue Persistence | stores, boot | `lib/stores/use-queue-store.ts` | `lib/boot/sequence.ts` |
| 5.4 Album Art + Color | hooks, utils, components | `lib/hooks/use-dominant-color.ts` | `lib/utils/image.ts`, `lib/components/player/AlbumArt.tsx` |
| Boot Sequence | boot, stores, services, providers | `lib/boot/sequence.ts` | `lib/providers/`, `lib/stores/`, `lib/services/track-player/` |

### Integration Points

**Internal Communication:**

| From | To | Method |
|------|-----|--------|
| Screens | Queries | `useXxxQuery()` hooks |
| Screens | Stores | `useXxxStore()` hooks |
| Screens | Providers | React Context via `lib/providers/` |
| Queries | Services | Direct function calls |
| Track Player Events | Stores | Event handlers update Zustand |
| Stores | MMKV | Zustand persist middleware |
| Hooks | Utils | `lib/utils/image.ts` facade |

**External Integrations:**

| Service | Integration Point | Auth Method |
|---------|-------------------|-------------|
| Better Auth Server | `lib/services/auth/better-auth-client.ts` | OAuth/Session |
| Navidrome Server | `lib/services/navidrome/navidrome-service.ts` | Subsonic MD5 token |
| Last.fm (future) | `lib/services/scrobbling/scrobbler.ts` | API key |

### Provider Composition

```typescript
// lib/providers/index.ts
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerProvider>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </GestureHandlerProvider>
  );
}

// app/_layout.tsx
export default function RootLayout() {
  return (
    <AppProviders>
      <Stack />
    </AppProviders>
  );
}
```

### Development Workflow

**Development:**
```bash
npm run dev          # Start Expo dev server
npm run ios          # Open iOS simulator
npm run android      # Open Android emulator
```

**Testing:**
```bash
npm test             # Run all unit tests
npm run test:watch   # Watch mode
npm run test:e2e     # E2E tests (requires device/emulator)
```

**Building:**
```bash
npx expo prebuild    # Generate native projects
eas build --platform ios --profile development
eas build --platform android --profile development
```

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

| Decision Pair | Status | Notes |
|--------------|--------|-------|
| Expo SDK 54 + React 19.1.4 | ✅ Compatible | Expo 54.0.29 bundles React 19.1.4 |
| react-native-track-player + Expo | ✅ Compatible | Requires `index.js` registration before router |
| Zustand 5 + MMKV | ✅ Compatible | Zustand persist middleware supports MMKV |
| TanStack Query 5 + Expo Router | ✅ Compatible | Standard React integration |
| NativeWind 4 + Expo SDK 54 | ✅ Compatible | Metro transformer configured |
| Better Auth + SecureStore | ✅ Compatible | Token storage pattern defined |

**Pattern Consistency:**
- Naming conventions align with React Native/TypeScript ecosystem standards
- Import ordering matches community conventions (ESLint enforceable)
- Query key structure follows TanStack Query best practices
- Store patterns follow Zustand documentation recommendations
- File naming (PascalCase components, kebab-case hooks) is consistent throughout

**Structure Alignment:**
- `lib/` organization supports clear boundary enforcement
- `app/` route groups match Expo Router conventions
- Provider composition pattern matches React best practices
- Test co-location supports maintainability

### Requirements Coverage Validation ✅

**Epic Coverage:**

| Epic | Stories | Architectural Support | Gaps |
|------|---------|----------------------|------|
| 1: Foundation | 1.1, 1.5, 1.6 | ✅ Full | None |
| 2: Auth & Connection | 2.0-2.10 | ✅ Full | None |
| 3: Library Browsing | 3.1-3.6 | ✅ Full | None |
| 4: Search | 4.1-4.4 | ✅ Full | None |
| 5: Now Playing | 5.1-5.4 | ✅ Full | None |
| 6: Queue Management | 6.1-6.8 | ✅ Full | None |
| 7: Scrobbling | 7.x | ✅ Full | None |
| 8: Settings | 8.x | ✅ Full | None |

**Non-Functional Requirements Coverage:**

| NFR Category | Requirement | Architectural Support |
|--------------|-------------|----------------------|
| Performance | <3s launch | Boot sequence orchestration |
| Performance | 60fps scroll | FlashList, skeleton loading |
| Performance | <500ms Now Playing FMP | No loading states, pre-caching |
| Performance | 50k+ song support | TanStack Query pagination, factory fixtures |
| Reliability | 99.9% background audio | Track Player as source of truth |
| Security | Encrypted credentials | SecureStore pattern |
| Security | No plaintext secrets | MMKV for non-sensitive only |
| Resilience | Graceful degradation | 3-tier degradation model |
| UX | 2s error display minimum | Feedback patterns constant |

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ All technology versions specified (with CVE patch requirements)
- ✅ 8 core architectural decisions documented with rationale
- ✅ Boot sequence explicitly defined with dependencies
- ✅ Retry configuration with specific backoff values

**Structure Completeness:**
- ✅ 100+ files/directories explicitly defined
- ✅ All 8 epics mapped to specific locations
- ✅ Cross-cutting stories identified with multi-directory spans
- ✅ Component boundary rules with import restrictions

**Pattern Completeness:**
- ✅ 30 conflict points identified and addressed
- ✅ Naming conventions for all entity types
- ✅ Import order convention specified
- ✅ Test naming convention defined
- ✅ Good/anti-pattern examples provided
- ✅ Feedback micro-interaction patterns specified

### Gap Analysis Results

**Critical Gaps:** None identified

**Important Gaps (Addressed):**

| Gap | Resolution |
|-----|------------|
| Provider composition location | Added `lib/providers/` |
| Layout components location | Added `lib/components/layout/` |
| Navigation components location | Added `lib/components/navigation/` |
| Test utilities location | Added `lib/__test-utils__/` |
| E2E fixtures location | Added `e2e/fixtures/` |
| Image operations facade | Added `lib/utils/image.ts` |

**Nice-to-Have (Future):**
- ESLint plugin for boundary enforcement
- Storybook for component documentation
- Performance monitoring integration
- Error tracking service integration

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (42 FRs, 38 NFRs)
- [x] Scale and complexity assessed (Medium, 12-15 components)
- [x] Technical constraints identified (Track Player registration, clock drift)
- [x] Cross-cutting concerns mapped (12 concerns with approaches)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (10+ packages with versions)
- [x] Integration patterns defined (Subsonic API, Better Auth)
- [x] Performance considerations addressed (boot sequence, caching)

**✅ Implementation Patterns**
- [x] Naming conventions established (files, APIs, TypeScript)
- [x] Structure patterns defined (imports, barrels, tests)
- [x] Communication patterns specified (stores, queries, events)
- [x] Process patterns documented (errors, loading, retry)

**✅ Project Structure**
- [x] Complete directory structure defined (100+ entries)
- [x] Component boundaries established (6-layer boundary table)
- [x] Integration points mapped (internal + external)
- [x] Requirements to structure mapping complete (all 8 epics)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
1. Security-first: CVE patching as gate story, encrypted credential storage
2. Premium UX patterns: No loading on hero screens, skeleton loading, haptic feedback
3. Clear boundaries: AI agents cannot make conflicting import decisions
4. Comprehensive patterns: 30 conflict points addressed with examples
5. Testability: Co-located tests, mock factories, test utilities
6. Graceful degradation: 3-tier model with defined recovery paths

**Areas for Future Enhancement:**
- Offline-first with mutation queue (v1.1)
- Deep linking for profile sharing (v1.1)
- Demo mode with sample library (v1.1)
- Performance monitoring dashboard

### Implementation Handoff

**AI Agent Guidelines:**
1. Execute Story 1.1 (Security Update) first - it gates all other work
2. Follow boot sequence order for foundation stories
3. Use implementation patterns exactly as documented
4. Respect component boundary rules (import restrictions)
5. Reference this document for all architectural questions
6. Use test utilities from `lib/__test-utils__/`

**First Implementation Priority:**
```bash
# Story 1.1: Security Update (GATE)
cd /home/default/Desktop/dev/aidj-mobile
npm install expo@54.0.29
npx expo install --fix
npx expo install react-native-mmkv
npm audit
```

---

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2025-12-14
**Document Location:** `docs/architecture-mobile.md`

### Final Architecture Deliverables

**📋 Complete Architecture Document**
- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**🏗️ Implementation Ready Foundation**
- 8 core architectural decisions made
- 30 implementation patterns defined
- 100+ architectural components specified
- 42 functional + 38 non-functional requirements fully supported

**📚 AI Agent Implementation Guide**
- Technology stack with verified versions
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards

### Development Sequence

1. **Story 1.1: Security Update (GATE)** - Patch CVE-2025-55182, add MMKV
2. **Stories 1.5-1.6: State Management** - Zustand stores, TanStack Query
3. **Stories 2.5-2.6: Auth Foundation** - SecureStore, auto-login
4. **Story 3.1: Track Player** - Audio service initialization
5. **Epics 3-8: Feature Implementation** - Following architectural patterns

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**
- [x] All functional requirements are supported
- [x] All non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

### Project Success Factors

**🎯 Clear Decision Framework**
Every technology choice was made collaboratively with clear rationale, ensuring all stakeholders understand the architectural direction.

**🔧 Consistency Guarantee**
Implementation patterns and rules ensure that multiple AI agents will produce compatible, consistent code that works together seamlessly.

**📋 Complete Coverage**
All project requirements are architecturally supported, with clear mapping from business needs to technical implementation.

**🏗️ Solid Foundation**
The existing Expo project with documented updates provides a production-ready foundation following current best practices.

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

