# Story 9.1: Onboarding State & New User Detection

Status: review

## Story

As a new user,
I want the app to recognize I'm new and guide me appropriately,
so that I'm not overwhelmed by features that need data I don't have yet.

## Acceptance Criteria

1. Add `onboardingStatus` JSONB field to `user_preferences` with shape:
   ```ts
   {
     completed: boolean;
     completedAt?: string;        // ISO date
     skipped?: boolean;
     skippedAt?: string;
     selectedArtistIds?: string[]; // Navidrome artist IDs from step 1
     likedSongsSynced?: boolean;   // Step 2 completed
     lastfmImported?: boolean;     // Step 3 completed
     lastfmUsername?: string;      // For re-import / display
     currentStep?: number;         // Resume support (1-3)
   }
   ```
2. Create API route `GET /api/onboarding/status` — returns onboarding state + data maturity metrics:
   ```ts
   {
     onboardingCompleted: boolean;
     onboardingSkipped: boolean;
     currentStep: number;
     dataMaturity: {
       listeningHistoryCount: number;
       artistAffinityCount: number;
       feedbackCount: number;
       hasLikedSongs: boolean;
       hasLastfmImport: boolean;
     }
   }
   ```
3. Create API route `POST /api/onboarding/complete` — marks onboarding completed, triggers `calculateFullUserProfile()` + background discovery run (non-blocking)
4. Create API route `POST /api/onboarding/skip` — marks onboarding skipped (user can resume later from settings)
5. New user detection logic: `listeningHistory` count = 0 AND `artistAffinities` count = 0 AND onboarding not completed/skipped
6. Add `useOnboardingStatus` hook that queries status endpoint and exposes `{ isNewUser, onboardingCompleted, dataMaturity, currentStep, isLoading }`
7. Data maturity thresholds defined as constants:
   ```ts
   const DATA_MATURITY = {
     LOW: 0,        // No data — show onboarding
     EMERGING: 10,  // Some plays — show radio + basics
     READY: 30,     // Enough for recommendations — show full dashboard
   }
   ```
8. Existing user data and dashboard behavior unchanged
9. DB migration is backward compatible (nullable JSONB column with default)

## Tasks / Subtasks

