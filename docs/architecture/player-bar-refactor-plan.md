# PlayerBar.tsx Refactoring Plan

> **Status:** Planning (do not implement until iOS testing complete)
> **Created:** 2026-01-27
> **Current Size:** ~2100 lines

## Problem

`PlayerBar.tsx` has grown to handle:
- Dual-deck audio management
- Crossfade logic
- Stall detection & recovery
- Media Session API (lock screen controls)
- Visibility change handling
- Keyboard shortcuts
- Scrobbling
- Like/unlike mutations
- UI rendering (mobile + desktop)

This makes the file difficult to navigate and maintain.

---

## Proposed Structure

```
src/
├── components/
│   ├── layout/
│   │   └── PlayerBar.tsx          # ~300 lines (UI only)
│   └── player/
│       └── AlbumArt.tsx           # ~100 lines (extracted)
│
└── lib/
    └── hooks/
        └── audio/
            ├── index.ts           # Re-exports
            ├── useDualDeckAudio.ts    # ~400 lines (core audio)
            ├── useCrossfade.ts        # ~300 lines (crossfade logic)
            ├── useStallRecovery.ts    # ~200 lines (detection + recovery)
            ├── useMediaSession.ts     # ~250 lines (lock screen)
            └── usePlayerKeyboard.ts   # ~50 lines (shortcuts)
```

---

## Extraction Plan

### Phase 1: Extract AlbumArt Component

**File:** `src/components/player/AlbumArt.tsx`

Extract lines 22-144. This is a self-contained component with:
- Cover art fetching
- Fallback to initials
- Playing animation overlay

**Complexity:** Low
**Risk:** Low

---

### Phase 2: Extract Stall Recovery Hook

**File:** `src/lib/hooks/audio/useStallRecovery.ts`

Extract:
- `checkAndResumeAudioContext()` (lines 336-361)
- `attemptStallRecovery()` (lines 364-455)
- Stall watchdog effect (lines 1523-1599)
- Visibility change recovery effect (lines 1606-1701)
- Related refs: `lastProgressTimeRef`, `lastProgressValueRef`, `recoveryAttemptRef`, `audioContextRef`

**Interface:**
```typescript
interface UseStallRecoveryOptions {
  getActiveDeck: () => HTMLAudioElement | null;
  nextSong: () => void;
  setIsPlaying: (playing: boolean) => void;
  isPlaying: boolean;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
}

interface UseStallRecoveryReturn {
  attemptStallRecovery: (audio: HTMLAudioElement, source: string) => Promise<boolean>;
  checkAndResumeAudioContext: () => Promise<boolean>;
  resetRecoveryState: () => void;
}
```

**Complexity:** Medium
**Risk:** Medium (refs need careful handling)

---

### Phase 3: Extract Media Session Hook

**File:** `src/lib/hooks/audio/useMediaSession.ts`

Extract:
- Media Session effect (lines 1239-1516)
- Debounce refs: `mediaSessionDebounceRef`, `mediaSessionPendingActionRef`, `mediaSessionLastExecutedRef`
- `executeMediaAction()`, `debouncedMediaAction()`, `setupMediaSession()`, `handlePlaying()`

**Interface:**
```typescript
interface UseMediaSessionOptions {
  currentSong: Song | null;
  getActiveDeck: () => HTMLAudioElement | null;
  deckARef: React.RefObject<HTMLAudioElement>;
  deckBRef: React.RefObject<HTMLAudioElement>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
  isPrimingRef: React.MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
  previousSong: () => void;
  nextSong: () => void;
}
```

**Complexity:** Medium
**Risk:** Medium (iOS-specific behavior)

---

### Phase 4: Extract Crossfade Hook

**File:** `src/lib/hooks/audio/useCrossfade.ts`

Extract:
- `startCrossfade()` (lines 571-809)
- `preloadNextSong()` (lines 489-498)
- Related refs: `crossfadeInProgressRef`, `crossfadeIntervalRef`, `crossfadeCanPlayFiredRef`, `crossfadeJustCompletedRef`, `nextSongPreloadedRef`, `targetVolumeRef`

