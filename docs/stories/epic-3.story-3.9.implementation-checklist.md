# Story 3.9 Implementation Checklist

**Developer Pre-Flight & Progress Tracker**

**Story:** Epic 3 Story 3.9 - Feedback-Driven Recommendation Improvements
**Story Points:** 5 (or 3 if streaming deferred)
**Estimated Duration:** 5-7 days (3-4 days for core, +2-3 for optional features)

---

## Pre-Flight Checks (Before Starting)

### Environment & Dependencies
- [ ] Development environment running (`npm run dev`)
- [ ] PostgreSQL database accessible and healthy
- [ ] Ollama service running on `localhost:11434` (for testing AI integration)
- [ ] Navidrome instance running with test library (for Navidrome integration testing)
- [ ] Node.js version matches project requirements (check `package.json`)
- [ ] All dependencies up to date (`npm install`)

### Code Understanding
- [ ] Read Story 3.9 completely (all sections: AC, Tasks, Dev Notes, Architecture Review)
- [ ] Review existing Story 3.2 (Recommendation Display) - understand current feedback UI
- [ ] Review existing Story 3.6 (Playlist Generation) - understand Ollama integration
- [ ] Review Story 5.3 (User Preferences) - understand preferences store pattern
- [ ] Understand existing database schema (`src/lib/db/schema/preferences.schema.ts`)
- [ ] Understand existing API patterns (`src/routes/api/recommendations.ts`, `/api/preferences.ts`)

### Architecture Context Verification
- [ ] Locate and read `recommendationsCache` table definition (should exist in `preferences.schema.ts`)
- [ ] Locate and read `userPreferences` table definition (should have `recommendationSettings`)
- [ ] Review Better Auth session pattern in existing API routes
- [ ] Review Drizzle ORM migration process (`npm run db:generate`, `npm run db:push`)
- [ ] Understand TanStack Query mutation patterns (see `preferences.ts` for reference)
- [ ] Review Zustand store pattern in `src/lib/stores/preferences.ts`

### Testing Infrastructure
- [ ] Run existing tests to ensure baseline passes (`npm test`)
- [ ] Run E2E tests to verify environment (`npm run test:e2e`)
- [ ] Confirm test database is separate from dev database
- [ ] Verify Playwright is configured and working

### Git & Version Control
- [ ] Create feature branch: `git checkout -b feature/epic-3-story-3.9-feedback-driven-recommendations`
- [ ] Ensure working directory is clean (`git status`)
- [ ] Pull latest changes from main branch

---

## Phase 1: Database Foundation (Days 1-2)

### Task 1: Database Schema (CRITICAL PATH)

**Subtask 1.1: Review Existing Schema**
- [ ] Open `src/lib/db/schema/preferences.schema.ts`
- [ ] Verify `recommendationsCache` table exists with:
  - [ ] `userId` (FK to user)
  - [ ] `promptHash` (for deduplication)
  - [ ] `recommendations` (JSONB)
  - [ ] `expiresAt` (timestamp)
- [ ] Note current structure for FK references

**Subtask 1.2-1.4: Create New Schema File**
- [ ] Create `src/lib/db/schema/recommendations.schema.ts`
- [ ] Import Drizzle types and existing tables (user, recommendationsCache)
- [ ] Define `recommendationFeedback` table:
  ```typescript
  export const recommendationFeedback = pgTable("recommendation_feedback", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    recommendationCacheId: integer("recommendation_cache_id").references(() => recommendationsCache.id, { onDelete: "set null" }),
    songArtistTitle: text("song_artist_title").notNull(),
    feedbackType: text("feedback_type", { enum: ['thumbs_up', 'thumbs_down'] }).notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    source: text("source", { enum: ['recommendation', 'playlist'] }).default('recommendation'),
  });
  ```
- [ ] Add type exports: `export type RecommendationFeedback = typeof recommendationFeedback.$inferSelect;`

**Subtask 1.3: Extend Existing recommendationsCache Table**
- [ ] Add migration to extend `recommendationsCache` with:
  - [ ] `qualityScore` (real, nullable) - for feedback-based quality
  - [ ] `feedbackCount` (integer, default 0) - total feedback received
- [ ] Document migration in comments

