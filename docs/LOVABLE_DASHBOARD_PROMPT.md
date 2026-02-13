# Lovable Prompt: AIDJ Dashboard Redesign

> Copy everything below the line into Lovable. Attach `docs/screenshots/dashboard.png` as a reference image.

---

## Context

I'm redesigning the main dashboard for AIDJ, a self-hosted AI-powered music command center. The dashboard is the primary screen authenticated users see. It lives inside a three-column app shell (left sidebar + center content + right sidebar + bottom player bar), but **this prompt covers only the center content area** — the part rendered by `src/routes/dashboard/index.tsx`.

This is a React + TypeScript app using Tailwind CSS v4 and shadcn/ui. The dashboard route is protected (redirects to `/login` if unauthenticated).

### What the dashboard currently does

The center content scrolls vertically and contains these sections in order:

1. **Hero section** — greeting, now-playing widget or "Start Listening" CTA, stat pills
2. **Quick Actions** — 6 mood-preset gradient cards that generate playlists on click
3. **AI Recommendations** — collapsible section with LLM-generated song recommendations
4. **Discovery Queue** — pending/ready discovery items from background discovery
5. **Custom Playlist** — text-input vibe prompt, source mode selector, generated playlist cards
6. **Quick Access** — compact grid of nav shortcuts (DJ Tools, Downloads, Analytics, Preferences, Config)

### What needs improvement

- The **AI Recommendations** and **Custom Playlist** sections are visually dense and code-heavy inline JSX. They need cleaner card layouts and better visual hierarchy.
- The **Discovery Queue** feels like an afterthought — it should be more visually distinct.
- Sections should have clearer visual separation and consistent card styling.
- Loading states and empty states need polish (currently raw Skeletons and text).
- The overall vertical rhythm between sections is inconsistent.

## Design System (use these exactly)

### Color Tokens (CSS custom properties, already defined)

```css
/* ── Light mode ── */
--background: oklch(0.98 0.005 270);
--foreground: oklch(0.15 0.01 270);
--card: oklch(1 0 0);
--primary: oklch(0.55 0.25 280);
--muted: oklch(0.95 0.01 270);
--muted-foreground: oklch(0.5 0.02 270);
--border: oklch(0.9 0.01 270);

/* ── Dark mode (primary target) ── */
--background: oklch(0.12 0.02 280);
--foreground: oklch(0.95 0.01 270);
--card: oklch(0.16 0.02 280);
--primary: oklch(0.7 0.22 285);
--muted: oklch(0.2 0.02 280);
--muted-foreground: oklch(0.65 0.02 270);
--border: oklch(1 0 0 / 0.1);

/* AIDJ brand accents (both modes) */
--aidj-violet: oklch(0.7 0.25 285);
--aidj-magenta: oklch(0.7 0.25 330);
--aidj-cyan: oklch(0.75 0.15 200);
--aidj-emerald: oklch(0.7 0.2 160);
--aidj-amber: oklch(0.8 0.18 80);

/* Gradients */
--gradient-brand: linear-gradient(135deg, oklch(0.65 0.28 285), oklch(0.7 0.25 330));
--gradient-hero: linear-gradient(135deg, oklch(0.65 0.25 285 / 0.25), oklch(0.7 0.25 330 / 0.15));
--gradient-card-glow: radial-gradient(ellipse at top, oklch(0.7 0.22 285 / 0.15), transparent 50%);
```

### Typography

