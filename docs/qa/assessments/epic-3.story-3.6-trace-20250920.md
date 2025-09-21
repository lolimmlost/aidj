# Requirements Traceability Matrix

## Story: epic-3.story-3.6 - Style-Based Playlist Generation

### Coverage Summary

- Total Requirements: 9
- Fully Covered: 0 (0%)
- Partially Covered: 2 (22%)
- Not Covered: 7 (78%)
- Status: In-Progress (Core implementation partial; tests pending; impacted by Bug 3.7 on AC4)
- Updated: 2025-09-21

### Requirement Mappings

#### AC1: Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned E2E Test**: `tests/e2e/playlist-generation.spec.ts::user inputs style`
  - Given: User on dashboard with empty recommendations section
  - When: User types style/theme in input field and clicks generate
  - Then: Input value is captured and used in API request

#### AC2: Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context

**Coverage: PARTIAL**

Given-When-Then Mappings:

- **Existing Unit Test**: `src/lib/services/__tests__/navidrome.test.ts::fetchLibrarySummary`
  - Given: Mock Navidrome client with sample library data
  - When: `fetchLibrarySummary()` is called
  - Then: Returns top 20 artists with genres and top 10 songs as structured data
- **Planned E2E Test**: `tests/e2e/playlist-generation.spec.ts::full flow from style input`
  - Given: Authenticated user with Navidrome library
  - When: Generate playlist triggered
  - Then: Library summary fetched and included in Ollama prompt

#### AC3: Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON {"playlist": [{"song": "Artist - Title", "explanation": "why it fits"}]}

**Coverage: PARTIAL**

Given-When-Then Mappings:

- **Existing Unit Test**: `src/lib/services/__tests__/ollama.test.ts::generatePlaylistPrompt`
  - Given: Library summary and user style input
  - When: Prompt construction and Ollama API call
  - Then: Valid JSON response with 10 playlist items parsed correctly
- **Planned Unit Test**: `src/lib/services/__tests__/ollama.test.ts::JSON parsing for playlist suggestions`
  - Given: Ollama response JSON
  - When: Parse and validate playlist array
  - Then: Returns array of {song, explanation} objects

#### AC4: For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library

**Coverage: NONE** (Blocked by Bug 3.7: Navidrome search endpoint issue prevents resolution testing)

Given-When-Then Mappings:

- **Planned Unit Test**: `src/lib/services/__tests__/navidrome.test.ts::song resolution from suggestions`
  - Given: Playlist suggestions and Navidrome client
  - When: Search for each song title/artist
  - Then: Returns matching Song objects with ID and URL, or null for misses
- **Note**: Post Bug 3.7 fix, add integration test for end-to-end resolution with mock failures

#### AC5: Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned E2E Test**: `tests/e2e/playlist-generation.spec.ts::views display`
  - Given: Generated playlist data
  - When: Playlist rendered in dashboard
  - Then: Shows song list, explanations, thumbs up/down buttons, add-to-queue options; feedback stored encrypted in localStorage

#### AC6: Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned E2E Test**: `tests/e2e/playlist-generation.spec.ts::cache load if exists`
  - Given: Previously generated playlist in localStorage
  - When: User requests same style
  - Then: Loads from cache without regenerating; privacy toggle clears cache

#### AC7: Integrate with audio store: add entire playlist or individual songs to queue/play

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned E2E Test**: `tests/e2e/playlist-generation.spec.ts::adds to queue`
  - Given: Generated playlist displayed
  - When: User clicks add-to-queue for playlist or song
  - Then: Songs added to audio store queue and playback starts if selected

#### AC8: Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned E2E Test**: `tests/e2e/playlist-errors.spec.ts::error scenarios`
  - Given: Ollama timeout or Navidrome search failure
  - When: Generate playlist attempted
  - Then: Shows fallback UI (e.g., "No matches, try different style"), retries Ollama up to 3 times, handles 5s timeout

#### AC9: If suggested song not in library, add to Lidarr download queue with user confirmation

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `src/lib/services/__tests__/lidarr.test.ts::add request for missing songs` (file to create)
  - Given: Missing song suggestion and Lidarr client
  - When: User confirms add
  - Then: Sends download request to Lidarr queue
- **Planned E2E Test**: `tests/e2e/playlist-lidarr.spec.ts::handles missing song`
  - Given: Suggestion not in library
  - When: User confirms Lidarr add
  - Then: Prompts confirmation dialog, queues in Lidarr on yes

### Critical Gaps

1. **Test Implementation Priority**
   - Gap: All 24 planned scenarios (8 unit, 6 integration, 10 E2E) unimplemented despite partial code progress
   - Risk: High - Feature unverified; cannot promote to Done without >80% coverage
   - Action: Implement P0 tests first (core flows AC1-9): Start with unit for AC3/AC4, then E2E for full playlist generation. Target completion post Bug 3.7 fix.

2. **Caching Privacy Toggle**
   - Gap: No test for privacy toggle clearing cache or encrypted storage validation
   - Risk: Medium - Privacy feature unverified, potential data leak
   - Action: Add unit test for localStorage encryption/decryption and E2E for toggle functionality

3. **Mobile Responsiveness and UI Edge Cases**
   - Gap: No tests for responsive display on mobile or empty playlist handling
   - Risk: Low - UI may break on devices, but core flow intact
   - Action: Extend E2E tests with viewport emulation for mobile

4. **Non-Functional Requirements (Inferred)**
   - Gap: No performance test for 5s timeout enforcement; no security test for encrypted feedback
   - Risk: Medium - Could exceed SLAs or expose data
   - Action: Add integration test for timeout mocking and unit test for encryption

5. **Retry Logic on Ollama Failure**
   - Gap: Planned but no explicit test for retry count and backoff
   - Risk: Medium - Infinite retries or no fallback on persistent failure
   - Action: Unit test retry mechanism with mocked failures

6. **Bug 3.7 Impact (Navidrome Search)**
   - Gap: AC4 resolution untestable until endpoint fix
   - Risk: High - Blocks E2E validation of playlist suggestions
   - Action: After fix, re-run planned tests for AC4; add regression test for search endpoint

### Test Design Recommendations

Based on gaps identified, recommend:

1. Additional test scenarios: Privacy toggle, mobile UI, empty library handling
2. Test types to implement: Unit for Lidarr (create file), integration for audio store integration, performance for timeout
3. Test data requirements: Mock Navidrome libraries with/without matches, Ollama mock responses (success/fail/timeout)
4. Mock/stub strategies: Mock Ollama API for prompt/response, stub Navidrome/Lidarr for isolation

### Risk Assessment

- **High Risk**: Requirements with no coverage (ACs 1,4-9) - Core feature untested pre-implementation
- **Medium Risk**: Partial coverage on summary fetch and generation (ACs 2,3) - Existing units cover basics but not full integration
- **Low Risk**: N/A - All critical paths need tests