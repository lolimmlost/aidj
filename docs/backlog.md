# Backlog - Post-Halloween MVP Status

## 🎯 POST-HALLOWEEN MVP STATUS - **UPDATED 2025-11-03**

### ✅ COMPLETED (2025-10-17)
**Story 3.6 - AI Playlist Generation REMEDIATION**
- Status: ✅ **COMPLETE - USER VALIDATED AND WORKING**
- Time spent: 4 hours total
- Points delivered: 3
- **FIXES APPLIED:**
  1. ✅ Library index uses song artist (not album artist) for compilation albums
  2. ✅ Ollama JSON parsing with markdown cleanup and truncation handling
  3. ✅ Fallback parser for partial/malformed JSON responses
  4. ✅ Pre-caching uses 3-strategy search matching validation logic
  5. ✅ Switched to qwen2.5:7b model for better JSON instruction following
- **RESULT:** 3-5 out of 5 recommendations now resolve and play successfully
- **Files modified:** library-index.ts, ollama.ts, dashboard/index.tsx, .gitignore

**Story 5.1 - Responsive Design Implementation**
- Status: ✅ **COMPLETE - QA GATE WAIVED - PRODUCTION READY**
- Completion Date: 2025-10-25
- Points delivered: 5
- **QA Review:** All 6 acceptance criteria met, comprehensive E2E tests, infrastructure testing deferred per gate waiver
- **Files:** Created mobile-nav component, responsive audio player, E2E test suites (mobile, tablet, resize, touch)

**Story 5.2 - Error Handling & Polish**
- Status: ✅ **COMPLETE - READY FOR QA REVIEW**
- Completion Date: 2025-10-25
- Points delivered: 2
- **Implementation:** All 5 critical acceptance criteria met (100% complete)
  1. ✅ Error boundaries for service failures (Ollama, Navidrome)
  2. ✅ Loading states for all async operations (skeleton screens)
  3. ✅ Retry mechanisms with user-friendly messages
  4. ✅ Smooth transitions (prefers-reduced-motion support)
  5. ✅ Accessibility improvements (ARIA labels, keyboard navigation)
- **Files:** Created ErrorBoundary, OllamaErrorBoundary, NavidromeErrorBoundary, Skeleton component
- **Testing:** Phase 6 (edge cases) and E2E tests deferred as optional polish

**Story 5.3 - User Preferences and Settings**
- Status: ✅ **COMPLETE - QA GATE CONCERNS (PRODUCTION READY)**
- Completion Date: 2025-10-17
- Points delivered: 3
- **QA Review:** All 6 acceptance criteria met, comprehensive Zustand store, Better Auth integration
- **Implementation:**
  1. ✅ User profile management interface with encrypted session storage
  2. ✅ Preference settings for recommendations using Drizzle ORM
  3. ✅ Playback settings with audio store integration
  4. ✅ Notification preferences with browser API
  5. ✅ Dashboard layout customization
  6. ✅ Secure preference storage (PostgreSQL + localStorage)
- **Files:** Created preferences API, Zustand store, settings UI (5 tabs), database schema
- **QA Concerns:** Minor test gaps, dashboard integration complete per QA fixes

---

## 🎯 CURRENT FOCUS - Production Readiness

**PRIORITY 1: URGENT Testing Gaps Story**
- Status: 🔵 **IN PROGRESS** (Gate: PASS_WITH_CONCERNS)
- Test Pass Rate: 71.0% (479/675 tests passing)
- Critical Path: Core music playback ✅, AI DJ ✅, Queue management ✅
- **Remaining Work:**
  - Phase 4 Technical Debt: DJ mixer functions (19 tests), Ollama env vars (21 tests)
  - Fix remaining 7 audio player DJ performance tests
  - Address 12 Navidrome test assertion mismatches
- **Target:** 90%+ test pass rate for production deployment
- **Timeline:** 5-7 days effort for Phase 4 cleanup

**Deferred Stories (Post-MVP):**
- Story 5.4: Search & Playback Visual Polish
- Story 5.5: Artist Page Navigation
- Epic 3 Stories: 3.9, 3.10, 3.11, 3.12 (Advanced AI features)
- Epic 4: Download Management (all stories)

---

## 🚫 DEFERRED TO POST-MVP
- **Epic 4: Download Management** (All stories deferred)
- **Story 5.3+:** Advanced UX features (themes, customization)
- **Advanced AI features:** Detailed feedback, caching, complex playlists