- Font: Inter (with system fallbacks)
- Headings: `font-semibold tracking-tight`
- Section titles: `text-xl sm:text-2xl font-bold tracking-tight`
- Section labels: `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- Brand text effect: `.text-gradient-brand` (violet-to-magenta gradient on text)

### Existing CSS Classes (already in our stylesheet, use them)

- `.hero-section` — `rounded-3xl` container with `--gradient-hero` background and `::before` glow overlay
- `.hero-glow` — floating glow orb, `w-96 h-96 rounded-full blur-3xl`, brand gradient, `animation: float 8s`
- `.hero-glow-secondary` — secondary glow orb, cyan gradient, `animation: float 10s reverse`
- `.text-gradient-brand` — gradient text effect (violet to magenta)
- `.action-button` — brand gradient CTA button, white text, glow shadow, scales on hover
- `.glass-card` — `bg-background/80 backdrop-blur-sm border border-border/50`
- `.glass-card-premium` — `bg-card/60 backdrop-blur-xl border border-border/30 rounded-2xl` with inset border glow
- `.interactive-card` — `rounded-xl border p-4 sm:p-5`, lifts on hover with `hover:-translate-y-0.5`
- `.mood-card` — full gradient background, white text, `rounded-2xl p-5`, scales on hover with `hover:scale-[1.02]`
- `.mood-card-chill` — gradient: `--gradient-chill` (cyan to blue)
- `.mood-card-energy` — gradient: `--gradient-energy` (amber to orange-red)
- `.mood-card-party` — gradient: `--gradient-party` (magenta to purple)
- `.mood-card-focus` — gradient: `--gradient-focus` (emerald to teal)
- `.mood-card-discover` — gradient: `--gradient-discover` (violet to indigo)
- `.stat-card` — `rounded-xl p-4 bg-card/50 border border-border/50`, gradient top-border on hover
- `.now-playing-card` — glass card with dynamic color border for album art extraction
- `.animate-fade-up` — fade + slide up 500ms
- `.stagger-children` — each child fades up 100ms apart
- `.animate-spin-slow` — 8s rotation (for disc icon)
- `.audio-wave` + `.audio-wave-bar` — animated equalizer bars
- `.shimmer` — loading shimmer effect
- `.badge-success` — green status badge
- `.badge-info` — blue info badge
- `.badge-warning` — amber warning badge
- `.badge-purple` — purple AI badge
- `.vinyl-spin` + `.playing` — spinning disc animation for album art (4s linear rotation, paused by default, running when `.playing` is added)
- `.pulse-ring` — pulsing ring behind vinyl disc when playing (`scale(1)→scale(1.15)` at 50%, 2s infinite)

### Icons

Use Lucide React exclusively. Key icons used on dashboard: `Disc3`, `Music`, `Music2`, `Sparkles`, `Zap`, `PartyPopper`, `Target`, `Compass`, `Brain`, `Play`, `Pause`, `Plus`, `ListPlus`, `Download`, `ChevronDown`, `ChevronUp`, `BarChart3`, `Heart`, `Cog`, `ArrowRight`, `Loader2`, `TrendingUp`, `TrendingDown`

## Page Structure

The dashboard renders inside `AppLayout` which provides the sidebars and player bar. The center content area is a scrollable container with `container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8`. Bottom padding of `pb-24 md:pb-20` to clear the fixed player bar.

### Section 1: Hero (DashboardHero component)

**Keep the current design** — it's already polished. This uses `.hero-section` with floating `.hero-glow` orbs.

Content:
- Time-based greeting: "Good morning/afternoon/evening, **{userName}**" (name in `.text-gradient-brand`)
- Contextual subtitle based on now-playing state
- **Stat pills** — two separate renders for responsive layout:
  - **Desktop** (`hidden sm:flex`): `flex-wrap` row of pills showing weekly plays (violet, with delta), unique artists (amber, with delta), available recommendations (violet), ready-to-play songs (emerald), and AI DJ active indicator (green pulse dot). Each pill has a color variant with optional `TrendingUp`/`TrendingDown` delta arrows.
  - **Mobile** (`flex sm:hidden`): compact horizontally-scrollable row (`overflow-x-auto`) with smaller pills (shorter labels like "Plays", "Recs", "Ready") and a condensed AI DJ badge.
- **Now Playing widget** (right side): if a song is playing — album art in a spinning vinyl disc, song title/artist, audio wave bars, play/pause button. Uses `useDynamicColors` hook to extract colors from album art for the card border.
- **Start Listening CTA** (right side): if nothing is playing — `.glass-card-premium` with Music2 icon and "Browse your library or let AI DJ take over" text, links to `/library`.

### Section 2: Quick Actions (mood cards)

**Keep the current design** — mood cards are the hero interaction.

- Title: "What's your vibe?" with subtitle "Tap a mood to generate a playlist instantly"
- 6-column grid on desktop (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3`), 2-column on mobile
- Each card is a `button` with `.mood-card` + `.mood-card-{variant}` classes
- Cards: Chill, Energy, Party, Focus, Discover, Similar (note: "Similar" reuses `mood-card-party` gradient — there is no `mood-card-similar` class)
- Active card gets `ring-2 ring-white/50 ring-offset-2 scale-[1.02]`
- Loading card shows `Loader2` spinner with `animate-pulse`
- `.stagger-children` entry animation

### Section 3: AI Recommendations (collapsible)

**Needs redesign.** Currently a dense `.glass-card-premium` section.

