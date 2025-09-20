# Requirements Traceability Matrix

## Story: epic-3.story-3.6 - Style-Based Playlist Generation

### Coverage Summary

- Total Requirements: 8
- Fully Covered: 0 (0%)
- Partially Covered: 0 (0%)
- Not Covered: 8 (100%)

### Requirement Mappings

#### AC1: Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `dashboard/components/playlist-input.test.tsx::rendersInputField`
  - Given: Dashboard recommendations section loaded
  - When: Component mounts
  - Then: Text input field is visible with placeholder examples

- **Planned E2E Test**: `e2e/playlist-generation.spec.ts::userEntersStyle`
  - Given: Authenticated user on dashboard
  - When: Types style in input and clicks generate
  - Then: Input value is captured and API called with style param

#### AC2: Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `services/navidrome.test.ts::getLibrarySummary`
  - Given: Valid Navidrome config and auth token
  - When: getLibrarySummary() called
  - Then: Returns object with top 20 artists (incl. genres) and top 10 songs

- **Planned Integration Test**: `api/playlist.integration.test.ts::fetchesSummaryInEndpoint`
  - Given: Authenticated request to /api/recommendations/playlist
  - When: Endpoint processes style param
  - Then: Navidrome API called for artists/songs, summary returned without errors

#### AC3: Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `services/ollama.test.ts::generateStylePlaylist`
  - Given: Library summary and style string
  - When: generateStylePlaylist() called with prompt
  - Then: Ollama API POSTed with correct prompt, parses JSON response with 10 playlist items

- **Planned Integration Test**: `api/playlist.integration.test.ts::ollamaGeneration`
  - Given: Mock Ollama response with valid JSON
  - When: Endpoint builds and sends prompt
  - Then: Returns playlist array with song/explanation for each

#### AC4: For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `services/navidrome.test.ts::resolvePlaylistSongs`
  - Given: Array of song suggestions (Artist - Title)
  - When: resolvePlaylistSongs() called
  - Then: For each, searches Navidrome and returns Song[] with ID, URL, etc., or fallback if not found

- **Planned Integration Test**: `api/playlist.integration.test.ts::songResolution`
  - Given: Ollama suggestions from AC3
  - When: Endpoint resolves via search
  - Then: All suggestions mapped to valid Song objects from library

#### AC5: Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `dashboard/components/playlist-display.test.tsx::rendersPlaylist`
  - Given: Playlist data from API
  - When: Component receives props
  - Then: Displays 10 items with song, explanation, thumbs buttons, queue button

- **Planned E2E Test**: `e2e/playlist-display.spec.ts::viewsGeneratedPlaylist`
  - Given: Successful playlist generation
  - When: Dashboard updates with results
  - Then: List visible, feedback buttons functional (localStorage updated encrypted), queue adds to audio store

#### AC6: Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `utils/playlist-cache.test.ts::cacheAndRetrieve`
  - Given: Generated playlist for style
  - When: cachePlaylist(style, data) called
  - Then: Stored in localStorage by style hash, retrievePlaylist(style) returns data

- **Planned Unit Test**: `dashboard/components/privacy-toggle.test.tsx::clearCache`
  - Given: Cached playlists exist
  - When: Privacy toggle clicked
  - Then: localStorage cleared for playlist keys

#### AC7: Integrate with audio store: add entire playlist or individual songs to queue/play

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `stores/audio.test.ts::addPlaylistToQueue`
  - Given: Playlist Song[] from AC4
  - When: addPlaylistToQueue(playlist) or playSong(single)
  - Then: Audio store playlist updated, currentIndex set, isPlaying true

- **Planned Integration Test**: `dashboard/playlist.integration.test.ts::queueIntegration`
  - Given: Displayed playlist
  - When: User clicks add-to-queue (single or all)
  - Then: Audio store state changes, audio player reflects new queue

#### AC8: Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure

**Coverage: NONE**

Given-When-Then Mappings:

- **Planned Unit Test**: `services/ollama.test.ts::errorHandling`
  - Given: Ollama timeout or failure
  - When: generateStylePlaylist() called
  - Then: Retries (up to 3), aborts after 5s, throws OllamaError

- **Planned Unit Test**: `services/navidrome.test.ts::resolutionFallback`
  - Given: Suggestion not found in library
  - When: resolvePlaylistSongs() called
  - Then: Adds fallback message, continues with partial playlist

- **Planned E2E Test**: `e2e/playlist-errors.spec.ts::errorScenarios`
  - Given: Navidrome down or no matches
  - When: Generate playlist
  - Then: User sees error message/fallback UI, no crash

### Critical Gaps

1. **All Requirements**
   - Gap: No tests implemented as feature is pre-implementation (documentation only)
   - Risk: High - Without tests, quality cannot be assured post-implementation
   - Action: Implement unit/integration/E2E tests as planned above after dev completes feature

2. **Error Handling (AC8)**
   - Gap: Specific retry/timeout not tested
   - Risk: Medium - Could lead to poor UX on failures
   - Action: Add mocks for Ollama/Navidrome failures in integration tests

3. **Caching Privacy (AC6)**
   - Gap: localStorage security/privacy not validated
   - Risk: Low - But ensure encryption tested
   - Action: Unit test encryption/decryption cycles

### Test Design Recommendations

1. **Additional Test Scenarios**: Cover edge cases like empty library, invalid styles, large libraries (performance).
2. **Test Types**: Unit for services/stores, Integration for API/endpoint, E2E for UI flow, Performance for fetch timeouts.
3. **Test Data**: Mock Navidrome responses with sample library, Ollama JSON outputs.
4. **Mock/Stub Strategies**: Stub Ollama/Navidrome APIs, mock localStorage for caching tests.

### Risk Assessment

- **High Risk**: AC2, AC3, AC4 (external service dependencies - Navidrome/Ollama availability)
- **Medium Risk**: AC5, AC7 (UI/store integration - potential state inconsistencies)
- **Low Risk**: AC1, AC6 (local UI/storage - simpler to test)

Planning Reference: docs/qa/assessments/epic-3.story-3.6-test-design-20250920.md (to be created post-implementation)