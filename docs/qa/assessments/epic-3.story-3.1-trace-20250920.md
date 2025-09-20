# Requirements Traceability Matrix

## Story: epic-3-story-3.1 - Ollama API Integration

### Coverage Summary

- Total Requirements: 6
- Fully Covered: 0 (0%)
- Partially Covered: 0 (0%)
- Not Covered: 6 (100%)

### Requirement Mappings

#### AC1: Create service layer using TanStack Start's API routes for making API calls to Ollama

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Integration Test**: `services/ollama.integration.test.ts::apiCall`
  - Given: Ollama service configured and running locally
  - When: API route called with valid prompt
  - Then: Returns parsed recommendation response without errors

#### AC2: Implement model selection functionality with environment variables for configuration

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Unit Test**: `services/ollama.service.test.ts::selectModel`
  - Given: Environment variables set with model name
  - When: Model selection method invoked
  - Then: Correct model identifier is used in API payload

#### AC3: Handle API responses with standardized error handling patterns

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Unit Test**: `services/ollama.service.test.ts::handleResponse`
  - Given: Mock API response with success and error cases
  - When: Response handling function called
  - Then: Success returns parsed data; errors throw standardized exceptions

#### AC4: Implement error handling for model loading issues with service connection timeout specifications (5s for local services)

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Integration Test**: `services/ollama.integration.test.ts::modelLoadError`
  - Given: Ollama service unavailable or model not loaded
  - When: API call attempted with 5s timeout
  - Then: Timeout error handled gracefully with user-friendly message

#### AC5: Add retry mechanisms with exponential backoff for failed API calls

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Unit Test**: `services/ollama.service.test.ts::retryMechanism`
  - Given: Mock API failures (e.g., network error)
  - When: Retry logic invoked with exponential backoff
  - Then: Retries up to configured limit; succeeds on final attempt or fails appropriately

#### AC6: Implement caching for recommendations using Drizzle ORM with SQLite

**Coverage: NONE**

Given-When-Then Mappings:

No existing tests found. Proposed:

- **Integration Test**: `services/ollama.integration.test.ts::cacheRecommendations`
  - Given: Previous recommendation query in cache
  - When: Same query repeated
  - Then: Returns cached result without API call; cache invalidates on TTL

### Critical Gaps

1. **All Acceptance Criteria**
   - Gap: No tests implemented as story is planned
   - Risk: High - Potential integration failures with Ollama not validated
   - Action: Implement unit tests for service logic, integration tests for API interactions, and mock Ollama responses

2. **Database Caching (AC6)**
   - Gap: SQLite mentioned but project uses PostgreSQL; verify consistency
   - Risk: Medium - Potential data integrity issues if mismatched
   - Action: Update to PostgreSQL caching tests; add migration checks

3. **Timeout and Retry (AC4, AC5)**
   - Gap: No performance/resilience testing
   - Risk: High - Local service flakiness could break recommendations
   - Action: Add e2e tests simulating network delays

### Test Design Recommendations

Based on gaps identified, recommend:

1. Unit tests for Ollama service methods (model selection, response handling, retry logic)
2. Integration tests for API routes with mocked Ollama (using MSW or similar)
3. E2E tests for recommendation generation flow once implemented
4. Test data: Mock prompts, recommendation JSON; edge cases like invalid models, timeouts
5. Mock/stub strategies: Mock fetch for API calls; stub Drizzle for caching tests

### Risk Assessment

- **High Risk**: Requirements with no coverage (all ACs) - Critical for AI feature reliability
- **Medium Risk**: Inconsistencies like SQLite vs PostgreSQL
- **Low Risk**: N/A (pre-implementation)