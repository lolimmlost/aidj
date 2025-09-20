# Risk Profile: Story epic-3.story-3.6

Date: 2025-09-20
Reviewer: Quinn (Test Architect)

## Executive Summary

- Total Risks Identified: 12
- Critical Risks: 1
- High Risks: 3
- Risk Score: 42/100 (moderate risk – primarily from external dependencies; mitigable with robust error handling and mocks)

## Critical Risks Requiring Immediate Attention

### 1. TECH-001: Ollama API Unavailability or Model Loading Failure

**Score: 9 (Critical)**
**Probability**: High (3) – Local Ollama may not be running or model unavailable (common in dev setups)
**Impact**: High (3) – Blocks entire playlist generation, poor UX with no fallback
**Mitigation**:

- Preventive: Add health check endpoint for Ollama before generation; default to cached/manual playlists if down
- Detective: Timeout (5s) with user-friendly error ("AI service unavailable – try again or use search")
- Corrective: Retry logic (3 attempts, exponential backoff) already in service
  **Testing Focus**: Integration tests mocking Ollama failures; E2E with service down simulation
**Residual Risk**: Medium – Zero-day issues possible, but retries reduce to low

## Risk Distribution

### By Category

- Technical: 5 risks (1 critical)
- Security: 2 risks (0 critical)
- Performance: 2 risks (1 high)
- Data: 1 risk (0 critical)
- Business: 1 risk (1 high)
- Operational: 1 risk (0 critical)

### By Component

- Services (Navidrome/Ollama): 6 risks
- Frontend (Dashboard/UI): 3 risks
- Storage (localStorage): 2 risks
- Stores (Audio): 1 risk

## Detailed Risk Register

| Risk ID    | Description                                      | Probability | Impact | Score | Priority | Category |
|------------|--------------------------------------------------|-------------|--------|-------|----------|----------|
| TECH-001  | Ollama API unavailability/model failure          | High (3)   | High (3) | 9    | Critical | TECH    |
| TECH-002  | Navidrome auth token expiry during library fetch | Medium (2) | High (3) | 6    | High     | TECH    |
| PERF-001  | Slow library summary fetch for large collections | Medium (2) | High (3) | 6    | High     | PERF    |
| BUS-001   | AI suggestions not matching library (hallucinations) | High (3) | Medium (2) | 6 | High     | BUS     |
| TECH-003  | Song resolution search fails for ambiguous titles | Medium (2) | Medium (2) | 4 | Medium   | TECH    |
| PERF-002  | Ollama prompt too long (large library summary)   | Low (1)    | High (3) | 3    | Low      | PERF    |
| SEC-001   | localStorage caching exposes playlist data       | Low (1)    | Medium (2) | 2 | Low      | SEC     |
| TECH-004  | Audio store queue overflow from large playlists  | Low (1)    | Medium (2) | 2 | Low      | TECH    |
| SEC-002   | Feedback encryption key exposure in client code  | Low (1)    | High (3) | 3    | Low      | SEC     |
| DATA-001  | Inconsistent song data between suggestion and resolution | Low (1) | Medium (2) | 2 | Low      | DATA    |
| OPS-001   | Error handling fallback not user-friendly        | Medium (2) | Low (1)  | 2    | Low      | OPS     |
| TECH-005  | Prompt engineering leads to invalid JSON output  | Medium (2) | Low (1)  | 2    | Low      | TECH    |

## Risk-Based Testing Strategy

### Priority 1: Critical Risk Tests

- **TECH-001**: Chaos testing – Mock Ollama down, verify retries/timeout/fallback UI; E2E with service toggle
- Required test types: Integration (API mocks), E2E (full flow with failures)
- Test data: Mock library summary, invalid Ollama responses

### Priority 2: High Risk Tests

- **TECH-002**: Token expiry simulation in Navidrome mocks; test auto-refresh
- **PERF-001**: Load test library fetch with 1000+ artists; measure <2s threshold
- **BUS-001**: Validate suggestions against library (post-resolution match rate >80%)
- Edge case coverage: Empty library, no matches for style
- Test types: Performance (k6 for fetches), Unit (prompt validation)

### Priority 3: Medium/Low Risk Tests

- Standard functional: UI input, display, queue add
- Regression: Existing recommendations not broken by new endpoint
- Test types: Unit (components/services), Integration (store/UI)

## Risk Acceptance Criteria

### Must Fix Before Production

- All critical risks (TECH-001): Implement health checks and fallbacks
- High risks affecting core flow (TECH-002, PERF-001, BUS-001): Ensure <5% failure rate in tests

### Can Deploy with Mitigation

- Medium risks (TECH-003): Monitor search accuracy in prod analytics
- Low risks (SEC-001/002, etc.): Add logging for cache access, key rotation

### Accepted Risks

- None at this stage; review post-implementation

## Monitoring Requirements

Post-deployment monitoring for:

- API error rates (Ollama/Navidrome calls >5% → alert)
- Performance: Library fetch time >3s, playlist generation latency
- Security: localStorage access patterns (anomalies)
- Business: User feedback on playlist relevance (thumbs down >20% → review prompt)

## Risk Review Triggers

Review and update risk profile when:

- Ollama/Navidrome API changes
- Library size exceeds 10k items (perf re-assess)
- New privacy regs (SEC updates)
- User complaints on suggestion accuracy