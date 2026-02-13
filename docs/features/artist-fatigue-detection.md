# Artist Fatigue Detection (Phase 4.1)

**Status:** ✅ Implemented
**Date:** 2026-01-01

## Overview

Artist Fatigue Detection prevents the AI DJ from exhausting artist libraries by tracking when a high percentage of an artist's songs have been recently played or queued. When an artist hits the fatigue threshold, they're placed on a temporary cooldown period before being recommended again.

## Problem Solved

**Before:** AI DJ would queue all songs from one artist (e.g., all 10 Patrick Holland songs), exhaust that artist, then move to another artist and repeat. This created a repetitive, non-diverse listening experience, especially for smaller artist libraries.

**After:** When 80% of an artist's songs have been played in the last 72 hours, that artist goes on a 48-hour cooldown. This forces AI DJ to diversify across more artists and prevents burnout on any single artist.

## How It Works

### 1. Fatigue Calculation (Server-Side)

```typescript
// src/lib/services/artist-fatigue.ts

const FATIGUE_THRESHOLD = 0.8;  // 80% of artist's songs
const COOLDOWN_HOURS = 48;      // 48-hour cooldown
const LOOKBACK_HOURS = 72;      // Check last 72 hours
```

The service:
1. Counts total songs by artist in library
2. Counts unique songs played in last 72 hours (from `listening_history`)
3. Calculates: `fatiguePercentage = playedSongs / totalSongs`
4. If `fatiguePercentage >= 0.8`, artist goes on cooldown
5. Cooldown ends after 48 hours from last play

### 2. Integration Flow

```
User listening → AI DJ queue monitor → API call → Recommendations Service
                                         ↓
                           Calculate artist fatigue for recommended artists
                                         ↓
                           Return {recommendations, artistFatigueCooldowns}
                                         ↓
                           Audio store updates cooldown state
                                         ↓
                           Next queue refill excludes fatigued artists
```

### 3. Client-Side State (Zustand Store)

```typescript
// src/lib/stores/audio.ts

interface AudioState {
  // Map of artist name (lowercase) → cooldown end timestamp (ms)
  aiDJArtistFatigueCooldowns: Map<string, number>;
}
```

On each queue refill:
1. Clean up expired cooldowns
2. Build `fatigueExcludedArtists` list from active cooldowns
3. Pass to API via `excludeArtists` parameter
4. API calculates new fatigue states
5. Update state with new cooldowns

### 4. Server-Side API Integration

```typescript
// src/routes/api/ai-dj/recommendations.ts

// After generating recommendations, check fatigue
const fatigueMap = await calculateArtistFatigue(userId, recommendedArtists);

// Build cooldown map for artists that hit threshold
for (const [artist, fatigue] of fatigueMap.entries()) {
  if (fatigue.onCooldown && fatigue.cooldownUntil) {
    artistFatigueCooldowns[artist.toLowerCase()] = fatigue.cooldownUntil;
  }
}

// Return in API response
return { recommendations, artistFatigueCooldowns };
```

## Key Features

### ✅ Configurable Thresholds
- **Fatigue threshold:** 80% (adjustable via `FATIGUE_THRESHOLD`)
- **Cooldown period:** 48 hours (adjustable via `COOLDOWN_HOURS`)
- **Lookback window:** 72 hours (adjustable via `LOOKBACK_HOURS`)

### ✅ Automatic Expiration
- Cooldowns automatically expire after timeout
- Expired cooldowns cleaned up on each queue refill
- No manual intervention required

### ✅ Non-Blocking
- Fatigue calculation failures don't break recommendations
- Falls back gracefully if service unavailable
- Errors logged but not shown to user

### ✅ Server-Side Security
- All fatigue calculations happen server-side
- Client cannot manipulate cooldown state
- Based on actual listening history in database

### ✅ Logging & Debugging
```
⚠️ Artist fatigue: Patrick Holland on cooldown until 1/3/2026, 2:30 PM (8/10 songs played)
⚠️ Artists added to fatigue cooldown: Patrick Holland, Juice WRLD
```

## Files Modified

### New Files
- **`src/lib/services/artist-fatigue.ts`** - Core fatigue detection service

### Modified Files
- **`src/lib/stores/audio.ts`** - Added `aiDJArtistFatigueCooldowns` state
- **`src/routes/api/ai-dj/recommendations.ts`** - Integrated fatigue calculation

## Database Schema