**Subtask 1.5-1.7: Generate and Apply Migration**
- [ ] Export new schema from `src/lib/db/schema/index.ts`
- [ ] Run `npm run db:generate` to create migration files
- [ ] Review generated SQL migration for correctness
- [ ] Run `npm run db:push` to apply migration to database
- [ ] Verify tables created: `psql` or DB GUI to inspect tables
- [ ] Verify indexes created on:
  - [ ] `recommendation_feedback.user_id`
  - [ ] `recommendation_feedback.timestamp`
  - [ ] `recommendation_feedback.recommendation_cache_id`
  - [ ] Compound index: `(user_id, feedback_type, timestamp DESC)`

**Verification:**
- [ ] Schema compiles without TypeScript errors
- [ ] Migration applied successfully (no SQL errors)
- [ ] Database inspector shows new tables and indexes
- [ ] Can insert test feedback row manually via SQL

**Estimated Time:** 3-4 hours

---

### Task 2: Feedback Collection API (CRITICAL PATH)

**Subtask 2.1: Create Feedback API Endpoint**
- [ ] Create file: `src/routes/api/recommendations/feedback.ts`
- [ ] Import dependencies: `createServerFileRoute`, `auth`, Drizzle `db`, Zod
- [ ] Define Zod validation schema (follow pattern from `/api/preferences.ts`):
  ```typescript
  const feedbackSchema = z.object({
    songArtistTitle: z.string().min(3).max(200),
    feedbackType: z.enum(['thumbs_up', 'thumbs_down']),
    source: z.enum(['recommendation', 'playlist']).optional().default('recommendation'),
    recommendationCacheId: z.number().optional(),
  });
  ```
- [ ] Implement POST handler:
  - [ ] Check session authentication (Better Auth pattern)
  - [ ] Return 401 if not authenticated
  - [ ] Validate request body with Zod
  - [ ] Return 400 if validation fails
  - [ ] Insert feedback into `recommendationFeedback` table
  - [ ] If `recommendationCacheId` provided, update cache quality score (async, non-blocking)
  - [ ] Return `{ success: true, feedbackId: string }`
  - [ ] Catch errors, return ServiceError pattern
- [ ] Test endpoint with curl/Postman:
  ```bash
  curl -X POST http://localhost:3000/api/recommendations/feedback \
    -H "Content-Type: application/json" \
    -d '{"songArtistTitle":"Artist - Song","feedbackType":"thumbs_up"}'
  ```

**Subtask 2.2: localStorage Migration Helper**
- [ ] Create utility: `src/lib/utils/migrate-feedback.ts`
- [ ] Function: `migrateLocalStorageFeedback()`
  - [ ] Scan localStorage for feedback keys (base64 encoded song names)
  - [ ] Decode each key, extract song name and feedback type
  - [ ] Submit to `/api/recommendations/feedback` via fetch
  - [ ] Return migration summary: `{ migrated: number, failed: string[] }`
  - [ ] On success, clear localStorage feedback keys
- [ ] Add one-time migration trigger:
  - [ ] Check localStorage flag: `feedback_migration_complete`
  - [ ] If not set, show UI prompt (use shadcn/ui Alert or Dialog)
  - [ ] On user confirmation, run migration
  - [ ] Set flag after completion

**Subtask 2.3: Update Recommendation Detail Page**
- [ ] Open `src/routes/dashboard/recommendations/[id].tsx`
- [ ] Replace `getFeedback()` and `setFeedback()` functions (lines 82-96)
- [ ] Create TanStack Query mutation:
  ```typescript
  const feedbackMutation = useMutation({
    mutationFn: async ({ feedbackType }: { feedbackType: 'up' | 'down' }) => {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songArtistTitle: song,
          feedbackType: feedbackType === 'up' ? 'thumbs_up' : 'thumbs_down',
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
  ```
- [ ] Update button handlers to use mutation
- [ ] Add optimistic updates for instant UI feedback

**Subtask 2.4: Loading States and Error Handling**
- [ ] Add loading spinner on feedback buttons during mutation
- [ ] Use shadcn/ui Toast for success/error notifications
- [ ] Add retry logic for transient failures (built into TanStack Query)
- [ ] Add error boundary around feedback section

**Verification:**
- [ ] Can submit feedback via UI, see success toast
- [ ] Feedback appears in database (verify via SQL query)
- [ ] localStorage migration prompt appears on first load
- [ ] Migration successfully transfers old feedback to database
- [ ] Error handling works (test with network offline)

**Estimated Time:** 4-5 hours

---