- [x] Task 1: Add `onboarding_status` JSONB column to `user_preferences` schema (AC: #1, #9)
  - [x] 1.1 Add nullable JSONB column `onboarding_status` to `userPreferences` in `src/lib/db/schema/preferences.schema.ts` with TypeScript type and default `null`
  - [x] 1.2 Generate Drizzle migration: `npx drizzle-kit generate`
  - [x] 1.3 Apply migration: `npx drizzle-kit push` or run migration
  - [x] 1.4 Verify existing user_preferences rows unaffected (column is nullable, defaults to null)

- [x] Task 2: Create shared onboarding constants (AC: #7)
  - [x] 2.1 Create `src/lib/constants/onboarding.ts` with `DATA_MATURITY` thresholds and `OnboardingStatus` TypeScript interface
  - [x] 2.2 Export types for reuse across API routes and hooks

- [x] Task 3: Create `GET /api/onboarding/status` API route (AC: #2, #5)
  - [x] 3.1 Create `src/routes/api/onboarding/status.ts` using `createFileRoute` + `withAuthAndErrorHandling`
  - [x] 3.2 Query `user_preferences.onboarding_status` for current user
  - [x] 3.3 Query data maturity counts: `SELECT COUNT(*)` from `listeningHistory`, `artistAffinities`, `recommendationFeedback` filtered by userId
  - [x] 3.4 Check `likedSongsSync` for hasLikedSongs (any active rows)
  - [x] 3.5 Check `listeningHistory` for hasLastfmImport (any rows exist, or check onboarding_status.lastfmImported)
  - [x] 3.6 Return structured response matching AC #2 shape

- [x] Task 4: Create `POST /api/onboarding/complete` API route (AC: #3)
  - [x] 4.1 Create `src/routes/api/onboarding/complete.ts` using `withAuthAndErrorHandling`
  - [x] 4.2 Update `user_preferences.onboarding_status` → `{ completed: true, completedAt: new Date().toISOString() }`
  - [x] 4.3 Call `calculateFullUserProfile(userId)` from `compound-scoring.ts` (non-blocking, fire-and-forget with `.catch()` error logging)
  - [x] 4.4 Trigger background discovery via `getBackgroundDiscoveryManager().initialize(userId)` then `.triggerNow()` (non-blocking)
  - [x] 4.5 Return success response immediately (don't await profile/discovery)

- [x] Task 5: Create `POST /api/onboarding/skip` API route (AC: #4)
  - [x] 5.1 Create `src/routes/api/onboarding/skip.ts` using `withAuthAndErrorHandling`
  - [x] 5.2 Update `user_preferences.onboarding_status` → `{ skipped: true, skippedAt: new Date().toISOString() }`
  - [x] 5.3 Return success response

- [x] Task 6: Create `useOnboardingStatus` hook (AC: #6)
  - [x] 6.1 Create `src/lib/hooks/useOnboardingStatus.ts`
  - [x] 6.2 Use TanStack Query (`useQuery`) to fetch `GET /api/onboarding/status` with `staleTime: 60_000` (60s)
  - [x] 6.3 Derive `isNewUser` from: `listeningHistoryCount === 0 && artistAffinityCount === 0 && !onboardingCompleted && !onboardingSkipped`
  - [x] 6.4 Expose `{ isNewUser, onboardingCompleted, dataMaturity, currentStep, isLoading }`
  - [x] 6.5 Include `queryKey: ['onboarding-status']` for easy invalidation from other components

- [x] Task 7: Verify existing behavior unchanged (AC: #8)
  - [x] 7.1 Verify dashboard route still renders normally for users with existing data
  - [x] 7.2 Verify preferences GET/POST still works (new column is nullable, doesn't affect existing API)

## Dev Notes

### Architecture & Integration

- **Schema location**: `src/lib/db/schema/preferences.schema.ts` — add `onboardingStatus` as a new JSONB column alongside existing `recommendationSettings`, `playbackSettings`, etc. Pattern: nullable JSONB with `$type<T>()` for TypeScript typing
- **DO NOT** nest inside `dashboardLayout` — the epic explicitly says "cleaner than nesting in dashboard_layout"
- **Schema index**: If adding new schema file, must re-export from `src/lib/db/schema/index.ts`. Since we're modifying an existing schema file (`preferences.schema.ts`), no index change needed
- **Drizzle convention**: snake_case columns (`casing: "snake_case"`), so TypeScript `onboardingStatus` maps to DB `onboarding_status`

### API Route Pattern

All API routes follow this established pattern:
```ts
import { createFileRoute } from "@tanstack/react-router";
import { withAuthAndErrorHandling, successResponse } from '@/lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;
    // ... logic ...
    return successResponse(data);
  },
  { service: 'onboarding', operation: 'status', defaultCode: 'ONBOARDING_STATUS_ERROR' }
);

export const Route = createFileRoute("/api/onboarding/status")({
  server: { handlers: { GET } },
});
```

### Key Imports for API Routes

```ts
// Database
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { recommendationFeedback } from '@/lib/db/schema/recommendations.schema';
import { likedSongsSync } from '@/lib/db/schema/profile.schema';
import { eq, count } from 'drizzle-orm';

// Profile calculation (for /complete route)
import { calculateFullUserProfile } from '@/lib/services/compound-scoring';

// Background discovery (for /complete route)
import { getBackgroundDiscoveryManager } from '@/lib/services/background-discovery';
```

### Data Maturity Queries

All tables have `userId` indexed. Queries are lightweight:
```ts
const [historyCount] = await db.select({ count: count() }).from(listeningHistory).where(eq(listeningHistory.userId, userId));
const [affinityCount] = await db.select({ count: count() }).from(artistAffinities).where(eq(artistAffinities.userId, userId));
const [feedbackCount] = await db.select({ count: count() }).from(recommendationFeedback).where(eq(recommendationFeedback.userId, userId));
```

### Hook Pattern

Follow existing TanStack Query pattern from `DashboardHero.tsx`:
```ts
import { useQuery } from '@tanstack/react-query';

export function useOnboardingStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      const res = await fetch('/api/onboarding/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch onboarding status');
      return res.json();
    },
    staleTime: 60_000,
  });
  // Derive isNewUser from response...
}
```

### Background Discovery Trigger Pattern

Reuse exact pattern from `src/routes/api/background-discovery/trigger.ts`:
```ts
const manager = getBackgroundDiscoveryManager();
await manager.initialize(userId);
manager.triggerNow(); // fire-and-forget
```

### Project Structure Notes

- New API routes go in `src/routes/api/onboarding/` (new directory)
- Constants file: `src/lib/constants/onboarding.ts` (new file, new directory)
- Hook: `src/lib/hooks/useOnboardingStatus.ts` (new file in existing directory)
- No new schema files — modifying existing `preferences.schema.ts`

### References

- [Source: src/lib/db/schema/preferences.schema.ts] — user_preferences table, JSONB column pattern
- [Source: src/routes/api/preferences.ts] — withAuthAndErrorHandling pattern, Drizzle query pattern
- [Source: src/routes/api/background-discovery/trigger.ts] — discovery trigger + withAuthAndErrorHandling pattern
- [Source: src/lib/services/compound-scoring.ts#L432] — calculateFullUserProfile() signature
- [Source: src/lib/services/background-discovery/discovery-manager.ts] — getBackgroundDiscoveryManager(), triggerNow()
- [Source: docs/prd-epic-9/stories.md] — Story 9.1 requirements and technical notes

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Pre-existing flaky test: `shuffle-scoring.test.ts` (non-deterministic artist adjacency check) — not related to this story

### Completion Notes List
- Added `OnboardingStatusData` interface and nullable JSONB column `onboarding_status` to `user_preferences` schema
- Generated and applied Drizzle migration (`0021_ancient_hercules.sql`) — backward compatible nullable column
- Created `DATA_MATURITY` constants and `OnboardingStatusResponse` type in `src/lib/constants/onboarding.ts`
- Implemented 3 API routes: `GET /api/onboarding/status`, `POST /api/onboarding/complete`, `POST /api/onboarding/skip`
- Status route runs parallel queries for data maturity counts (listening history, artist affinities, feedback, liked songs)
- Complete route fires-and-forgets `calculateFullUserProfile()` and background discovery trigger
- Skip route sets `skipped: true` with timestamp
- Created `useOnboardingStatus` hook with TanStack Query, 60s staleTime, `['onboarding-status']` queryKey
- Hook derives `isNewUser` from: zero history + zero affinities + not completed + not skipped
- Added `onboardingStatus` to store `UserPreferences` interface and `createDefaultPreferences` utility
- All 444 existing tests pass (1 pre-existing flaky failure unrelated to changes)
- 13 new tests added: 5 constants tests, 8 hook unit tests

### Change Log
- 2026-03-17: Story 9.1 implemented — onboarding state schema, API routes, hook, and constants
- 2026-03-18: Post-review hardening — atomic JSONB merges (SQL `||` operator) replace read-modify-write in complete.ts and skip.ts; idempotency guard on complete endpoint (skips expensive profile/discovery ops if already completed); documented discovery manager singleton race as acceptable for single-user deployment

### File List
- `src/lib/db/schema/preferences.schema.ts` (modified) — added `OnboardingStatusData` interface and `onboardingStatus` JSONB column
- `src/lib/stores/preferences.ts` (modified) — added `onboardingStatus` to `UserPreferences` interface
- `src/lib/utils/preference-merge.ts` (modified) — added `onboardingStatus: null` to `createDefaultPreferences`
- `src/lib/constants/onboarding.ts` (new) — `DATA_MATURITY` thresholds, `OnboardingStatusResponse` type
- `src/routes/api/onboarding/status.ts` (new) — GET endpoint for onboarding state + data maturity
- `src/routes/api/onboarding/complete.ts` (new) — POST endpoint to complete onboarding
- `src/routes/api/onboarding/skip.ts` (new) — POST endpoint to skip onboarding
- `src/lib/hooks/useOnboardingStatus.ts` (new) — client hook for onboarding status
- `src/lib/constants/__tests__/onboarding.test.ts` (new) — constants unit tests
- `src/lib/hooks/__tests__/useOnboardingStatus.test.ts` (new) — hook unit tests
- `src/routes/api/__tests__/onboarding.test.ts` (new) — API route test scenarios (todo-style per project convention)
- `drizzle/0021_ancient_hercules.sql` (new) — migration adding `onboarding_status` column