Desired layout:
- **Section header**: clickable row to toggle collapse. Left side: icon container (`w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20`) with Sparkles icon, title "AI Recommendations" in `.text-gradient-brand` with `.badge-purple` "AI" tag, subtitle "Personalized picks based on your taste". Right side: collapse chevron.
- **Collapsed state**: single line "Tap to explore personalized recommendations" in muted text, indented under header.
- **Expanded state**:
  - Controls row: "Refresh" button (outline, rounded-xl) and type selector dropdown ("Similar Artists" / "Mood-Based")
  - Stats banner: subtle gradient stripe (`bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/10 rounded-xl`) showing "X of Y songs in your library" and timestamp
  - **Recommendation cards**: each card is a `.interactive-card` with:
    - Song title (bold), library status badge (green "In Library" / orange "Not Found")
    - Explanation text in muted
    - Thumbs up/down feedback buttons
    - Queue dropdown (Play Now / Play Next / Add to End) if in library, or "Search Similar" button if not
  - Loading state: 5x skeleton cards with Skeleton components
  - Error state: red text with rate-limit tip

### Section 4: Discovery Queue (collapsible)

**Needs visual upgrade.** Currently bare.

Desired layout:
- Same collapsible header pattern as AI Recommendations
- Icon container: `bg-gradient-to-br from-emerald-500/20 to-cyan-500/20` with Compass icon
- Title: "Discovery Queue" with `.badge-success` "Live" tag
- Subtitle: "Background discovery finds new music while you listen"
- **Discovery items**: each is a `.glass-card` with:
  - Status icon (pending = Loader2 spinning, ready = CheckCircle green)
  - Song title + artist
  - Source badge (Last.fm red / AI purple)
  - Action buttons: Play (if ready) or Remove
- **Empty state**: illustrated empty state with muted text "Start playing music to discover new tracks"
- Footer: "Check Now" button and "Clear Ready" button

### Section 5: Custom Playlist (collapsible)

**Needs redesign.** Currently the most visually heavy section.

Desired layout:
- Same collapsible header pattern
- Icon container: `bg-gradient-to-br from-cyan-500/20 to-blue-500/20` with Music icon
- Title: "Custom Playlist" in cyan-to-blue gradient text with `.badge-info` "AI" tag
- Subtitle: "Describe your vibe, get a playlist"
- **Expanded content**:
  - **Source mode selector**: 3 toggle buttons (Library Only / Discovery / Mix) — already exists as `SourceModeSelector` component. Each button is color-coded when active (green for Library, purple for Discovery, blue for Mix). **When "Mix" is selected**, a sub-panel appears with a `Slider` (range 10–90, step 10) letting the user set the library/discovery ratio, displayed as "70% / 30%" with contextual description ("Mostly familiar songs with some discoveries" etc.).
  - **Input area**: text input with Sparkles icon prefix, placeholder "Describe your vibe... (e.g., 'Chill Sunday morning')", plus `.action-button` "Generate" button. Input is debounced (800ms) — while the user is typing, show a pulsing muted indicator: "Typing detected... playlist will generate when you stop typing"
  - **Generation progress**: animated card with `GenerationProgress` component showing stage (generating / resolving / retrying) with cancel button
  - **Results**: stats banner (similar to recommendations — blue gradient stripe showing song count + source mode badge), then song cards:
    - Each song card: numbered, song title, source badge (green "In Library" / purple "Discovery" / red "Last.fm" / orange "Not Found"), explanation, feedback buttons, queue dropdown or "Find & Download" button for discovery songs. If a song is currently playing and the playlist item has BPM/key metadata, **MixCompatibilityBadges** render below the explanation showing harmonic mixing compatibility (lazy-loaded).
  - **Empty results**: dashed border empty state "No matching songs found"

### Section 6: Quick Access (MoreFeatures component)

**Keep the current design** — clean and minimal.

- Section label: "Quick Access" in `.text-xs uppercase tracking-wider text-muted-foreground`
- Grid: `grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3`
- Each link: `rounded-xl border border-border/50 bg-card/30` with icon, label, ArrowRight, and color-coded hover effect
- Links: DJ Tools (violet, mobile only), Downloads (cyan), Analytics (emerald), Preferences (rose), Config (amber)

## Important Design Rules

