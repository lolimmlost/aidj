# AIDJ Design System

Opinionated design language reference. Every page, component, and interaction in AIDJ follows these rules. No exceptions.

---

## 1. Color System

AIDJ uses OKLCH color space with a violet/purple-dominant brand identity.

### Brand Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--aidj-violet` | `oklch(0.55 0.28 285)` | `oklch(0.7 0.25 285)` | Primary brand, CTAs, focus rings |
| `--aidj-purple` | `oklch(0.5 0.3 300)` | `oklch(0.65 0.28 300)` | Secondary brand, accents |
| `--aidj-magenta` | `oklch(0.6 0.28 330)` | `oklch(0.7 0.25 330)` | Gradient endpoints, party mood |
| `--aidj-cyan` | `oklch(0.7 0.15 200)` | `oklch(0.75 0.15 200)` | Chill mood, info states |
| `--aidj-emerald` | `oklch(0.65 0.2 160)` | `oklch(0.7 0.2 160)` | Success, focus mood |
| `--aidj-amber` | `oklch(0.75 0.18 80)` | `oklch(0.8 0.18 80)` | Warnings, energy mood |

### Semantic Colors

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--primary` | `oklch(0.55 0.25 280)` | `oklch(0.7 0.22 285)` | Buttons, active nav, links, focus rings |
| `--primary-foreground` | `oklch(1 0 0)` | `oklch(0.12 0.02 280)` | Text on primary backgrounds |
| `--background` | `oklch(0.98 0.005 270)` | `oklch(0.12 0.02 280)` | Page background |
| `--foreground` | `oklch(0.15 0.01 270)` | `oklch(0.95 0.01 270)` | Default text color |
| `--card` | `oklch(1 0 0)` | `oklch(0.16 0.02 280)` | Card surfaces |
| `--card-foreground` | `oklch(0.15 0.01 270)` | `oklch(0.95 0.01 270)` | Text on cards |
| `--secondary` | `oklch(0.95 0.02 270)` | `oklch(0.22 0.03 280)` | Secondary buttons, subtle fills |
| `--secondary-foreground` | `oklch(0.2 0.01 270)` | `oklch(0.95 0.01 270)` | Text on secondary |
| `--muted` | `oklch(0.95 0.01 270)` | `oklch(0.2 0.02 280)` | Muted backgrounds, skeletons |
| `--muted-foreground` | `oklch(0.5 0.02 270)` | `oklch(0.65 0.02 270)` | Deemphasized text, labels |
| `--accent` | `oklch(0.92 0.03 280)` | `oklch(0.25 0.04 285)` | Hover backgrounds, highlights |
| `--accent-foreground` | `oklch(0.2 0.01 270)` | `oklch(0.95 0.01 270)` | Text on accents |
| `--popover` | `oklch(1 0 0)` | `oklch(0.16 0.02 280)` | Dropdown/popover surfaces |
| `--popover-foreground` | `oklch(0.15 0.01 270)` | `oklch(0.95 0.01 270)` | Text in popovers |
| `--border` | `oklch(0.9 0.01 270)` | `oklch(1 0 0 / 0.1)` | Borders and dividers |
| `--input` | `oklch(0.92 0.01 270)` | `oklch(1 0 0 / 0.12)` | Input field borders/backgrounds |
| `--ring` | `oklch(0.55 0.25 280)` | `oklch(0.7 0.22 285)` | Focus ring color |
| `--destructive` | `oklch(0.6 0.25 25)` | `oklch(0.65 0.22 25)` | Delete/danger actions |

### Border Radius Tokens

Base: `--radius: 0.75rem` (12px)

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `calc(var(--radius) - 4px)` = 8px | Small inputs, badges |
| `--radius-md` | `calc(var(--radius) - 2px)` = 10px | Buttons, standard elements |
| `--radius-lg` | `var(--radius)` = 12px | Cards (shadcn default) |
| `--radius-xl` | `calc(var(--radius) + 4px)` = 16px | Feature cards, modals |

### Chart Colors

Five named chart colors for data visualization. Always use these in order for consistency:
- `--chart-1` through `--chart-5` (magenta, violet, cyan, green, amber)

---

## 2. Gradients

Gradients are the visual signature of AIDJ. Every major surface uses one.

| Name | Definition | Usage |
|------|-----------|-------|
| `--gradient-brand` | `violet → magenta 135deg` | CTAs, hero sections, brand moments |
| `--gradient-hero` | `violet/15% → magenta/10% 135deg` | Page hero backgrounds |
| `--gradient-card-glow` | `radial from violet/10% to transparent` | Card top glow accent |
| `--gradient-chill` | `cyan → blue 135deg` | Chill mood cards |
| `--gradient-energy` | `amber → orange-red 135deg` | Energy mood cards |
| `--gradient-party` | `magenta → purple 135deg` | Party mood cards |
| `--gradient-focus` | `emerald → teal 135deg` | Focus mood cards |
| `--gradient-discover` | `violet → indigo 135deg` | Discovery features |

### Gradient Rules

- Hero sections always use `--gradient-hero` as background + `--gradient-card-glow` as `::before` overlay
- Mood cards use their corresponding gradient as a solid background with white text
- Icon containers use `bg-gradient-to-br from-{color}/20 to-{color}/20` (very subtle)
- Never use raw hex/rgb gradients — always reference CSS custom properties

---

## 3. Typography

Font: **Inter** (with system fallbacks: `ui-sans-serif, system-ui, sans-serif`)

| Element | Classes | Notes |
|---------|---------|-------|
| Page title (h1) | `text-2xl sm:text-3xl font-bold tracking-tight` | Rarely used — dashboard has no h1 |
| Section title | `text-xl sm:text-2xl font-bold` | Main content section headings |
| Card title | `text-base sm:text-lg font-semibold` | Inside card headers |
| Body text | `text-sm` | Default for content |
| Caption/label | `text-xs font-semibold text-muted-foreground uppercase tracking-wider` | Sidebar section headers, stat labels |
| Stat number | `text-2xl sm:text-3xl font-bold` | Dashboard stat values |
| Brand text | `.text-gradient-brand` class | Gradient brand text effect |

### Typography Rules

- All headings use `font-semibold tracking-tight` (set globally on `h1-h6`)
- Muted text always uses `text-muted-foreground`
- Truncate long text with `truncate` class. For sidebar items, use `.scroll-text-container` + `.scroll-text` for hover-to-scroll
- No `font-light` or `font-thin` anywhere

---

## 4. Spacing & Layout

### App Shell (3-column)

```
+------------------+-------------------+------------------+
| Left Sidebar     | Main Content      | Right Sidebar    |
| w-56 (224px)     | flex-1            | w-72 (288px)     |
| hidden < md      |                   | hidden < xl      |
+------------------+-------------------+------------------+
|              Fixed Player Bar (z-50)                    |
+---------------------------------------------------------+
```

- Left sidebar: `w-56`, `border-r`, `bg-card/30`
- Right sidebar: `w-72`, `border-l`, `bg-card/30`
- Player bar: `fixed bottom-0`, `bg-background/95 backdrop-blur-xl`, `border-t`
- Mobile: Full-width content + bottom MobileNav + slide-up PlayerBar

### Spacing Scale

| Context | Value |
|---------|-------|
| Page padding | `p-4 sm:p-6 lg:p-8` |
| Section gaps | `space-y-6 sm:space-y-8` (`.section-spacing`) |
| Card padding | `p-4 sm:p-5` |
| Card grid gap | `gap-3 sm:gap-4` |
| Sidebar item padding | `px-3 py-2` |
| Between sidebar sections | `space-y-6` |

### Grid Patterns

| Pattern | Classes |
|---------|---------|
| Dashboard stats | `grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4` |
| Feature cards | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6` |
| Mood cards | `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3` |
| Mobile grid | `.mobile-grid-1` = `grid-cols-1 → 2 → 3` |

