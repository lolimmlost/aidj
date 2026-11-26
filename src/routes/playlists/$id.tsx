import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { loginRedirect } from '~/lib/auth/login-redirect';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useScrollSafeMenu } from '@/lib/hooks/useScrollSafeMenu';
import {
  ListMusic, Play, Trash2, X, Plus, Shuffle,
  Heart, Sparkles, MoreHorizontal, Music2, Pause, GripVertical,
  Users, SkipForward, Search, ArrowUpDown, ArrowUp, ArrowDown, ListStart, ListEnd
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Radio } from 'lucide-react';
import { PageLayout } from '@/components/ui/page-layout';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';
import { CollaborativePlaylistPanel } from '@/components/playlists/collaboration';
import { StartRadioButton } from '@/components/radio/StartRadioButton';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { GlassPlaylistHeader } from '@/components/playlists/GlassPlaylistHeader';
import { AlphabetRail } from '@/components/glass/AlphabetRail';
import { GlassSheet, SheetRow } from '@/components/glass/GlassSheet';
import { SongActionSheet, type ActionSheetSong } from '@/components/glass/SongActionSheet';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseArtistTitle } from '@/lib/utils/song-artist-title';
import { usePageTitle } from '@/lib/hooks/useDocumentTitle';

export const Route = createFileRoute('/playlists/$id')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
    }
    return { user: context.user };
  },
  component: PlaylistDetailPage,
});

