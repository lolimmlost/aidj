/**
 * The playlist page's song list: rows (marquee titles, heart, ⋯ / dropdown actions), drag to reorder
 * on desktop, virtualised so huge playlists stay light (#420). Moved out of routes/playlists/$id.tsx.
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode, type ReactElement, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useScrollSafeMenu } from '@/lib/hooks/useScrollSafeMenu';
import { Play, X, Plus, Heart, MoreHorizontal, Music2, GripVertical, SkipForward, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DndContext, closestCenter, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseArtistTitle } from '@/lib/utils/song-artist-title';

export interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
  duration?: number | null;
  album?: string | null;
  albumId?: string | null;
  artistId?: string | null;
  starred?: boolean;
}

interface SongRowProps {
  song: PlaylistSong;
  index: number;
  isCurrentSong: boolean;
  isPlaying: boolean;
  onPlayFromSong: (index: number) => void;
  onAddSongToQueue: (song: PlaylistSong, position: 'now' | 'next' | 'end') => void;
  onRemoveSong: (songId: string) => void;
  onToggleStar: (songId: string, currentlyStarred: boolean) => void;
  onStartRadioFromSong: (songId: string) => void;
  isRemovePending: boolean;
  /** Glass UI (phones): no track number, ⋯ opens the action sheet, optional no heart. */
  glass?: boolean;
  hideHeart?: boolean;
  onMore?: (song: PlaylistSong) => void;
}

// Format duration as mm:ss
function formatDuration(seconds?: number | null) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export // Display wrapper over the canonical parser. The UI wants a visible
// "Unknown Artist" placeholder; `parseArtistTitle` deliberately never returns
// one, because an "Unknown" that looks like a real value defeats the
// truthiness guards downstream.
function extractArtistTitle(songArtistTitle: string): [string, string] {
  const { artist, title } = parseArtistTitle(songArtistTitle);
  return [artist || 'Unknown Artist', title];
}

// Marquee timing (#450): one pass out and back, then a long hold so a list of
// long titles isn't a wall of moving text.
const MARQUEE_SPEED_PX_PER_S = 40;
const MARQUEE_MIN_MOVE_MS = 1200;
const MARQUEE_HOLD_MS = 5000; // still at the start, between passes
const MARQUEE_END_HOLD_MS = 1500; // still at the end so the tail can be read
const MARQUEE_FIRST_DELAY_MS = 2000; // first pass after mount (rows mount while scrolling)
const MARQUEE_FADE_PX = 24; // right-edge fade on titles that don't fit

/**
 * Text that scrolls horizontally when content overflows its container: slides
 * to the end, holds, slides back, then holds ~5 s before the next pass. No-ops
 * when text fits or the user prefers reduced motion.
 */
function MarqueeText({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Text width without the fade padding, which is only added once it overflows.
    const padding = parseFloat(getComputedStyle(inner).paddingRight) || 0;
    const diff = inner.scrollWidth - padding - outer.clientWidth;
    setOverflow(diff > 1 ? diff + MARQUEE_FADE_PX : 0);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure, children]);

  // The hold is a fixed time while the move time scales with the overflow, so
  // keyframe offsets are computed per row (CSS percentages can't express it).
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || overflow <= 0 || typeof inner.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const move = Math.max(MARQUEE_MIN_MOVE_MS, (overflow / MARQUEE_SPEED_PX_PER_S) * 1000);
    const total = MARQUEE_HOLD_MS + move + MARQUEE_END_HOLD_MS + move;
    const at = (ms: number) => ms / total;
    const start = 'translateX(0)';
    const end = `translateX(-${overflow}px)`;
    const animation = inner.animate(
      [
        { transform: start, offset: 0 },
        { transform: start, offset: at(MARQUEE_HOLD_MS), easing: 'ease-in-out' },
        { transform: end, offset: at(MARQUEE_HOLD_MS + move) },
        { transform: end, offset: at(MARQUEE_HOLD_MS + move + MARQUEE_END_HOLD_MS), easing: 'ease-in-out' },
        { transform: start, offset: 1 },
      ],
      // Negative delay = start partway into the opening hold.
      { duration: total, iterations: Infinity, delay: MARQUEE_FIRST_DELAY_MS - MARQUEE_HOLD_MS },
    );
    return () => animation.cancel();
  }, [overflow]);

  // A long title fades out at the right edge instead of being cut mid-letter.
  // The padding (counted in the overflow) lets the tail clear the fade when scrolled.
  const fade = overflow > 0
    ? `linear-gradient(to right, #000 calc(100% - ${MARQUEE_FADE_PX}px), transparent)`
    : undefined;
  return (
    <div
      ref={outerRef}
      className="overflow-hidden whitespace-nowrap"
      style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
    >
      <span ref={innerRef} className="inline-block" style={overflow > 0 ? { paddingRight: MARQUEE_FADE_PX } : undefined}>
        {children}
      </span>
    </div>
  );
}