## Phase 2: Preference Modeling & AI Integration (Days 2-4)

### Task 3: User Preference Profile Builder

**Subtask 3.1: Create Preferences Service**
- [ ] Create file: `src/lib/services/user-preferences.ts`
- [ ] Define `UserPreferenceProfile` type:
  ```typescript
  interface UserPreferenceProfile {
    likedArtists: { name: string; count: number }[];
    dislikedArtists: { name: string; count: number }[];
    likedGenres: string[];
    dislikedGenres: string[];
    totalFeedback: number;
    positiveRatio: number;
  }
  ```
- [ ] Implement `buildUserPreferenceProfile(userId: string): Promise<UserPreferenceProfile>`
  - [ ] Query all feedback for user from database
  - [ ] Extract artist names from `songArtistTitle` (split on " - ")
  - [ ] Group by artist, count positive/negative feedback
  - [ ] Return top 10 liked, top 5 disliked
- [ ] Implement `getLikedArtists(userId: string, limit: number): Promise<string[]>`
- [ ] Implement `getDislikedArtists(userId: string, limit: number): Promise<string[]>`
- [ ] Implement `getListeningPatterns(userId: string): Promise<object>`

**Subtask 3.2: Preference Aggregation Logic**
- [ ] Write SQL queries using Drizzle ORM for efficient aggregation
- [ ] Handle edge cases: no feedback, all negative feedback, compilation albums
- [ ] Add error handling for database failures

**Subtask 3.3: Caching Strategy**
- [ ] Implement in-memory cache with 30-minute TTL (follow `library-index.ts` pattern)
- [ ] Cache key: `preference_profile_${userId}`
- [ ] Invalidate cache on new feedback submission

**Subtask 3.4: Unit Tests**
- [ ] Create `src/lib/services/__tests__/user-preferences.test.ts`
- [ ] Test `buildUserPreferenceProfile()` with mock feedback data
- [ ] Test artist name extraction from various formats
- [ ] Test edge cases: empty feedback, all negative, single artist

**Verification:**
- [ ] Unit tests pass (`npm test user-preferences`)
- [ ] Can fetch preference profile via service function
- [ ] Profile updates when new feedback submitted
- [ ] Cache reduces database queries (verify with logging)

**Estimated Time:** 4-5 hours

---

### Task 4: Enhanced Ollama Prompts with Personalization

**Subtask 4.1-4.2: Update generateRecommendations()**
- [ ] Open `src/lib/services/ollama.ts`
- [ ] Import `getUserPreferenceProfile` from user-preferences service
- [ ] Modify `generateRecommendations()` function signature to accept `userId`
- [ ] Fetch preference profile inside function (if userId provided)
- [ ] Enhance prompt template:
  ```typescript
  if (preferenceProfile && preferenceProfile.totalFeedback > 5) {
    enhancedPrompt += `

  USER PREFERENCES (from feedback history):
  LIKED ARTISTS: ${preferenceProfile.likedArtists.map(a => a.name).join(', ')}
  DISLIKED ARTISTS: ${preferenceProfile.dislikedArtists.map(a => a.name).join(', ')}

  IMPORTANT: Prioritize songs from liked artists, avoid disliked artists.`;
  }
  ```

**Subtask 4.3: Update generatePlaylist()**
- [ ] Apply same preference enhancement to `generatePlaylist()` function
- [ ] Add preference context for style matching

**Subtask 4.4: Fallback Behavior**
- [ ] If no preference data exists (new user), use generic prompt
- [ ] Add logging to track when preferences are used vs generic

**Subtask 4.5: Test Personalized Recommendations**
- [ ] Create test user with mock feedback data
- [ ] Generate recommendations, verify prompt includes preferences
- [ ] Compare recommendations with vs without preference data

**Verification:**
- [ ] Recommendations generated with preference context (check logs)
- [ ] New users still get recommendations (generic prompt)
- [ ] Preferences improve recommendation relevance (manual testing)

**Estimated Time:** 3-4 hours

---

### Task 5: Caching & Performance Optimization

**Subtask 5.1-5.2: Library Index Optimization**
- [ ] Review `src/lib/services/library-index.ts`
- [ ] Add artist-to-genre mapping cache
- [ ] Extend cache TTL configuration

**Subtask 5.3: Cache Warming on Login**
- [ ] Add background cache warming function
- [ ] Trigger on user authentication (after login)
- [ ] Preload library index + preference profile