---

## 5. Component Patterns

### Cards

Seven card tiers. Use the right one:

| Tier | Class/Pattern | Usage |
|------|--------------|-------|
| **Standard** | `<Card>` (shadcn) | Default for simple content containers (`rounded-lg`) |
| **Interactive** | `.interactive-card` | Clickable cards that lift on hover (`rounded-xl`) |
| **Glass** | `.glass-card` | Translucent overlays, `bg-background/80 backdrop-blur-sm` |
| **Glass Premium** | `.glass-card-premium` | High-emphasis overlays, `bg-card/60 backdrop-blur-xl` + inset border glow (`rounded-2xl`) |
| **Stat** | `.stat-card` | Dashboard stats, gradient top-border on hover (`rounded-xl`) |
| **Mood** | `.mood-card` + variant | Full-gradient background, white text, scales on hover (`rounded-2xl`) |
| **Now Playing** | `.now-playing-card` | Glow shadow, gradient background, `::before` glow overlay (`rounded-2xl`) |

### Card Rules

- Feature/custom cards use `rounded-xl` or `rounded-2xl`. The shadcn `<Card>` base uses `rounded-lg` — only acceptable for simple containers, not feature cards.
- Hover states: `hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5`
- Active states: `active:scale-[0.98]`
- Cards with gradient backgrounds always use white text
- Icon containers inside cards: `w-10 h-10 rounded-lg bg-{color}/10` or `bg-gradient-to-br from-{color}/20 to-{secondColor}/20`

