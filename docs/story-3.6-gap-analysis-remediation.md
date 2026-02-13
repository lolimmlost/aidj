# Story 3.6: AI Playlist Generation - Gap Analysis & Remediation Plan

**Date:** 2025-10-17
**Analyst:** Sarah (Product Owner)
**Status:** 🚨 **PARTIALLY WORKING - CRITICAL GAPS IDENTIFIED**

---

## Executive Summary

Story 3.6 was marked **COMPLETE** with all acceptance criteria checked, but **user reports it doesn't fully work**. After code audit, I've identified several critical gaps between documented completion and actual functionality.

**Verdict:** Story 3.6 is **~60-70% complete**. Core infrastructure exists, but has reliability and UX issues preventing production readiness.

---

## Code Audit Findings

### ✅ What's Actually Working

1. **UI Components Exist** ([dashboard/index.tsx](../src/routes/dashboard/index.tsx))
   - Style input field (line 472-477)
   - "Generate Now" button (line 478-489)
   - Playlist display card (line 508-555)
   - Debouncing logic (800ms delay, lines 44-67)
   - Caching (localStorage, lines 274-290)

2. **API Endpoint Exists** ([api/playlist.ts](../src/routes/api/playlist.ts))
   - POST /api/playlist route defined (lines 6-82)
   - Auth check (lines 8-22)
   - Library summary fetching (line 33)
   - Ollama integration (line 36)
   - Song resolution via Navidrome search (lines 39-57)

3. **Ollama Service Layer** ([services/ollama.ts](../src/lib/services/ollama.ts))
   - `generatePlaylist()` function (lines 203-284)
   - 5-second timeout (line 211) - **NOTE: Documented as 10s, actually 5s**
   - Rate limiting (10 requests/min, lines 11-35)
   - Retry logic with exponential backoff (lines 48-65)
   - Enhanced prompts with library context (lines 213-228)

---

## 🔴 Critical Gaps & Issues

### Issue #1: **Timeout Mismatch (Documentation vs. Code)**

**Documented:** 10-second timeout (AC7, multiple doc references)
**Actual Code:** 5-second timeout

```typescript
// src/lib/services/ollama.ts:211
const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per AC7
```

**Impact:**
- Ollama may need >5s for playlist generation, causing premature timeouts
- User sees "timeout" errors when Ollama is actually working

**Evidence:**
- Line 396 in dashboard shows "10s timeout" in UI
- Story 3.6 doc says "10s timeouts (extended from 5s for better UX)"
- **Code still uses 5s**

---

### Issue #2: **Song Resolution Failures Not Handled Gracefully**

**Problem:** When Ollama suggests a song not in library, the API marks it `missing: true` but doesn't provide actionable feedback to user.

**Code Analysis:**
```typescript
// api/playlist.ts:43-51
const matches = await search(suggestion.song, 0, 1);
if (matches.length > 0) {
  // Found
} else {
  console.log(`❌ No match found for: "${suggestion.song}"`);
  return { ...suggestion, songId: null, url: null, missing: true };
}
```

**UI Handling:**
```typescript
// dashboard/index.tsx:545
{item.missing && <p className="text-xs text-destructive">Not in library - Lidarr integration deferred</p>}
```

**Impact:**
- Users see "Not in library" message but **can't do anything** about it
- No retry option, no search suggestions, no explanation
- Lidarr integration deferred (AC9), so missing songs just... sit there

---

### Issue #3: **Rate Limiting Too Aggressive**

**Current:** 10 AI requests per minute (Ollama rate limit)
**Problem:** User generates 3 playlists, refreshes recommendations 2x → 5 requests → **50% of quota used**

**Code:**
```typescript
// ollama.ts:13
const OLLAMA_RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 AI requests per minute
```

**Impact:**
- User hits limit after 10 actions in 60 seconds
- Error message: "Too many AI requests. Please wait a moment before refreshing."
- For local Ollama instance (not cloud SaaS), 10/min is artificially low