**Interface:**
```typescript
interface UseCrossfadeOptions {
  deckARef: React.RefObject<HTMLAudioElement>;
  deckBRef: React.RefObject<HTMLAudioElement>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  nextSong: () => void;
}

interface UseCrossfadeReturn {
  startCrossfade: (nextSong: Song, duration: number) => void;
  preloadNextSong: (song: Song) => void;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
  crossfadeJustCompletedRef: React.MutableRefObject<boolean>;
  // ... other refs that parent needs access to
}
```

**Complexity:** High
**Risk:** High (complex state machine, iOS edge cases)

---

### Phase 5: Extract Core Audio Hook

**File:** `src/lib/hooks/audio/useDualDeckAudio.ts`

This is the main orchestration hook. Extract:
- Deck refs: `deckARef`, `deckBRef`, `activeDeckRef`
- `getActiveDeck()`, `getInactiveDeck()`
- `loadSong()` (lines 465-486)
- `togglePlayPause()` (lines 500-549) including mobile priming
- `seek()`, `changeVolume()`
- Audio event listeners effect (lines 812-1038)
- Song loading effect (lines 1045-1118)
- Play/pause state effect (lines 1141-1197)

This hook would compose the other hooks internally.

**Interface:**
```typescript
interface UseDualDeckAudioReturn {
  // Refs for audio elements (to render in JSX)
  deckARef: React.RefObject<HTMLAudioElement>;
  deckBRef: React.RefObject<HTMLAudioElement>;

  // Controls
  togglePlayPause: () => void;
  seek: (time: number) => void;
  changeVolume: (volume: number) => void;

  // State
  isLoading: boolean;

  // For child hooks that need access
  getActiveDeck: () => HTMLAudioElement | null;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
}
```

**Complexity:** High
**Risk:** High (central orchestration)

---

### Phase 6: Extract Keyboard Shortcuts Hook

**File:** `src/lib/hooks/audio/usePlayerKeyboard.ts`

Extract keyboard shortcuts effect (lines 1200-1237).

**Complexity:** Low
**Risk:** Low

---

## Dependency Graph

```
PlayerBar.tsx (UI)
    │
    └── useDualDeckAudio (orchestration)
            │
            ├── useCrossfade
            │       └── (refs shared with parent)
            │
            ├── useStallRecovery
            │       └── (needs getActiveDeck, crossfadeInProgressRef)
            │
            ├── useMediaSession
            │       └── (needs deck refs, crossfade refs)
            │
            └── usePlayerKeyboard
                    └── (needs controls from parent)
```

---

## Implementation Order

| Order | Phase | Risk | Reason |
|-------|-------|------|--------|
| 1 | AlbumArt | Low | Self-contained, no state sharing |
| 2 | Keyboard Shortcuts | Low | Simple effect, easy to test |
| 3 | Stall Recovery | Medium | Clear boundaries, testable |
| 4 | Media Session | Medium | iOS-specific, needs careful testing |
| 5 | Crossfade | High | Complex state, many edge cases |
| 6 | Core Audio | High | Final assembly, depends on all others |

---

## Testing Strategy

Each extraction should be tested on iOS before proceeding to next:

- [ ] **Phase 1-2:** Basic playback still works
- [ ] **Phase 3:** Stall recovery triggers and works
- [ ] **Phase 4:** Lock screen controls work, no Bluetooth glitches
- [ ] **Phase 5:** Crossfade works smoothly
- [ ] **Phase 6:** Full integration test

---

## Alternative: Single Hook Approach

Instead of multiple hooks, extract everything into one `useDualDeckAudio` hook:

**Pros:**
- Simpler dependency management
- All refs in one place
- Easier to reason about state

**Cons:**
- Still a large file (~800 lines)
- Harder to test individual parts
- Less reusable

**Recommendation:** Start with single hook, split later if needed.

---

## Notes

- Keep all iOS-specific comments when extracting
- Maintain the same ref patterns (useRef for values that shouldn't trigger re-renders)
- Test on iOS after each phase before continuing
- Consider adding unit tests for recovery logic (can mock audio elements)

---

## Related

- [iOS Audio Resilience Plan](./ios-audio-resilience-plan.md)
- Current PlayerBar: `src/components/layout/PlayerBar.tsx`
