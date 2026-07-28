# Search Page — Albums View — Lovable Prompt

## Context

This is for the "Albums" tab within an existing music search page. The search page already has a working design with:
- A sticky glassmorphic header with a rounded search input (search icon left, clear X right)
- Pill-shaped tab filters: **All | Songs | Artists | Albums** — the Albums tab is what we're designing
- An ambient backdrop with subtle gradient blobs (primary, fuchsia, cyan)
- Recent search chips in the idle state
- Dark theme primary, light theme supported
- Tailwind CSS 4 + Radix UI (shadcn/ui) + Lucide icons

The "All" tab already shows Artists (circular avatar grid) and Songs (compact rows with album art thumbnail). We need the **Albums section** — shown in the "All" tab and as the full view in the "Albums" tab.

## Tech Stack (for reference — you're designing UI, not integrating)

- React 19 + Tailwind CSS 4
- Dark theme default (`bg-background`, `text-foreground`, `text-muted-foreground`)
- shadcn/ui primitives available (Card, Button, Badge, Skeleton)
- Lucide icons (`Disc3`, `Play`, `Clock`, `Music`)

## Album Data Shape

Each album result has:
```ts
{
  id: string;
  name: string;          // "Abbey Road"
  artist: string;        // "The Beatles"
  artistId: string;      // for linking to artist page
  year?: number;         // 1969
  songCount?: number;    // 17
  duration?: number;     // total seconds
  genre?: string;        // "Rock"
  coverArtUrl?: string;  // square album art image URL
}
```

## Design Requirements

### Album Card Component

Design an `AlbumResultCard` component for each album in the results:

**Desktop (≥640px):**
- Square album art with rounded corners (rounded-xl, ~8-12px)
- Subtle shadow and border (`border border-white/5`)
- Below the art: album name (bold, truncated 1 line) + artist name (muted, truncated 1 line)
- Year badge in the top-right corner of the art (small, semi-transparent pill)
- Play button overlay: appears on hover, positioned bottom-right of the album art
  - Circular, primary color, slight shadow, translates up on hover
  - Contains a filled Play icon
- Hover state: art scales up slightly (scale-105), card gets a subtle bg highlight
- The entire card is clickable — navigates to album detail page
- Song count as small muted text below artist: "17 tracks"

**Mobile (<640px):**
- Same card layout but smaller art
- No hover play button (entire card taps to navigate)
- Touch-friendly: minimum 44px tap target
- Year shown as small text, not a badge overlay

### Grid Layout

**In "All" tab** (mixed results — albums appear after Artists, before/after Songs):
- Section header: "Albums" in uppercase tracking-wider muted text, with count on the right
- Horizontal scrolling row of album cards (not a grid)
  - Cards are ~160px wide on mobile, ~180px on desktop
  - Gap of 12px between cards
  - Overflow hidden with no visible scrollbar (`[scrollbar-width:none]`)
  - Edge-to-edge scroll with padding on the container
- "See all" link at the right of the section header when > 6 albums (switches to Albums tab)

**In "Albums" tab** (full view):
- Responsive grid: 2 columns mobile, 3 columns tablet, 4 columns desktop, 5 columns wide
- `gap-3 sm:gap-4`
- All matching albums shown (no "See all" needed)
- Sort controls at the top-right: "Year" | "Name" | "Artist" (small muted pills)

### Loading State

- Skeleton placeholders matching the card layout
- Square skeleton for art (aspect-square, rounded-xl)
- Two narrow skeletons below for text
- Shimmer animation
- Show 4-6 skeleton cards in the grid

### Empty State (Albums tab selected, 0 album results)

- Centered layout with a `Disc3` icon (muted, 48px)
- "No albums found" heading
- "Try searching by album title or artist name" muted subtext
- Should feel light and informative, not like an error

### Visual Refinements

- Album art should have a thin `ring-1 ring-white/5` to separate from dark backgrounds
- Cards should use `bg-white/[0.03]` background with `hover:bg-white/[0.06]` transition
- Subtle border: `border border-white/5`
- Consistent with the existing song rows and artist cards already in the search page
- Duration format: if total album duration is available, show as "42 min" next to track count

### Interactions

- Click/tap card → navigate to album detail page (`/library/artists/{artistId}/albums/{albumId}`)
- Hover play button (desktop only) → play all songs in the album
- Long-press on mobile → could show a context menu (optional, stretch goal):
  - Play Album
  - Add to Queue
  - Add to Playlist
  - Go to Artist

### Accessibility

- Each card has `aria-label="Album: {name} by {artist}"`
- Play button has `aria-label="Play {name}"`
- Grid uses appropriate landmark roles
- Focus ring visible on keyboard navigation
- Sort controls are `role="radiogroup"` with `aria-checked`

## Mock Data

Use 8-12 mock albums with varied data:
```ts
const MOCK_ALBUMS = [
  { id: '1', name: 'Abbey Road', artist: 'The Beatles', year: 1969, songCount: 17, genre: 'Rock', coverArtUrl: '/placeholder.svg' },
  { id: '2', name: 'Random Access Memories', artist: 'Daft Punk', year: 2013, songCount: 13, genre: 'Electronic', coverArtUrl: '/placeholder.svg' },
  { id: '3', name: 'To Pimp a Butterfly', artist: 'Kendrick Lamar', year: 2015, songCount: 16, genre: 'Hip-Hop', coverArtUrl: '/placeholder.svg' },
  { id: '4', name: 'Blonde', artist: 'Frank Ocean', year: 2016, songCount: 17, genre: 'R&B', coverArtUrl: '/placeholder.svg' },
  { id: '5', name: 'In Rainbows', artist: 'Radiohead', year: 2007, songCount: 10, genre: 'Alternative', coverArtUrl: '/placeholder.svg' },
  { id: '6', name: 'Currents', artist: 'Tame Impala', year: 2015, songCount: 13, genre: 'Psychedelic', coverArtUrl: '/placeholder.svg' },
  { id: '7', name: 'Channel Orange', artist: 'Frank Ocean', year: 2012, songCount: 17, genre: 'R&B', coverArtUrl: '/placeholder.svg' },
  { id: '8', name: 'OK Computer', artist: 'Radiohead', year: 1997, songCount: 12, genre: 'Alternative', coverArtUrl: '/placeholder.svg' },
  { id: '9', name: 'Discovery', artist: 'Daft Punk', year: 2001, songCount: 14, genre: 'Electronic', coverArtUrl: '/placeholder.svg' },
  { id: '10', name: 'Ctrl', artist: 'SZA', year: 2017, songCount: 14, genre: 'R&B', coverArtUrl: '/placeholder.svg' },
];
```

## What NOT to Build

- No API integration — use mock data
- No audio playback — just the UI
- No routing — just the component
- No authentication

## Deliverable

Two React components with Tailwind CSS:
1. `AlbumResultCard` — The individual album card
2. `AlbumResultsGrid` — The grid/scroll container with section header, sort controls, loading, and empty states

Show both the "All" tab horizontal scroll variant and the "Albums" tab full grid variant. Match the dark, premium aesthetic of a Spotify/Apple Music search page with the ambient backdrop and glassmorphic elements from the parent search page design.
