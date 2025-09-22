# Requirements Traceability Matrix

## Story: epic-3.story-3.6 - Style-Based Playlist Generation

### Coverage Summary

- Total Requirements: 9
- Fully Covered: 9 (100%)
- Partially Covered: 0 (0%)
- Not Covered: 0 (0%)
- Status: Complete (All ACs implemented and tested; Bug 3.7 fixed enabling AC4 resolution)
- Updated: 2025-09-21

### Requirement Mappings

#### AC1: Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC1: User inputs style and generates playlist`
  - Given: User on dashboard
  - When: User types style/theme in input field and clicks generate
  - Then: Input value is captured, API called, playlist displayed

#### AC2: Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented Unit Test**: `src/lib/services/__tests__/navidrome.test.ts::getLibrarySummary`
  - Given: Mock Navidrome client with sample library data
  - When: `getLibrarySummary()` is called
  - Then: Returns top 20 artists with genres and top 10 songs as structured data
- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC2: Fetches library summary for prompt context`
  - Given: Authenticated user with Navidrome library
  - When: Generate playlist triggered
  - Then: Library summary fetched and included in Ollama prompt via API response

#### AC3: Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON {"playlist": [{"song": "Artist - Title", "explanation": "why it fits"}]}

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented Unit Test**: `src/lib/services/__tests__/ollama.test.ts::generatePlaylistPrompt`
  - Given: Library summary and user style input
  - When: Prompt construction and Ollama API call
  - Then: Valid JSON response with 10 playlist items parsed correctly
- **Implemented Unit Test**: `src/lib/services/__tests__/ollama.test.ts::JSON parsing for playlist suggestions`
  - Given: Ollama response JSON
  - When: Parse and validate playlist array
  - Then: Returns array of {song, explanation} objects

#### AC4: For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library

**Coverage: FULL** (Bug 3.7 fixed; Subsonic endpoint now resolves songs)

Given-When-Then Mappings:

- **Implemented Unit Test**: `src/lib/services/__tests__/navidrome.test.ts::Subsonic search endpoint - successful search`
  - Given: Playlist suggestions and Navidrome client
  - When: Search for each song title/artist via /rest/search.view
  - Then: Returns matching Song objects with ID and URL, or null for misses
- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC4: Resolves suggestions to Song objects from library`
  - Given: Generated suggestions
  - When: Resolution via search
  - Then: >0 resolved songs with Queue buttons, <10 missing

#### AC5: Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC5: Displays playlist with explanations, feedback, and queue buttons`
  - Given: Generated playlist data
  - When: Playlist rendered in dashboard
  - Then: Shows song list, explanations, thumbs up/down buttons, add-to-queue options; feedback stored encrypted in localStorage

#### AC6: Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC6: Caches generated playlist and loads on regenerate`
  - Given: Previously generated playlist in localStorage
  - When: User requests same style
  - Then: Loads from cache without regenerating; privacy toggle clears cache

#### AC7: Integrate with audio store: add entire playlist or individual songs to queue/play

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC7: Adds entire playlist or individual songs to queue`
  - Given: Generated playlist displayed
  - When: User clicks add-to-queue for playlist or song
  - Then: Songs added to audio store queue and playback starts if selected

#### AC8: Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC8: Handles errors (no matches, timeout, retry)`
  - Given: Ollama timeout or Navidrome search failure
  - When: Generate playlist attempted
  - Then: Shows fallback UI (e.g., "No matches, try different style"), retries Ollama up to 3 times, handles 5s timeout

#### AC9: If suggested song not in library, add to Lidarr download queue with user confirmation

**Coverage: FULL**

Given-When-Then Mappings:

- **Implemented Unit Test**: `src/lib/services/__tests__/lidarr.test.ts::add request for missing songs`
  - Given: Missing song suggestion and Lidarr client
  - When: User confirms add
  - Then: Sends download request to Lidarr queue
- **Implemented E2E Test**: `tests/e2e/playlist-generation.spec.ts::AC9: Adds missing songs to Lidarr with confirmation`
  - Given: Suggestion not in library
  - When: User confirms Lidarr add
  - Then: Prompts confirmation dialog, queues in Lidarr on yes

### Critical Gaps

None - All requirements fully covered with implemented tests and fixes.

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