# Music Recommendation and Download Interface Product Requirements Document (PRD) - Epic 7: Pro DJ Features & Discovery Mode

## Epic Goal

Transform the AI recommendation system into a professional DJ tool with discovery capabilities, workflow integration, and intelligent mixing assistance. This epic bridges the gap between library management and professional DJ workflows, enabling Spotify-like discovery while maintaining control over what gets recommended.

## Background

The current implementation (Epics 3-4) provides:
- Ollama-based AI recommendations
- Style-based playlist generation
- Lidarr download integration
- Basic recommendation display

However, it lacks:
- Control over recommendation sources (library vs external)
- Discovery pipeline for new music
- Pro DJ features (harmonic mixing, BPM matching)
- Intentional user-triggered workflows (current recommendations auto-load)

## User Personas

### Casual Listener
- Wants personalized recommendations from their library
- Occasionally discovers new music to download
- Prefers simple, automatic suggestions

### Home DJ
- Builds playlists for parties/events
- Wants style-based generation with library control
- Interested in discovering new tracks that fit their style

### Professional DJ
- Needs harmonic/BPM-aware suggestions
- Builds structured sets with energy curves
- Requires reliability (library-only mode for live performance)
- Uses discovery for set preparation, not live mixing

## Core Concepts

### Source Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Library Only** | Recommendations exclusively from Navidrome library | Live performance, reliable playback |
| **Discovery** | Recommendations for songs NOT in library | Finding new music, wishlist building |
| **Mix** | Blend of library (70%) and discovery (30%) | Set preparation with discovery |

### AI DJ Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| **Autopilot** | AI automatically queues next tracks | Background listening, casual use |
| **Suggestions** | AI suggests, user approves before queue | Active curation, learning preferences |
| **Manual** | No AI intervention, user controls everything | Professional performance |

---

## Story 7.1: Source Mode Toggle

**Priority**: High (Foundation for all discovery features)

As a user,
I want to control whether recommendations come from my library, external sources, or a mix,
so that I can choose between reliable playback and music discovery.

### Acceptance Criteria

1. Add source mode selector to playlist generator UI with three options:
   - Library Only (default)
   - Discovery (external recommendations)
   - Mix (configurable ratio, default 70/30)
2. Update recommendation/playlist API to accept `sourceMode` parameter
3. For "Library Only" mode:
   - Only return songs that exist in Navidrome
   - Filter out any recommendations not found in library
4. For "Discovery" mode:
   - Return songs NOT in library
   - Include metadata for Lidarr lookup (artist, album, track)
   - Show "Download" button instead of "Queue" button
5. For "Mix" mode:
   - Return configurable ratio of library/discovery songs
   - Clearly label each recommendation's source
6. Persist user's preferred source mode in preferences store
7. Update AI prompt to respect source mode constraints

### Technical Notes

- Extend `PlaylistRequest` interface with `sourceMode: 'library' | 'discovery' | 'mix'`
- Add source mode to user preferences schema
- Discovery mode requires Story 7.2 (Last.fm) for external recommendations

### Tasks

- [ ] Add `sourceMode` to PlaylistRequest interface
- [ ] Update playlist generator UI with toggle/selector
- [ ] Modify recommendation API to filter by source mode
- [ ] Add source mode to preferences store
- [ ] Update AI prompt builder to include source constraints
- [ ] Add visual indicators for library vs discovery songs
- [ ] Unit tests for source mode filtering
- [ ] E2E test for each source mode

---

## Story 7.2: Last.fm Integration

**Priority**: High (Required for discovery mode)

As a user,
I want the AI to suggest music from outside my library using Last.fm,
so that I can discover new artists and tracks that match my taste.

### Acceptance Criteria

1. Create Last.fm service layer with API key authentication
2. Implement similar tracks lookup (`track.getSimilar`)
3. Implement similar artists lookup (`artist.getSimilar`)
4. Implement top tracks by artist (`artist.getTopTracks`)
5. Cache Last.fm responses (5 minute TTL) to reduce API calls
6. Cross-reference results with Navidrome to identify what's not in library
7. Return enriched recommendations with:
   - Track/artist name
   - Album name
   - Last.fm URL
   - Match score (similarity percentage)
   - "In Library" boolean flag
8. Handle rate limiting gracefully (Last.fm: 5 requests/second)
9. Provide fallback if Last.fm unavailable

### API Endpoints

```
GET /api/lastfm/similar-tracks?artist={artist}&track={track}
GET /api/lastfm/similar-artists?artist={artist}
GET /api/lastfm/top-tracks?artist={artist}
```

