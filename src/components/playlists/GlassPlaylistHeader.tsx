import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from '@tanstack/react-router';
import { Check, Pause, Play, Plus, Search, Shuffle, X } from 'lucide-react';
import { useDynamicColors } from '@/hooks/useDynamicColors';
import { cn } from '@/lib/utils';

interface SortOption<T extends string> {
  value: T;
  label: string;
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
  name, meta, coverUrl, searchQuery, onSearchChange, sortOptions, sortField, onSortChange,
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
          <button type="button" onClick={() => setSortOpen(true)} className="glass-flat rounded-xl px-4 text-[15px] font-bold">
            Sort
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

      <DialogPrimitive.Root open={sortOpen} onOpenChange={setSortOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/45" />
          <DialogPrimitive.Content className="glass-surface fixed inset-x-2 bottom-2 z-[71] rounded-[26px] bg-background/85 px-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-2 dark:bg-[rgb(22_20_32/0.86)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
            <span aria-hidden className="mx-auto mb-2.5 mt-1 block h-1 w-9 rounded-full bg-foreground/25" />
            <DialogPrimitive.Title className="mx-1.5 mb-1.5 font-display text-lg font-bold">Sort by</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Choose how songs are ordered</DialogPrimitive.Description>
            {sortOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={o.value === sortField}
                onClick={() => {
                  onSortChange(o.value);
                  setSortOpen(false);
                }}
                className="flex h-[50px] w-full items-center justify-between rounded-xl px-2 text-left text-[15px] active:bg-foreground/10"
              >
                <span className={cn(o.value === sortField && 'text-primary')}>{o.label}</span>
                {o.value === sortField && <Check className="size-[18px] text-primary" />}
              </button>
            ))}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
