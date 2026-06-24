# Search Page Redesign — Lovable Prompt

## Overview

Redesign the search page for a music streaming PWA (similar to Spotify/Apple Music). The current search page is functional but dated — a basic text input with two stacked sections (Artists grid + Songs list). We want a modern, mobile-first, visually rich search experience.

## Current Tech Stack (for reference only — you're designing the UI/UX, not integrating)

- React 19 + TanStack Router
- Tailwind CSS 4 + Radix UI (shadcn/ui components)
- Dark theme primary, light theme supported
- PWA with mobile-first design

## Design Requirements

### Layout & Structure

1. **Search Input** — Large, prominent search bar at the top with:
   - Search icon on the left
   - Clear (X) button when text is entered
   - Placeholder text: "Songs, artists, albums…"
   - Rounded pill shape, frosted glass / slightly translucent background
   - Auto-focus on page load

2. **Before Search (Empty State)** — When no query is entered, show:
   - **Recent Searches** — Horizontally scrollable chips/pills of recent search terms (stored in localStorage). Each chip has an X to remove it. Tapping replays that search.
   - **Browse Categories** — A grid of genre/mood cards (e.g., "Rock", "Electronic", "Chill", "Hip-Hop", "Jazz", "Pop", "Latin", "Metal", "R&B", "Indie"). Each card should be a rounded rectangle with a gradient background and the genre name in bold white text. 2 columns on mobile, 3-4 on desktop. These should be visually striking like Spotify's browse categories.
   - **Trending / Top Played** — Optional section showing 4-6 top played songs from the user's library as a horizontal scroll of small cards (album art + title + artist).

3. **Search Results** — When a query is entered, results appear instantly (debounced 300ms):

   **Top Result Card** — The single best match (artist or song) displayed as a large featured card:
   - If artist: Large circular avatar, artist name, "Artist" label, play button overlay
   - If song: Album art background (blurred), song title, artist name, play button
   - Takes up ~40% width on desktop (side by side with Songs), full width on mobile (stacked above Songs)

   **Songs Section** — Compact list of matching songs (max 6 initially, "See All" link):
   - Each row: Album art thumbnail (40x40) | Title + Artist (stacked, truncated) | Duration | Three-dot menu
   - Hover/active state highlights the row
   - Clicking plays the song immediately
   - Three-dot menu: Play Now, Play Next, Add to End, Add to Playlist, Start Radio

   **Artists Section** — Horizontal scroll of circular artist avatars:
   - Circular image + name below
   - 80px diameter on mobile, 120px on desktop
   - Scrollable horizontally, no wrapping
   - Tapping navigates to artist detail page

   **Albums Section** — Grid of album cards:
   - Square album art with rounded corners
   - Album name + artist below
   - 2 columns mobile, 3-4 desktop
   - Tapping navigates to album detail page

4. **Result Tabs** (optional, above results) — Pill-shaped toggle tabs for filtering:
   - "All" | "Songs" | "Artists" | "Albums"
   - "All" shows the mixed layout described above
   - Individual tabs show a full-page list of that type

### Mobile-Specific UX

- Search bar should be sticky at the top during scroll
- All touch targets minimum 44x44px
- Song rows should have generous padding for thumb tapping
- Three-dot menu should be easily reachable (right side)
- Swipe-to-dismiss keyboard on scroll down
- Results should load with a subtle stagger animation (each row fades in 50ms apart)

### Desktop Enhancements

- Two-column layout for Top Result + Songs (side by side)
- Keyboard navigation: arrow keys to move between results, Enter to play
- Hover states on all interactive elements
- Album art enlarges slightly on hover (scale transform)

### Visual Design

- Use glassmorphism / frosted glass effects sparingly (search bar, top result card)
- Smooth transitions between empty state and results (crossfade, not jump)
- Loading state: Skeleton shimmer placeholders matching the result layout
- Empty results: Friendly illustration/icon + "No results for '{query}'" + suggestion to try a different search
- Color accents should use the app's primary color (customizable via CSS variable `--primary`)
- Album art should have subtle rounded corners (8px) and a thin border/shadow

### Action Buttons Per Song

Each song result should support these actions (via three-dot menu or contextual buttons):
- **Play Now** — Replaces queue and plays this song
- **Play Next** — Inserts after currently playing song
- **Add to End** — Appends to end of queue
- **Add to Playlist** — Opens sub-menu showing user's playlists + "Create New Playlist"
- **Start Radio** — Generates a radio station seeded from this song
- **Like / Dislike** — Thumbs up/down feedback buttons (visible on the row, not just in menu)

### Component Breakdown

Please create these as separate, reusable components:
1. `SearchBar` — The search input with clear button and recent searches
2. `SearchResults` — Container that orchestrates the result sections
3. `TopResultCard` — The featured large card for the best match
4. `SongResultRow` — Individual song row with actions
5. `ArtistResultChip` — Circular artist avatar for horizontal scroll
6. `AlbumResultCard` — Album art card for the grid
7. `BrowseCategoryCard` — Genre/mood card for the empty state grid
8. `RecentSearchChips` — Horizontal scroll of recent search pills

### Empty / Error States

- **No query**: Show recent searches + browse categories
- **Loading**: Skeleton shimmer matching result layout
- **No results**: "We couldn't find anything for '{query}'" with a search icon, muted text, and suggestion to check spelling
- **Error**: "Something went wrong. Tap to retry." with retry button

### Animations

- Search bar focus: subtle glow/border animation
- Results appear: fade-in with slight upward slide (staggered per row)
- Category cards: subtle scale on press (mobile) or hover (desktop)
- Top result card: parallax-like depth effect on hover (desktop)
- Tab switching: crossfade between content sections

### Accessibility

- All interactive elements have aria-labels
- Search input has associated label (visually hidden)
- Results section has `aria-live="polite"` for screen reader updates
- Keyboard navigable (Tab, Arrow keys, Enter, Escape)
- Sufficient color contrast (WCAG AA)
- Focus indicators on all focusable elements

## What NOT to Build

- No actual API integration — use mock/placeholder data
- No authentication logic
- No audio playback — just the UI triggers
- No routing — just the page component

## Deliverable

A single-page React component with Tailwind CSS that demonstrates the complete search experience. Use placeholder/mock data for all results. The design should feel like a premium music app — think Spotify meets Apple Music with a touch of modern glassmorphism.