/**
 * Shared song row content — used by both plain and sortable variants
 */
function SongRowContent({
  song,
  index,
  isCurrentSong,
  isPlaying,
  onAddSongToQueue,
  onRemoveSong,
  onToggleStar,
  onStartRadioFromSong,
  isRemovePending,
  dragHandle,
  glass,
  hideHeart,
  onMore,
}: SongRowProps & { dragHandle?: ReactElement }) {
  const [artist, title] = extractArtistTitle(song.songArtistTitle);

  const { open: menuOpen, onOpenChange: onMenuOpenChange, triggerProps: menuTriggerProps } = useScrollSafeMenu();

  return (
    <>
      {/* Drag Handle — only rendered on desktop */}
      {dragHandle}

      {/* Track Number / Equalizer */}
      <span className={cn(
        "w-8 text-sm tabular-nums text-right shrink-0 flex items-center justify-end",
        isCurrentSong ? "text-primary" : "text-muted-foreground",
        glass && "max-md:hidden",
      )}>
        {index + 1}
      </span>

      {/* Album Art Thumbnail */}
      <div className="relative w-11 h-11 shrink-0">
        {song.albumId ? (
          <img
            src={`/api/navidrome/rest/getCoverArt?id=${song.albumId}&size=96`}
            alt=""
            className="w-11 h-11 rounded shrink-0 object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="w-11 h-11 rounded shrink-0 bg-muted flex items-center justify-center">
            <Music2 className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        )}
        {isCurrentSong && isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
            <span className="audio-wave !h-3">
              <span className="audio-wave-bar !w-[2px] !bg-primary" />
              <span className="audio-wave-bar !w-[2px] !bg-primary" />
              <span className="audio-wave-bar !w-[2px] !bg-primary" />
            </span>
          </div>
        )}
      </div>

      {/* Song Info: the row plays on a tap anywhere (the button keeps keyboard focus; its click bubbles to the row).
          Never narrower than ~6rem, so the artist / album columns can't squeeze the title away */}
      <button
        type="button"
        aria-label={`Play ${title}`}
        className="min-w-[6rem] flex-1 text-left py-0.5 min-h-[44px] flex flex-col justify-center overflow-hidden"
      >
        {/* Two lines on every screen: title (scrolls if long) over artist */}
        <div className={cn("text-[15px] sm:text-sm leading-snug font-medium", isCurrentSong && "text-primary")}>
          <MarqueeText>{title}</MarqueeText>
        </div>
        <div className="text-[13px] sm:text-xs leading-snug text-muted-foreground truncate">
          {artist}
        </div>
      </button>

      {/* Album - from md (between sm and md it left the title no room) */}
      <span className="hidden md:block text-sm text-muted-foreground truncate w-32 lg:w-40 shrink min-w-0">
        {song.album || '—'}
      </span>

      {/* Duration */}
      <span className="hidden sm:block text-sm text-muted-foreground tabular-nums shrink-0 w-12 text-right">
        {formatDuration(song.duration) || '—'}
      </span>

      {/* Date added - large screens only */}
      <span className="hidden lg:block text-sm text-muted-foreground shrink-0 w-28 text-right">
        {new Date(song.addedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })}
      </span>

      {/* Star toggle: always there on phones (there was no other way to like a song here); hover-revealed on desktop */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={song.starred ? `Unlike ${title}` : `Like ${title}`}
        aria-pressed={!!song.starred}
        className={cn(
          "h-9 w-9 sm:h-8 sm:w-8 p-0 shrink-0 transition-opacity inline-flex",
          glass && hideHeart && "max-md:hidden",
          song.starred ? "opacity-100 text-rose-500 hover:text-rose-600" : "text-muted-foreground/60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-500"
        )}
        onClick={(e) => { e.stopPropagation(); onToggleStar(song.songId, !!song.starred); }}
      >
        <Heart className={cn("h-4 w-4", song.starred && "fill-current")} />
      </Button>

      {/* Play Next - desktop hover only (accessible via menu on mobile) */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hidden sm:inline-flex"
        onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'next'); }}
        title="Play Next"
      >
        <SkipForward className="h-4 w-4" />
      </Button>

      {/* Glass UI (phones): ⋯ opens the action sheet instead of the dropdown */}
      {glass && onMore && (
        <button
          type="button"
          aria-label={`More for ${title}`}
          onClick={(e) => { e.stopPropagation(); onMore(song); }}
          className="md:hidden grid h-10 w-9 shrink-0 place-items-center text-muted-foreground [-webkit-tap-highlight-color:transparent]"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      )}

      {/* Actions menu — controlled + scroll-guarded on mobile */}
      <span className={glass && onMore ? "hidden md:contents" : "contents"}>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
            {...menuTriggerProps}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'now'); }}
            className="min-h-[40px]"
          >
            <Play className="mr-2 h-4 w-4" />
            Play Now
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'next'); }}
            className="min-h-[40px]"
          >
            <Play className="mr-2 h-4 w-4" />
            Play Next
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'end'); }}
            className="min-h-[40px]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add to End
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onStartRadioFromSong(song.songId); }}
            className="min-h-[40px]"
          >
            <Radio className="mr-2 h-4 w-4" />
            Start Radio from Song
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onRemoveSong(song.songId); }}
            disabled={isRemovePending}
            className="min-h-[40px] text-destructive focus:text-destructive"
          >
            <X className="mr-2 h-4 w-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>
    </>
  );
}