### Technical Notes

- Last.fm API: https://www.last.fm/api
- Free tier: 5 requests/second, no daily limit
- API key stored in config alongside Ollama/Lidarr keys

### Tasks

- [ ] Create Last.fm service (`src/lib/services/lastfm.ts`)
- [ ] Implement `getSimilarTracks()` function
- [ ] Implement `getSimilarArtists()` function
- [ ] Implement `getTopTracks()` function
- [ ] Add caching layer for API responses
- [ ] Create API routes for Last.fm endpoints
- [ ] Add Last.fm API key to config schema
- [ ] Cross-reference with Navidrome library
- [ ] Unit tests for Last.fm service
- [ ] Integration tests with mock API

---

## Story 7.3: Discovery-to-Download Pipeline

**Priority**: High (Completes the discovery loop)

As a user,
I want discovered songs to automatically download via Lidarr and appear in my queue,
so that I can seamlessly add new music while listening.

### Acceptance Criteria

1. For discovery recommendations, show "Download" action button
2. When user clicks "Download":
   - Search Lidarr for the artist
   - Add artist to Lidarr if not present
   - Show confirmation toast with estimated wait time
3. Create discovery queue tracker:
   - Track pending discoveries (artist/album/track requested)
   - Monitor Lidarr download status
   - Detect when song appears in Navidrome (via periodic scan or webhook)
4. When download completes:
   - Notify user ("Song X is now available!")
   - Optionally auto-add to current queue
5. Show discovery queue status in UI:
   - Pending downloads
   - Completed (ready to play)
   - Failed (with retry option)
6. Settings for discovery behavior:
   - Auto-queue completed downloads (on/off)
   - Notification preferences
   - Discovery ratio for Mix mode

### Technical Notes

- Builds on existing Lidarr service (Epic 4)
- Requires polling or webhook for Navidrome sync detection
- Consider background job for monitoring

### Tasks

- [ ] Create discovery queue service (`src/lib/services/discovery-queue.ts`)
- [ ] Add "Download" button to discovery recommendations
- [ ] Implement Lidarr add flow for discovered tracks
- [ ] Create polling mechanism for download completion
- [ ] Detect new songs in Navidrome after Lidarr download
- [ ] Add notifications for completed downloads
- [ ] Create discovery queue UI component
- [ ] Add discovery settings to preferences
- [ ] Unit tests for discovery queue
- [ ] E2E test for full discovery-to-playback flow

---

## Story 7.4: Dashboard Refactor

**Priority**: Medium (UX improvement)

As a user,
I want recommendations to appear when I request them, not automatically,
so that the dashboard feels intentional rather than random.

### Acceptance Criteria

1. Remove auto-loading recommendations from dashboard
2. Replace with "Quick Actions" section:
   - "Get Recommendations" button (triggers AI generation)
   - "Continue Listening" (recently played)
   - Style preset buttons (Chill, Energetic, Party, Focus)
3. Move recommendation results to expandable section or modal
4. Add "AI DJ" card with mode selector (Autopilot/Suggestions/Manual)
5. Improve recommendation request UX:
   - Clear loading states
   - Progress indicators for multi-step generation
   - Estimated wait time
6. Persist and display last generated recommendations until explicitly refreshed
7. Add "Clear" button to reset recommendations

### Technical Notes

- Consider using React Query's `enabled: false` and manual refetch
- Style presets map to predefined prompts
- Keep existing playlist generator functionality

### Tasks

- [ ] Remove auto-fetch from recommendations query
- [ ] Create "Quick Actions" component
- [ ] Add style preset buttons
- [ ] Create AI DJ mode selector component
- [ ] Implement "Continue Listening" section
- [ ] Improve loading/progress UX
- [ ] Add clear/reset functionality
- [ ] Update dashboard layout
- [ ] Unit tests for new components
- [ ] E2E test for user-triggered recommendations

---

## Story 7.5: Harmonic Mixing Suggestions (Pro)

**Priority**: Medium (Pro DJ feature)

As a professional DJ,
I want recommendations that consider BPM and musical key,
so that I can create seamless mixes with harmonic transitions.

### Acceptance Criteria

1. Extract/display BPM and key metadata from Navidrome tracks
2. Implement Camelot wheel compatibility scoring:
   - Same key = perfect match
   - Adjacent keys (+1/-1 on wheel) = good match
   - Compatible keys (relative major/minor) = acceptable
3. Add BPM compatibility scoring:
   - Within ±3% = seamless transition
   - Within ±6% = manageable with pitch adjustment
   - Beyond ±6% = requires technique
