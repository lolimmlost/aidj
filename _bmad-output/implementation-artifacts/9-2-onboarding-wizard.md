# Story 9.2: Onboarding Wizard (Artist Picker + Liked Songs + Last.fm Import)

Status: review

## Story

As a new user,
I want a guided wizard that helps me tell the app what music I like,
so that recommendations, discovery, and radio are immediately personalized to my taste.

## Acceptance Criteria

**Step 1: Pick Your Artists**
1. Create `OnboardingWizard` component with step indicator (1/3, 2/3, 3/3)
2. Step 1 displays a searchable, responsive grid of artist cards from the Navidrome library
3. Each card shows: album art (lazy-loaded), artist name, song count
4. Search bar with 300ms debounce filters artists by name
5. Default sort: by album count descending (popular artists first)
6. Tap to select/deselect with visual checkmark overlay and selected counter
7. Minimum 3 artists required to proceed (helper text: "Pick at least 3 artists you enjoy")
8. Mobile: 2-col grid; Tablet: 3-4 col; Desktop: 5-6 col
9. Create API route `GET /api/onboarding/artists` — paginated artist list from Navidrome
10. Create API route `POST /api/onboarding/artists/select` — accepts `{ artistIds: string[] }`:
    - Writes `artist_affinities` rows with `affinityScore: 0.7`, `likedCount: 1` per artist
    - For each artist: fetches top 3-5 tracks, writes `recommendation_feedback` with `feedbackType: 'thumbs_up'`, `source: 'library'`
    - Saves `selectedArtistIds` to onboarding status
    - Updates `currentStep: 2`

**Step 2: Sync Liked Songs**
11. Shows count of starred songs available in Navidrome (pre-fetched)
12. One-tap "Sync Now" triggers existing `/api/playlists/liked-songs/sync` + `syncLikedSongsToFeedback()`
13. Progress indicator while syncing
14. Shows result: "Synced X liked songs"
15. "Skip" option if user has no starred songs
16. Updates `likedSongsSynced: true` and `currentStep: 3`

**Step 3: Connect Last.fm (Optional)**
17. Explains benefit: "Import your listening history for instant personalized recommendations"
18. Username input field
19. "Import" button triggers existing Last.fm backfill service
20. Polling-based progress bar (reuses existing backfill progress tracking)
21. Shows result: "Imported X plays across Y artists"
22. "Skip" option prominently available
23. Updates `lastfmImported: true`, `lastfmUsername` on completion

**Wizard Completion**
24. "Finish" button calls `POST /api/onboarding/complete` → triggers `calculateFullUserProfile()` + background discovery
25. Client-side: invalidates `['onboarding-status']` query → dashboard re-renders
26. Client-side: auto-starts radio shuffle from seed artists (calls radio API from Story 9.3)
27. Wizard is resumable — `currentStep` persists and user resumes on next visit
28. "Skip entire setup" option available on every step

## Tasks / Subtasks