---

## COMPLETED EPICS
Epic 1: Foundation & Core Infrastructure - Completed ✅
Epic 2: Music Library Integration - Completed ✅

## 📊 PROJECT STATUS SUMMARY (Updated 2025-11-03)

### Completed Work
- **Epic 1:** Foundation & Core Infrastructure ✅
- **Epic 2:** Music Library Integration ✅
- **Epic 3:** AI Recommendations Engine (Stories 3.1, 3.2, 3.6, 3.8 complete)
- **Epic 5:** Unified User Experience (Stories 5.1, 5.2, 5.3 complete)

### Current Sprint
- **URGENT Testing Gaps Story:** In Progress (71% test pass rate, production-ready core features)

### Total Story Points Delivered: 31
- Epic 1: 24 points
- Epic 2: 21 points
- Epic 3: 13 points (partial)
- Epic 5: 10 points (5.1=5, 5.2=2, 5.3=3)
- Testing: 21 points (in progress)

### Halloween MVP Status
- **Original Target:** Halloween 2025
- **Current Status:** Core MVP features complete, in production readiness phase
- **Remaining:** Technical debt cleanup for 90%+ test coverage

---

## Story 1.1: Project Setup and Basic Structure
As a developer,
I want to set up the project with a monorepo structure containing frontend and backend components,
so that I can begin implementing the application features.

### Acceptance Criteria
- [x] 1. Create project repository with appropriate directory structure
- [x] 2. Set up package.json with project metadata and dependencies
- [x] 3. Configure ESLint and Prettier for code quality standards
- [x] 4. Set up basic Git configuration with initial commit
- [x] 5. Create README with project description and setup instructions

Points: 5

## Story 1.2: User Authentication System
As a user,
I want to securely log in to the application,
so that my preferences and settings are protected.

### Acceptance Criteria
- [x] 1. Implement user registration functionality with secure password storage
- [x] 2. Create login interface with username and password fields
- [x] 3. Implement session management with secure tokens
- [x] 4. Add logout functionality
- [x] 5. Create protected routes that require authentication
- [x] 6. Implement proper error handling for authentication failures

Points: 5

## Story 1.3: Service Configuration Interface
As a user,
I want to configure connections to my local Ollama, Navidrome, and Lidarr services,
so that the application can communicate with these services.

### Acceptance Criteria
- [x] 1. Create configuration screen with fields for service URLs and credentials
- [x] 2. Implement form validation for configuration inputs
- [x] 3. Store configuration securely in local storage or database
- [x] 4. Provide test connection functionality for each service
- [x] 5. Display connection status indicators for each service
- [x] 6. Implement proper error handling for configuration issues

Points: 5

## Story 1.4: Local Development Environment Setup
As a developer,
I want a reproducible local dev environment (containers, scripts) so that new contributors can start quickly.

### Acceptance Criteria
- [x] 1. Docker/compose configuration for frontend and backend
- [x] 2. Local environment variables documented and loaded securely
- [x] 3. npm/yarn install and startup scripts work out-of-the-box
- [x] 4. Developer README includes setup and run instructions
- [x] 5. Linting and formatting run on pre-commit or CI

Points: 3

## Story 1.5: Basic CI/CD Pipeline
As a development team, we want automated builds and basic tests on push to main, so that quality gates are enforced.

### Acceptance Criteria
- [x] 1. Set up GitHub Actions workflow for build, lint, and unit tests on push/PR to main
- [x] 2. Cache pnpm dependencies to speed up builds
- [x] 3. Generate reports and artifacts (e.g., coverage reports) accessible from CI
- [x] 4. Document CI/CD workflow in .github/workflows/README.md and update main README.md
- [x] 5. Include secret scanning and security checks (e.g., for Story 1.6 checklist items 3,5,6)

Points: 3

## Story 1.6: Secrets Management & Security Baseline
As a security-conscious team, we want a baseline for secrets management to protect credentials and API keys.

### Acceptance Criteria
- [x] 1. Secrets stored securely (env vars, vault, or encrypted storage)
- [x] 2. Sensitive data redacted from logs and error messages
- [x] 3. Create baseline security checklist and enforce in CI

### Completion Status
- [x] Completed: Environment variables are used for sensitive data (e.g., service URLs, API keys) via config.ts and .env files. Credentials are not hardcoded.
- [x] Completed: Logging uses console.log without exposing secrets; no sensitive data is logged in current implementation.
- [x] Completed: Basic security checklist created and enforced in CI where applicable.