**Subtask 5.4: Reduce Ollama Prompt Size**
- [ ] Optimize song list in prompts (top 40 songs + genre summary instead of 60 full songs)
- [ ] Add genre-based summarization

**Subtask 5.5: Performance Monitoring**
- [ ] Add timing logs for:
  - [ ] Library index fetch time
  - [ ] Preference profile build time
  - [ ] Ollama call duration
  - [ ] Total recommendation generation time
- [ ] Target: < 5s end-to-end

**Verification:**
- [ ] Cache hits reduce API calls (verify with logs)
- [ ] Recommendation generation < 5s on average
- [ ] Cache warming completes in background without blocking

**Estimated Time:** 3-4 hours

---

## Phase 3: Enhancements (Days 4-6) - OPTIONAL

### Task 6: Streaming Response Support (OPTIONAL - CAN DEFER)

**⚠️ COMPLEXITY WARNING:** This task is complex and can be deferred to a follow-up story if timeline is tight.

**Subtask 6.1-6.2: Ollama Streaming Mode**
- [ ] Update Ollama API call to use `stream: true`
- [ ] Implement Server-Sent Events (SSE) endpoint

**Subtask 6.3-6.4: React Streaming Integration**
- [ ] Update dashboard to handle SSE stream
- [ ] Add incremental rendering for recommendations

**Subtask 6.5-6.6: Error Handling**
- [ ] Handle stream interruptions
- [ ] Fallback to non-streaming mode on errors

**Decision Point:**
- [ ] **Implement now** if streaming is high priority for UX
- [ ] **Defer to follow-up story** if core feedback loop is higher priority

**Estimated Time:** 5-6 hours (if implemented)

---

### Task 7: Preference Analytics Dashboard Widget

**Subtask 7.1: Create Analytics API**
- [ ] Create `src/routes/api/recommendations/analytics.ts`
- [ ] Implement GET handler:
  - [ ] Aggregate feedback counts, liked/disliked artists, activity trends
  - [ ] Return JSON summary
- [ ] Add caching with TanStack Query (5-minute staleTime)

**Subtask 7.2-7.3: Create PreferenceInsights Component**
- [ ] Create `src/components/recommendations/PreferenceInsights.tsx`
- [ ] Use shadcn/ui Card, Badge, Progress components
- [ ] Display:
  - [ ] Total feedback count
  - [ ] Top liked artists (with badges)
  - [ ] Activity trend (last 7 days vs previous 7 days)

**Subtask 7.4-7.5: Integrate into Dashboard**
- [ ] Add widget to `src/routes/dashboard/index.tsx`
- [ ] Style responsively (full width mobile, half width desktop)

**Verification:**
- [ ] Analytics widget shows correct data
- [ ] Updates when new feedback submitted
- [ ] Responsive design works on mobile

**Estimated Time:** 3-4 hours

---

### Task 8: Privacy & Data Management

**Subtask 8.1: Privacy Toggle in Settings**
- [ ] Open `src/routes/settings/recommendations.tsx`
- [ ] Add toggle: "Use feedback to improve recommendations"
- [ ] Store in `userPreferences.recommendationSettings`

**Subtask 8.2: Conditional Preference Usage**
- [ ] Modify ollama.ts to check privacy setting before adding preferences to prompt
- [ ] If disabled, use generic recommendations

**Subtask 8.3-8.4: Data Export Endpoint**
- [ ] Create `src/routes/api/recommendations/export.ts`
- [ ] GET handler: Returns all user feedback as JSON
- [ ] Add download link in settings

**Subtask 8.5-8.6: Data Deletion Endpoint**
- [ ] Create `src/routes/api/recommendations/clear.ts`
- [ ] DELETE handler: Wipes all feedback for user
- [ ] Add confirmation dialog in UI (shadcn/ui AlertDialog)

**Verification:**
- [ ] Privacy toggle works (recommendations ignore feedback when disabled)
- [ ] Export downloads complete feedback JSON
- [ ] Deletion removes all feedback from database

**Estimated Time:** 3-4 hours

---

### Task 9: Navidrome Smart Playlist Integration (OPTIONAL)

**Subtask 9.1: Implement Subsonic Star Endpoint**
- [ ] Open `src/lib/services/navidrome.ts`
- [ ] Add `starSong(songId: string): Promise<void>`
  - [ ] Call Subsonic API `rest/star.view?id={songId}`
  - [ ] Use existing auth token from session
