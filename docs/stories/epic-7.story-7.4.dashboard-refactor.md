# Epic 7 Story 7.4: Dashboard Refactor

## Status
Ready for Development

## Priority
Medium (UX improvement, can be done independently)

## Story
As a user,
I want recommendations to appear when I request them, not automatically,
so that the dashboard feels intentional rather than random.

## Acceptance Criteria

1. Remove auto-loading recommendations from dashboard:
   - Recommendations query should not run on page load
   - User must explicitly trigger generation

2. Replace auto-recommendations with "Quick Actions" section:
   - "Get Recommendations" primary button
   - Style preset buttons (Chill, Energetic, Party, Focus, etc.)
   - "Continue Listening" based on recent history
   - Source mode quick toggle

3. Add AI DJ control card:
   - Mode selector: Autopilot / Suggestions / Manual
   - Visual indicator of current mode
   - Quick access to AI DJ settings

4. Improve recommendation generation UX:
   - Clear loading states with progress text
   - Show what stage we're in (Generating... Finding in library...)
   - Estimated wait time indicator
   - Cancel button for long operations

5. Persist last generated recommendations:
   - Show until user explicitly clears/regenerates
   - Include timestamp of when generated
   - "Refresh" button to regenerate

6. Streamline playlist generator section:
   - Keep style input + generate
   - Add source mode selector (from Story 7.1)
   - Move presets to Quick Actions

7. Clean up visual hierarchy:
   - Hero section with greeting + quick stats
   - Quick Actions prominently displayed
   - Generated content in expandable/collapsible sections
   - DJ Features section remains

## Tasks / Subtasks

### Remove Auto-Loading
- [ ] Change recommendations query to `enabled: false`
- [ ] Add manual `refetch()` trigger via button
- [ ] Remove automatic retry logic on page load
- [ ] Keep cached data display until explicitly cleared

### Quick Actions Component
- [ ] Create `src/components/dashboard/quick-actions.tsx`
- [ ] Design action button grid layout
- [ ] Implement style preset buttons:
  - Chill / Relaxing
  - Energetic / Workout
  - Party / Dance
  - Focus / Study
  - Discover New
- [ ] Add "Continue Listening" section:
  - Fetch last 5-10 played songs
  - Show "Resume" button
- [ ] Add source mode quick toggle

### AI DJ Control Card
- [ ] Create `src/components/dashboard/ai-dj-control.tsx`
- [ ] Mode selector (Autopilot / Suggestions / Manual):
  - Autopilot: AI auto-queues songs
  - Suggestions: AI suggests, you approve
  - Manual: No AI intervention
- [ ] Visual mode indicator (icon + text)
- [ ] Settings shortcut link
- [ ] Current queue preview (if AI DJ active)

### Loading/Progress UX
- [ ] Create progress component with stages:
  - "Analyzing your library..."
  - "Generating recommendations..."
  - "Finding songs in your collection..."
  - "Almost ready..."
- [ ] Add cancel button for long operations
- [ ] Show estimated time based on history

### Recommendation Persistence
- [ ] Store last recommendations in localStorage
- [ ] Load on mount if available
- [ ] Show generation timestamp
- [ ] Add "Clear" button
- [ ] Add "Refresh" button (regenerate)

### Layout Reorganization
- [ ] Redesign dashboard grid layout
- [ ] Make sections collapsible
- [ ] Improve mobile responsiveness
- [ ] Add section anchors for quick nav

### Testing
- [ ] Unit tests for Quick Actions component
- [ ] Unit tests for AI DJ Control
- [ ] E2E test: user triggers recommendations manually
- [ ] E2E test: presets generate correct prompts
- [ ] Visual regression tests for layout

## UI Design