### Security Checklist
1. [x] Use .env files for secrets, excluded from git via .gitignore
2. [x] Validate environment variables at runtime
3. [x] Implement secret scanning in CI (e.g., GitHub Secret Scanning)
4. [x] No secrets in client-side code
5. [x] Add helmet.js for security headers (if applicable)
6. [x] Rate limiting on API routes

Points: 3

## Story 1.7: Testing Framework Integration
As a development team,
I want comprehensive testing setup for unit, integration, and E2E tests,
so that we can ensure reliability across auth, API, and UI flows.

### Acceptance Criteria
- [x] 1. Add Vitest/Jest for unit and integration tests with setup in package.json and vitest.config.ts
- [x] 2. Create tests for auth flows (login/register), Navidrome API calls, and library browsing/playback
- [x] 3. Integrate E2E tests using Playwright or Cypress for key user journeys (e.g., config → library → play)
- [x] 4. Run tests in CI/CD pipeline (Story 1.5) with coverage thresholds (>80%)
- [x] 5. Update docs/testing-framework-integration.md with setup instructions and best practices

### Completion Status
- [x] Completed: Vitest configured with unit tests for auth and Navidrome services
- [x] Completed: Component tests for library browsing components (artists, search)
- [x] Completed: Playwright E2E testing setup with user journey validation
- [x] Completed: CI/CD pipeline updated to run unit and E2E tests with 80% coverage threshold
- [x] Completed: Comprehensive testing documentation created

**Story 1.7 is complete and meets all acceptance criteria.**

Points: 5

Epic 2: Music Library Integration - Completed

## Story 2.1: Navidrome API Integration
As a developer,
I want to implement API integration with Navidrome,
so that the application can retrieve music library data.

### Acceptance Criteria
- [x] 1. Implement authentication with Navidrome API
- [x] 2. Create service layer for making API calls to Navidrome
- [x] 3. Handle token refresh for long sessions
- [x] 4. Implement error handling for API failures
- [x] 5. Create data models for artists, albums, and songs
- [x] 6. Implement pagination for large music collections

Points: 5

## Story 2.2: Music Library Browser
As a user,
I want to browse my music library by artists, albums, and songs,
so that I can easily find music to listen to.

### Acceptance Criteria
- [x] 1. Create artist listing view with alphabetical sorting
- [x] 2. Implement album grid view for each artist
- [x] 3. Create song listing view for each album
- [x] 4. Implement search functionality across the entire library
- [x] 5. Add filtering options (genre, year, etc.)
- [x] 6. Display album artwork and metadata

Points: 5

## Story 2.3: Music Player Implementation
As a user,
I want to play music directly in the browser,
so that I can listen to my music collection without leaving the application.

### Acceptance Criteria
- [x] 1. Implement audio player component with play/pause controls
- [x] 2. Add progress bar with seeking functionality
- [x] 3. Implement volume control
- [x] 4. Create playlist functionality
- [x] 5. Display current track information
- [x] 6. Handle streaming from Navidrome with proper buffering

Points: 5

## Story 2.4: Navidrome Data Caching Layer
As a developer,
I want a caching layer to reduce repeated API calls to Navidrome, improving performance.

### Acceptance Criteria
- [x] 1. Implement in-memory or local cache for common queries
- [x] 2. Invalidate cache on data changes or time-based TTL
- [x] 3. Ensure cache coherence with Navidrome API
- [x] 4. Document caching strategy in README

Points: 3

## Story 2.5: Library UI Pagination & Performance Enhancements
As a user,
I want smooth pagination and fast navigation through large libraries.

### Acceptance Criteria
- [x] 1. Implement efficient pagination with server-side or lazy loading
- [x] 2. Optimize rendering for large lists
- [x] 3. Provide loading placeholders and skeletons

Points: 5

Epic 3: AI Recommendations Engine

## Story 3.1: Ollama API Integration
As a developer,
I want to implement API integration with Ollama,
so that the application can generate music recommendations.

### Acceptance Criteria
1. [x] Create service layer for making API calls to Ollama
2. [x] Implement model selection functionality
3. [x] Handle API responses and parse recommendation results
4. [x] Implement error handling for model loading issues
5. [x] Add retry mechanisms for failed API calls
6. [x] Implement caching for recommendations to reduce API calls