interface PlaylistSong {
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

interface PlaylistDetail {
  id: string;
  name: string;
  description?: string | null;
  songs: PlaylistSong[];
  createdAt: Date;
  updatedAt: Date;
  // True when this is the canonical ❤️ Liked Songs playlist (server-computed).
  isLikedSongs?: boolean;
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

type SortField = 'custom' | 'title' | 'artist' | 'album' | 'dateAdded' | 'duration';

const SORT_OPTIONS: Array<{ value: SortField; label: string; asc?: string; desc?: string }> = [
  { value: 'custom', label: 'Custom Order' },
  { value: 'title', label: 'Title', asc: 'A–Z', desc: 'Z–A' },
  { value: 'artist', label: 'Artist', asc: 'A–Z', desc: 'Z–A' },
  { value: 'album', label: 'Album', asc: 'A–Z', desc: 'Z–A' },
  { value: 'dateAdded', label: 'Date Added', asc: 'Oldest first', desc: 'Newest first' },
  { value: 'duration', label: 'Duration', asc: 'Shortest first', desc: 'Longest first' },
];

// Display wrapper over the canonical parser. The UI wants a visible
// "Unknown Artist" placeholder; `parseArtistTitle` deliberately never returns
// one, because an "Unknown" that looks like a real value defeats the
// truthiness guards downstream.
function extractArtistTitle(songArtistTitle: string): [string, string] {
  const { artist, title } = parseArtistTitle(songArtistTitle);
  return [artist || 'Unknown Artist', title];
}

function getSortValue(song: PlaylistSong, field: SortField): string | number {
  const [artist, title] = extractArtistTitle(song.songArtistTitle);
  switch (field) {
    case 'title': return title.toLowerCase();
    case 'artist': return artist.toLowerCase();
    case 'album': return (song.album || '').toLowerCase();
    case 'dateAdded': return new Date(song.addedAt).getTime();
    case 'duration': return song.duration || 0;
    default: return song.position;
  }
}

/** Sorts where the list runs in letter order, so a letter rail means something. */
const ALPHA_SORTS = new Set<SortField>(['title', 'artist', 'album']);

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
}: SongRowProps & { dragHandle?: JSX.Element }) {
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

function PlaylistSongsList({
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

function playlistSongsToAudio(songs: PlaylistSong[]) {
  return songs.map((song) => {
    const [artist, title] = extractArtistTitle(song.songArtistTitle);
    return {
      id: song.songId,
      name: title,
      title,
      artist,
      artistId: song.artistId || undefined,
      album: song.album || undefined,
      albumId: song.albumId || '',
      duration: song.duration || 0,
      track: song.position,
      url: `/api/navidrome/stream/${song.songId}`,
    };
  });
}

function PlaylistDetailPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPlaylist, playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress, playlist: audioPlaylist, currentSongIndex, isPlaying, startRadio } = useAudioStore();
  const currentSong = useMemo(() => audioPlaylist[currentSongIndex] || null, [audioPlaylist, currentSongIndex]);

  // Collaboration panel state
  const [isCollaborationPanelOpen, setIsCollaborationPanelOpen] = useState(false);

  // Glass UI prototype (phones): new header + ⋯ action sheet
  const glass = useGlassUi();
  const [actionSong, setActionSong] = useState<PlaylistSong | null>(null);

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('custom');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [glassMoreOpen, setGlassMoreOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const songListRef = useRef<HTMLDivElement>(null);
  const songListHandleRef = useRef<PlaylistSongsListHandle | null>(null);

  // Check if this is a special playlist type
  const isLikedSongsPlaylist = id === 'liked-songs';
  const isSmartPlaylist = id.startsWith('smart-');

  const { data: playlist, isLoading, error } = useQuery({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const response = await fetch(`/api/playlists/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch playlist');
      }
      const json = await response.json();
      return json.data as PlaylistDetail;
    },
  });
  usePageTitle(playlist?.name);

  // Reconcile-on-open backstop for Liked Songs: when the canonical Liked Songs
  // playlist is opened, rebuild it once from Navidrome stars so the view
  // self-heals from out-of-band changes (e.g. unstarring directly in the
  // Navidrome client), which the app's own write-through can't observe.
  // Fires once per playlist id; silent + non-blocking (the cached list renders
  // immediately, then refreshes when the rebuild lands).
  const reconciledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playlist?.isLikedSongs) return;
    if (reconciledIdRef.current === id) return;
    reconciledIdRef.current = id;
    void (async () => {
      try {
        const res = await fetch('/api/playlists/liked-songs/sync', { method: 'POST' });
        if (!res.ok) return;
        queryClient.invalidateQueries({ queryKey: ['playlist', id] });
        queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      } catch {
        // Non-blocking: the cached view stays usable if the reconcile fails.
      }
    })();
  }, [playlist?.isLikedSongs, id, queryClient]);

  const removeSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      const response = await fetch(`/api/playlists/${id}/songs/${songId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to remove song');
      }
      return response.json();
    },
    onMutate: async (songId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['playlist', id] });
      const previousPlaylist = queryClient.getQueryData(['playlist', id]);
      queryClient.setQueryData(['playlist', id], (old: PlaylistDetail | undefined) => {
        if (!old) return old;
        return {
          ...old,
          songs: old.songs.filter(s => s.songId !== songId),
        };
      });
      return { previousPlaylist };
    },
    onError: (error, _, context) => {
      // Revert optimistic update
      if (context?.previousPlaylist) {
        queryClient.setQueryData(['playlist', id], context.previousPlaylist);
      }
      toast.error('Failed to remove song', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Song removed from playlist');
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/playlists/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.message || 'Failed to delete playlist');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Playlist deleted');
      navigate({ to: '/playlists' });
    },
    onError: (error) => {
      toast.error('Failed to delete playlist', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });

  const reorderSongsMutation = useMutation({
    mutationFn: async (songIds: string[]) => {
      const response = await fetch(`/api/playlists/${id}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds }),
      });
      if (!response.ok) {
        throw new Error('Failed to reorder songs');
      }
      return response.json();
    },
    onError: (error) => {
      // Revert on error by refetching
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      toast.error('Failed to reorder songs', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });

  // Drag and drop sensors - includes TouchSensor for mobile support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && playlist) {
      const oldIndex = playlist.songs.findIndex((s) => s.id === active.id);
      const newIndex = playlist.songs.findIndex((s) => s.id === over.id);

      // Optimistic update
      const reorderedSongs = arrayMove(playlist.songs, oldIndex, newIndex);
      queryClient.setQueryData(['playlist', id], {
        ...playlist,
        songs: reorderedSongs,
      });

      // Send reorder request
      reorderSongsMutation.mutate(reorderedSongs.map((s) => s.songId));
    }
  };

  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    const audioSongs = playlistSongsToAudio(playlist.songs);
    setPlaylist(audioSongs);
    playSong(audioSongs[0].id, audioSongs);
    setIsPlaying(true);
    toast.success('Playing playlist');
  };

  const handlePlayFromSong = (startIndex: number) => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    const audioSongs = playlistSongsToAudio(playlist.songs);
    setPlaylist(audioSongs);
    playSong(audioSongs[startIndex].id, audioSongs);
    setIsPlaying(true);

    const songTitle = audioSongs[startIndex].title || audioSongs[startIndex].name;
    toast.success(`Playing from "${songTitle}"`, {
      description: `From "${playlist.name}"`,
    });
  };

  const handleAddSongToQueue = (song: PlaylistSong, position: 'now' | 'next' | 'end') => {
    if (!playlist) return;

    const [artist, title] = extractArtistTitle(song.songArtistTitle);

    if (position === 'now') {
      const audioSongs = playlistSongsToAudio(playlist.songs);
      setPlaylist(audioSongs);
      playSong(song.songId, audioSongs);
      setIsPlaying(true);
      toast.success(`Now playing "${title}"`);
    } else {
      const audioSong = {
        id: song.songId,
        name: title,
        title,
        artist,
        artistId: song.artistId || undefined,
        album: song.album || undefined,
        albumId: song.albumId || '',
        duration: song.duration || 0,
        track: song.position,
        url: `/api/navidrome/stream/${song.songId}`,
      };

      if (position === 'next') {
        setAIUserActionInProgress(true);
        addToQueueNext([audioSong]);
        toast.success(`Added "${title}" to play next`);
        setTimeout(() => setAIUserActionInProgress(false), 2000);
      } else {
        setAIUserActionInProgress(true);
        addToQueueEnd([audioSong]);
        toast.success(`Added "${title}" to end of queue`);
        setTimeout(() => setAIUserActionInProgress(false), 2000);
      }
    }
  };

  // Star/unstar mutation with optimistic update
  const starMutation = useMutation({
    mutationFn: async ({ songId, star }: { songId: string; star: boolean }) => {
      const response = await fetch(`/api/navidrome/star?id=${songId}`, {
        method: star ? 'POST' : 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Failed to ${star ? 'star' : 'unstar'} song`);
      }
      return response.json();
    },
    onMutate: async ({ songId, star }) => {
      await queryClient.cancelQueries({ queryKey: ['playlist', id] });
      const previousPlaylist = queryClient.getQueryData(['playlist', id]);
      queryClient.setQueryData(['playlist', id], (old: PlaylistDetail | undefined) => {
        if (!old) return old;
        return {
          ...old,
          songs: old.songs.map(s =>
            s.songId === songId ? { ...s, starred: star } : s
          ),
        };
      });
      return { previousPlaylist };
    },
    onSuccess: (_data, { star }) => {
      // Invalidate feedback cache so PlayerBar heart icon updates
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      // Cross-device propagation is server-authoritative now (setSongLiked
      // broadcasts feedback_update); no client emit needed.
      // When unstarring, the server removes the song from the liked songs playlist.
      // Refetch so the song disappears from the list without a full page refresh.
      if (!star) {
        queryClient.invalidateQueries({ queryKey: ['playlist', id] });
        queryClient.invalidateQueries({ queryKey: ['playlists'] });
      }
    },
    onError: (_error, _vars, context) => {
      if (context?.previousPlaylist) {
        queryClient.setQueryData(['playlist', id], context.previousPlaylist);
      }
      toast.error('Failed to update star');
    },
  });

  const handleToggleStar = (songId: string, currentlyStarred: boolean) => {
    starMutation.mutate({ songId, star: !currentlyStarred });
  };

  const handleRemoveSong = (songId: string) => {
    removeSongMutation.mutate(songId);
  };

  const handleDeletePlaylist = () => {
    deletePlaylistMutation.mutate();
  };

  // Filter and sort songs
  const isFiltered = searchQuery.trim().length > 0 || sortField !== 'custom';

  const filteredSongs = useMemo(() => {
    if (!playlist) return [];
    let songs = [...playlist.songs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      songs = songs.filter(s =>
        s.songArtistTitle.toLowerCase().includes(q) ||
        (s.album || '').toLowerCase().includes(q)
      );
    }

    if (sortField !== 'custom') {
      songs.sort((a, b) => {
        const aVal = getSortValue(a, sortField);
        const bVal = getSortValue(b, sortField);
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return songs;
  }, [playlist, searchQuery, sortField, sortDirection]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    const sortByTitle = sortField === 'title';
    for (const song of filteredSongs) {
      const [artist, title] = extractArtistTitle(song.songArtistTitle);
      const text = sortByTitle ? title : sortField === 'artist' ? artist : (song.album || title);
      const first = text.trim().charAt(0).toUpperCase();
      if (first >= 'A' && first <= 'Z') letters.add(first);
      else if (first) letters.add('#');
    }
    return letters;
  }, [filteredSongs, sortField]);

  const handleLetterSelect = useCallback((letter: string) => {
    const sortByTitle = sortField === 'title';
    const idx = filteredSongs.findIndex((song) => {
      const [artist, title] = extractArtistTitle(song.songArtistTitle);
      const text = sortByTitle ? title : sortField === 'artist' ? artist : (song.album || title);
      const first = text.trim().charAt(0).toUpperCase();
      return letter === '#' ? (first < 'A' || first > 'Z') : first === letter;
    });
    // Rows are virtualized, so jump by index rather than querying the DOM.
    if (idx >= 0) songListHandleRef.current?.scrollToIndex(idx, 'start');
  }, [filteredSongs, sortField]);

  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'dateAdded' ? 'desc' : 'asc');
    }
  };

  const handleAddToQueue = (position: 'next' | 'end') => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    const audioSongs = playlistSongsToAudio(playlist.songs);

    if (position === 'next') {
      setAIUserActionInProgress(true);
      addToQueueNext(audioSongs);
      toast.success(`Added ${playlist.songs.length} songs to play next`, {
        description: `From "${playlist.name}"`,
      });
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    } else {
      setAIUserActionInProgress(true);
      addToQueueEnd(audioSongs);
      toast.success(`Added ${playlist.songs.length} songs to end of queue`, {
        description: `From "${playlist.name}"`,
      });
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    }
  };

  const handleShufflePlay = () => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    useAudioStore.getState().playShuffled(playlistSongsToAudio(playlist.songs));
    toast.success('Shuffling playlist', {
      description: `Playing ${playlist.name}`,
    });
  };

  // Determine playlist icon based on type
  const playlistIconType = isLikedSongsPlaylist ? 'heart' : isSmartPlaylist ? 'sparkles' : 'list';

  if (error) {
    return (
      <PageLayout title="Playlist" backLink="/playlists" backLabel="Playlists" compact>
        <div className="text-center py-8 text-destructive">
          Error loading playlist: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
        <div className="text-center">
          <Button asChild variant="outline">
            <Link to="/playlists">Back to Playlists</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Loading..." backLink="/playlists" backLabel="Playlists" compact>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </PageLayout>
    );
  }

  if (!playlist) {
    return (
      <PageLayout title="Not Found" backLink="/playlists" backLabel="Playlists" compact>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Playlist not found</p>
        </div>
        <div className="text-center">
          <Button asChild variant="outline">
            <Link to="/playlists">Back to Playlists</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  // Check if a song from this playlist is currently playing
  const isCurrentlyPlayingFromPlaylist = playlist.songs.some(
    song => song.songId === currentSong?.id
  );

  // Glass UI (phones)
  const isLikedView = isLikedSongsPlaylist || !!playlist.isLikedSongs;
  const glassNavId = (playlist as PlaylistDetail & { navidromeId?: string | null }).navidromeId;
  const glassCover = !isLikedView && glassNavId ? getCoverArtUrl(`pl-${glassNavId}`, 400) : null;
  const glassSeconds = playlist.songs.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const glassLength = glassSeconds >= 3600
    ? `${Math.floor(glassSeconds / 3600)} hr ${Math.round((glassSeconds % 3600) / 60)} min`
    : `${Math.round(glassSeconds / 60)} min`;
  const glassMeta = `${playlist.songs.length} songs${glassSeconds > 0 ? ` · ${glassLength}` : ''}`;
  const handleGlassPlay = () => {
    if (isCurrentlyPlayingFromPlaylist) setIsPlaying(!isPlaying);
    else handlePlayAll();
  };
  const toSheetSong = (ps: PlaylistSong): ActionSheetSong => {
    const [artist, title] = extractArtistTitle(ps.songArtistTitle);
    return { songId: ps.songId, title, artist, albumId: ps.albumId, artistId: ps.artistId, starred: isLikedView || !!ps.starred };
  };
  const findPlaylistSong = (songId: string) => playlist.songs.find((x) => x.songId === songId);

  // Glass phones: the playlist's ⋯ as a bottom sheet (moreMenu is the desktop dropdown).
  const canDelete = !isLikedSongsPlaylist && !playlist.isLikedSongs && !isSmartPlaylist;
  const glassMoreSheet = glass && (
    <GlassSheet
      open={glassMoreOpen}
      onOpenChange={(o) => { setGlassMoreOpen(o); if (!o) setConfirmDelete(false); }}
      title={isLikedSongsPlaylist || playlist.isLikedSongs ? 'Liked Songs' : playlist.name}
      subtitle={`${playlist.songs.length} song${playlist.songs.length === 1 ? '' : 's'}`}
      description="Playlist actions"
    >
      <SheetRow icon={<Shuffle className="size-5" />} title="Shuffle play" disabled={playlist.songs.length === 0} onClick={() => { handleShufflePlay(); setGlassMoreOpen(false); }} />
      <SheetRow icon={<ListStart className="size-5" />} title="Play next" disabled={playlist.songs.length === 0} onClick={() => { handleAddToQueue('next'); setGlassMoreOpen(false); }} />
      <SheetRow icon={<ListEnd className="size-5" />} title="Add to queue" disabled={playlist.songs.length === 0} onClick={() => { handleAddToQueue('end'); setGlassMoreOpen(false); }} />
      {canDelete && (
        <SheetRow
          icon={<Trash2 className="size-5" />}
          title={confirmDelete ? 'Tap again to delete' : 'Delete playlist'}
          sub={confirmDelete ? 'This can’t be undone' : undefined}
          tone="destructive"
          active={confirmDelete}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            setGlassMoreOpen(false);
            handleDeletePlaylist();
          }}
        />
      )}
    </GlassSheet>
  );

  const moreMenu = (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9 p-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={handleShufflePlay}
                disabled={playlist.songs.length === 0}
                className="min-h-[44px]"
              >
                <Shuffle className="mr-2 h-4 w-4" />
                Shuffle Play
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddToQueue('next')}
                disabled={playlist.songs.length === 0}
                className="min-h-[44px]"
              >
                <Play className="mr-2 h-4 w-4" />
                Play Next
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddToQueue('end')}
                disabled={playlist.songs.length === 0}
                className="min-h-[44px]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add to Queue
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="min-h-[44px] text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Playlist
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{playlist.name}" and all its songs. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeletePlaylist}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
  );

  return (
    <PageLayout
      title=""
      backLink="/playlists"
      backLabel="Library"
      compact
      fullWidth
      className="px-3 sm:px-4 lg:px-6"
    >
      {/* Compact Header — icon + title + count + action buttons in one row */}
      <div className={cn("flex items-center gap-3 px-3 sm:px-4 lg:px-6 pb-3 border-b border-border/50", glass && "max-md:hidden")}>
        {/* Playlist Icon */}
        <div className={cn(
          "w-10 h-10 sm:w-11 sm:h-11 rounded-lg shadow-md flex items-center justify-center shrink-0",
          isLikedSongsPlaylist
            ? "bg-gradient-to-br from-rose-500 to-pink-600"
            : isSmartPlaylist
              ? "bg-gradient-to-br from-violet-500 to-purple-600"
              : "bg-gradient-to-br from-primary/80 to-primary"
        )}>
          {playlistIconType === 'heart' && <Heart className="h-5 w-5 text-white" />}
          {playlistIconType === 'sparkles' && <Sparkles className="h-5 w-5 text-white" />}
          {playlistIconType === 'list' && <ListMusic className="h-5 w-5 text-white" />}
        </div>

        {/* Title + Song Count */}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold truncate">{playlist.name}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{playlist.songs.length} songs</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Main Play Button */}
          <Button
            onClick={handlePlayAll}
            disabled={playlist.songs.length === 0}
            size="sm"
            className={cn(
              "rounded-full h-9 w-9 sm:h-10 sm:w-10 p-0 shadow-md",
              isLikedSongsPlaylist
                ? "bg-rose-500 hover:bg-rose-600"
                : isSmartPlaylist
                  ? "bg-violet-500 hover:bg-violet-600"
                  : "bg-primary hover:bg-primary/90"
            )}
          >
            {isCurrentlyPlayingFromPlaylist && isPlaying ? (
              <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <Play className="h-4 w-4 sm:h-5 sm:w-5 ml-0.5" />
            )}
          </Button>

          {/* Shuffle button */}
          <Button
            onClick={handleShufflePlay}
            disabled={playlist.songs.length === 0}
            variant="ghost"
            size="sm"
            className="rounded-full h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <Shuffle className="h-4 w-4" />
          </Button>

          {/* Start Radio from this playlist */}
          <StartRadioButton
            seed={{ kind: 'playlist', playlistId: id }}
            label="Start Radio"
            size="icon"
            variant="ghost"
            className="rounded-full h-8 w-8 sm:h-9 sm:w-9 p-0"
          />

          {/* More Menu */}
          {moreMenu}

          {/* Collaborate button */}
          {!isLikedSongsPlaylist && !isSmartPlaylist && (
            <Button
              onClick={() => setIsCollaborationPanelOpen(!isCollaborationPanelOpen)}
              variant={isCollaborationPanelOpen ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "rounded-full h-8 w-8 p-0 sm:h-9 sm:w-auto sm:gap-2 sm:px-3",
                isCollaborationPanelOpen && "bg-primary/10 border-primary/30"
              )}
            >
              <Users className="h-4 w-4 sm:shrink-0" />
              <span className="hidden sm:inline text-sm">Collaborate</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area with optional Collaboration Panel */}
      <div className="flex flex-1 min-w-0">
        {/* Song List */}
        <div className="flex-1 min-w-0">
          <div className={cn(
            "transition-all duration-300 px-3 sm:px-4 lg:px-6 py-1.5 sm:py-2",
            isCollaborationPanelOpen ? "lg:mr-[400px]" : "",
            glass && "relative glass-home",
          )}>
            {glass && (
              <GlassPlaylistHeader
                name={isLikedView ? 'Liked Songs' : playlist.name}
                meta={glassMeta}
                coverUrl={glassCover}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortOptions={SORT_OPTIONS}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                onPlay={handleGlassPlay}
                onShuffle={handleShufflePlay}
                isPlayingThis={isCurrentlyPlayingFromPlaylist && isPlaying}
                disabled={playlist.songs.length === 0}
                showAddSongs={!isLikedView && !isSmartPlaylist}
                leftActions={
                  <>
                    <StartRadioButton
                      seed={{ kind: 'playlist', playlistId: id }}
                      label="Start Radio"
                      size="icon"
                      variant="ghost"
                      className="glass-flat size-11 rounded-full p-0"
                    />
                    <button
                      type="button"
                      aria-label="More"
                      onClick={() => setGlassMoreOpen(true)}
                      className="glass-flat grid size-11 place-items-center rounded-full [-webkit-tap-highlight-color:transparent]"
                    >
                      <MoreHorizontal className="size-5" />
                    </button>
                  </>
                }
              />
            )}
            {playlist.songs.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-6">
                  <Music2 className="h-10 w-10 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">No songs yet</h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Add songs to this playlist from the search page or library
                </p>
                <Button asChild>
                  <Link to="/library/search">Search Library</Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Search & Sort Bar */}
                <div className={cn("flex items-center gap-2 py-2 pr-6 sm:pr-0", glass && "max-md:hidden")}>
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="search"
                      placeholder={`Search ${playlist.songs.length} songs…`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setSearchQuery('')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0 text-xs sm:text-sm">
                        {sortField === 'custom' ? (
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        ) : sortDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {SORT_OPTIONS.find(o => o.value === sortField)?.label || 'Sort'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {SORT_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          onClick={() => handleSortChange(opt.value)}
                          className={cn(
                            'min-h-[40px] justify-between',
                            sortField === opt.value && 'bg-accent'
                          )}
                        >
                          {opt.label}
                          {sortField === opt.value && (
                            sortDirection === 'asc'
                              ? <ArrowUp className="h-3.5 w-3.5 ml-2" />
                              : <ArrowDown className="h-3.5 w-3.5 ml-2" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Filter status */}
                {searchQuery && (
                  <p className="text-xs text-muted-foreground px-1 pb-1">
                    {filteredSongs.length} of {playlist.songs.length} songs
                  </p>
                )}

                {/* Song list with alphabet rail */}
                <div className="relative" ref={songListRef}>
                  <PlaylistSongsList
                    songs={filteredSongs}
                    currentSongId={currentSong?.id}
                    isPlaying={isPlaying}
                    sensors={sensors}
                    onDragEnd={handleDragEnd}
                    onPlayFromSong={(idx) => {
                      if (!playlist) return;
                      const song = filteredSongs[idx];
                      const originalIdx = playlist.songs.findIndex(s => s.id === song.id);
                      handlePlayFromSong(originalIdx >= 0 ? originalIdx : idx);
                    }}
                    onAddSongToQueue={handleAddSongToQueue}
                    onRemoveSong={handleRemoveSong}
                    onToggleStar={handleToggleStar}
                    onStartRadioFromSong={(songId) => { void startRadio({ kind: 'song', songId }); }}
                    isRemovePending={removeSongMutation.isPending}
                    disableDnD={isFiltered}
                    handleRef={songListHandleRef}
                    glass={glass}
                    hideHeart={isLikedView}
                    onMore={setActionSong}
                  />

                  {/* Alphabet rail — mobile only, 20+ songs, and only when the
                      list is in letter order (title / artist / album sort) */}
                  {filteredSongs.length >= 20 && ALPHA_SORTS.has(sortField) && (
                    <div className="sm:hidden">
                      <AlphabetRail
                        availableLetters={availableLetters}
                        onLetterSelect={handleLetterSelect}
                        reversed={sortDirection === 'desc'}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {glassMoreSheet}
        {glass && (
          <SongActionSheet
            song={actionSong ? toSheetSong(actionSong) : null}
            onOpenChange={(open) => { if (!open) setActionSong(null); }}
            canRemove={!isLikedView && !isSmartPlaylist}
            currentPlaylistId={id}
            onPlayNext={(s) => { const ps = findPlaylistSong(s.songId); if (ps) handleAddSongToQueue(ps, 'next'); }}
            onAddToQueue={(s) => { const ps = findPlaylistSong(s.songId); if (ps) handleAddSongToQueue(ps, 'end'); }}
            onToggleLike={(s) => handleToggleStar(s.songId, !!s.starred)}
            onStartRadio={(s) => { void startRadio({ kind: 'song', songId: s.songId }); }}
            onRemove={(s) => handleRemoveSong(s.songId)}
          />
        )}

        {/* Collaboration Panel - Slide-in from right (only renders when open) */}
        {!isLikedSongsPlaylist && !isSmartPlaylist && isCollaborationPanelOpen && (
          <>
            {/* Backdrop overlay for mobile */}
            <div
              className="fixed inset-0 bg-black/50 z-[55] lg:hidden"
              onClick={() => setIsCollaborationPanelOpen(false)}
            />
            <div
              className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-background border-l shadow-2xl z-[60] flex flex-col"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <h2 className="font-semibold">Collaboration</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsCollaborationPanelOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-auto pb-24">
                {user && (
                  <CollaborativePlaylistPanel
                    playlistId={id}
                    currentUserId={user.id}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
