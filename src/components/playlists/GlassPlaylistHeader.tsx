import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, Pause, Play, Plus, Search, Shuffle, X } from 'lucide-react';
import { GlassSheet } from '@/components/glass/GlassSheet';
import { useDynamicColors } from '@/hooks/useDynamicColors';
import { cn } from '@/lib/utils';

interface SortOption<T extends string> {
  value: T;
  label: string;
  /** How each direction reads ("A–Z", "Newest first"); none = no direction (custom order). */
  asc?: string;
  desc?: string;
}

interface GlassPlaylistHeaderProps<T extends string> {
  name: string;
  meta: string;
  /** Playlist cover (Navidrome collage); null = Liked Songs style wash, no cover. */
  coverUrl: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortOptions: SortOption<T>[];
  sortField: T;
  sortDirection: 'asc' | 'desc';
  /** Picking the current field again flips its direction. */
  onSortChange: (field: T) => void;
  onPlay: () => void;
  onShuffle: () => void;
  isPlayingThis: boolean;
  disabled?: boolean;
  /** Left side of the action row (radio, more menu…). */
  leftActions?: ReactNode;
  showAddSongs?: boolean;
}

/**
 * Glass UI (phones): playlist header in the library-app shape — find + sort,
 * cover (or a colour wash for Liked Songs), title, an action row ending in one
 * big Play. When that Play scrolls under the top bar, a compact bar with the
 * centred title and the Play button takes over, so only one is ever visible.
 */
export function GlassPlaylistHeader<T extends string>({
  name, meta, coverUrl, searchQuery, onSearchChange, sortOptions, sortField, sortDirection, onSortChange,
  onPlay, onShuffle, isPlayingThis, disabled, leftActions, showAddSongs,
}: GlassPlaylistHeaderProps<T>) {
  const barRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const [docked, setDocked] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const { colors } = useDynamicColors(coverUrl);
  const wash = coverUrl
    ? colors?.primary
      ? `color-mix(in oklch, ${colors.primary} 70%, transparent)`
      : 'color-mix(in oklch, var(--primary) 35%, transparent)'
    : 'oklch(0.5 0.22 285 / 0.85)';

  useEffect(() => {
    const play = playRef.current;
    const bar = barRef.current;
    if (!play || !bar) return;
    const scroller: HTMLElement | Window =
      (play.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null) ?? window;
    let frame = 0;
    const check = () => {
      frame = 0;
      setDocked(play.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const current = sortOptions.find((o) => o.value === sortField);
  const sorted = !!current?.asc;
  const dirLabel = sorted ? (sortDirection === 'asc' ? current?.asc : current?.desc) : undefined;
  const SortIcon = !sorted ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;

  const playIcon = isPlayingThis ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />;
  const playLabel = isPlayingThis ? 'Pause' : `Play ${name}`;

  // Fragment on purpose: the sticky bar must sit in the page section that also
  // holds the song list (a sticky element can't leave its parent), and the
  // wash is positioned against that section. The parent must be `relative`.
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-24 h-[440px] md:hidden"
        style={{ background: `linear-gradient(180deg, ${wash} 0%, transparent 100%)` }}
      />

      {/* Compact bar (in flow height 0): centred title + the docked Play */}
      <div
        ref={barRef}
        className={cn(
          // full-bleed past the page + column gutters (12 + 12 px), tinted like the wash
          'sticky top-[calc(env(safe-area-inset-top)+3rem)] z-20 -mx-6 -mb-14 flex h-14 items-center justify-center px-20 transition-opacity duration-200 md:hidden',
          'backdrop-blur-xl',
          docked ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!docked}
        style={{ background: `linear-gradient(180deg, color-mix(in oklch, ${wash} 60%, var(--background)), color-mix(in oklch, var(--background) 88%, transparent))` }}
      >
        <span className="truncate font-display text-[17px] font-bold">{name}</span>
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          tabIndex={docked ? 0 : -1}
          aria-label={playLabel}
          className="absolute right-6 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
        >
          {playIcon}
        </button>
      </div>

      <div className="relative pt-2 md:hidden">
        <div className="flex h-11 gap-2">
          <label className="glass-flat flex flex-1 items-center gap-2.5 rounded-xl px-3">
            <Search className="size-[18px] shrink-0" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Find in ${name}`}
              aria-label={`Find in ${name}`}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-foreground/70"
            />
            {searchQuery && (
              <button type="button" aria-label="Clear" onClick={() => onSearchChange('')} className="grid size-6 place-items-center rounded-full text-muted-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            aria-label={`Sort: ${current?.label ?? 'Custom'}${dirLabel ? `, ${dirLabel}` : ''}`}
            className={cn(
              'glass-flat flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[15px] font-bold [-webkit-tap-highlight-color:transparent]',
              sorted && 'text-primary',
            )}
          >
            <SortIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{sorted ? current?.label : 'Sort'}</span>
          </button>
        </div>

        {coverUrl && (
          <div className="flex justify-center pt-5">
            <img
              src={coverUrl}
              alt=""
              className="size-[196px] rounded-lg bg-muted object-cover shadow-[0_24px_50px_rgb(0_0_0/0.5)]"
            />
          </div>
        )}

        <h1 className={cn('font-display text-[30px] font-extrabold leading-9 tracking-[-0.03em]', coverUrl ? 'mt-4' : 'mt-6')}>
          {name}
        </h1>
        <p className="text-sm text-foreground/70">{meta}</p>

        <div className="mt-3 flex h-14 items-center gap-2">
          {leftActions}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onShuffle}
            disabled={disabled}
            aria-label="Shuffle play"
            className="grid size-11 place-items-center rounded-full text-foreground/80"
          >
            <Shuffle className="size-6" />
          </button>
          <button
            ref={playRef}
            type="button"
            onClick={onPlay}
            disabled={disabled}
            tabIndex={docked ? -1 : 0}
            aria-label={playLabel}
            className={cn(
              'grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary)_45%,transparent)] transition-opacity',
              docked && 'opacity-0',
            )}
          >
            {playIcon}
          </button>
        </div>

        {showAddSongs && (
          <Link
            to="/library/search"
            className="mt-2 flex items-center gap-3.5 rounded-lg py-1.5 text-base active:bg-foreground/5"
          >
            <span className="grid size-12 place-items-center rounded bg-foreground/10">
              <Plus className="size-5" aria-hidden />
            </span>
            Add songs
          </Link>
        )}
      </div>

      <GlassSheet open={sortOpen} onOpenChange={setSortOpen} title="Sort by" description="Choose how songs are ordered">
        {sortOptions.map((o) => {
          const on = o.value === sortField;
          const dir = o.asc && o.desc ? (on ? (sortDirection === 'asc' ? o.asc : o.desc) : null) : null;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onSortChange(o.value);
                // A new field closes the sheet; the same one flips and stays so you see it.
                if (!on || !o.asc) setSortOpen(false);
              }}
              className={cn(
                'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-3 text-left [-webkit-tap-highlight-color:transparent] active:bg-foreground/10',
                on && 'bg-primary/10',
              )}
            >
              <span className="min-w-0">
                <span className={cn('block truncate text-[15px] font-semibold', on && 'text-primary')}>{o.label}</span>
                {dir != null && <span className="block text-[13px] text-muted-foreground">{dir} · tap to flip</span>}
              </span>
              {on && (dir == null ? null : sortDirection === 'asc'
                ? <ArrowUp className="size-5 shrink-0 text-primary" />
                : <ArrowDown className="size-5 shrink-0 text-primary" />)}
            </button>
          );
        })}
      </GlassSheet>
    </>
  );
}