1. **Dark mode is primary** — design for dark first, light mode second
2. **No pure black** — darkest background is `oklch(0.12 0.02 280)` (deep navy with violet tint)
3. **Borders in dark mode** are always semi-transparent white (`oklch(1 0 0 / 0.1)`), never gray
4. **Every section** has subtle background differentiation — the hero has gradient glow, collapsible sections use `.glass-card-premium`, quick access uses `bg-card/30`
5. **Glow effects** on the hero section — `box-shadow: 0 0 40px oklch(0.7 0.25 285 / 0.3)`
6. **Cards always `rounded-xl` or `rounded-2xl`** — never `rounded-lg` for feature cards
7. **Hover transitions** use `duration-200` for cards, `duration-300` for backgrounds
8. **Respect `prefers-reduced-motion`** — all animations should be optional
9. **Mobile-first** — everything works at 375px width, enhances from there
10. **Collapsible sections** use `ChevronDown`/`ChevronUp` icons with smooth height transitions
11. **Stat pills** are `rounded-full` with color-coded borders, never square
12. **Section spacing** is consistent: `space-y-4 sm:space-y-6 lg:space-y-8` on the container
13. **Touch targets** are minimum 44px height for buttons and interactive elements (`min-h-[44px]`)
14. **Overflow-hidden** on containers with floating glow orbs to prevent horizontal scroll
15. **`relative z-10`** on all visible content above glow orbs

## Existing Component Imports Available

```tsx
// React
import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Suspense, lazy } from "react";

// Route setup
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import authClient from "@/lib/auth/auth-client";

// Toast notifications
import { toast } from "sonner";

// Stores
import { useAudioStore } from "@/lib/stores/audio";
import { usePreferencesStore, type SourceMode } from "@/lib/stores/preferences";
import { useDiscoveryQueueStore } from "@/lib/stores/discovery-queue";

// UI primitives
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualizedList } from "@/components/ui/virtualized-list";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GenerationProgress } from "@/components/ui/generation-progress";

// Dashboard components
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { QuickActions, STYLE_PRESETS, type StylePreset } from "@/components/dashboard/quick-actions";
import { SourceModeSelector, SourceBadge } from "@/components/playlist/source-mode-selector";
import { SongFeedbackButtons } from "@/components/library/SongFeedbackButtons";
import { RecommendationCard } from "@/components/recommendations/RecommendationCard";
import { OllamaErrorBoundary } from "@/components/ollama-error-boundary";

// Lazy-loaded
const DJFeatures = lazy(() => import("@/components/dashboard/DJFeatures"));
const MoreFeatures = lazy(() => import("@/components/dashboard/MoreFeatures"));
const DiscoveryQueuePanel = lazy(() => import("@/components/discovery/DiscoveryQueuePanel"));
const MixCompatibilityBadges = lazy(() => import("@/components/dj/mix-compatibility-badges"));

// Lucide icons
import {
  Play, Plus, ListPlus, Download, ChevronDown, ChevronUp, Sparkles,
  Zap, PartyPopper, Target, Compass, Music, Loader2, Disc3, BarChart3,
  Heart, Cog, ArrowRight, TrendingUp, TrendingDown
} from "lucide-react";
```

## File Location

The component is the route handler for `/dashboard/`. It uses `AppLayout` (provided by the route tree layout), so it only renders the center content.

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardIndex,
});

function DashboardIndex() {
  // ... dashboard content
}
```

## Key Behavioral Notes

- **Recommendations and Custom Playlist are manual-trigger** — they don't auto-fetch on page load. The user clicks "Refresh" or types a vibe prompt.
- **Mood card clicks** set the vibe prompt and trigger playlist generation immediately.
- **Collapsible sections** remember state in component state (not persisted). Recommendations default to collapsed, playlist to expanded.
- **Code splitting**: DJFeatures, MoreFeatures, DiscoveryQueuePanel, and MixCompatibilityBadges are lazy-loaded with deferred rendering (500ms–2000ms delays).
- **Feedback** uses optimistic updates — thumbs up/down appear immediately, roll back on error.
- **Song queuing** uses a 3-strategy search (title+artist, artist+title, full string) with pre-warming cache.
- **AI DJ status** shows a green pulse indicator when active.
- **Legacy feedback migration**: on mount, the dashboard checks `localStorage` for legacy feedback data and shows a `sonner` toast prompting the user to migrate it to the server. This is a one-time onboarding flow — the toast has a "Migrate" action button and shows progress/results via `toast.loading`/`toast.success`.

## Out of Scope

- **AppLayout shell** — the sidebars (left nav, right "Now Playing"), bottom player bar, and mobile nav are separate. This prompt covers only the scrollable center content.
- **Backend / API changes** — this is a purely frontend/visual redesign of the dashboard route.
- **DJFeatures section** — currently commented out in the route. Do not include it unless re-enabling.
- **PlayerBar** — handled separately, always rendered in AppLayout.