4. When generating recommendations, factor in:
   - Current/last played track's BPM and key
   - User's preferred BPM range tolerance
   - Harmonic mixing preference (strict/flexible/off)
5. Display compatibility indicators in recommendation UI:
   - BPM badge with +/- indicator
   - Key badge with Camelot notation
   - Overall "mix score" (0-100)
6. Add sorting/filtering by mix compatibility

### Technical Notes

- Navidrome may not have BPM/key metadata; consider integration with:
  - beets (music tagger)
  - essentia (audio analysis)
  - KeyFinder
- Camelot wheel: https://mixedinkey.com/harmonic-mixing-guide/

### Tasks

- [ ] Create harmonic mixing service
- [ ] Implement Camelot wheel compatibility algorithm
- [ ] Implement BPM compatibility scoring
- [ ] Add mix score calculation
- [ ] Create compatibility badge components
- [ ] Integrate with recommendation generation
- [ ] Add harmonic mixing settings to preferences
- [ ] Unit tests for compatibility algorithms
- [ ] Document Camelot wheel reference

---

## Story 7.6: Set Builder (Pro)

**Priority**: Low (Advanced Pro DJ feature)

As a professional DJ,
I want to plan my sets with energy curves and structure,
so that I can prepare for gigs with intentional flow.

### Acceptance Criteria

1. Create Set Builder interface:
   - Timeline/track list view
   - Drag-and-drop reordering
   - Energy level indicator per track (1-10 scale)
2. Set templates:
   - Warm Up (30 min, energy 3→5)
   - Peak Time (60 min, energy 7→9)
   - Cool Down (30 min, energy 5→3)
   - Custom (user-defined duration and energy curve)
3. AI-assisted set generation:
   - "Fill my set" - AI suggests tracks matching energy curve
   - "Suggest next" - AI recommends what should come next
   - Respects harmonic mixing if enabled
4. Set metadata:
   - Total duration
   - Average BPM
   - Key distribution
   - Genre breakdown
5. Export options:
   - Save as Navidrome playlist
   - Export track list (PDF/text)
   - Share set (future: social features)
6. Set history:
   - Save/load sets
   - Track what was played at past events

### Technical Notes

- Energy levels may need manual tagging or ML inference
- Consider Spotify's audio features API as reference for energy/valence

### Tasks

- [ ] Design Set Builder UI/UX
- [ ] Create Set data model and storage
- [ ] Implement timeline/track list component
- [ ] Add drag-and-drop reordering
- [ ] Create set template presets
- [ ] Implement "Fill my set" AI generation
- [ ] Add export to Navidrome playlist
- [ ] Create set history/save functionality
- [ ] Unit tests for set operations
- [ ] E2E test for complete set building flow

---

## Dependencies

```
Story 7.1 (Source Mode) ─────┬──→ Story 7.3 (Discovery Pipeline)
                             │
Story 7.2 (Last.fm) ─────────┘

Story 7.4 (Dashboard) ───────→ Independent, can start anytime

Story 7.5 (Harmonic) ────────→ Story 7.6 (Set Builder)
```

## Implementation Status

| Story | Status | Notes |
|-------|--------|-------|
| **7.1**: Source Mode Toggle | ✅ Done | SourceModeSelector, API support, preferences |
| **7.3**: Discovery Pipeline | ✅ Done | Last.fm genre-first discovery, Lidarr integration |
| **7.4**: Dashboard Refactor | 🔄 In Progress | QuickActions + AI DJ Control added |
| **7.6**: Set Builder | ✅ Done | Timeline view, energy curves, AI-assisted fill |
| **7.2**: Last.fm Integration | 📋 Ready | API integrated in discovery mode |
| **7.5**: Harmonic Mixing | 📋 Ready | BPM/key algorithms implemented |

## Recommended Implementation Order

1. **Story 7.1**: Source Mode Toggle (foundation) ✅
2. **Story 7.4**: Dashboard Refactor (quick UX win) 🔄
3. **Story 7.2**: Last.fm Integration (enables discovery) 📋
4. **Story 7.3**: Discovery Pipeline (completes discovery loop) ✅
5. **Story 7.5**: Harmonic Mixing (pro feature) 📋
6. **Story 7.6**: Set Builder (advanced pro feature) ✅

## Success Metrics

- User can generate library-only playlists for reliable playback
- User can discover new music and download it seamlessly
- Dashboard feels intentional, not random
- Pro DJs can use harmonic mixing features
- Set preparation workflow is streamlined

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
