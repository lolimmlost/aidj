# Epic 3 Story 3.6: Style-Based Playlist Generation

As a user,
I want to request and generate themed playlists (e.g., Halloween, Christmas, rave dubstep, rock) using my existing Navidrome library,
so that I can discover and play music matching specific styles or occasions from my collection.

## Acceptance Criteria
- [ ] 1. Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")
- [ ] 2. Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context
- [ ] 3. Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON {"playlist": [{"song": "Artist - Title", "explanation": "why it fits"}]}
- [ ] 4. For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library
- [ ] 5. Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons
- [ ] 6. Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)
- [ ] 7. Integrate with audio store: add entire playlist or individual songs to queue/play
- [ ] 8. Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure
- [ ] 9. If suggested song not in library, add to Lidarr download queue with user confirmation

## Tasks
- [ ] Design and implement Ollama prompt: "My library: artists [list with genres], songs [examples]. Create 10-song playlist for '[style]' using only my library. JSON: {\"playlist\": [{\"song\": \"Artist - Title\", \"explanation\": \"reason\"}]}"
- [ ] Update recommendations API to /playlist endpoint: fetch summary, build prompt, call Ollama, resolve songs via search
- [ ] Add UI: text input + generate button in dashboard recommendations section
- [ ] Cache: store playlist by style hash in localStorage, load if exists, privacy button to clear
- [ ] Display: list with links to details, queue integration
- [ ] Unit test: Ollama prompt construction with library summary and style (src/lib/services/__tests__/ollama.test.ts)
- [ ] Unit test: JSON parsing for playlist suggestions with validation (src/lib/services/__tests__/ollama.test.ts)
- [ ] Unit test: Navidrome library summary fetch (top 20 artists/genres, top 10 songs) (src/lib/services/__tests__/navidrome.test.ts)
- [ ] Unit test: Song resolution from suggestions with fallback for no matches (src/lib/services/__tests__/navidrome.test.ts)
- [ ] Unit test: Lidarr add request for missing songs (src/lib/services/__tests__/lidarr.test.ts – create if needed)
- [ ] E2E test: User inputs style, generates playlist, views display, adds to queue (tests/e2e/playlist-generation.spec.ts)
- [ ] E2E test: Handles missing song – prompts Lidarr add confirmation and queues request (tests/e2e/playlist-lidarr.spec.ts)
- [ ] E2E test: Error scenarios – timeout, no matches, verifies fallback UI (tests/e2e/playlist-errors.spec.ts)
- [ ] E2E test: Full flow from style input to queue add or Lidarr request (tests/e2e/playlist-generation.spec.ts)

## Dev Agent Record
### Agent Model Used
x-ai/grok-4-fast:free

### Debug Log References
N/A (documentation only)

### Completion Notes
- Feature enhances Story 3.2 display and 3.3 caching/privacy.
- Ensures recommendations are library-constrained for accuracy.
- Mobile-responsive UI via shadcn.
- Encrypted feedback extends existing pattern.

### File List
- docs/backlog.md (updated)
- docs/prd-epic-3.md (updated)
- docs/stories/epic-3.story-3.6.md (new)

### Change Log
- Added as enhancement to Epic 3 for interactive playlist requests.
- Prompt designed to limit to user's library via summary inclusion.

### Status
Documentation Complete - Ready for Implementation