**Recommendation:** Increase to 60/min for local instances, or make configurable

---

### Issue #4: **No Visual Feedback During Generation**

**Problem:** User clicks "Generate Now" → **8+ seconds of silence** → playlist appears

**Missing:**
- Progress indicator during Ollama generation (5-10s wait)
- No "AI is thinking..." message
- No status like "Fetching library summary... Generating playlist... Resolving songs..."

**Code Evidence:**
```typescript
// dashboard/index.tsx:499
{playlistLoading && <p>Loading playlist...</p>}
```

**Why It's Inadequate:**
- Generic "Loading playlist..." doesn't communicate **what's happening**
- Users don't know if it's stuck, slow, or working
- No way to estimate wait time

---

### Issue #5: **Search Quality Issues**

**Problem:** Ollama returns "Artist - Title" format, but Navidrome search may not find exact matches.

**Example Failure:**
- Ollama suggests: "The Beatles - Hey Jude"
- Navidrome search for "The Beatles - Hey Jude" returns 0 results
- **Why?** Search expects separate artist/title fields or full-text search, not hyphenated format

**Code:**
```typescript
// api/playlist.ts:43
const matches = await search(suggestion.song, 0, 1);
```

**Better Approach:**
```typescript
// Parse "Artist - Title" into separate artist and title
const [artist, title] = suggestion.song.split(' - ');
const matches = await search(`artist:${artist} title:${title}`, 0, 1);
// OR search separately and match both
```

---

### Issue #6: **Caching Breaks Fresh Generation**

**Problem:** User generates "Halloween" playlist → cached. User wants **different** Halloween songs → cache returns same results.

**Code:**
```typescript
// dashboard/index.tsx:274-279
const cacheKey = `playlist-${debouncedStyle}`;
const cached = localStorage.getItem(cacheKey);
if (cached) {
  console.log(`📦 Returning cached playlist for "${debouncedStyle}"`);
  return JSON.parse(cached);
}
```

**Impact:**
- User types "Halloween" → gets 5 songs → clears → types "Halloween" again → **gets same 5 songs**
- "Clear Cache" button exists (line 469) but user doesn't know to use it
- No "Regenerate" option to bypass cache for same style

---

### Issue #7: **Recommendations Feature Confusion**

**Problem:** Dashboard has **TWO AI features**:
1. **AI Recommendations** (lines 370-464): "Similar Artists" / "Mood-Based"
2. **Style-Based Playlist** (lines 466-556): User enters style like "Halloween"

**User Confusion:**
- Recommendations use `/api/recommendations` endpoint (different from playlist)
- Recommendations validate songs BEFORE showing (lines 117-156)
- Recommendations have retry logic (3 attempts, lines 92-165)
- **Playlists don't have same validation/retry**

**Why This Matters:**
- Recommendations feature is more robust than playlist feature
- User expects playlist to work as well as recommendations
- **They don't**

---

## Acceptance Criteria Reality Check

| AC | Claimed | Reality | Gap |
|----|---------|---------|-----|
| AC1: Style input field | ✅ Complete | ✅ Works | None |
| AC2: Fetch library summary | ✅ Complete | ⚠️ Works but slow (no feedback) | Missing progress indicator |
| AC3: Generate playlist via Ollama | ✅ Complete | ⚠️ Works but 5s timeout (not 10s) | Timeout mismatch |
| AC4: Resolve songs via Navidrome | ✅ Complete | ❌ **Partial** - search format issues | Song resolution unreliable |
| AC5: Display playlist with explanations | ✅ Complete | ✅ Works | None |
| AC6: Queue integration | ✅ Complete | ⚠️ Works if songs found | Fails silently if no matches |
| AC7: Error handling (timeout, retry, fallback) | ✅ Complete | ❌ **Partial** - timeout wrong, no retry for search failures | Missing retry for song resolution |

**Overall:** 3/7 fully working, 3/7 partially working, 1/7 broken

---

## Production Enhancements - Reality Check