- [ ] Add `unstarSong(songId: string): Promise<void>`

**Subtask 9.2: Sync Feedback to Navidrome**
- [ ] Update feedback API to call `starSong()` on thumbs up
- [ ] Background sync (don't block API response)
- [ ] Log errors but don't fail feedback submission

**Subtask 9.3: Smart Playlist Generator (OPTIONAL)**
- [ ] Create `src/lib/services/smart-playlists.ts`
- [ ] Implement `generateFavoritesPlaylist(userId)` - writes .nsp file
- [ ] Requires Navidrome PlaylistsPath config

**Subtask 9.4-9.5: UI Integration**
- [ ] Add settings toggle: "Sync feedback to Navidrome"
- [ ] Add dashboard widget: "Your Smart Playlists" (optional)

**Subtask 9.6-9.7: Tests**
- [ ] Unit test: Mock Subsonic API, verify star/unstar calls
- [ ] Integration test: Submit feedback, verify song starred in Navidrome

**Verification:**
- [ ] Thumbs up marks song as "loved" in Navidrome
- [ ] Can verify in Navidrome UI
- [ ] Sync failures don't break feedback submission

**Estimated Time:** 4-5 hours

---

## Phase 4: Testing & Validation (Day 6-7)

### Task 10: Comprehensive Testing

**Subtask 10.1: Unit Tests for Preference Profile**
- [ ] `src/lib/services/__tests__/user-preferences.test.ts`
- [ ] Test preference aggregation with various feedback datasets
- [ ] Test edge cases (no feedback, all positive, all negative)
- [ ] Run tests: `npm test user-preferences`

**Subtask 10.2: Unit Tests for Feedback API**
- [ ] Test validation (invalid inputs should fail)
- [ ] Test authentication (unauthenticated requests should return 401)
- [ ] Test error handling (database failures)

**Subtask 10.3: Integration Test - Feedback Flow**
- [ ] Create `src/lib/services/__tests__/feedback-integration.test.ts`
- [ ] Test: Submit feedback → Profile updates → Cache invalidates
- [ ] Verify database state after each step

**Subtask 10.4: E2E Test - Recommendation Personalization**
- [ ] Create `tests/e2e/feedback-driven-recommendations.spec.ts`
- [ ] Test flow:
  1. User logs in
  2. User likes 5 rock songs
  3. User generates new recommendations
  4. Verify next recommendations prioritize rock artists
- [ ] Use Playwright fixtures for authenticated user

**Subtask 10.5: E2E Test - Privacy Toggle**
- [ ] Test flow:
  1. User likes songs (feedback recorded)
  2. User disables "Use feedback to improve recommendations"
  3. User generates recommendations
  4. Verify recommendations are generic (no preference influence)

**Subtask 10.6: Performance Test**
- [ ] Measure recommendation generation time with and without cache
- [ ] Target: < 5s with cache, < 8s without
- [ ] Use `console.time()` and `console.timeEnd()` for measurement

**Subtask 10.7: E2E Test - Navidrome Sync**
- [ ] Test flow:
  1. User thumbs up song
  2. Verify song starred in Navidrome (via API query)
- [ ] Requires Navidrome test instance

**Verification:**
- [ ] All unit tests pass (`npm test`)
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] Performance targets met
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No linting errors (`npm run lint`)

**Estimated Time:** 6-8 hours

---

## Final Checklist (Before Marking Story Complete)

### Code Quality
- [ ] All TypeScript errors resolved
- [ ] All ESLint warnings addressed
- [ ] Code formatted with Prettier
- [ ] No console.log statements left in production code (use proper logging)
- [ ] All TODOs addressed or documented for follow-up

### Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Manual testing completed on:
  - [ ] Desktop browser (Chrome)
  - [ ] Mobile browser (responsive design)
  - [ ] Error scenarios (network failure, auth failure)

### Documentation
- [ ] Update story file with completion notes
- [ ] Document any deviations from plan
- [ ] Update file list with all modified/created files
- [ ] Add debug log references if issues encountered
- [ ] Update change log in story

### Database
- [ ] Migrations applied successfully
- [ ] Database schema matches expected structure
- [ ] Indexes created and verified
- [ ] No orphaned test data in production tables

### Performance
- [ ] Recommendation generation < 5s (with cache)
- [ ] Feedback submission < 500ms
- [ ] No N+1 query issues
- [ ] Caching strategy validated