Points: 5

## Story 3.2: Recommendation Display and Interaction
As a user,
I want to see AI-generated music recommendations, so that I can discover new music based on my preferences.

### Acceptance Criteria
1. [x] Create recommendation display section on the main dashboard
2. [x] Implement different recommendation types (similar artists, mood-based, etc.)
3. [x] Allow users to provide feedback on recommendations (thumbs up/down)
4. [x] Create detailed recommendation view with explanations
5. [x] Implement functionality to add recommended songs to play queue
6. [x] Display recommendation generation timestamp

Points: 5

## Story 3.3: Recommendation Caching & Privacy Controls
As a user,
I want local processing with privacy-preserving settings and cached results for faster experiences.

### Acceptance Criteria
1. Ensure recommendations are generated and stored locally when possible
2. Provide user controls to clear cache and manage privacy preferences
3. Respect user data retention policies in UI

Points: 3

## Story 3.4: Explainable Recommendations UI
As a user,
I want explanations for why a song is recommended.

### Acceptance Criteria
1. Show concise explanation per recommendation
2. Allow user to view more details or dismiss recommendations

Points: 3

## Story 3.5: User Feedback Analytics for Recommendations
As a product team,
We want to analyze user feedback to improve models.

### Acceptance Criteria
1. Track thumbs up/down and their impact on recommendations
2. Provide dashboard view summarizing feedback signals
3. Integrate with analytics/telemetry (privacy-compliant)

Points: 5

## 🚨 Story 3.6: Style-Based Playlist Generation (MVP Simplified) - **IN REMEDIATION**
As a user,
I want to request and generate themed playlists (e.g., Halloween, Christmas, rock) using my existing Navidrome library,
so that I can discover and play music matching specific styles from my collection.

### Acceptance Criteria (MVP Simplified) - **PARTIALLY WORKING**
1. [x] Add input field in dashboard for user to specify playlist style/theme (text input with examples like "Halloween", "rock", "party")
2. [x] Fetch library summary (top 15 artists, top 10 songs) via Navidrome service for enhanced context
3. [x] Generate playlist using Ollama: prompt includes library summary and style, returns 5 suggestions as simple JSON
4. [~] **BROKEN:** For each suggestion, search Navidrome to resolve actual Song objects from library
   - **Issue:** Ollama returns songs NOT in user's library, search fails to find matches
   - **Impact:** 0-1 out of 5 songs actually playable
5. [x] Display generated playlist in dashboard with basic explanations and add-to-queue buttons
6. [~] **PARTIAL:** Integrate with audio store: add entire playlist or individual songs to queue/play
   - **Issue:** Only works for the 0-1 songs that resolve, rest show "Not in library"
7. [~] **PARTIAL:** Handle errors gracefully: timeout (10s), retry on Ollama failure, fallback message if no matches
   - **Issues:** Timeout actually 5s (not 10s), no retry for song resolution failures

### **Critical Issues Blocking Production:**
- 🔴 **Ollama ignores library context** - suggests random popular songs, not user's actual collection
- 🔴 **Song resolution fails** - "Artist - Title" format not matching Navidrome search expectations
- 🔴 **Timeout mismatch** - Code uses 5s, docs say 10s, causes premature failures
- 🔴 **Poor UX** - 8-10s generation with no progress indicator, users think it's broken
- 🔴 **Rate limiting too aggressive** - 10 requests/min for local Ollama is artificially low

### **What Actually Works:**
- ✅ UI components (input, buttons, display cards)
- ✅ Caching and debouncing
- ✅ API endpoint wired up
- ✅ Error messages display correctly
- ⚠️ Pre-warming cache (works but caches wrong songs)

### **Production Enhancements - Reality Check:**
- ⚠️ Persistent song caching - EXISTS but caches unplayable songs
- ❌ Rate limiting (60 requests/minute) - ACTUALLY 10/min, not 60/min
- ⚠️ Pre-warming cache - EXISTS but pre-warms songs not in library
- ❌ Enhanced AI prompts - EXISTS but Ollama ignores constraints
- ⚠️ Comprehensive logging - console.log only, not structured
- ❌ 10s timeouts - ACTUALLY 5s in code
- ✅ Debounced input - WORKS
- ✅ Smart cache coordination - WORKS

### **Remediation Plan:**
See [story-3.6-gap-analysis-remediation.md](story-3.6-gap-analysis-remediation.md) for detailed fix plan.

