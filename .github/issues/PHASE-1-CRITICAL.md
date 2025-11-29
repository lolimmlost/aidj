# Phase 1: Critical Production Readiness Issues

**Timeline:** 4-6 weeks
**Priority:** CRITICAL (P0)
**Status:** NOT YET CREATED - Manual creation required
**Goal:** Achieve production-ready state with 90%+ test coverage and all critical features stable

---

## ⚠️ IMPORTANT

Phase 1 issues must be created **MANUALLY** and prioritized **IMMEDIATELY**. These are production blockers and should be tracked separately from the automated roadmap issues.

**Recommended approach:**
1. Create these issues with `priority:critical` label
2. Add them to a "Production Readiness" milestone
3. Assign to core team members immediately
4. Track daily progress
5. Block all Phase 2+ work until Phase 1 completes

---

## Issue 1: Fix Test Suite Stability (73% → 90%+)

### Title
`[Phase 1] Fix Test Suite Stability (73% → 90%+)`

### Labels
- `priority:critical`
- `phase:1`
- `testing`
- `bug`
- `status:ready`

### Description

**Goal:** Achieve 90%+ pass rate across all tests to unblock production deployment.

**Current State (Updated 2025-11-29):**
- 711 total tests
- 515 passing, 188 failing (73% pass rate)
- 20 test files failing, 21 passing, 1 skipped
- Blocking production deployment

**Key Failure Areas:**
1. **Zustand Store Mocking**: `setAIDJEnabled is not a function` in ai-dj-toggle.tsx:55
2. **DJ Mixer Tests**: 6 failures in BPM/key compatibility calculations
3. **Audio Player Tests**: Uncaught exceptions from async state updates
4. **Component Tests**: Store not properly mocked

**Impact:**
- Blocks production release
- Indicates potential reliability issues
- Prevents confidence in core feature stability

**Effort Estimate:** 5-7 days

### Tasks

- [ ] Fix Zustand store mocking in component tests (critical)
- [ ] Fix async timeout cleanup in AI DJ toggle tests
- [ ] Fix DJ mixer BPM compatibility test assertions
- [ ] Fix DJ mixer key compatibility test assertions
- [ ] Fix audio player uncaught exceptions
- [ ] Add proper afterEach cleanup for async operations
- [ ] Run full test suite 10 times to confirm stability
- [ ] Document root causes and fixes

### Specific Failing Tests

```
src/lib/services/__tests__/dj-mixer.test.ts (6 failures):
  - calculateBPMCompatibility > should return low compatibility for incompatible BPM
  - calculateBPMCompatibility > should consider genre in BPM compatibility
  - calculateKeyCompatibility > should return perfect compatibility for exact key match
  - calculateKeyCompatibility > should return high compatibility for relative minor/major
  (+ 2 more)

src/components/ai-dj-toggle.tsx:55:
  TypeError: setAIDJEnabled is not a function

src/components/ui/__tests__/audio-player.test.tsx:
  Uncaught exceptions from async state updates
```

### Acceptance Criteria

- [ ] 90%+ overall test pass rate (640+/711 tests)
- [ ] All tests pass 10 consecutive times
- [ ] No flaky tests (inconsistent pass/fail)
- [ ] Root causes documented
- [ ] CI pipeline green
- [ ] No regressions in existing functionality

### Files to Review

- `src/lib/services/__tests__/dj-mixer.test.ts` - DJ mixer test failures
- `src/components/ai-dj-toggle.tsx` - Store function error
- `src/components/ui/__tests__/audio-player.test.tsx` - Async cleanup issues
- `src/lib/stores/audio.ts` - Zustand store to mock

### Related Documentation