### Buttons

| Variant | Usage |
|---------|-------|
| `default` (primary) | Primary actions |
| `outline` | Secondary actions |
| `ghost` | Tertiary, icon-only actions |
| `.action-button` | Brand gradient CTA — gradient background, white text, glow shadow, lift on hover |

### Action Button Rules

- Only ONE `.action-button` per visible section
- Always has `--gradient-brand` background + glow shadow
- Never appears in sidebars or secondary areas

### Badges

| Class | Usage |
|-------|-------|
| `<Badge>` (shadcn) | Default, used with variant prop |
| `.badge-success` | Green — confirmed, synced, available states |
| `.badge-warning` | Orange — degraded, limited, attention states |
| `.badge-info` | Blue — informational, counts, neutral metadata |
| `.badge-purple` | Purple — AI-powered, premium, special features |

All badge classes follow the pattern: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-{color}-100 text-{color}-800 dark:bg-{color}-900/30 dark:text-{color}-300`

### StatPill

Inline stat badges used in the dashboard hero. Rounded-full pills with color-coded borders:

```
+---------------------------+
| 42 Plays this week  +12% |
+---------------------------+
```

- Container: `rounded-full border px-3 py-1.5` (or `px-2.5 py-1` for compact)
- Three color variants:
  - `violet`: `bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400`
  - `emerald`: `bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400`
  - `amber`: `bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400`
- Optional delta indicator: `TrendingUp` / `TrendingDown` icon with emerald/red color

### Navigation

- Active nav item: `bg-primary/10 text-primary font-medium`
- Inactive: `text-muted-foreground hover:bg-accent/50 hover:text-foreground`
- Section headers: `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- Rank numbers use semantic colors: gold (`text-yellow-500`), silver (`text-gray-400`), bronze (`text-amber-600`)

### Sidebar Icon Color Coding

The right sidebar uses intentional section-specific gradient colors for icon containers (raw Tailwind, not brand tokens):

| Section | Gradient |
|---------|----------|
| Top Artists | `from-orange-500/20 to-red-500/20` with `text-orange-500/70` |
| Most Played | `from-green-500/20 to-emerald-500/20` with `text-green-500/70` |
| Recently Played | `from-blue-500/20 to-cyan-500/20` with `text-blue-500/70` |
| Recommendations | `from-purple-500/20 to-pink-500/20` with `text-purple-500/70` |
| Album art placeholder | `from-primary/20 via-purple-500/20 to-pink-500/20` |

This is intentional — each section has its own color identity for quick visual scanning.

---

## 6. Effects & Animation

### Glow Effects

- Hero glow orbs: `w-96 h-96 rounded-full blur-3xl` with brand gradient, `animation: float 8s`
- Card glow: `box-shadow: var(--shadow-glow-sm)` for elevated cards
- CTA glow: `box-shadow: 0 4px 14px oklch(0.55 0.25 285 / 0.3)` — increases on hover

### Shadow Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--shadow-sm` | `0 1px 2px oklch(0 0 0 / 0.05)` | same |
| `--shadow-md` | `0 4px 6px -1px oklch(0 0 0 / 0.1)` | same |
| `--shadow-lg` | `0 10px 15px -3px oklch(0 0 0 / 0.1)` | same |
| `--shadow-glow` | `0 0 40px oklch(0.55 0.25 285 / 0.2)` | `0 0 60px oklch(0.7 0.25 285 / 0.3)` |
| `--shadow-glow-sm` | `0 0 20px oklch(0.55 0.25 285 / 0.15)` | `0 0 30px oklch(0.7 0.25 285 / 0.2)` |

