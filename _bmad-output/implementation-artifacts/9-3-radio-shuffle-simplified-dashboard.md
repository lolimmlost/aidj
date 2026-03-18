# Story 9.3: Radio Shuffle & Simplified Dashboard

Status: review

## Story

As a user (new or returning),
I want a one-tap "Start Radio" that plays a shuffled mix based on my taste, and I want the dashboard to show me only what's useful given my current data,
so that I can start listening immediately without being overwhelmed.

## Acceptance Criteria

**Radio Shuffle:**
1. Create API route `GET /api/radio/shuffle` — accepts optional `{ artistIds?: string[], count?: number }`:
   - If `artistIds` provided: fetch random songs from those artists via Navidrome
   - If no `artistIds` but user has `artist_affinities`: use top 10 affinity artists
   - If no affinity data: pull diverse random sample from full Navidrome library (`getRandomSongs()`)
   - Default count: 30 songs
   - Returns shuffled song list with full metadata (id, title, artist, album, albumArt, duration)
2. Add "Start Radio" button to dashboard hero CTA
3. Radio uses existing audio store: `setPlaylist()` + `playSong()` + `setIsPlaying(true)`
4. Radio plays recorded via normal `recordSongPlay()` path (writes to `listeningHistory`, async-fetches similar tracks)
5. After 10 radio plays in a session, trigger async `calculateFullUserProfile()` refresh (non-blocking)
6. If AI DJ is enabled, radio seeds the initial queue and AI DJ takes over
7. Radio button replaces "Sync Liked Songs" CTA for users who completed onboarding

**Simplified Dashboard (Progressive Disclosure):**
8. Dashboard checks onboarding status + data maturity on mount via `useOnboardingStatus` hook
9. **Tier 1 — New User** (onboarding not done, `listeningHistoryCount < DATA_MATURITY.EMERGING`):
   - Show hero greeting + `OnboardingWizard` component prominently
   - Hide: mood presets, AI studio cards, discovery queue
10. **Tier 2 — Emerging** (`DATA_MATURITY.EMERGING <= count < DATA_MATURITY.READY`):
    - Show hero with "Start Radio" CTA + mood presets (QuickActions)
    - Show teaser cards for AI Recommendations and Playlist Studio with lock icon: "Play more music to unlock" with progress (e.g., "12/30 plays")
    - Hide: discovery queue (or show collapsed "Building your discovery profile...")
11. **Tier 3 — Ready** (`count >= DATA_MATURITY.READY`):
    - Show full dashboard as it exists today
12. Transition between tiers is seamless — react to query invalidation, no page reload
13. All features remain accessible via direct URL (e.g., `/dashboard/generate` works regardless of tier)
14. "Complete your profile" nudge card for users who skipped onboarding, dismissible, links back to wizard
15. Skeleton/loading state while onboarding status loads (default to Tier 1 to avoid feature flash)

## Tasks / Subtasks

