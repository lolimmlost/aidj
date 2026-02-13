# Crossfade iOS Fixes Plan

## Summary of Issues

Based on debug logs from iOS Safari testing, three main issues were identified:

### Issue 1: Crossfade Ready Timeout Too Short (2 seconds)
- **Symptom**: `⚠️ [XFADE] Aborting crossfade: timeout - deck never became ready`
- **Cause**: iOS makes 15+ small range requests (8-12KB each) to buffer audio. The 2-second timeout fires before `canplaythrough` can fire.
- **Evidence**: Timeout abort at 3:18:14, but `CANPLAY` fires at the same time - race condition.

### Issue 2: Stale Deck State After Crossfade Abort
- **Symptom**: `📊 [STATE] Deck B | playing=true time=202.0/207.2` stuck for minutes
- **Cause**: After crossfade abort, `activeDeckRef` still points to old deck. Periodic state logger reports wrong deck.
- **Evidence**: Deck A is actually playing but state reports Deck B.

### Issue 3: Pause During Crossfade Causes State Confusion
- **Symptom**: User pauses to recover, crossfade keeps running, weird ABORT events on decks
- **Cause**: No check for `isPlaying` state during crossfade interval. Crossfade and pause handler fight for control.
- **Evidence**: `isPlaying=false` logged, but crossfade progress continues 14% → 100%.

---

## Fix 1: Increase Crossfade Ready Timeout

**File**: `src/components/layout/PlayerBar.tsx`

**Current Code** (around line 553):
```typescript
// Timeout fallback in case canplaythrough doesn't fire
setTimeout(() => {
  // Only fire if crossfade is in progress AND we haven't started the interval yet
  if (!crossfadeInProgressRef.current || crossfadeCanPlayFiredRef.current) return;
  if (inactiveDeck.readyState >= 3) {
    console.log(`[XFADE] Timeout fallback: forcing canplaythrough`);
    onCanPlayThrough();
  } else {
    // canplaythrough never fired and deck not ready - abort
    abortCrossfade('timeout - deck never became ready');
  }
}, 2000);  // <-- TOO SHORT
```

**Change**:
```typescript
}, 5000);  // Increase to 5 seconds for iOS buffering
```

**Rationale**: iOS Safari makes multiple small range requests to buffer audio. 5 seconds gives enough time for the browser to fetch ~200KB of audio data across 15-20 requests.

---

## Fix 2: Abort Crossfade When User Pauses

**File**: `src/components/layout/PlayerBar.tsx`

**Location**: Inside the crossfade interval (around line 475)

**Current Code**:
```typescript
crossfadeIntervalRef.current = setInterval(() => {
  // Safety check: if inactive deck stopped playing mid-crossfade, abort
  if (inactiveDeck.paused && crossfadeInProgressRef.current) {
    abortCrossfade('inactive deck stopped playing');
    return;
  }
  // ... rest of crossfade logic
}, 50);
```

**Change**: Add check for store's `isPlaying` state at the start of interval:
```typescript
crossfadeIntervalRef.current = setInterval(() => {
  // Check if user paused - abort crossfade and pause both decks
  const storeState = useAudioStore.getState();
  if (!storeState.isPlaying && crossfadeInProgressRef.current) {
    console.log('[XFADE] User paused during crossfade - aborting');
    // Pause both decks
    activeDeck.pause();
    inactiveDeck.pause();
    abortCrossfade('user paused');
    return;
  }

  // Safety check: if inactive deck stopped playing mid-crossfade, abort
  if (inactiveDeck.paused && crossfadeInProgressRef.current) {
    abortCrossfade('inactive deck stopped playing');
    return;
  }
  // ... rest of crossfade logic
}, 50);
```

**Note**: Need to import `useAudioStore` at top of file if not already done, and use `useAudioStore.getState()` to get current state without hook.

---

## Fix 3: Fix Periodic State Logger to Use Correct Deck

**File**: `src/components/layout/PlayerBar.tsx`

**Location**: Debug logging useEffect (around line 1070)

**Current Code**:
```typescript
// Periodic state logging every 10 seconds
const stateInterval = setInterval(() => {
  const active = getActiveDeck();
  const activeDeck = activeDeckRef.current;
  if (active) {
    console.log(`📊 [STATE] Deck ${activeDeck} | playing=${!active.paused} ...`);
  }
}, 10000);
```

**Issue**: `getActiveDeck()` returns the audio element but logs `activeDeckRef.current` for the deck label. These should match, but if there's any stale closure issue, they might not.

**Change**: Use the ref directly for both:
```typescript
const stateInterval = setInterval(() => {
  const deckLabel = activeDeckRef.current;
  const active = deckLabel === 'A' ? deckARef.current : deckBRef.current;
  if (active) {
    console.log(`📊 [STATE] Deck ${deckLabel} | playing=${!active.paused} time=${active.currentTime.toFixed(1)}/${active.duration?.toFixed(1) || '?'} network=${networkStateMap[active.networkState]} ready=${readyStateMap[active.readyState]} buffered=${active.buffered.length > 0 ? active.buffered.end(0).toFixed(1) : '0'}`);
  }
}, 10000);
```