### Animations

| Animation | Class | Duration | Usage |
|-----------|-------|----------|-------|
| Fade up | `.animate-fade-up` | 500ms | Page entry, card entry |
| Stagger children | `.stagger-children` | 400ms per child, 100ms stagger | Lists, grid entries |
| Float | `@keyframes float` | 8-10s | Background glow orbs |
| Wave | `@keyframes wave` | 1-1.2s | Audio playing indicators |
| Vinyl spin | `.vinyl-spin` | 4s | Now-playing disc |
| Pulse ring | `.pulse-ring` | 2s | Status indicators |
| Shimmer | `.shimmer` | 2s | Loading placeholder overlay |
| Slow spin | `.animate-spin-slow` | 8s | Disc3 logo icon |
| Card hover | `.card-hover` | 200ms | Lift + shadow on hover |
| Fade in | `.fade-in` | 300ms | Opacity 0 → 1 entry |

### Animation Rules

- All animations respect `prefers-reduced-motion: reduce`
- Background animations (float, spin) are decorative — they NEVER block interaction
- Entry animations use `ease-out`, exits use `ease-in`
- Hover transitions: `duration-200` for cards, `duration-300` for backgrounds
- Never animate more than `transform` and `opacity` on mobile
- Animation library: `tw-animate-css` is imported globally for additional Tailwind animation utilities

---

## 7. Feedback & Notifications

### Toast Notifications

Uses **sonner** (`toast` from `'sonner'`). Standard patterns:

| Method | Usage |
|--------|-------|
| `toast.success(message)` | Completed actions: "Added to queue", "Synced 42 liked songs" |
| `toast.error(message)` | Failed actions: "Song not available in library", "Sync failed" |
| `toast.info(message)` | Informational: status updates, background task progress |

Rules:
- Keep messages under 60 characters
- Use present tense for success ("Added to queue" not "Song was added to queue")
- Never toast on every routine event — only user-initiated actions and errors

### Loading States

Two patterns, used based on context:

**Skeleton Loading** (primary pattern):
```html
<div className="flex items-center gap-3 p-2 animate-pulse">
  <div className="w-10 h-10 rounded-md bg-muted" />
  <div className="flex-1 space-y-1">
    <div className="h-3 bg-muted rounded w-3/4" />
    <div className="h-2 bg-muted rounded w-1/2" />
  </div>
</div>
```
- Uses `animate-pulse` with `bg-muted` rectangles matching the layout of the real content
- Skeleton shapes must mirror the final content dimensions (same width/height ratios)

**Shimmer overlay** (`.shimmer` class):
- Used on larger containers during loading
- Adds a sliding shine effect over the existing content

---

## 8. Dynamic Colors

The `useDynamicColors` hook (`src/hooks/useDynamicColors.ts`) extracts dominant colors from album art and applies them to the Now Playing widget:

- Extracts primary color from album art image
- Returns a `style` object with CSS custom properties for the dynamic color
- Used to tint the `now-playing-card` border, glow, and pulse ring
- Falls back to `--primary` when no album art is available or extraction fails

This is how the Now Playing card border/glow color shifts to match whatever album art is showing.

---

## 9. Icons

**Library**: Lucide React (exclusively). No other icon libraries.

### Icon Sizing

| Context | Size |
|---------|------|
| Nav items | `h-4 w-4` |
| Card feature icons | `h-5 w-5` |
| Hero/display icons | `h-10 w-10` to `h-16 w-16` |
| Action buttons | `h-3.5 w-3.5` to `h-5 w-5` |
| Inline with text | `h-4 w-4` |

### Key Icons

| Feature | Icon |
|---------|------|
| Home | `Home` |
| Discover | `Sparkles` |
| DJ Mode | `Radio` |
| Music/Browse | `Music` |
| Playlists | `ListMusic` |
| Analytics | `BarChart3` |
| Music Identity | `User` |
| Downloads | `Download` |
| Settings | `Settings` |
| Brand logo | `Disc3` |
| Library Growth | `TrendingUp` |

---