**Documented Enhancements:**
- ✅ Persistent song caching across sessions → **EXISTS** (lines 31-42, 322-336)
- ⚠️ Rate limiting (60 requests/minute) → **ACTUALLY 10/min** (ollama.ts:13)
- ✅ Pre-warming cache system → **EXISTS** (lines 338-359)
- ✅ Enhanced AI prompts → **EXISTS** (ollama.ts:213-228)
- ⚠️ Comprehensive logging → **PARTIALLY** (console.logs, not structured)
- ⚠️ 10s timeouts → **ACTUALLY 5s** (ollama.ts:211)
- ✅ Debounced input → **EXISTS** (lines 44-67)
- ✅ Smart cache coordination → **EXISTS** (lines 180-225)

---

## User-Facing Symptoms (Likely)

Based on code analysis, users probably experience:

1. **Timeouts**: "Ollama request timed out after 5s" - playlist generation takes 6-8s
2. **Missing Songs**: Playlist shows 5 suggestions, only 1-2 actually queue (search failures)
3. **Stale Cache**: Same Halloween playlist every time (cache not refreshing)
4. **Rate Limit Errors**: After 10 generations, "Too many AI requests" message
5. **No Feedback**: Long pauses with no indication if it's working
6. **Silent Failures**: Songs marked "Not in library" with no actionable next step

---

## Remediation Plan

### Priority 1: Fix Critical Functionality (Blocking Release)

#### Task 1.1: Fix Timeout Mismatch
- **File:** `src/lib/services/ollama.ts`
- **Change:** Line 211 - Change `5000` to `10000`
- **Estimate:** 5 minutes
- **Test:** Generate playlist with slow Ollama model, verify 10s timeout

#### Task 1.2: Improve Song Resolution
- **File:** `src/routes/api/playlist.ts`
- **Change:** Parse "Artist - Title" format before searching
```typescript
const [artist, title] = suggestion.song.split(' - ').map(s => s.trim());
// Try exact search first
let matches = await search(`${artist} ${title}`, 0, 3);
// If no results, try fuzzy search or artist-only
if (matches.length === 0) {
  matches = await search(artist, 0, 5); // Find by artist, more results
}
// Rank by title similarity
const bestMatch = matches.find(s => s.title.toLowerCase().includes(title.toLowerCase()));
```
- **Estimate:** 30 minutes
- **Test:** Generate Halloween playlist, verify all songs resolve correctly

#### Task 1.3: Add Playlist Generation Retry Logic
- **File:** `src/routes/dashboard/index.tsx` (queryFn starting line 273)
- **Change:** Add retry logic similar to recommendations (lines 92-165)
- **Estimate:** 20 minutes
- **Test:** Force Ollama failure, verify retry attempts

### Priority 2: UX Improvements (High Impact)

#### Task 2.1: Add Generation Progress Indicator
- **File:** `src/routes/dashboard/index.tsx`
- **Add:** Multi-stage loading state
```typescript
const [generationStage, setGenerationStage] = useState<'idle' | 'summary' | 'generating' | 'resolving' | 'done'>('idle');

// During fetch:
setGenerationStage('summary'); // "Fetching library summary..."
setGenerationStage('generating'); // "AI generating playlist... (this may take 10s)"
setGenerationStage('resolving'); // "Finding songs in your library..."
setGenerationStage('done');
```
- **Estimate:** 30 minutes
- **Test:** User sees progress updates during generation

#### Task 2.2: Add "Regenerate" Button for Cached Playlists
- **File:** `src/routes/dashboard/index.tsx`
- **Add:** Button to bypass cache for same style
- **Estimate:** 15 minutes
- **Test:** Generate "Halloween" twice, verify different results

#### Task 2.3: Improve "Missing Song" Handling
- **File:** `src/routes/dashboard/index.tsx`
- **Add:** Actionable options for missing songs
```typescript
{item.missing && (
  <div>
    <p className="text-xs text-destructive">Not in library</p>
    <Button size="sm" onClick={() => searchManually(item.song)}>
      Search Manually
    </Button>
  </div>
)}
```
- **Estimate:** 20 minutes
- **Test:** Missing song shows search option