### Security
- [ ] All API endpoints require authentication
- [ ] User feedback isolated per userId (no data leaks)
- [ ] Input validation on all endpoints (Zod schemas)
- [ ] No SQL injection vulnerabilities

### User Experience
- [ ] Loading states show during async operations
- [ ] Error messages are user-friendly (not technical stack traces)
- [ ] Success feedback provided (toasts, updated UI)
- [ ] Responsive design works on mobile
- [ ] Accessibility: keyboard navigation, ARIA labels

### Git & Deployment
- [ ] All changes committed with descriptive messages
- [ ] Feature branch rebased on latest main
- [ ] No merge conflicts
- [ ] Build succeeds (`npm run build`)
- [ ] Ready for code review and PR

---

## Story Completion Criteria

### All Acceptance Criteria Met
- [ ] AC1: Feedback stored in database (not just localStorage)
- [ ] AC2: User preference profile tracks liked/disliked songs, artists, genres
- [ ] AC3: Ollama prompts include user preference data
- [ ] AC4: Caching strategy implemented (library index, recommendation context)
- [ ] AC5: Streaming response support (or marked as deferred)
- [ ] AC6: Analytics endpoint and dashboard widget created
- [ ] AC7: Privacy controls (export, delete, opt-out)
- [ ] AC8: Navidrome sync (thumbs up → star song)
- [ ] AC9: Smart Playlists (optional, may be deferred)

### Developer Signoff
- [ ] I have completed all tasks to the best of my ability
- [ ] I have tested all functionality manually
- [ ] I have documented any known issues or limitations
- [ ] I have updated the story with completion notes
- [ ] I am ready for QA review

**Developer Signature:** _________________
**Date:** _________________

---

## Post-Implementation

### QA Handoff
- [ ] Create QA ticket with story reference
- [ ] Provide test environment URL and credentials
- [ ] List key flows to test
- [ ] Document any known limitations

### Code Review
- [ ] Create pull request with descriptive title and body
- [ ] Link to Story 3.9 in PR description
- [ ] Request review from team lead or peer
- [ ] Address review feedback

### Story Closure
- [ ] Update story status to "Review" or "Done"
- [ ] Add final completion notes
- [ ] Log total time spent
- [ ] Identify follow-up stories if needed

---

## Troubleshooting Guide

### Common Issues

**Database Migration Fails**
- Check PostgreSQL is running and accessible
- Verify connection string in `.env`
- Check for syntax errors in schema definition
- Try `npm run db:push` with `--force` flag (caution: dev only)

**Feedback API Returns 401**
- Verify Better Auth session is valid
- Check authentication middleware in API route
- Test with valid session token

**Ollama Prompts Too Long**
- Reduce song sample size (40 → 30)
- Summarize genres instead of listing all songs
- Limit preference list to top 5 artists

**Recommendations Not Improving**
- Verify preference profile has sufficient feedback (> 5 entries)
- Check preference data is included in Ollama prompt (logs)
- Ensure cache invalidation working (feedback should bust cache)

**Performance Slow**
- Check database indexes exist (`\d recommendation_feedback` in psql)
- Verify caching is enabled (check logs for cache hits)
- Profile slow queries with `EXPLAIN ANALYZE`

**Tests Failing**
- Ensure test database is separate from dev database
- Check test fixtures are up to date
- Verify Playwright browser binaries installed (`npx playwright install`)

---

## Estimated Total Time

**Minimum Viable Implementation (Core Feedback Loop):**
- Phase 1 (Database + API): 7-9 hours
- Phase 2 (Preferences + AI): 7-9 hours
- Phase 4 (Testing): 6-8 hours
- **Total: 20-26 hours (2.5-3.5 days)**

**Full Implementation (All Features):**
- Phase 1: 7-9 hours
- Phase 2: 7-9 hours
- Phase 3: 15-19 hours (all optional features)
- Phase 4: 6-8 hours
- **Total: 35-45 hours (4.5-6 days)**

---

## Notes

- This checklist is ordered by dependency and priority
- Optional tasks can be deferred to follow-up stories
- Core feedback loop (Phases 1-2) should be completed first
- Performance targets are guidelines, not hard requirements
- When in doubt, refer to Story 3.9 Dev Notes section

**Good luck with implementation! Remember to track your progress and ask for help if blocked.**