/**
 * Plain song row for mobile — no DnD overhead
 */
function PlainSongRow(props: SongRowProps) {
  return (
    <div
      data-song-id={props.song.songId}
      onClick={() => props.onPlayFromSong(props.index)}
      className={cn(
        "group flex items-center gap-3 px-3 py-1.5 hover:bg-accent/50 rounded-md transition-colors min-w-0 cursor-pointer",
        props.isCurrentSong && (props.glass ? "bg-primary/10 md:border-l-2 md:border-l-primary" : "bg-primary/10 border-l-2 border-l-primary"),
        props.glass && "max-md:px-1 max-md:[-webkit-tap-highlight-color:transparent]"
      )}
    >
      <SongRowContent {...props} />
    </div>
  );
}

/**
 * Sortable song row for desktop — wraps content with DnD
 */
function SortableSongRow(props: SongRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-song-id={props.song.songId}
      onClick={() => props.onPlayFromSong(props.index)}
      className={cn(
        "group flex items-center gap-3 px-3 py-1.5 hover:bg-accent/50 rounded-md transition-colors min-w-0 cursor-pointer",
        props.isCurrentSong && "bg-primary/10 border-l-2 border-l-primary",
        isDragging && "opacity-50 bg-accent shadow-lg"
      )}
    >
      <SongRowContent
        {...props}
        dragHandle={
          <div
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing touch-none shrink-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        }
      />
    </div>
  );
}

/** Imperative handle so the page can jump to a row that may not be rendered yet. */
export interface PlaylistSongsListHandle {
  scrollToIndex: (index: number, align?: 'start' | 'center') => void;
}