- [Roadmap Phase 1.1](../../docs/roadmap-2025.md#11-test-stability--technical-debt)

---

## Issue 2: Refactor Large Components for Maintainability

### Title
`[Phase 1] Refactor Large Components (Dashboard 1732 lines, Audio Player 775 lines)`

### Labels
- `priority:critical`
- `phase:1`
- `refactor`
- `code-quality`
- `status:ready`

### Description

**Goal:** Split oversized components into smaller, maintainable, testable units.

**Current State:**
- Dashboard component: 1,732 lines (complex state management)
- Audio Player component: 775 lines (feature-packed)
- Multiple concerns mixed in single components
- Hard to test, hard to maintain

**Impact:**
- Improves code maintainability
- Enables better test coverage
- Reduces cognitive load for developers
- Prevents future bugs from tight coupling

**Effort Estimate:** 2 weeks

### Tasks

**Dashboard Refactoring:**
- [ ] Extract recommendation display into separate component
- [ ] Create dedicated playlist management component
- [ ] Split analytics dashboard into sub-components
- [ ] Extract library browser logic
- [ ] Create custom hooks for complex state logic
- [ ] Move API calls to dedicated service layer
- [ ] Update tests for new structure

**Audio Player Refactoring:**
- [ ] Extract playback controls into separate component
- [ ] Create dedicated queue management component
- [ ] Split DJ features into separate module
- [ ] Extract volume and progress controls
- [ ] Create custom hooks for audio state
- [ ] Move audio logic to dedicated service
- [ ] Update tests for new structure

**General Cleanup:**
- [ ] Remove duplicate code
- [ ] Extract reusable utilities
- [ ] Improve TypeScript types
- [ ] Add JSDoc comments
- [ ] Update component documentation

### Acceptance Criteria

- [ ] No component exceeds 400 lines
- [ ] Each component has single responsibility
- [ ] Test coverage maintained or improved
- [ ] No functionality regression
- [ ] Code review approved by 2+ developers
- [ ] Documentation updated
- [ ] Performance benchmarks show no degradation

### Files to Refactor

- `/home/user/aidj/src/routes/dashboard/index.tsx` (1,732 lines)
- `/home/user/aidj/src/components/audio-player/index.tsx` (775 lines)

### Related Documentation

- [Roadmap Phase 1.2](../../docs/roadmap-2025.md#12-code-quality--refactoring)
- [Architecture Document](../../docs/architecture.md)

---

## Issue 3: Complete Lidarr Integration

### Title
`[Phase 1] Complete Lidarr Integration (Album Lookup & Availability Checks)`

### Labels
- `priority:high`
- `phase:1`
- `enhancement`
- `epic-4`
- `status:ready`

### Description

**Goal:** Complete Lidarr integration to enable unified music discovery and download workflow.

**Current State:**
- Lidarr search functionality exists
- Navidrome album lookup NOT implemented (placeholder: `navidrome: undefined`)
- Lidarr song availability check missing
- TypeScript types incomplete (`unknown` placeholders)
- Epic 4 (Download Management) blocked

**Impact:**
- Completes Epic 4 vision
- Enables seamless music discovery → download workflow
- Unifies Navidrome + Lidarr experiences
- Critical for power users managing large libraries

**Effort Estimate:** 1.5 weeks

### Tasks

**Core Implementation:**
- [ ] Define proper Navidrome Album type (lidarr-navidrome.ts:20)
- [ ] Implement Navidrome album lookup (lidarr-navidrome.ts:186)
- [ ] Add Lidarr song availability checking (lidarr-navidrome.ts:252)
- [ ] Create unified search results interface
- [ ] Implement download queue management
- [ ] Add download status tracking
- [ ] Create download notifications

**UI Components:**
- [ ] Create unified search UI (Navidrome + Lidarr results)
- [ ] Add "Download" button for missing albums
- [ ] Create download queue interface
- [ ] Add download status indicators
- [ ] Implement download history view

**Testing:**
- [ ] Unit tests for Navidrome album lookup
- [ ] Integration tests for Lidarr availability checks
- [ ] E2E tests for unified search flow
- [ ] Test download request lifecycle

### Acceptance Criteria

- [ ] Navidrome album lookup implemented and tested
- [ ] Lidarr availability checking works correctly
- [ ] All TypeScript `unknown` types replaced with proper types
- [ ] Unified search returns both Navidrome + Lidarr results
- [ ] Download requests can be submitted and tracked
- [ ] Download queue persists across sessions
- [ ] Tests passing (unit + integration + E2E)
- [ ] Documentation updated

### Files to Modify

- `/home/user/aidj/src/lib/services/lidarr-navidrome.ts` (TODOs at lines 20, 186, 252)
- `/home/user/aidj/src/routes/api/integrated/search.ts` (line 78)
- `/home/user/aidj/src/components/search/` (create unified search UI)

### Related Documentation

- [Roadmap Phase 1.3](../../docs/roadmap-2025.md#13-complete-lidarr-integration)
- [Epic 4: Download Management](../../docs/backlog.md#epic-4-download-management-deferred-to-post-mvp)
- [API Routes Documentation](../../docs/api-routes.md)

---

## Issue 4: Documentation Cleanup & Modernization

### Title
`[Phase 1] Documentation Cleanup (Remove Obsolete References, Update Architecture)`

### Labels
- `priority:medium`
- `phase:1`
- `documentation`
- `status:ready`

### Description

**Goal:** Clean up outdated documentation to reflect current state and remove obsolete references.

**Current State:**
- Epic 1 marked "Obsolete" but still referenced
- Refactoring plan shows "Not Started" for all phases
- Outdated architecture diagrams
- Missing troubleshooting guides
- No deployment documentation

**Impact:**
- Reduces onboarding friction for new developers
- Improves support and troubleshooting
- Provides clear deployment guidance
- Removes confusion from obsolete docs

**Effort Estimate:** 1 week

### Tasks

**Cleanup:**
- [ ] Remove or archive obsolete Epic 1 references
- [ ] Update refactoring plan status
- [ ] Remove "Not Started" placeholders
- [ ] Consolidate duplicate documentation
- [ ] Fix broken internal links

**Updates:**
- [ ] Update architecture diagrams to reflect current state
- [ ] Document recent changes (DJ features, AI improvements)
- [ ] Update API documentation with latest endpoints
- [ ] Refresh technology stack table
- [ ] Update file structure documentation

**New Documentation:**
- [ ] Create user guide and feature walkthrough
- [ ] Write troubleshooting guide for service integration
- [ ] Add deployment guide for self-hosted setups
- [ ] Document environment variable configuration
- [ ] Create performance tuning guide

**Organization:**
- [ ] Reorganize docs/ directory for clarity
- [ ] Create docs/guides/ subdirectory
- [ ] Move obsolete docs to docs/archive/
- [ ] Add table of contents to main README
- [ ] Create documentation index

### Acceptance Criteria

- [ ] No references to "Obsolete" or "Not Started" content
- [ ] All architecture diagrams current and accurate
- [ ] User guide covers all major features
- [ ] Troubleshooting guide addresses common issues
- [ ] Deployment guide tested on fresh system
- [ ] All internal links working
- [ ] Documentation review approved
- [ ] Docs build without errors/warnings

### Files to Update

- `/home/user/aidj/docs/prd-epic-1.md` (marked obsolete)
- `/home/user/aidj/docs/refactoring-plan-epic1.md` (not started)
- `/home/user/aidj/docs/architecture.md` (needs updates)
- `/home/user/aidj/docs/api-routes.md` (missing recent changes)
- `/home/user/aidj/README.md` (needs better organization)

### Related Documentation

- [Roadmap Phase 1.4](../../docs/roadmap-2025.md#14-documentation-cleanup)
- [Current Documentation Status](../../docs/)

---

## Issue 5: Production Deployment Preparation

### Title
`[Phase 1] Production Deployment Preparation (Re-enable Signup, Health Checks, Monitoring)`

### Labels
- `priority:critical`
- `phase:1`
- `deployment`
- `ops`
- `status:ready`

### Description

**Goal:** Prepare application for production deployment with proper health checks and monitoring.

**Current State:**
- Signup disabled for preview deployment
- Session userId hardcoded in some places
- No health check endpoints
- No database migration strategy
- No backup/restore procedures
- Missing monitoring and alerting

**Impact:**
- Enables production deployment
- Ensures application resilience
- Provides operational visibility
- Enables safe rollbacks

**Effort Estimate:** 1 week

### Tasks

**Enable Production Features:**
- [ ] Re-enable signup functionality (currently disabled)
- [ ] Fix session userId extraction (ai-dj/recommendations.ts:42)
- [ ] Remove hardcoded test data
- [ ] Validate all environment variables
- [ ] Test production build

**Health & Monitoring:**
- [ ] Create health check endpoint (/health, /ready)
- [ ] Add database connectivity check
- [ ] Implement service dependency checks (Ollama, Navidrome, Lidarr)
- [ ] Create readiness probe
- [ ] Add liveness probe

**Database:**
- [ ] Document database migration strategy
- [ ] Create backup scripts
- [ ] Implement restore procedures
- [ ] Test migrations on staging
- [ ] Add database health monitoring

**Deployment:**
- [ ] Create production deployment guide
- [ ] Document environment configuration
- [ ] Set up log aggregation
- [ ] Configure error tracking (Sentry or similar)
- [ ] Add performance monitoring (APM)
- [ ] Create rollback procedures

**Security:**
- [ ] Security audit of production configuration
- [ ] Review secrets management
- [ ] Validate HTTPS enforcement
- [ ] Check CORS configuration
- [ ] Review authentication flows

### Acceptance Criteria

- [ ] Signup enabled and working in production
- [ ] Health check endpoints return accurate status
- [ ] All services checked for availability
- [ ] Database migrations tested and documented
- [ ] Backup/restore procedures tested
- [ ] Monitoring dashboards created
- [ ] Error tracking configured
- [ ] Deployment guide verified on staging
- [ ] Security audit passed
- [ ] Zero-downtime deployment verified

### Files to Modify

- `/home/user/aidj/src/routes/(auth)/signup.tsx` (re-enable signup)
- `/home/user/aidj/src/routes/(auth)/login.tsx` (re-enable login)
- `/home/user/aidj/src/routes/api/ai-dj/recommendations.ts:42` (fix userId)
- Create `/home/user/aidj/src/routes/api/health.ts`
- Create `/home/user/aidj/src/routes/api/ready.ts`

### Related Documentation

- [Roadmap Phase 1.5](../../docs/roadmap-2025.md#15-production-deployment-preparation)
- [Environment Configuration](../../docs/environment-configuration.md)
- [Architecture Document](../../docs/architecture.md)

---

## Quick Reference: Create Phase 1 Issues

### Option 1: Manual Creation (Recommended)

Copy each issue section above and create manually on GitHub:

```bash
# Example for Issue 1
gh issue create \
  --title "[Phase 1] Fix Navidrome Integration Test Stability (87.8% → 95%)" \
  --label "priority:critical" \
  --label "phase:1" \
  --label "testing" \
  --label "bug" \
  --milestone "Phase 1" \
  --body "$(cat <<'EOF'
**Goal:** Achieve 95%+ pass rate on Navidrome integration tests...
[Copy description from above]
EOF
)"
```

### Option 2: Batch Creation Script

```bash
# Create all Phase 1 issues at once
cat > create-phase1-issues.sh <<'SCRIPT'
#!/bin/bash
set -e

echo "Creating Phase 1 critical issues..."

# Issue 1: Test Stability
gh issue create --title "[Phase 1] Fix Navidrome Integration Test Stability (87.8% → 95%)" \
  --label "priority:critical" --label "phase:1" --label "testing" --label "bug" \
  --milestone "Phase 1" --body-file .github/issues/phase1-issue1.md

# Issue 2: Refactoring
gh issue create --title "[Phase 1] Refactor Large Components" \
  --label "priority:critical" --label "phase:1" --label "refactor" --label "code-quality" \
  --milestone "Phase 1" --body-file .github/issues/phase1-issue2.md

# Issue 3: Lidarr
gh issue create --title "[Phase 1] Complete Lidarr Integration" \
  --label "priority:high" --label "phase:1" --label "enhancement" --label "epic-4" \
  --milestone "Phase 1" --body-file .github/issues/phase1-issue3.md

# Issue 4: Docs
gh issue create --title "[Phase 1] Documentation Cleanup" \
  --label "priority:medium" --label "phase:1" --label "documentation" \
  --milestone "Phase 1" --body-file .github/issues/phase1-issue4.md

# Issue 5: Deployment
gh issue create --title "[Phase 1] Production Deployment Preparation" \
  --label "priority:critical" --label "phase:1" --label "deployment" --label "ops" \
  --milestone "Phase 1" --body-file .github/issues/phase1-issue5.md

echo "✅ Created 5 Phase 1 issues"
SCRIPT

chmod +x create-phase1-issues.sh
./create-phase1-issues.sh
```

---

## Timeline & Dependencies

### Week 1-2
- **Issue 1:** Test Stability (BLOCKER) - Start immediately
- **Issue 5:** Production Prep (Parallel) - Can start immediately

### Week 2-3
- **Issue 2:** Component Refactoring - After test stability
- **Issue 3:** Lidarr Integration - Can run parallel to refactoring

### Week 3-4
- **Issue 4:** Documentation - Can run parallel throughout
- Final integration testing and validation

### Critical Path
```
Issue 1 (Test Stability)
    ↓
Issue 2 (Refactoring)
    ↓
Issue 5 (Production Prep)
    ↓
PRODUCTION READY
```

**Parallel Tracks:**
- Track A: Issue 1 → Issue 2 → Validation
- Track B: Issue 3 (Lidarr) → Integration
- Track C: Issue 4 (Docs) → Ongoing
- Track D: Issue 5 (Deployment) → Ongoing

---

## Success Metrics

**Phase 1 Complete When:**
- ✅ 90%+ test pass rate achieved
- ✅ Zero critical bugs
- ✅ All components < 400 lines
- ✅ Lidarr integration functional
- ✅ Documentation complete and current
- ✅ Production deployment successful
- ✅ Health checks passing
- ✅ Monitoring active

**Ready to Begin Phase 2 When:**
- All 5 Phase 1 issues closed
- Production running stable for 1 week
- No P0/P1 bugs in backlog
- Team capacity available for Phase 2 work

---

**Last Updated:** 2025-11-29
**Status:** Ready for creation
**Priority:** CRITICAL - Create these issues FIRST