---

## Fix 4: Prevent Song Loading During Crossfade

**File**: `src/components/layout/PlayerBar.tsx`

**Location**: The `useEffect` that loads songs when `currentSongIndex` changes (around line 754)

**Current Code**:
```typescript
useEffect(() => {
  if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
    const song = playlist[currentSongIndex];
    const audio = getActiveDeck();

    // Skip if crossfade just completed
    if (crossfadeJustCompletedRef.current) {
      console.log(`[XFADE] Skipping loadSong - crossfade just completed`);
      return;
    }
    // ... rest of loading logic
  }
}, [currentSongIndex, playlist, isPlaying, loadSong, getActiveDeck]);
```

**Change**: Also skip if crossfade is currently in progress:
```typescript
useEffect(() => {
  if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
    const song = playlist[currentSongIndex];
    const audio = getActiveDeck();

    // Skip if crossfade is in progress - the crossfade handles song loading
    if (crossfadeInProgressRef.current) {
      console.log(`[XFADE] Skipping loadSong - crossfade in progress`);
      return;
    }

    // Skip if crossfade just completed
    if (crossfadeJustCompletedRef.current) {
      console.log(`[XFADE] Skipping loadSong - crossfade just completed`);
      return;
    }
    // ... rest of loading logic
  }
}, [currentSongIndex, playlist, isPlaying, loadSong, getActiveDeck]);
```

---

## Fix 5: Improve Crossfade Abort Cleanup

**File**: `src/components/layout/PlayerBar.tsx`

**Location**: The `abortCrossfade` helper function (around line 444)

**Current Code**:
```typescript
const abortCrossfade = (reason: string) => {
  console.warn(`⚠️ [XFADE] Aborting crossfade: ${reason}`);
  inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
  if (crossfadeIntervalRef.current) {
    clearInterval(crossfadeIntervalRef.current);
    crossfadeIntervalRef.current = null;
  }
  crossfadeInProgressRef.current = false;
  crossfadeCanPlayFiredRef.current = false;
  // Restore active deck volume
  activeDeck.volume = targetVolumeRef.current;
};
```

**Change**: Also reset the inactive deck to prevent lingering state:
```typescript
const abortCrossfade = (reason: string) => {
  console.warn(`⚠️ [XFADE] Aborting crossfade: ${reason}`);
  inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
  if (crossfadeIntervalRef.current) {
    clearInterval(crossfadeIntervalRef.current);
    crossfadeIntervalRef.current = null;
  }
  crossfadeInProgressRef.current = false;
  crossfadeCanPlayFiredRef.current = false;

  // Restore active deck volume
  activeDeck.volume = targetVolumeRef.current;

  // Reset inactive deck to clean state
  inactiveDeck.pause();
  inactiveDeck.currentTime = 0;
  inactiveDeck.volume = 0;
  // Clear source to prevent accidental playback
  inactiveDeck.src = '';

  console.log(`⚠️ [XFADE] Abort cleanup complete - active deck is ${activeDeckRef.current}`);
};
```

---

## Fix 6: Add Crossfade State to Store for UI Awareness

**File**: `src/lib/stores/audio.ts`

This is optional but would help the UI know when crossfade is happening:

**Add to store state**:
```typescript
interface AudioState {
  // ... existing fields
  isCrossfading: boolean;
  setCrossfading: (value: boolean) => void;
}
```

**File**: `src/components/layout/PlayerBar.tsx`

Update crossfade start/end to set this:
```typescript
// At crossfade start:
useAudioStore.getState().setCrossfading(true);

// At crossfade complete or abort:
useAudioStore.getState().setCrossfading(false);
```

This allows other components to know crossfade is happening and avoid conflicting actions.

---

## Testing Plan

1. **Test increased timeout**:
   - Play a song, let it approach end
   - Verify crossfade starts and completes without timeout abort
   - Check logs for `[XFADE] Crossfade complete`

2. **Test pause during crossfade**:
   - Start crossfade (song near end)
   - Quickly pause using UI button
   - Verify both decks pause and crossfade aborts cleanly
   - Check logs for `[XFADE] User paused during crossfade - aborting`

3. **Test state consistency**:
   - Complete a crossfade
   - Verify `📊 [STATE]` logs show correct deck (A or B)
   - Verify playback time is advancing, not stuck

4. **Test background/foreground**:
   - Start playing, lock phone
   - Wait for song to end (crossfade should happen in background)
   - Unlock and verify next song is playing correctly

---

## Implementation Order

1. Fix 1 (timeout) - Simplest, immediate impact
2. Fix 4 (prevent loading during crossfade) - Prevents race conditions
3. Fix 5 (abort cleanup) - Ensures clean state on abort
4. Fix 2 (pause during crossfade) - User experience improvement
5. Fix 3 (state logger) - Debug improvement
6. Fix 6 (store state) - Optional, for future UI improvements