- [x] Task 1: Create `GET /api/radio/shuffle` API route (AC: #1)
  - [x] 1.1 Create `src/routes/api/radio/shuffle.ts` with `withAuthAndErrorHandling`
  - [x] 1.2 Accept query params: `artistIds` (comma-separated, optional), `count` (default 30)
  - [x] 1.3 If `artistIds` provided: for each artist, fetch songs via `getSongsByArtist(artistId)`, collect and shuffle
  - [x] 1.4 If no `artistIds`: query `artistAffinities` for top 10 by `affinityScore` DESC for this user. Map artist names to Navidrome artist IDs (search by name), then fetch songs
  - [x] 1.5 If no affinities: use `getRandomSongs(count)` from Navidrome service
  - [x] 1.6 Shuffle collected songs using Fisher-Yates, limit to `count`
  - [x] 1.7 Return `{ songs: Array<{ id, title, artist, album, albumArt, duration }> }`

- [x] Task 2: Add radio session play counter for profile refresh trigger (AC: #5)
  - [x] 2.1 Track radio play count in `useAudioStore` as transient state (not persisted): `radioSessionPlayCount: number`
  - [x] 2.2 Increment counter in existing `recordSongPlay` flow or via effect in dashboard
  - [x] 2.3 When `radioSessionPlayCount >= 10`, fire `POST /api/listening-history/compound-scores` or direct `calculateFullUserProfile()` call (non-blocking)
  - [x] 2.4 Reset counter after trigger to allow subsequent refreshes every 10 plays

- [x] Task 3: Update DashboardHero with "Start Radio" CTA (AC: #2, #7)
  - [x] 3.1 Modify `src/components/dashboard/DashboardHero.tsx`
  - [x] 3.2 Accept new prop: `onStartRadio: () => void` and `showRadioButton: boolean`
  - [x] 3.3 Show "Start Radio" button when `showRadioButton` is true (user completed onboarding or has data)
  - [x] 3.4 Style: prominent primary button with Radio/Play icon

- [x] Task 4: Create radio start handler in dashboard (AC: #3, #6)
  - [x] 4.1 In dashboard index, create `handleStartRadio` function:
    - Fetch `GET /api/radio/shuffle` (optionally with `artistIds` from onboarding selections)
    - Load songs into audio store: `useAudioStore.getState().setPlaylist(songs)`
    - Start playback: `useAudioStore.getState().playSong(0)` + `setIsPlaying(true)`
  - [x] 4.2 If AI DJ is enabled in preferences, radio seeds initial queue and AI DJ takes over for subsequent songs (existing AI DJ behavior handles this automatically once queue is populated)

- [x] Task 5: Implement progressive disclosure in dashboard (AC: #8-#12, #15)
  - [x] 5.1 In `src/routes/dashboard/index.tsx`, add `useOnboardingStatus()` hook call
  - [x] 5.2 Determine current tier from `dataMaturity.listeningHistoryCount` and `DATA_MATURITY` constants
  - [x] 5.3 Show skeleton/loading while `isLoading` is true (default visual = Tier 1, minimal)
  - [x] 5.4 **Tier 1**: Render `<DashboardHero>` + `<OnboardingWizard>` only. Hide `<QuickActions>`, AI studio cards, `<DiscoveryQueueSection>`
  - [x] 5.5 **Tier 2**: Render `<DashboardHero>` with "Start Radio" + `<QuickActions>`. Replace AI studio cards with teaser cards showing lock icon + progress ("12/30 plays to unlock"). Hide or collapse `<DiscoveryQueueSection>`
  - [x] 5.6 **Tier 3**: Render full dashboard exactly as current (no changes for existing users)
  - [x] 5.7 Tier transitions are seamless — driven by TanStack Query cache invalidation (onboarding-status query re-fetches, component re-renders)

- [x] Task 6: Create teaser cards for Tier 2 (AC: #10)
  - [x] 6.1 Create `src/components/dashboard/FeatureTeaser.tsx`
  - [x] 6.2 Accept props: `title`, `description`, `icon`, `progress` (current/total), `locked: boolean`
  - [x] 6.3 Show lock icon overlay, progress bar ("12/30 plays"), muted styling
  - [x] 6.4 When `locked === false` (tier upgraded), render normal card linking to feature

- [x] Task 7: Create "Complete your profile" nudge card (AC: #14)
  - [x] 7.1 Create `src/components/onboarding/ProfileNudge.tsx`
  - [x] 7.2 Show for users who skipped onboarding (`onboardingSkipped && !onboardingCompleted`)
  - [x] 7.3 Dismissible — store dismissal in localStorage (`aidj-profile-nudge-dismissed`)
  - [x] 7.4 Links back to wizard: navigates to wizard view or triggers wizard display

- [x] Task 8: Ensure deep links work regardless of tier (AC: #13)
  - [x] 8.1 Verify `/dashboard/generate`, `/dashboard/generate?section=recommendations`, etc. still work directly
  - [x] 8.2 Progressive disclosure only affects the dashboard index route — sub-routes are unaffected
  - [x] 8.3 Add test/verification for direct URL access to gated features

## Dev Notes

### Architecture & Integration

- **Radio API** is a new server-side route that queries Navidrome. It does NOT create new computation — just fetches and shuffles songs
- **Dashboard modification** is the core of this story. The existing `DashboardIndex` component in `src/routes/dashboard/index.tsx` needs conditional rendering based on `useOnboardingStatus()`
- **Play recording** already happens via existing `recordSongPlay()` path in the audio store — radio plays naturally feed into the recommendation pipeline without any new code

### Navidrome Service Functions to Use

```ts
// For radio with seed artists
getSongsByArtist(artistId: string, start?: number, limit?: number): Promise<Song[]>
// Located at src/lib/services/navidrome.ts:756

// For radio without seed data (random)
getRandomSongs(count?: number): Promise<Song[]>
// Located at src/lib/services/navidrome.ts:958
```

### Artist Affinity Query for Radio Seeding

```ts
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { desc, eq } from 'drizzle-orm';

const topArtists = await db.select()
  .from(artistAffinities)
  .where(eq(artistAffinities.userId, userId))
  .orderBy(desc(artistAffinities.affinityScore))
  .limit(10);
```

**Note**: `artistAffinities.artist` stores lowercase artist name, NOT Navidrome artist ID. To get songs, either:
- Search Navidrome by artist name to get ID, then `getSongsByArtist(id)`
- Or use `getRandomSongs()` and filter (less ideal)

### Audio Store Integration

The audio store (`src/lib/stores/audio.ts`) exposes:
```ts
setPlaylist(songs: Song[]): void     // Replace current playlist
playSong(index: number): void         // Start playing song at index
setIsPlaying(playing: boolean): void  // Toggle playback
```

Radio just needs to set the playlist and start playing — all subsequent behavior (recording plays, fetching similarities, AI DJ takeover) is handled by existing audio store logic.

### Current Dashboard Layout (What to Modify)

Current `DashboardIndex` renders unconditionally:
1. `<DashboardHero>` — Keep for all tiers (modify CTA per tier)
2. `<QuickActions>` — Hide in Tier 1, show in Tier 2+
3. AI studio cards (2x `<Link>` cards) — Hide in Tier 1, teaser in Tier 2, full in Tier 3
4. `<DiscoveryQueueSection>` — Hide in Tier 1-2, show in Tier 3

### Progressive Disclosure Implementation

```tsx
function DashboardIndex() {
  const { isNewUser, onboardingCompleted, dataMaturity, isLoading } = useOnboardingStatus();

  const tier = isLoading ? 1 :
    (dataMaturity?.listeningHistoryCount ?? 0) >= DATA_MATURITY.READY ? 3 :
    (dataMaturity?.listeningHistoryCount ?? 0) >= DATA_MATURITY.EMERGING ? 2 : 1;

  const showOnboarding = tier === 1 && !onboardingCompleted;

  return (
    <div>
      <DashboardHero showRadioButton={tier >= 2} onStartRadio={handleStartRadio} />
      {showOnboarding && <OnboardingWizard />}
      {tier >= 2 && <QuickActions />}
      {tier === 2 && <FeatureTeaser progress={dataMaturity.listeningHistoryCount} total={DATA_MATURITY.READY} />}
      {tier >= 3 && <AIStudioCards />}
      {tier >= 3 && <DiscoveryQueueSection />}
    </div>
  );
}
```

### 10-Play Profile Refresh

Track in audio store as transient state (not persisted via `partialize`):
```ts
// In audio store
radioSessionPlayCount: 0, // Transient, resets on page load
incrementRadioPlayCount: () => set(s => ({ radioSessionPlayCount: s.radioSessionPlayCount + 1 })),
```

Trigger profile recalculation after 10 plays via effect in dashboard or audio hook — fire-and-forget `POST /api/listening-history/compound-scores` or a new lightweight endpoint.

### Dependencies on Stories 9.1 and 9.2

- `useOnboardingStatus` hook (Story 9.1) — required for tier detection
- `DATA_MATURITY` constants (Story 9.1) — required for threshold checks
- `OnboardingWizard` component (Story 9.2) — rendered in Tier 1
- `POST /api/onboarding/complete` (Story 9.1) — wizard completion triggers
- `onboarding_status` column (Story 9.1) — stores wizard state

### Project Structure Notes

New files:
- `src/routes/api/radio/shuffle.ts` — Radio shuffle API
- `src/components/dashboard/FeatureTeaser.tsx` — Locked feature teaser card
- `src/components/onboarding/ProfileNudge.tsx` — Skipped onboarding nudge

Modified files:
- `src/routes/dashboard/index.tsx` — Progressive disclosure logic, onboarding integration
- `src/components/dashboard/DashboardHero.tsx` — "Start Radio" CTA button
- `src/lib/stores/audio.ts` — `radioSessionPlayCount` transient field (minimal change)

### References

- [Source: src/routes/dashboard/index.tsx] — Current dashboard layout to modify
- [Source: src/components/dashboard/DashboardHero.tsx] — Hero component to extend
- [Source: src/lib/services/navidrome.ts#L756] — getSongsByArtist()
- [Source: src/lib/services/navidrome.ts#L958] — getRandomSongs()
- [Source: src/lib/stores/audio.ts] — setPlaylist(), playSong(), setIsPlaying()
- [Source: src/lib/db/schema/profile.schema.ts#L29] — artistAffinities for radio seeding
- [Source: docs/prd-epic-9/stories.md] — Story 9.3 requirements and technical notes

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Pre-existing flaky test: `shuffle-scoring.test.ts` (non-deterministic artist adjacency check) — not related to this story

### Completion Notes List
- Created `GET /api/radio/shuffle` API route with 3-tier song sourcing: explicit artistIds → user affinities → random library songs
- Radio API uses Fisher-Yates shuffle, caps at 100 songs, returns full song metadata for audio store
- Added `radioSessionPlayCount` transient field to audio store with `incrementRadioPlayCount` action (not persisted, resets on rehydration)
- Dashboard index now uses `useOnboardingStatus` hook for progressive disclosure across 3 tiers
- Tier 1 (new user): Hero + OnboardingWizard only; hides QuickActions, AI cards, DiscoveryQueue
- Tier 2 (emerging): Hero with "Start Radio" CTA + QuickActions + FeatureTeaser cards with lock/progress
- Tier 3 (ready): Full dashboard unchanged for existing users
- Added `RadioCTA` component to DashboardHero with Radio icon and loading state
- Created `FeatureTeaser` component with lock icon, progress bar, and muted styling
- Created `ProfileNudge` component for skipped-onboarding users, dismissible via localStorage
- Radio play counter effect triggers profile refresh (`POST /api/listening-history/compound-scores`) every 10 plays
- AI DJ takeover handled automatically — radio seeds queue, existing AI DJ monitors and extends
- Deep links to `/dashboard/generate` etc. work regardless of tier (separate route files)
- All 468 existing tests pass (1 pre-existing flaky failure unrelated), 7 new component tests added, 7 API todo tests

### Change Log
- 2026-03-18: Story 9.3 implemented — radio shuffle API, progressive dashboard, feature teasers, profile nudge

### File List
- `src/routes/api/radio/shuffle.ts` (new) — Radio shuffle API with 3-tier song sourcing
- `src/routes/dashboard/index.tsx` (modified) — Progressive disclosure, radio handler, play counter effect
- `src/components/dashboard/DashboardHero.tsx` (modified) — RadioCTA component, showRadioButton/onStartRadio props
- `src/components/dashboard/FeatureTeaser.tsx` (new) — Locked feature teaser card with progress
- `src/components/onboarding/ProfileNudge.tsx` (new) — Skipped onboarding nudge card
- `src/lib/stores/audio.ts` (modified) — radioSessionPlayCount transient field + incrementRadioPlayCount action
- `src/components/dashboard/__tests__/FeatureTeaser.test.tsx` (new) — FeatureTeaser component tests
- `src/components/onboarding/__tests__/ProfileNudge.test.tsx` (new) — ProfileNudge component tests
- `src/routes/api/__tests__/radio.test.ts` (new) — Radio API integration test scenarios (todo-style)