Uses existing `listening_history` table:
```sql
SELECT
  artist,
  COUNT(DISTINCT song_id) as played_songs,
  MAX(played_at) as last_played
FROM listening_history
WHERE
  user_id = ?
  AND played_at >= ? -- Last 72 hours
GROUP BY artist
```

No schema changes required - works with existing data.

## Example Scenarios

### Scenario 1: Patrick Holland (10 songs)
1. User plays 8 Patrick Holland songs over 2 days
2. Fatigue = 8/10 = 80% → cooldown activated
3. Patrick Holland excluded from AI DJ for 48 hours
4. After 48 hours, cooldown expires automatically
5. Patrick Holland can be recommended again

### Scenario 2: Juice WRLD (100 songs)
1. User plays 75 Juice WRLD songs over 3 days
2. Fatigue = 75/100 = 75% → no cooldown (under 80%)
3. AI DJ continues recommending Juice WRLD
4. At 80+ songs (80%), cooldown activates

### Scenario 3: Multiple Artists
- Patrick Holland: 8/10 played (80%) → cooldown
- Juice WRLD: 75/100 played (75%) → no cooldown
- Lil Uzi Vert: 2/50 played (4%) → no cooldown

AI DJ will now prioritize Juice WRLD and Lil Uzi Vert, skipping Patrick Holland.

## API Functions

### Public API

```typescript
// Calculate fatigue for specific artists
calculateArtistFatigue(userId: string, artists?: string[]): Promise<Map<string, ArtistFatigue>>

// Check if single artist is on cooldown
isArtistOnCooldown(userId: string, artist: string): Promise<boolean>

// Get all artists currently on cooldown
getArtistsOnCooldown(userId: string): Promise<string[]>

// Filter fatigued artists from song list
filterOutFatiguedArtists<T>(songs: T[], userId: string): Promise<T[]>

// Get fatigue stats for debugging/display
getArtistFatigueStats(userId: string): Promise<{
  onCooldown: ArtistFatigue[];
  approaching: ArtistFatigue[];  // 60-80% fatigue
  healthy: ArtistFatigue[];      // <60% fatigue
}>
```

### Types

```typescript
interface ArtistFatigue {
  artist: string;
  totalSongs: number;
  playedSongs: number;
  fatiguePercentage: number;     // 0.0-1.0
  onCooldown: boolean;
  cooldownUntil?: number;         // Unix timestamp (ms)
  lastPlayed?: number;            // Unix timestamp (ms)
}
```

## Testing

To test artist fatigue:

1. **Setup:** Find an artist with ~10 songs in your library
2. **Trigger:** Play 8+ of their songs within a few hours
3. **Verify:** Check console logs for fatigue warnings:
   ```
   ⚠️ Artist fatigue: [Artist Name] on cooldown until [Date]
   ```
4. **Confirm:** AI DJ should not recommend that artist for next 48 hours
5. **Reset:** Wait 48 hours or manually clear `listening_history` for testing

### Manual Testing Query
```sql
-- See current fatigue for all artists
SELECT
  s.artist,
  COUNT(DISTINCT s.id) as total_songs,
  COUNT(DISTINCT lh.song_id) as played_recently,
  ROUND(COUNT(DISTINCT lh.song_id) * 100.0 / COUNT(DISTINCT s.id), 1) as fatigue_pct
FROM songs s
LEFT JOIN listening_history lh ON
  lh.artist = s.artist
  AND lh.played_at >= datetime('now', '-72 hours')
GROUP BY s.artist
HAVING played_recently > 0
ORDER BY fatigue_pct DESC;
```

## Future Enhancements

### Potential Improvements
1. **User-configurable thresholds** - Let users adjust fatigue % and cooldown duration
2. **Fatigue UI indicator** - Show fatigue % per artist in library view
3. **Grace period** - Allow 1-2 "grace" songs even during cooldown for manual plays
4. **Variable cooldown** - Longer cooldown for artists with more fatigue
5. **Genre-based fatigue** - Prevent exhausting entire genres, not just artists

### Phase 4.2 & 4.3 Integration
- Genre Discovery Mode can override fatigue for exploration
- "More Like This" nudge respects fatigue but weights down fatigued artists

## Performance

- **Database queries:** 2 queries per recommendation batch (artist counts + recent plays)
- **Caching:** Consider Redis cache for fatigue state if scaling needed
- **Impact:** Adds ~10-50ms to recommendation API call (negligible)

## Conclusion

Artist Fatigue Detection solves the core problem of AI DJ exhausting artist libraries. Combined with Phase 1-3 improvements (artist diversity, genre matching, skip learning), it creates a much more balanced and enjoyable automated DJ experience.