### Priority 3: Configuration & Polish

#### Task 3.1: Increase Rate Limit for Local Ollama
- **File:** `src/lib/services/ollama.ts`
- **Change:** Line 13 - Change to 30/min or make configurable
- **Estimate:** 10 minutes
- **Test:** Verify 30 requests in 60s don't fail

#### Task 3.2: Add Structured Logging
- **File:** All Ollama/playlist files
- **Change:** Replace `console.log` with structured logger (Pino)
- **Estimate:** 30 minutes
- **Test:** Logs show timestamp, level, context

---

## Revised Story Status

### Before Remediation:
**Status:** ❌ **NOT PRODUCTION READY**
- Critical bugs (timeout, search failures)
- Poor UX (no progress, stale cache)
- User frustration (rate limits, missing songs)

### After Priority 1 Remediation (1 hour):
**Status:** ⚠️ **FUNCTIONAL BUT NEEDS POLISH**
- Core functionality reliable
- Basic UX improvements
- Acceptable for Halloween MVP

### After Priority 1 + 2 Remediation (2.5 hours):
**Status:** ✅ **PRODUCTION READY**
- All ACs working as documented
- Good UX with progress indicators
- Graceful handling of edge cases

---

## Recommended Next Steps

1. **IMMEDIATE (Today):**
   - [ ] User confirms these are the actual issues experienced
   - [ ] Assign developer to Priority 1 tasks (1 hour work)
   - [ ] Test fixes with real Ollama instance
   - [ ] Update Story 3.6 status to "IN REMEDIATION"

2. **THIS WEEK:**
   - [ ] Complete Priority 1 + 2 tasks (2.5 hours total)
   - [ ] Run E2E tests (still missing from story)
   - [ ] Update QA gate with remediation results
   - [ ] Mark story COMPLETE only after verification

3. **BEFORE HALLOWEEN MVP:**
   - [ ] Priority 3 polish tasks (optional if time allows)
   - [ ] User acceptance testing with real playlists
   - [ ] Document known limitations in user-facing docs

---

## Updated QA Gate

**Previous Gate Status:** ✅ APPROVED WITH MINOR ITEMS (INCORRECT)

**New Gate Status:** 🚨 **BLOCKED - CRITICAL REMEDIATION REQUIRED**

**Blocking Issues:**
1. Timeout configuration mismatch (5s vs. documented 10s)
2. Song resolution unreliable (search format issues)
3. No retry logic for playlist generation failures
4. Poor UX during 8-10s generation time

**Approval Criteria:**
- [ ] All Priority 1 tasks completed and tested
- [ ] User confirms issues resolved
- [ ] E2E tests passing (or documented as deferred)
- [ ] No critical bugs in manual testing

---

## Lessons Learned

1. **"Complete" checkmarks don't equal "working"** - All ACs were checked but code had bugs
2. **Documentation drift** - Docs said 10s timeout, code had 5s timeout
3. **Missing E2E tests** - Unit tests passed, but integration broken
4. **Assumed vs. verified** - Story marked complete without user testing

**For Future Stories:**
- [ ] Require user acceptance testing before marking complete
- [ ] E2E tests mandatory, not optional
- [ ] Code audit before QA approval
- [ ] Configuration values match documentation

---

## Questions for User

**To diagnose faster, please confirm:**

1. What error messages do you see? (timeout? rate limit? "not in library"?)
2. Does playlist generation work at all, or completely broken?
3. When you type "Halloween", do you get any results? How many songs resolve?
4. Have you tried the recommendations feature (top section) - does that work?
5. Are you running Ollama locally? Which model?

**This will help me prioritize the right fixes first.**

---

**Created:** 2025-10-17
**Next Review:** After user confirms symptoms and remediation tasks completed
