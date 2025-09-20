# Music Recommendation and Download Interface Product Requirements Document (PRD) - Epic 3: AI Recommendations Engine

## Epic Goal

Implement integration with Ollama to provide AI-powered music recommendations based on user preferences and listening history. This epic will deliver personalized music discovery capabilities while maintaining privacy through local processing.

**MVP Prioritization**: Focus initially on Stories 3.1 and 3.2 for core integration and display. Advanced features (3.3-3.5) deferred until MVP validation.

## Story 3.1: Ollama API Integration

As a developer,
I want to implement API integration with Ollama,
so that the application can generate music recommendations.

### Acceptance Criteria

1. Create service layer using TanStack Start's API routes for making API calls to Ollama
2. Implement model selection functionality with environment variables for configuration
3. Handle API responses with standardized error handling patterns
4. Implement error handling for model loading issues with service connection timeout specifications (5s for local services)
5. Add retry mechanisms with exponential backoff for failed API calls
6. Implement caching for recommendations using Drizzle ORM with SQLite

### Tasks

- [ ] Implement unit test for parsing successful API responses (AC3)
- [ ] Implement unit test for handling malformed API responses with standardized error patterns (AC3)
- [ ] Implement unit test for retry mechanism with exponential backoff on failed API calls (AC5)
- [ ] Implement unit test for successful retry after initial failure (AC5)

- [ ] Implement integration test for valid API call to Ollama via route (AC1)
- [ ] Implement integration test for end-to-end recommendation request via API (AC1)
- [ ] Implement integration test for timeout on unavailable Ollama service (5s) (AC4)
- [ ] Implement integration test for graceful error handling on model load failure (AC4)

- [ ] Implement E2E test for end-to-end recommendation request via API route (AC1)

## Story 3.2: Recommendation Display and Interaction

As a user,
I want to see AI-generated music recommendations,
so that I can discover new music based on my preferences.

### Acceptance Criteria

1. Create recommendation display section on the main dashboard using CSS variables for theme implementation
2. Implement different recommendation types (similar artists, mood-based, etc.) with mobile-specific performance optimizations
3. Allow users to provide feedback on recommendations (thumbs up/down) with encrypted storage
4. Create detailed recommendation view with explanations using file-based routing
5. Implement functionality to add recommended songs to play queue with lazy loading
6. Display recommendation generation timestamp with service connection timeout specifications

## Story 3.6: Style-Based Playlist Generation

As a user,
I want to request and generate themed playlists (e.g., Halloween, Christmas, rave dubstep, rock) using my existing Navidrome library,
so that I can discover and play music matching specific styles or occasions from my collection.

### Acceptance Criteria

1. Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")
2. Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context
3. Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON {"playlist": [{"song": "Artist - Title", "explanation": "why it fits the style"}]}
4. For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library
5. Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons
6. Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)
7. Integrate with audio store: add entire playlist or individual songs to queue/play
8. Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure
9. If suggested song not in library, add to Lidarr download queue with user confirmation (integrates with Epic 4 Lidarr API; dependency on Story 4.1)

### Tasks

- Design and implement Ollama prompt: "My library: artists [list with genres], songs [examples]. Create 10-song playlist for '[style]' using only my library. JSON: {\"playlist\": [{\"song\": \"Artist - Title\", \"explanation\": \"reason\"}]}"
- Update recommendations API to /playlist endpoint: fetch summary, build prompt, call Ollama, resolve songs via search
- Add UI: text input + generate button in dashboard recommendations section
- Cache: store playlist by style hash in localStorage, load if exists, privacy button to clear
- Display: list with links to details, queue integration
- Tests: unit for prompt/resolution, E2E for input-to-playback flow
- Unit test: Lidarr add request for missing songs (src/lib/services/__tests__/lidarr.test.ts – create if needed)
