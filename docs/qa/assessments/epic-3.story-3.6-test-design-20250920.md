# Test Design: Story epic-3.story-3.6

Date: 2025-09-20
Designer: Quinn (Test Architect)

## Test Strategy Overview

- Total test scenarios: 25
- Unit tests: 10 (40%)
- Integration tests: 8 (32%)
- E2E tests: 7 (28%)
- Priority distribution: P0: 12, P1: 9, P2: 4

## Test Scenarios by Acceptance Criteria

### AC1: Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "holiday")

#### Scenarios

| ID                  | Level      | Priority | Test                                      | Justification                          |
|---------------------|------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-001       | Unit       | P1       | Renders text input with placeholder examples | Component logic isolation              |
| 3.6-UNIT-002       | Unit       | P1       | Handles input value changes               | State management in component          |
| 3.6-E2E-001        | E2E        | P1       | User types style and clicks generate      | User journey validation                |

### AC2: Fetch library summary (top 20 artists with genres, top 10 songs) via Navidrome service for prompt context

#### Scenarios

| ID                  | Level         | Priority | Test                                      | Justification                          |
|---------------------|---------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-003       | Unit          | P0       | Returns top 20 artists with genres         | Service logic for pagination/sorting   |
| 3.6-UNIT-004       | Unit          | P0       | Returns top 10 songs from library          | Query construction and filtering       |
| 3.6-INT-001        | Integration   | P0       | Fetches summary with valid auth token      | API + Navidrome mock interaction       |
| 3.6-INT-002        | Integration   | P1       | Handles token expiry during fetch          | Error path with refresh                |

### AC3: Generate playlist using Ollama: prompt includes library summary and style, returns 10 suggestions as JSON

#### Scenarios

| ID                  | Level         | Priority | Test                                      | Justification                          |
|---------------------|---------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-005       | Unit          | P0       | Builds prompt with summary and style       | Prompt engineering logic               |
| 3.6-UNIT-006       | Unit          | P0       | Parses valid JSON response to playlist     | Response handling and validation       |
| 3.6-INT-003        | Integration   | P0       | Calls Ollama API with correct body         | Service + mock API                     |
| 3.6-INT-004        | Integration   | P1       | Retries on transient failure               | Resilience testing                     |

### AC4: For each suggestion, search Navidrome to resolve actual Song objects (ID, URL) from library

#### Scenarios

| ID                  | Level         | Priority | Test                                      | Justification                          |
|---------------------|---------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-007       | Unit          | P0       | Resolves song from suggestion string       | Search query building                  |
| 3.6-UNIT-008       | Unit          | P0       | Handles no match with fallback            | Error path logic                       |
| 3.6-INT-005        | Integration   | P0       | Searches and maps 10 suggestions to Songs  | End-to-end resolution flow             |
| 3.6-E2E-002        | E2E           | P0       | Full resolution in API response            | Journey with mocks                     |

### AC5: Display generated playlist in dashboard with explanations, feedback (thumbs up/down, encrypted localStorage), and add-to-queue buttons

#### Scenarios

| ID                  | Level      | Priority | Test                                      | Justification                          |
|---------------------|------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-009       | Unit       | P1       | Renders playlist list with explanations    | Component rendering                    |
| 3.6-UNIT-010       | Unit       | P1       | Toggles feedback buttons and encrypts      | localStorage interaction               |
| 3.6-E2E-003        | E2E        | P1       | Displays playlist after generation         | UI update flow                         |
| 3.6-E2E-004        | E2E        | P1       | Clicks feedback and verifies storage       | User interaction                       |

### AC6: Implement caching for generated playlists (localStorage, with privacy toggle to clear cache)

#### Scenarios

| ID                  | Level      | Priority | Test                                      | Justification                          |
|---------------------|------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-011       | Unit       | P2       | Caches playlist by style hash              | Storage logic                          |
| 3.6-UNIT-012       | Unit       | P2       | Retrieves and loads cached playlist        | Retrieval and validation               |
| 3.6-INT-006        | Integration| P2       | Clears cache on privacy toggle             | Toggle + storage clear                 |
| 3.6-E2E-005        | E2E        | P2       | Generates, caches, reloads from cache      | Full caching flow                      |

### AC7: Integrate with audio store: add entire playlist or individual songs to queue/play

#### Scenarios

| ID                  | Level         | Priority | Test                                      | Justification                          |
|---------------------|---------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-013       | Unit          | P0       | Adds single song to queue                  | Store action logic                     |
| 3.6-UNIT-014       | Unit          | P0       | Adds full playlist to queue                | Bulk add and index management          |
| 3.6-INT-007        | Integration   | P0       | Button click dispatches to audio store     | UI + store interaction                 |
| 3.6-E2E-006        | E2E           | P0       | Adds playlist and verifies player update   | End-to-end queueing                    |

### AC8: Handle errors: fallback if no matching songs, timeout (5s), retry on Ollama failure

#### Scenarios

| ID                  | Level         | Priority | Test                                      | Justification                          |
|---------------------|---------------|----------|-------------------------------------------|----------------------------------------|
| 3.6-UNIT-015       | Unit          | P1       | Aborts after 5s timeout                   | Timeout logic                          |
| 3.6-UNIT-016       | Unit          | P1       | Retries 3 times on failure                | Retry mechanism                        |
| 3.6-INT-008        | Integration   | P1       | Fallback UI on no matches                 | Error path in API/UI                   |
| 3.6-E2E-007        | E2E           | P1       | Simulates failure and shows fallback      | User-facing error handling             |

## Risk Coverage

- TECH-001 (Ollama failure): Covered by AC8 scenarios (INT-004, UNIT-015/016)
- TECH-002 (Token expiry): AC2 INT-002
- PERF-001 (Slow fetch): AC2 UNIT-003 with perf assertions
- BUS-001 (AI mismatch): AC3/4 INT-003/005 (match rate >80%)
- All high risks addressed; low risks via standard scenarios

## Recommended Execution Order

1. P0 Unit tests (services/prompt/resolution/queue – fail fast on logic)
2. P0 Integration tests (API flows with mocks)
3. P0 E2E tests (generation to queue)
4. P1 tests (UI/errors)
5. P2 tests (caching)

## Quality Checklist

- [x] Every AC has test coverage
- [x] Test levels appropriate (no over-testing)
- [x] No duplicates
- [x] Priorities align with risk (P0 for core/external)
- [x] IDs follow convention
- [x] Scenarios atomic