**Estimated Fix Time:** 2.5 hours (Priority 1 + 2 tasks)

### Deferred Features (Post-MVP)
- Advanced feedback system (thumbs up/down with localStorage)
- Detailed explanations and metadata
- Lidarr integration for missing songs
- Complex playlist generation (10+ songs, multiple styles)

Points: 3 (reduced from 5) - **🚨 BLOCKED - NEEDS REMEDIATION BEFORE HALLOWEEN MVP**

## Bug 3.7: Navidrome Search Endpoint Fix
As a developer,
I want to fix the library search function to use the correct Subsonic API endpoint,
so that playlist resolution and recommendations work properly.

### Acceptance Criteria
- [x] Update src/lib/services/navidrome.ts search() to use /rest/search.view?query=...&songCount=50 instead of /api/song?fullText=
- [x] Parse 'song' array from response for matching Song objects
- [x] Add unit test for search with mock data
- [x] Validate E2E: Generate playlist and confirm songs resolve without fallback to invalid defaults

Points: 2

### Completion Status
- [x] Completed: Search function already uses /rest/search.view endpoint with proper song array parsing
- [x] Completed: Unit tests exist for Subsonic search endpoint with mock data
- [x] Completed: E2E tests validate playlist generation and song resolution

## Story 3.8: Search Feature Reliability Fix
As a user,
I want the search feature to work reliably,
so that I can consistently find music in my library.

### Acceptance Criteria
- [x] 1. Search returns results for valid queries
- [x] 2. Search handles errors gracefully
- [x] 3. Search works across different query types (albums, artists, songs)
- [x] 4. Existing functionality continues to work unchanged
- [x] 5. Search follows existing auth and API patterns
- [x] 6. Integration with audio player maintains current behavior
- [x] 7. Search is covered by appropriate tests
- [x] 8. No regression in existing functionality verified

Points: 3

### Completion Status
- [x] Completed: Search implementation in navidrome.ts includes prioritization (albums > artists > songs), comprehensive error handling, and follows auth patterns. Songs include streaming URLs for audio player integration. Extensive unit tests cover all scenarios including error cases. No regressions detected in existing functionality.

Epic 4: Download Management (DEFERRED TO POST-MVP)

## Story 4.1: Lidarr API Integration (DEFERRED)
As a developer,
I want to implement API integration with Lidarr,
so that the application can search for and request music downloads.

### Acceptance Criteria (Deferred to Post-MVP)
1. Create service layer for making API calls to Lidarr
2. Implement API key authentication
3. Handle search functionality with query parameters
4. Implement album/artist lookup capabilities
5. Handle API responses and parse search results
6. Implement error handling for API failures

Points: 5 (deferred)

## Story 4.2: Download Request Interface (DEFERRED)
As a user,
I want to search for and request music downloads, so that I can expand my music collection.

### Acceptance Criteria (Deferred to Post-MVP)
1. Create search interface for finding music to download
2. Display search results with album artwork and metadata
3. Implement download request functionality
4. Show confirmation when download request is submitted
5. Handle duplicate request detection
6. Provide feedback on request submission success or failure

Points: 3 (deferred)

## Story 4.3: Download Status Monitoring (DEFERRED)
As a user,
I want to monitor the status of my download requests, so that I know when new music will be available.

### Acceptance Criteria (Deferred to Post-MVP)
1. Create download status view showing pending and completed downloads
2. Display progress information for active downloads
3. Show estimated completion times when available
4. Implement automatic status updates
5. Provide notifications when downloads complete
6. Allow users to cancel pending download requests

Points: 3 (deferred)

## Story 4.4: Mock Download Interface Prototype
As a UX designer/developer,
I want a mock download interface to test UX flows early,
so that we can validate user interactions before full Lidarr integration.

### Acceptance Criteria
- [x] 1. Create placeholder search and request UI using static/mock data
- [x] 2. Simulate request submission and status updates (pending, in progress, completed)
- [x] 3. Implement mock notifications and error states
- [x] 4. Test end-to-end UX flows for download management
- [x] 5. Document findings and refinements needed for real integration
- [x] 6. Ensure mock aligns with final design system (CSS variables, responsive)

### Completion Status
- [x] Completed: Mock UI implemented in src/routes/downloads/index.tsx with static data simulation.

Points: 3

## Story 4.5: Download Notifications
As a user,
I want to receive timely notifications about download events.

