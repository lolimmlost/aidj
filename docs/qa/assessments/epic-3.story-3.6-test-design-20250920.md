# Test Design: Story epic-3.story-3.6

Date: 2025-09-20
Designer: Quinn (Test Architect)

## Test Strategy Overview

- Total test scenarios: 24
- Unit tests: 8 (33%)
- Integration tests: 6 (25%)
- E2E tests: 10 (42%)
- Priority distribution: P0: 18, P1: 6, P2: 0

## Test Scenarios by Acceptance Criteria

### AC1: Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")

#### Scenarios

| ID                  | Level     | Priority | Test Description                          | Justification                          |
|---------------------|-----------|----------|-------------------------------------------|----------------------------------------|
| 3.6-E2E-001        | E2E       | P0       | User enters style in input field and submits | Critical user input journey; validates UI integration |
| 3.6-E2E-002        | E2E       | P0       | Input shows placeholder examples on load  | Ensures discoverability of feature     |
| 3.6-UNIT-001       | Unit      | P0       | Validate input sanitization for special chars | Pure UI logic isolation; prevents injection risks |

### AC2: Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context

#### Scenarios

| ID                  | Level       | Priority | Test Description                          | Justification                          |
|---------------------|-------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-001        | Integration | P0       | Fetch summary from Navidrome with valid library | Tests service API call and data transformation |
| 3.6-UNIT-002       | Unit        | P0       | Limit artists to top 20 and songs to top 10 | Business logic for summary aggregation |
| 3.6-E2E-003        | E2E         | P0       | Summary fetched during generate flow      | End-to-end data flow validation        |

### AC3: Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON {"playlist": [{"song": "Artist - Title", "explanation": "why it fits"}]}

#### Scenarios

| ID                  | Level       | Priority | Test Description                          | Justification                          |
|---------------------|-------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-002        | Integration | P0       | Build and send prompt to Ollama, parse JSON response | Service interaction with external API  |
| 3.6-UNIT-003       | Unit        | P0       | Construct prompt with summary and style   | Logic for prompt templating            |
| 3.6-UNIT-004       | Unit        | P0       | Validate JSON structure has exactly 10 items | Parsing and validation logic           |
| 3.6-E2E-004        | E2E         | P0       | Full generation from input to JSON output | Critical path for playlist creation    |

### AC4: For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library

#### Scenarios

| ID                  | Level       | Priority | Test Description                          | Justification                          |
|---------------------|-------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-003        | Integration | P0       | Search and resolve songs for all suggestions | Database/service query integration     |
| 3.6-UNIT-005       | Unit        | P0       | Match suggestion to library song by title/artist | Fuzzy matching logic                   |
| 3.6-E2E-005        | E2E         | P0       | Resolutions complete before display       | Ensures data readiness in user flow    |

### AC5: Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons

#### Scenarios

| ID                  | Level     | Priority | Test Description                          | Justification                          |
|---------------------|-----------|----------|-------------------------------------------|----------------------------------------|
| 3.6-E2E-006        | E2E       | P0       | Render playlist list with explanations    | User-facing display validation         |
| 3.6-E2E-007        | E2E       | P0       | Thumbs up/down feedback submission and storage | Interactive UI and localStorage integration |
| 3.6-UNIT-006       | Unit      | P0       | Encrypt/decrypt feedback data for localStorage | Security logic for privacy             |
| 3.6-E2E-008        | E2E       | P0       | Add-to-queue buttons functional for single song | Core interaction test                  |

### AC6: Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)

#### Scenarios

| ID                  | Level     | Priority | Test Description                          | Justification                          |
|---------------------|-----------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-007       | Unit      | P1       | Cache playlist by style hash in localStorage | Storage logic isolation                |
| 3.6-E2E-009        | E2E       | P1       | Load from cache on repeat style request   | User experience for repeated use       |
| 3.6-E2E-010        | E2E       | P1       | Privacy toggle clears all playlist cache  | Privacy feature validation             |
| 3.6-UNIT-008       | Unit      | P1       | Hash style input for cache key            | Utility function for deduplication     |

### AC7: Integrate with audio store: add entire playlist or individual songs to queue/play

#### Scenarios

| ID                  | Level     | Priority | Test Description                          | Justification                          |
|---------------------|-----------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-004        | Integration | P0       | Add full playlist to audio store queue    | State management integration           |
| 3.6-INT-005        | Integration | P0       | Add single song from playlist to queue    | Partial add functionality              |
| 3.6-E2E-011        | E2E       | P0       | Queue add triggers playback start         | End-to-end media flow                  |

### AC8: Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure

#### Scenarios

| ID                  | Level       | Priority | Test Description                          | Justification                          |
|---------------------|-------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-006        | Integration | P0       | Retry Ollama call up to 3 times on failure | Error recovery in service layer        |
| 3.6-UNIT-009       | Unit        | P0       | Enforce 5s timeout on Ollama request      | Timeout logic                          |
| 3.6-E2E-012        | E2E         | P0       | Display fallback UI for no matches/timeout | User error experience                  |

### AC9: If suggested song not in library, add to Lidarr download queue with user confirmation

#### Scenarios

| ID                  | Level       | Priority | Test Description                          | Justification                          |
|---------------------|-------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-INT-007        | Integration | P0       | Send missing song to Lidarr queue after confirmation | External service integration           |
| 3.6-E2E-013        | E2E         | P0       | Prompt user confirmation for Lidarr add   | User decision flow                     |

## Risk Coverage

- All scenarios mitigate risks from trace: high-risk uncovered ACs now have P0 tests; medium-risk partials extended with integration/E2E.

## Recommended Execution Order

1. P0 Unit tests (fail fast)
2. P0 Integration tests
3. P0 E2E tests
4. P1 tests in order
5. P2+ as time permits