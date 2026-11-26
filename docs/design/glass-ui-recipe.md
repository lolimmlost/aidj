# Glass UI recipe (phones)

The look that shipped on Home, Search, playlists and the Transition Lab
(canvas boards N/O, W/AE/AF, AD, AJ; draft PR #458). Use it for every page
that gets the glass treatment so they stay one family.

## Switch

- Flag `glassUi` (`src/lib/config/features.ts`), read with `useGlassUi()`
  after mount. Toggle: `?glass=1|0` or ☰ → "Glass design (preview)".
- Phones only: glass styles go behind `max-md:` / `md:hidden`; desktop keeps
  the old layout until there's a desktop direction.

## Page frame

- Page: `glass-page glass-home relative` + `<GlassBackdrop className="md:hidden" />`
  (cover-tinted glow from the playing song).
- Content starts under the top bar: `pt-[calc(env(safe-area-inset-top)+3.5rem)]`.
- Gutter: 16 px (`px-4`).
- **Page title: 26 px**, `font-display font-extrabold leading-8 tracking-[-0.03em]`.
  (Exception: a playlist / album / artist *name* in a hero can go 30 px.)
- First content 16 px under the title or filter chips.

## Sections

- Heading: 17 px `font-display font-bold`, **flush with the content edge**
  (no `px-1` inset). Use `GlassSectionHead` (`src/components/search/GlassSearch.tsx`).
- Right side of a heading: "See all N" (13 px, primary) when the section is
  truncated, else the plain count (13 px, muted). Status labels in the Lab
  are mono 10 px caps.
- Rhythm: **20 px between headed sections**; 8 px heading → content;
  stacked cards 10 px apart.
- "All"-style overviews show 5 rows or 8 tiles before "See all N".

## Surfaces

- `.glass-surface`: frosted card (backdrop blur). Radius 20 px for cards,
  18 px for pick cards, 26 px for bottom sheets.
- `.glass-flat`: same tint, **no blur**. Use for controls sitting on a
  gradient (find field, sort, chips): iOS draws the gradient twice inside a
  blurred layer (light rectangles).
- A `view-transition-name` makes an element a backdrop root: put it on the
  glass card itself, not a wrapper, or the card stops blurring the page.
- `[-webkit-tap-highlight-color:transparent]` on tappable glass, or iOS
  paints a dark box on tap.

## Rows and tiles

- Song row: 48 px cover (radius 6), title 15 px semibold, subtitle 13 px
  muted with a type tag ("Song · artist · 3:41"), the playing song's title in
  primary, trailing ⋯ (44 px target) → `SongActionSheet`.
- The ⋯ sheet is the one action menu everywhere: play next, queue, add to
  playlist (sub-list), like (library star), remove (where it applies),
  radio, go to artist, go to album.
- Tiles: **120 px**, artist = circle, album/song = radius 12; caption
  13 px semibold + 12 px muted second line ("Artist" / album artist).
  Sideways strips bleed to the screen edge (`-mx-4 px-4`), no scrollbar.
- Find field: `glass-flat`, 44 px, radius 12, 15 px semibold, placeholder
  at 70 % foreground.
- Chips: 36 px (`h-9`); selected = solid foreground pill, others glass.
  An `h-` class also opts out of the 44 px coarse-pointer min-height rule
  (`styles.css`, `@media (hover:none) and (pointer:coarse)`).

## Motion

- Playheads and pulses run in `requestAnimationFrame` on refs, never via
  re-renders; honour `prefers-reduced-motion`.
- Sticky compact bars take over when the hero's play button scrolls under
  them, so only one play button is ever visible.

## Gotchas already paid for

- A sticky element can't leave its parent: headers that must stick over a
  list return a fragment into the list's column.
- Radix ScrollArea's `display: table` child breaks flex truncation
  (see CLAUDE.md).
- Layered component classes (`.glass-flat`, `.glass-surface`) can't take
  Tailwind variants (`max-md:glass-flat` does nothing) and lose to utilities
  like `bg-*` / `border-*`: switch the class list instead.
