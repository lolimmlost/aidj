# Time-Based Discovery Logic

This document explains how the time-based music discovery system works, including time slot definitions, caching behavior, and the recommendation flow.

## Overview

The discovery feed provides personalized music recommendations based on:
- **Time of day** (morning, afternoon, evening, night)
- **Day of week** (weekday vs weekend patterns)
- **User listening history** and preferences
- **Context detection** (workout, focus, relaxation, etc.)

## Time Slot Definitions

Time slots are determined by the current hour:

| Time Slot   | Hours           | Description                    |
|-------------|-----------------|--------------------------------|
| Morning     | 5:00 AM - 10:59 AM  | Early day listening        |
| Afternoon   | 11:00 AM - 4:59 PM  | Midday listening           |
| Evening     | 5:00 PM - 8:59 PM   | Early night listening      |
| Night       | 9:00 PM - 4:59 AM   | Late night listening       |

```typescript
function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiscoveryFeed.tsx (UI)                       │
│  - Time slot tabs (All, Morning, Afternoon, Evening, Night)     │
│  - Displays recommendation cards                                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               discovery-feed.ts (Zustand Store)                 │
│  - Manages client-side state                                    │
│  - Handles tab switching (clears items for fresh fetch)         │
│  - Tracks active time filter                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│            /api/discovery-feed (API Endpoint)                   │
│  - Receives time slot request                                   │
│  - Validates parameters                                         │
│  - Routes to appropriate generator                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│          time-based-discovery.ts (Service Layer)                │
│  - generateDiscoveryFeed(): Main recommendation engine          │
│  - Manages database caching (7-day expiration)                  │
│  - Applies time slot filtering                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User clicks a time tab** (e.g., "Evening")
2. **Store clears cached items** and triggers a refresh
3. **API receives request** with `timeSlot: 'evening'`
4. **Service checks for cached items** matching the time slot
5. **If insufficient cached items**, generates new recommendations
6. **Returns only items matching** the requested time slot (or 'any')

## Caching Strategy

### Database Caching

Feed items are cached in `discovery_feed_items` table with:
- **7-day expiration** (`expiresAt` field)
- **Time slot targeting** (`targetTimeSlot` field: 'morning', 'afternoon', 'evening', 'night', or 'any')

### Cache Lookup Logic

When fetching items, the system filters by time slot:

```typescript
// Only return items that match the requested time slot OR are marked as 'any'
where(
  and(
    eq(discoveryFeedItems.userId, userId),
    gte(discoveryFeedItems.expiresAt, new Date()),
    or(
      eq(discoveryFeedItems.targetTimeSlot, timeContext.timeSlot),
      eq(discoveryFeedItems.targetTimeSlot, 'any')
    )
  )
)
```

### Client-Side Cache Clearing

When switching tabs, the store clears items to ensure fresh data:

```typescript
setActiveFilter: (filter: TimeSlot | 'any') => {
  // If switching to a specific time slot, clear items
  if (filter !== previousFilter && filter !== 'any') {
    set({ items: [], hasMore: true, lastFetchedAt: null });
  }
}
```

## Recommendation Strategies

The `generateDiscoveryFeed` function uses multiple strategies:

### 1. Compound-Scored Recommendations (40%)
- Based on songs the user has enjoyed multiple times
- Weighted by play count, completion rate, and recency
- Tagged with the current time slot

### 2. Time-Pattern Based Recommendations (30%)
- Uses top genres from user's listening patterns for this time slot
- Generates mood-based recommendations (e.g., "jazz music for evening")
- Tagged with the current time slot

### 3. Personalized Recommendations (30%)
- General personalized suggestions
- Tagged as `targetTimeSlot: 'any'` (valid for all time slots)

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/services/time-based-discovery.ts` | Core service with time slot logic and recommendation generation |
| `src/lib/stores/discovery-feed.ts` | Zustand store for client-side state management |
| `src/components/discovery-feed/DiscoveryFeed.tsx` | UI component with time filter tabs |
| `src/routes/api/discovery-feed/index.ts` | API endpoint |
| `src/lib/db/schema/discovery-feed.schema.ts` | Database schema for feed items and patterns |

## Common Issues & Solutions

### Issue: Wrong time slot recommendations showing

**Cause**: Database query not filtering by `targetTimeSlot`

**Solution**: Both the cache lookup query AND the final fetch query must filter by time slot:
```typescript
or(
  eq(discoveryFeedItems.targetTimeSlot, timeContext.timeSlot),
  eq(discoveryFeedItems.targetTimeSlot, 'any')
)
```

### Issue: Stale items after tab switch

**Cause**: Client-side cache not cleared when switching tabs

**Solution**: Clear items in `setActiveFilter` when switching to a specific time slot, then trigger refresh.

## Related Documentation

- [Personalized Music Discovery Feed](./personalized-music-discovery-feed.md)
- [Listening History Schema](../schemas/listening-history.md)