### New Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Welcome back, [User]!                                      │
│  ───────────────────────────────────────────────────────────│
│  🎵 423 songs  │  🎤 89 artists  │  💿 52 albums            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  AI DJ                                           [Settings] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mode:  (○) Autopilot  (●) Suggestions  (○) Manual          │
│                                                              │
│  Status: Waiting for your input...                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Quick Actions                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │   😌     │ │   🔥     │ │   🎉     │ │   🎯     │       │
│  │  Chill   │ │ Energetic│ │  Party   │ │  Focus   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  ┌──────────┐ ┌──────────────────────────────────┐          │
│  │   ✨     │ │  🎤 Continue: "Last Song - Artist" │          │
│  │ Discover │ │                         [Resume] │          │
│  └──────────┘ └──────────────────────────────────┘          │
│                                                              │
│  Source: [Library Only ▼]                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Recommendations                              [▼ Collapse]  │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  [No recommendations yet. Click a quick action above!]      │
│                                                              │
│  ─── OR after generation ───                                │
│                                                              │
│  Generated 2 minutes ago                    [↻] [Clear]     │
│                                                              │
│  1. Song A - Artist A  [In Library ✓]      [Queue ▼]       │
│  2. Song B - Artist B  [In Library ✓]      [Queue ▼]       │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Custom Playlist                              [▼ Collapse]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Style: [___________________________] [Generate]            │
│                                                              │
│  Examples: "90s rock", "Sunday morning", "Workout mix"      │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  DJ Features                                                 │
│  ─────────────────────────────────────────────────────────  │
│  [Smart Playlists] [Set Builder] [Library Analysis] [...]   │
└─────────────────────────────────────────────────────────────┘
```

### Loading State

```
┌─────────────────────────────────────────────────────────────┐
│  Recommendations                              [Cancel]       │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  ⏳ Generating "Chill" playlist...                          │
│                                                              │
│  [████████████░░░░░░░░░░░░░░░░░░] Step 2/3                  │
│                                                              │
│  ✓ Analyzing your library                                   │
│  ● Generating recommendations...                            │
│  ○ Finding songs in your collection                         │
│                                                              │
│  Usually takes about 10 seconds                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Preset Prompts

```typescript
const STYLE_PRESETS = {
  chill: 'relaxing chill vibes, acoustic, downtempo, peaceful',
  energetic: 'high energy workout music, upbeat, driving rhythm',
  party: 'dance party hits, crowd pleasers, upbeat pop and electronic',
  focus: 'concentration music, minimal lyrics, ambient, instrumental',
  discover: 'hidden gems and deep cuts from artists similar to my favorites',
};
```

### Query Configuration

```typescript
// Before (auto-loading)
const { data } = useQuery({
  queryKey: ['recommendations'],
  queryFn: fetchRecommendations,
  enabled: !!session,  // Runs immediately
});

// After (manual trigger)
const { data, refetch, isLoading } = useQuery({
  queryKey: ['recommendations'],
  queryFn: fetchRecommendations,
  enabled: false,  // Never auto-runs
  staleTime: Infinity,  // Keep data until explicitly cleared
});

// Trigger via button
<Button onClick={() => refetch()}>Get Recommendations</Button>
```

### AI DJ Modes

```typescript
type AIDJMode = 'autopilot' | 'suggestions' | 'manual';

// Autopilot: AI DJ adds songs automatically when queue runs low
// Suggestions: AI DJ shows suggestions panel, user approves
// Manual: AI DJ is off, user manages queue entirely
```

## Dependencies

- Story 7.1 (Source Mode) - For source selector in quick actions
- Existing audio store - For continue listening
- Existing preferences store - For persisting mode

## Dev Notes

### File Locations
- Quick Actions: `src/components/dashboard/quick-actions.tsx`
- AI DJ Control: `src/components/dashboard/ai-dj-control.tsx`
- Progress component: `src/components/ui/generation-progress.tsx`
- Updated dashboard: `src/routes/dashboard/index.tsx`

### Migration
- Keep existing code, just change query `enabled` flag
- Add new components incrementally
- Feature flag for A/B testing if desired

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