### Acceptance Criteria
1. In-app and optional push/email notifications for status changes
2. Configurable notification preferences
3. Notification history with timestamps

Points: 3

## Story 4.6: Download History Import/Export
As a user,
I want to export/import my download history.

### Acceptance Criteria
1. Export format (CSV/JSON) with metadata
2. Import support with conflict handling
3. Persist history across sessions

Points: 3

Epic 5: Unified User Experience (HALLOWEEN MVP PRIORITY)

**Critical Path for Halloween**: Responsive design is now BLOCKER for MVP completion.

## Story 5.1: Responsive Design Implementation (PRIORITY 1 - HALLOWEEN MVP)
As a user,
I want to use the application on both desktop and mobile devices,
so that I can manage my music collection from anywhere.

### Acceptance Criteria (MVP Critical)
1. [ ] Implement responsive layout that adapts to different screen sizes (mobile, tablet, desktop)
2. [ ] Add mobile hamburger menu for navigation on small screens
3. [ ] Ensure all functionality is accessible on mobile (library, playlist generation, playback)
4. [ ] Optimize touch interactions for mobile devices (larger tap targets, swipe gestures)
5. [ ] Test core flows on mobile: login → dashboard → generate playlist → play music
6. [ ] Add basic mobile performance optimizations (image sizing, lazy loading)

Points: 3 (increased priority)

## Story 5.2: Error Handling & Polish (PRIORITY 2 - HALLOWEEN MVP)
As a user,
I want the application to handle errors gracefully and feel polished,
so that I have confidence using the AI features.

### Acceptance Criteria (MVP Critical)
1. [ ] Add error boundaries for service failures (Ollama, Navidrome)
2. [ ] Implement loading states for all async operations
3. [ ] Add retry mechanisms with user-friendly messages
4. [ ] Ensure transitions don't feel jarring
5. [ ] Basic accessibility improvements (ARIA labels, keyboard navigation)

Points: 2

## Story 5.2: UI Polish and Consistency
As a user,
I want a visually appealing and consistent interface,
so that I enjoy using the application.

### Acceptance Criteria
1. Implement consistent color scheme and typography
2. Create cohesive component design system
3. Add smooth transitions and animations
4. Implement proper loading states and placeholders
5. Ensure accessibility standards are met
6. Conduct usability testing and implement improvements

Points: 3

## Story 5.3: User Preferences and Settings
As a user,
I want to customize the application to my preferences,
so that I can have a personalized experience.

### Acceptance Criteria
1. Create user profile management interface
2. Implement preference settings for recommendation types
3. Add playback settings (default quality, crossfade, etc.)
4. Implement notification preferences
5. Allow customization of dashboard layout
6. Store user preferences securely

Points: 3

## Story 5.4: Accessibility Improvements
As a user with accessibility needs,
I want the UI to be accessible (a11y) across features.

### Acceptance Criteria
1. Keyboard navigation support for all primary flows
2. Screen reader friendly labels and ARIA roles
3. Color contrast and focus states meet standards
4. Accessible error messaging and help text

Points: 2

## Story 5.5: Theming & Customization
As a user,
I want to customize the look and feel (theme, font, spacing) to suit my preferences.

### Acceptance Criteria
1. Support light/dark themes and high-contrast options
2. Persist theme selections across sessions
3. Provide simple UI for theme customization

Points: 2

## Story 5.6: Dashboard Layout Customization
As a user,
I want to personalize the dashboard layout (which widgets appear, their order, and sizes).

### Acceptance Criteria
1. Drag-and-drop customization of panels
2. Persist layout configuration
3. Restore defaults and shareable layouts

Points: 2

## Story 5.7: Privacy-Compliant Analytics
As a product team,
I want basic usage analytics across epics (e.g., feature adoption, error rates),
so that we can inform iterations while respecting user privacy.

### Acceptance Criteria
1. Implement local-only analytics (no external services) using localStorage or DB for opt-in metrics
2. Track non-PII events: e.g., login success, library searches, recommendation interactions
3. Provide opt-in toggle in user settings (Story 5.3) with clear privacy policy
4. Aggregate data in dashboard view for team review (no individual tracking)
5. Ensure compliance with local processing; document in architecture.md

Points: 3

References:
- docs/prd-epic-1.md
- docs/prd-epic-2.md
- docs/prd-epic-3.md
- docs/prd-epic-4.md
- docs/prd-epic-5.md

End of backlog