interface VirtualizedPlaylistSongsProps {
  songs: PlaylistSong[];
  currentSongId?: string;
  isPlaying: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onPlayFromSong: (index: number) => void;
  onAddSongToQueue: (song: PlaylistSong, position: 'now' | 'next' | 'end') => void;
  onRemoveSong: (songId: string) => void;
  onToggleStar: (songId: string, currentlyStarred: boolean) => void;
  onStartRadioFromSong: (songId: string) => void;
  isRemovePending: boolean;
  disableDnD?: boolean;
  handleRef?: RefObject<PlaylistSongsListHandle | null>;
  /** Glass UI (phones): no track number, ⋯ opens the action sheet, optional no heart. */
  glass?: boolean;
  hideHeart?: boolean;
  onMore?: (song: PlaylistSong) => void;
}

/** Row height estimate (py-1.5 + 44px art); real heights are measured. */
const SONG_ROW_ESTIMATE = 56;

export function PlaylistSongsList({
  songs,
  currentSongId,
  isPlaying,
  sensors,
  onDragEnd,
  onPlayFromSong,
  onAddSongToQueue,
  onRemoveSong,
  onToggleStar,
  onStartRadioFromSong,
  isRemovePending,
  disableDnD,
  handleRef,
  glass,
  hideHeart,
  onMore,
}: VirtualizedPlaylistSongsProps) {
  // Disable DnD on mobile — TouchSensor intercepts taps and wastes space
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Rows are virtualized against the app shell's scroll container (the Radix
  // ScrollArea viewport in AppLayout), so a 4,000-song playlist only mounts the
  // rows on screen instead of crashing the tab.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const viewport = list.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    setScrollEl(viewport);
    if (!viewport) return;
    // Offset of the list's top within the scroll content; content above it
    // (header, search bar) can change height, so re-measure on resize.
    const measure = () => {
      const offset = list.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      setScrollMargin((prev) => (Math.abs(prev - offset) > 0.5 ? offset : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => SONG_ROW_ESTIMATE,
    overscan: 12,
    scrollMargin,
    getItemKey: (index) => songs[index].id,
  });

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      scrollToIndex: (index, align = 'start') => virtualizer.scrollToIndex(index, { align }),
    };
    return () => { handleRef.current = null; };
  }, [handleRef, virtualizer]);

  // Auto-scroll to now-playing song on mount
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || !currentSongId || !scrollEl) return;
    const idx = songs.findIndex((s) => s.songId === currentSongId);
    if (idx < 0) return;
    scrolledRef.current = true;
    requestAnimationFrame(() => virtualizer.scrollToIndex(idx, { align: 'center' }));
  }, [currentSongId, songs, scrollEl, virtualizer]);

  const sharedRowProps = {
    isPlaying,
    onPlayFromSong,
    onAddSongToQueue,
    onRemoveSong,
    onToggleStar,
    onStartRadioFromSong,
    isRemovePending,
    glass,
    hideHeart,
    onMore,
  };

  const useDnD = isDesktop && !disableDnD;
  const songIds = useMemo(() => songs.map((s) => s.id), [songs]);
  const virtualRows = virtualizer.getVirtualItems();

  const rows = (
    <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualRows.map((vr) => {
        const song = songs[vr.index];
        const Row = useDnD ? SortableSongRow : PlainSongRow;
        return (
          <div
            key={vr.key}
            data-index={vr.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${vr.start - virtualizer.options.scrollMargin}px)` }}
          >
            <Row
              song={song}
              index={vr.index}
              isCurrentSong={song.songId === currentSongId}
              {...sharedRowProps}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="overflow-hidden">
      {/* Column Headers - desktop only */}
      <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span className="w-6 shrink-0" /> {/* Drag handle space */}
        <span className="w-8 text-right shrink-0">#</span>
        <span className="w-11 shrink-0" /> {/* Art space */}
        <span className="flex-1 min-w-0">Title</span>
        <span className="hidden md:block w-32 lg:w-40 shrink min-w-0">Album</span>
        <span className="w-12 text-right shrink-0">Time</span>
        <span className="hidden lg:block w-28 text-right shrink-0">Added</span>
        <span className="w-[6.5rem] shrink-0" /> {/* Star + Play next + Actions space */}
      </div>

      {useDnD ? (
        /* Desktop: DnD-enabled sortable rows */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={songIds} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        /* Plain rows — no DnD (mobile or when filtering/sorting) */
        rows
      )}
    </div>
  );
}

