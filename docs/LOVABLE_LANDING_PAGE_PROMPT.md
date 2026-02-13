# Lovable Prompt: AIDJ Landing Page Redesign

> Copy everything below the line into Lovable.

---

## Context

I'm redesigning the landing page for AIDJ, a self-hosted AI-powered music command center. The app already has an opinionated dashboard with immersive gradients, glass morphism, glow effects, and a violet/purple brand identity. The landing page currently looks like a placeholder — it needs to match the richness and polish of the rest of the app.

This is a React + TypeScript app using Tailwind CSS v4 and shadcn/ui. The page lives at `src/routes/index.tsx` and renders for unauthenticated users (logged-in users redirect to `/dashboard`).

## Design System (use these exactly)

### Color Tokens (CSS custom properties, already defined)

```css
/* ── Light mode ── */
--background: oklch(0.98 0.005 270);     /* Near-white with faint violet */
--foreground: oklch(0.15 0.01 270);      /* Near-black text */
--card: oklch(1 0 0);                    /* Pure white cards */
--primary: oklch(0.55 0.25 280);         /* Violet */
--muted: oklch(0.95 0.01 270);
--muted-foreground: oklch(0.5 0.02 270);
--border: oklch(0.9 0.01 270);           /* Light gray */

/* ── Dark mode (primary target) ── */
--background: oklch(0.12 0.02 280);      /* Deep navy with violet tint */
--foreground: oklch(0.95 0.01 270);      /* Near-white text */
--card: oklch(0.16 0.02 280);            /* Slightly lighter navy */
--primary: oklch(0.7 0.22 285);          /* Brighter violet */
--muted: oklch(0.2 0.02 280);
--muted-foreground: oklch(0.65 0.02 270);
--border: oklch(1 0 0 / 0.1);            /* White at 10% */

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
- Hero title: `text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight`
- Subtitle: `text-lg sm:text-xl text-muted-foreground`
- Section labels: `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- Brand text effect: violet-to-magenta gradient on text (background-clip: text)

### Existing CSS Classes (already in our stylesheet, use them)
- `.hero-section` — rounded-3xl container with `--gradient-hero` background and `::before` glow overlay
- `.hero-glow` — floating glow orb, `w-96 h-96 rounded-full blur-3xl`, brand gradient, `animation: float 8s`
- `.hero-glow-secondary` — secondary glow orb, cyan gradient, `animation: float 10s reverse`
- `.text-gradient-brand` — gradient text effect (violet to magenta)
- `.action-button` — brand gradient CTA button, white text, glow shadow, scales on hover
- `.glass-card` — `bg-background/80 backdrop-blur-sm border border-border/50`
- `.glass-card-premium` — `bg-card/60 backdrop-blur-xl border border-border/30 rounded-2xl` with inset border glow
- `.interactive-card` — `rounded-xl border p-4 sm:p-5`, lifts on hover with `hover:-translate-y-0.5`
- `.mood-card` — full gradient background, white text, `rounded-2xl p-5`, scales on hover with `hover:scale-[1.02]`
- `.stat-card` — `rounded-xl p-4 bg-card/50 border border-border/50`, gradient top-border on hover
- `.animate-fade-up` — fade + slide up 500ms
- `.stagger-children` — each child fades up 100ms apart
- `.animate-spin-slow` — 8s rotation (for disc icon)
- `.audio-wave` + `.audio-wave-bar` — animated equalizer bars
- `.shimmer` — loading shimmer effect

### Icons
Use Lucide React exclusively. Key icons: `Disc3` (brand logo), `Music`, `Sparkles` (AI/discovery), `Radio` (DJ), `Play`, `Headphones`, `BarChart3` (analytics), `Zap` (energy), `Layers` (playlists), `Shield` (self-hosted), `Brain` (AI)

## Page Structure

Design a single-page landing that scrolls vertically with these sections:

### Section 1: Hero (full viewport height)

- Full `min-h-svh` section with `overflow-hidden` (prevents glow orbs from causing horizontal scroll)
- Background: dark navy (`bg-background`) with two floating glow orbs (`.hero-glow` and `.hero-glow-secondary`) that slowly drift — orbs are `absolute` / `pointer-events-none`
- Additional subtle grid or dot pattern overlay at very low opacity for texture
- **All visible content** must be wrapped in `relative z-10` so it layers above the glow orbs
- Center-aligned content:
  - `Disc3` icon with `.animate-spin-slow` and a pulsing glow ring behind it (`absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse`)
  - App name "AIDJ" in `text-gradient-brand` at `text-6xl lg:text-8xl font-bold`
  - Tagline: "Your AI-powered music command center" in `text-xl text-muted-foreground`
  - `.action-button` CTA: "Get Started" with ArrowRight icon, links to `/login`
  - Below CTA: small text "Self-hosted. Private. Your music, your rules." in `text-sm text-muted-foreground`
- Theme toggle (sun/moon) pinned to `fixed top-4 right-4`
- Scroll indicator at bottom: small bouncing chevron-down icon

### Section 2: Feature Showcase (what makes AIDJ different)