## 10. Dark Mode

AIDJ is dark-mode-first. Dark mode is the primary design target.

### Dark Mode Differences

- Background shifts from near-white to deep navy with violet tint
- Borders become white at 10% opacity (`oklch(1 0 0 / 0.1)`)
- Primary becomes more vibrant (higher lightness in OKLCH)
- Gradients intensify (higher opacity values)
- Glow shadows become larger and more visible
- Card backgrounds: `oklch(0.16 0.02 280)` — NOT pure dark, always has violet undertone

### Dark Mode Rules

- Never use `bg-black` or pure black backgrounds
- Always maintain the violet undertone in dark backgrounds
- Borders in dark mode are always semi-transparent white, never gray
- Glow effects are MORE prominent in dark mode, not less

---

## 11. Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|-----------|-------|--------------|
| Default | < 640px | Single column, mobile nav, stacked layouts |
| `sm` | >= 640px | 2-column grids, larger padding |
| `md` | >= 768px | Left sidebar visible |
| `lg` | >= 1024px | 3-column grids, expanded content |
| `xl` | >= 1280px | Right sidebar visible, full layout |

### Mobile Rules

- All interactive elements minimum `44px` touch target (`.touch-target`)
- Mobile cards use `p-3` not `p-4`
- Mobile text scales: `.mobile-text-sm` = `text-sm → text-base`
- Bottom safe area: `pb-[env(safe-area-inset-bottom)]` on fixed bottom elements
- No hover-dependent UI on mobile — everything accessible via tap

---

## 12. Accessibility

- Focus rings: `outline-2 outline-offset-2 outline-primary ring-2 ring-primary`
- Reduced motion: All animations collapse to instant transitions
- Color contrast: OKLCH values chosen for WCAG AA minimum
- Keyboard navigation: All interactive elements reachable via Tab
- Screen reader: Semantic HTML (`nav`, `main`, `aside`, `h1-h6`)

---

## 13. Page Anatomy (Dashboard Reference)

The dashboard is the gold standard. Every page should feel like it belongs next to it.

```
+------------------------------------------------------------------+
| Hero Section (hero-section class)                                |
| - gradient-hero background + card-glow ::before overlay          |
| - Floating glow orbs (hero-glow, hero-glow-secondary)           |
| - Welcome text + subtitle + StatPill row                         |
| - NowPlayingWidget or StartListeningCTA on right                 |
| - Optional: audio-wave animation                                 |
+------------------------------------------------------------------+
| Mood Cards Row (mood-card class)                                 |
| - 5 mood presets in a grid (chill, energy, party, focus, discover)|
| - Full gradient backgrounds, white text, scale on hover          |
| - Icon + label + song count                                      |
+------------------------------------------------------------------+
| Quick Actions (interactive-card class)                           |
| - Icon container + title + description                           |
| - Arrow icon on hover                                            |
| - 3-column grid on desktop                                       |
+------------------------------------------------------------------+
| DJ Features / More Features (interactive-card class)             |
| - Same pattern as quick actions                                  |
| - Feature-specific accent colors                                 |
+------------------------------------------------------------------+
| AI DJ Control (glass-card-premium or stat-card)                  |
| - Control panel aesthetic                                         |
| - Toggle switches, status indicators                             |
+------------------------------------------------------------------+
```

Every page follows this pattern:
1. **Hero/Header** -- gradient background, glow effects, primary CTA
2. **Feature Grid** -- interactive cards in 2-3 column grid
3. **Data/Content** -- stat cards, lists, charts
4. **Controls/Actions** -- bottom of page, secondary CTAs

---

## 14. Dead CSS (Cleanup Candidates)

These classes are defined in `src/styles.css` but not used in any component:

| Class | Defined | Used | Action |
|-------|---------|------|--------|
| `.feature-card-blue` | styles.css | nowhere | Remove or adopt |
| `.feature-card-purple` | styles.css | nowhere | Remove or adopt |
| `.feature-card-green` | styles.css | nowhere | Remove or adopt |
| `.feature-card-orange` | styles.css | nowhere | Remove or adopt |
| `.input-enhanced` | styles.css | nowhere | Remove or adopt |

These were defined as part of the design system but components use inline Tailwind classes instead. Either migrate components to use these classes or remove them from the stylesheet.