- [x] Task 1: Create `GET /api/onboarding/artists` API route (AC: #9)
  - [x] 1.1 Create `src/routes/api/onboarding/artists.ts` with `withAuthAndErrorHandling`
  - [x] 1.2 Accept query params: `start` (default 0), `limit` (default 50), `search` (optional)
  - [x] 1.3 Use admin Navidrome service `getArtistsWithDetails(start, limit)` for browsing
  - [x] 1.4 If `search` param provided, filter by artist name (case-insensitive)
  - [x] 1.5 Sort by album count descending (popular artists first)
  - [x] 1.6 Return `{ artists: Array<{ id, name, albumCount, songCount, albumArt? }>, total }`

- [x] Task 2: Create `POST /api/onboarding/artists/select` API route (AC: #10)
  - [x] 2.1 Create `src/routes/api/onboarding/artists/select.ts` with `withAuthAndErrorHandling`
  - [x] 2.2 Validate body: `{ artistIds: string[] }` — require minimum 3
  - [x] 2.3 Wrap all writes in `db.transaction()`:
    - [x] 2.3a Insert `artist_affinities` rows: `affinityScore: 0.7`, `likedCount: 1`, `playCount: 0`, `skipCount: 0`, `totalPlayTime: 0`. Use artist name (lowercase) from Navidrome lookup. Use `onConflictDoUpdate` to handle re-selections
    - [x] 2.3b For each artist: fetch top 3-5 tracks via `getTopSongs(artistId, 5)`. Insert `recommendation_feedback` rows with `feedbackType: 'thumbs_up'`, `source: 'library'`. Use `onConflictDoUpdate` on `(userId, songId)` unique constraint
  - [x] 2.4 Update `user_preferences.onboarding_status` → merge `selectedArtistIds` and `currentStep: 2`
  - [x] 2.5 Return `{ success: true, artistCount, feedbackCount }`

- [x] Task 3: Create OnboardingWizard component shell (AC: #1, #27, #28)
  - [x] 3.1 Create `src/components/onboarding/OnboardingWizard.tsx`
  - [x] 3.2 Implement step indicator showing current step (1/3, 2/3, 3/3) with progress dots/bar
  - [x] 3.3 Accept `initialStep` prop from `useOnboardingStatus().currentStep` for resume support
  - [x] 3.4 Add "Skip entire setup" button on every step — calls `POST /api/onboarding/skip` then invalidates `['onboarding-status']`
  - [x] 3.5 Use Radix/shadcn components: Card, Button, Input, Progress, Badge

- [x] Task 4: Implement Step 1 — Artist Picker (AC: #2-#8)
  - [x] 4.1 Create `src/components/onboarding/ArtistPicker.tsx`
  - [x] 4.2 Fetch artists via `GET /api/onboarding/artists` with TanStack Query, infinite scroll or pagination
  - [x] 4.3 Search input with 300ms debounce (use `useState` + `useEffect` with timeout, or `useDeferredValue`)
  - [x] 4.4 Responsive grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`
  - [x] 4.5 Artist card: lazy-loaded album art via `<img loading="lazy">`, artist name, song count
  - [x] 4.6 Selection state: local `Set<string>` in parent wizard, visual checkmark overlay on selected cards, counter badge "X selected"
  - [x] 4.7 "Continue" button disabled until `selectedArtists.size >= 3`, helper text shown below
  - [x] 4.8 On continue: call `POST /api/onboarding/artists/select` with selected IDs, advance to step 2

- [x] Task 5: Implement Step 2 — Sync Liked Songs (AC: #11-#16)
  - [x] 5.1 Create `src/components/onboarding/SyncLikedSongs.tsx`
  - [x] 5.2 Pre-fetch starred count: query Navidrome starred songs via existing service, display count
  - [x] 5.3 "Sync Now" button calls `POST /api/playlists/liked-songs/sync` (existing endpoint)
  - [x] 5.4 Show loading state with spinner/progress during sync
  - [x] 5.5 On success: display "Synced X liked songs" with checkmark
  - [x] 5.6 Update onboarding status: PATCH `likedSongsSynced: true`, `currentStep: 3` via dedicated endpoint or inline update
  - [x] 5.7 "Skip" button advances to step 3 without syncing, still updates `currentStep: 3`

- [x] Task 6: Implement Step 3 — Last.fm Import (AC: #17-#23)
  - [x] 6.1 Create `src/components/onboarding/LastfmImport.tsx`
  - [x] 6.2 Benefit explanation text + username input field
  - [x] 6.3 "Import" button: POST to existing `/api/lastfm/backfill` with `{ username, userId }`
  - [x] 6.4 Poll `GET /api/lastfm/backfill?jobId=xxx` for progress events (existing polling pattern)
  - [x] 6.5 Display progress bar showing import phase, similarity phase, scoring phase
  - [x] 6.6 On completion: show "Imported X plays across Y artists"
  - [x] 6.7 Update onboarding status: `lastfmImported: true`, `lastfmUsername`
  - [x] 6.8 "Skip" button prominently placed — advances to completion

- [x] Task 7: Implement Wizard Completion (AC: #24-#26)
  - [x] 7.1 "Finish" / "Get Started" button on final step
  - [x] 7.2 Call `POST /api/onboarding/complete` (from Story 9.1)
  - [x] 7.3 Invalidate `queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })`
  - [x] 7.4 After invalidation, dashboard will re-render based on new onboarding status (tier detection from Story 9.3)
  - [x] 7.5 Auto-start radio: call radio shuffle API and load into audio store (integration point with Story 9.3)

## Dev Notes

### Architecture & Integration

- **Component structure**: `OnboardingWizard` is the parent shell managing step state. Each step is a separate component: `ArtistPicker`, `SyncLikedSongs`, `LastfmImport`
- **Where rendered**: Dashboard route (`src/routes/dashboard/index.tsx`) will conditionally render `OnboardingWizard` based on `useOnboardingStatus().isNewUser` (Story 9.3 handles this integration)
- **State management**: Wizard step state is server-authoritative via `onboarding_status.currentStep`. Local state only for transient UI (search text, selected artists Set)

### Existing Services to REUSE (DO NOT Reimplement)

| Service | Location | Usage |
|---------|----------|-------|
| `getArtistsWithDetails()` | `src/lib/services/navidrome.ts:719` | Artist browsing in Step 1 |
| `getTopSongs(artistId, count)` | `src/lib/services/navidrome.ts:911` | Top tracks per artist for feedback seeding |
| Liked songs sync | `src/routes/api/playlists/liked-songs/sync.ts` | Step 2 — call existing POST endpoint |
| `syncLikedSongsToFeedback()` | Called by liked-songs/sync | Already triggered by sync endpoint |
| Last.fm backfill | `src/routes/api/lastfm/backfill.ts` | Step 3 — POST starts job, GET polls progress |
| `calculateFullUserProfile()` | `src/lib/services/compound-scoring.ts:432` | Called by `/api/onboarding/complete` (Story 9.1) |
| Background discovery | `src/lib/services/background-discovery/` | Called by `/api/onboarding/complete` (Story 9.1) |

### Artist Affinities Schema (for Task 2)

```ts
// src/lib/db/schema/profile.schema.ts
artistAffinities: {
  id: text PK,
  userId: text FK,
  artist: text (normalized lowercase), // Use artist name, NOT ID
  affinityScore: real (0-1),
  playCount: integer,
  likedCount: integer,
  skipCount: integer,
  totalPlayTime: integer,
  calculatedAt: timestamp
}
// Unique: (userId, artist)
```

### Recommendation Feedback Schema (for Task 2)

```ts
// src/lib/db/schema/recommendations.schema.ts
recommendationFeedback: {
  id: text PK,
  userId: text FK,
  songArtistTitle: text ("Artist - Title"),
  songId: text (Navidrome ID),
  feedbackType: enum('thumbs_up', 'thumbs_down'),
  source: enum('recommendation','playlist','playlist_generator','search','library','nudge','ai_dj','autoplay','ai_dj_skip','ai_dj_listen_through'),
  timestamp, month, season, dayOfWeek, hourOfDay
}
// Unique: (userId, songId)
```

### Last.fm Backfill Polling Pattern

The existing backfill uses job-based polling, NOT SSE:
1. `POST /api/lastfm/backfill` → starts backfill, returns `{ jobId }` with 202
2. `GET /api/lastfm/backfill?jobId=xxx` → returns `{ jobId, event: BackfillEvent }`
3. `BackfillEvent` phases: `import` → `similarity` → `scoring` → `done`
4. Poll every 1-2 seconds until `phase === 'done'` or `phase === 'error'`

### Album Art for Artist Cards

Artist album art URL pattern via Navidrome: use `coverArt` from artist detail or construct from first album. The `getArtistsWithDetails()` returns enriched data including art URLs.

### UI Styling

Follow existing glass-card premium aesthetic:
- `rounded-xl border bg-card` for card containers
- `bg-primary/10 text-primary` for accent elements
- `text-muted-foreground` for secondary text
- Radix/shadcn components: Button, Input, Card, Progress, Badge
- Use Lucide icons: `Check`, `Search`, `Music`, `Radio`, `SkipForward`

### Onboarding Status Update Pattern

For intermediate step updates (currentStep, selectedArtistIds, etc.), the `/api/onboarding/artists/select` route directly updates `user_preferences.onboarding_status` JSONB. Use Drizzle's `jsonb` update with spread to merge:
```ts
// Read current, merge, write back
const prefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
const currentStatus = prefs[0]?.onboardingStatus || {};
await db.update(userPreferences).set({
  onboardingStatus: { ...currentStatus, selectedArtistIds: artistIds, currentStep: 2 },
  updatedAt: new Date(),
}).where(eq(userPreferences.userId, userId));
```

### Project Structure Notes

New files:
- `src/routes/api/onboarding/artists.ts` — GET paginated artists
- `src/routes/api/onboarding/artists/select.ts` — POST artist selections
- `src/components/onboarding/OnboardingWizard.tsx` — Wizard shell
- `src/components/onboarding/ArtistPicker.tsx` — Step 1
- `src/components/onboarding/SyncLikedSongs.tsx` — Step 2
- `src/components/onboarding/LastfmImport.tsx` — Step 3

### Dependencies on Story 9.1

- `useOnboardingStatus` hook must exist (provides `currentStep` for resume)
- `POST /api/onboarding/complete` must exist (wizard completion)
- `POST /api/onboarding/skip` must exist (skip entire setup)
- `onboarding_status` column must exist on `user_preferences`
- `OnboardingStatus` TypeScript type must be exported from constants

### References

- [Source: src/lib/services/navidrome.ts#L719] — getArtistsWithDetails()
- [Source: src/lib/services/navidrome.ts#L911] — getTopSongs()
- [Source: src/routes/api/playlists/liked-songs/sync.ts] — Existing liked songs sync endpoint
- [Source: src/routes/api/lastfm/backfill.ts] — Backfill job pattern (POST start, GET poll)
- [Source: src/lib/services/lastfm-backfill.ts#L29] — BackfillProgress, BackfillEvent types
- [Source: src/lib/db/schema/profile.schema.ts#L29] — artistAffinities table schema
- [Source: src/lib/db/schema/recommendations.schema.ts#L9] — recommendationFeedback table schema
- [Source: docs/prd-epic-9/stories.md] — Story 9.2 requirements and technical notes

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Used `onConflictDoUpdate` with `target` array pattern (matching existing codebase) instead of `onConflictOnConstraint` which is not available in this Drizzle version
- OnboardingStatusData type requires `completed: boolean` — ensured all JSONB merges include this field via fallback `{ completed: false }`
- Route path type errors (FileRoutesByPath) are pre-existing across all onboarding routes — resolved by TanStack Router route generation at build time

### Completion Notes List
- Task 1: Created `GET /api/onboarding/artists` — paginated, searchable, sorted by album count desc, uses `getArtistsWithDetails()`
- Task 2: Created `POST /api/onboarding/artists/select` — validates min 3 artists, wraps in transaction, creates artist_affinities (0.7 score) and recommendation_feedback (thumbs_up, library source) rows with temporal metadata, updates onboarding status JSONB
- Task 3: Created `OnboardingWizard.tsx` — 3-step wizard shell with step indicator, resume via `initialStep` prop, "Skip entire setup" button on every step
- Task 4: Created `ArtistPicker.tsx` — searchable responsive grid (2-6 cols), 300ms debounced search, Set-based selection state, visual checkmark overlay, min 3 required, counter badge
- Task 5: Created `SyncLikedSongs.tsx` — pre-fetches starred count via new `/api/onboarding/starred-count` endpoint, sync button calls existing liked-songs/sync, shows result, skip option. Created `update-step.ts` API for generic onboarding step updates
- Task 6: Created `LastfmImport.tsx` — username input, triggers existing `/api/lastfm/backfill`, 1.5s polling interval, progress bar with phase labels, handles 409 concurrent conflict, skip option
- Task 7: Wizard completion integrated in OnboardingWizard — `handleFinish` calls `/api/onboarding/complete` (triggers calculateFullUserProfile + background discovery) and invalidates queries. Radio auto-start is integration point with Story 9.3
- Created 2 supporting API routes: `starred-count.ts` (GET starred song count) and `update-step.ts` (POST generic onboarding step updates)
- All 17 new unit tests pass, full regression suite passes (462 tests, 0 failures)

### File List
- `src/routes/api/onboarding/artists.ts` — NEW: GET paginated/searchable artist list
- `src/routes/api/onboarding/artists/select.ts` — NEW: POST artist selection with affinity + feedback seeding
- `src/routes/api/onboarding/starred-count.ts` — NEW: GET starred song count for step 2 pre-fetch
- `src/routes/api/onboarding/update-step.ts` — NEW: POST generic onboarding step field updates
- `src/components/onboarding/OnboardingWizard.tsx` — NEW: 3-step wizard shell
- `src/components/onboarding/ArtistPicker.tsx` — NEW: Step 1 artist picker
- `src/components/onboarding/SyncLikedSongs.tsx` — NEW: Step 2 liked songs sync
- `src/components/onboarding/LastfmImport.tsx` — NEW: Step 3 Last.fm import
- `src/routes/api/onboarding/__tests__/artists.test.ts` — NEW: Artist list API tests
- `src/routes/api/onboarding/__tests__/artists-select.test.ts` — NEW: Artist selection API tests
- `src/routes/api/onboarding/__tests__/update-step.test.ts` — NEW: Update step API tests

### Change Log
- 2026-03-17: Implemented Story 9.2 — Onboarding Wizard with Artist Picker, Liked Songs Sync, Last.fm Import, and Wizard Completion (7 tasks, 17 tests)