- Section title: "Everything your music deserves" with `.text-gradient-brand`
- `text-xs uppercase tracking-wider text-muted-foreground` subtitle: "A complete music platform, not just a player"
- 3-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`) of `.interactive-card` components
- Each card has:
  - Icon container: `w-12 h-12 rounded-xl bg-gradient-to-br from-{color}/20 to-{secondColor}/20` with the icon in `{color}`
  - Title: `text-lg font-semibold`
  - Description: `text-sm text-muted-foreground` (2-3 lines)
  - Cards fade in with `.stagger-children`

Feature cards:

1. **AI DJ Engine** (icon: `Brain`, color: violet/purple)
   "Multi-provider LLM support with compound scoring. Play history, similarity, genre matching, and artist fatigue all factor into every recommendation."

2. **Dual-Deck Crossfade** (icon: `Disc3`, color: cyan/blue)
   "Gapless transitions between tracks with a real crossfade engine. 10 built-in audio visualizers from bars to particle starfields."

3. **Music Identity** (icon: `BarChart3`, color: magenta/pink)
   "Spotify Wrapped-style analytics on demand. Listening patterns, mood profiles, decade breakdowns, and shareable identity cards."

4. **Smart Playlists** (icon: `Layers`, color: emerald/green)
   "Rule-based smart playlists, drag-and-drop editing, collaborative playlists with real-time suggestions, and Navidrome two-way sync."

5. **Discovery Feed** (icon: `Sparkles`, color: amber/orange)
   "Background discovery finds new music while you listen. Accept, skip, or save — the engine learns your taste with every interaction."

6. **Self-Hosted & Private** (icon: `Shield`, color: violet/purple)
   "Your Navidrome library, your PostgreSQL database, your local AI. No data leaves your network unless you choose to connect Last.fm."

### Section 3: Mood Presets Visual (full-width)

- Section with slightly different background: `bg-card/30` or very subtle gradient shift
- Title: "Set the mood" in center
- Horizontal row of 5 mood cards using `.mood-card` base class **plus** the variant class for its gradient (these already exist in the stylesheet):
  - `.mood-card.mood-card-chill` — gradient: `--gradient-chill` (cyan → blue), icon: `Coffee` or `Waves`
  - `.mood-card.mood-card-energy` — gradient: `--gradient-energy` (amber → orange-red), icon: `Zap`
  - `.mood-card.mood-card-party` — gradient: `--gradient-party` (magenta → purple), icon: `PartyPopper` or `Music`
  - `.mood-card.mood-card-focus` — gradient: `--gradient-focus` (emerald → teal), icon: `Brain`
  - `.mood-card.mood-card-discover` — gradient: `--gradient-discover` (violet → indigo), icon: `Sparkles`
- Each card: icon, mood name, and a fake song count ("142 songs")
- Cards should be `min-w-[160px]` and horizontally scrollable on mobile, grid on desktop
- Use `.stagger-children` for entry animation

### Section 4: Integration Ecosystem

- Title: "Plays well with others"
- 2x3 grid of integration cards using `.glass-card-premium` style
- Each shows: service icon/logo area (just a colored icon container), service name, one-line description, "Required" or "Optional" badge
- Integrations:
  1. Navidrome — Music library & streaming (Required)
  2. PostgreSQL — Application database (Required)
  3. Last.fm — Scrobbling & similar tracks (Optional)
  4. Lidarr — Music acquisition (Optional)
  5. MeTube — YouTube audio downloads (Optional)
  6. Ollama / LLM — AI DJ recommendations (Optional)

### Section 5: Tech Stack Strip

- Narrow horizontal section with subtle border-top/bottom
- Row of tech badges: React 19, TypeScript, Tailwind v4, PostgreSQL, Drizzle ORM, shadcn/ui
- Each badge: small rounded pill with icon and name, `bg-card/50 border border-border/50 px-3 py-1.5 rounded-full text-xs`
- Horizontally scrollable on mobile, centered row on desktop

### Section 6: CTA Footer

- Another `.hero-section` style container but shorter (not full viewport)
- Glow orb effects
- "Ready to take control of your music?" in large text
- `.action-button` "Get Started" CTA
- Below: "Open source. Self-hosted. Zero tracking." in muted text
- Very bottom: "Unlicense (public domain)" link + small credit text

## Important Design Rules

1. **Dark mode is primary** — design for dark first, light mode second
2. **No pure black** — darkest background is `oklch(0.12 0.02 280)` (deep navy with violet tint)
3. **Borders in dark mode** are always semi-transparent white (`oklch(1 0 0 / 0.1)`), never gray
4. **Every section** has subtle background differentiation — alternate between `bg-background`, `bg-card/30`, and gradient overlays
5. **Glow effects** are prominent in dark mode — use `box-shadow: 0 0 40px oklch(0.7 0.25 285 / 0.3)` on hero elements
6. **Cards always `rounded-xl` or `rounded-2xl`** — never `rounded-lg` for feature cards
7. **Hover transitions** use `duration-200` for cards, `duration-300` for backgrounds
8. **Respect `prefers-reduced-motion`** — all animations should be optional
9. **Mobile-first** — everything works at 375px width, enhances from there
10. **No emoji** in the UI unless showing mood presets

## Existing Component Imports Available

```tsx
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
// Lucide icons
import { Disc3, Music, Sparkles, Radio, Play, ArrowRight, Brain, BarChart3, Layers, Shield, Zap, ChevronDown, Headphones } from "lucide-react";
```

## File Location

The component should export as the default route component for `/` (the root path). It's a standalone page that does NOT use the AppLayout shell — it has its own full-page layout with no sidebar.

```tsx
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: '/dashboard' });
    }
  },
});

function Home() {
  // ... landing page content
}
```

## Out of Scope

- **`/login` page** — already exists at `src/routes/(auth)/login.tsx` with its own design. The "Get Started" CTA links there; do not recreate it.
- **AppLayout shell** — the landing page is standalone; it does not use the sidebar/player bar layout.
- **Backend / API changes** — this is a purely frontend/visual redesign of the root route.
