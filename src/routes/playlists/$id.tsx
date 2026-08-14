import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useScrollSafeMenu } from '@/lib/hooks/useScrollSafeMenu';
import {
  ListMusic, Play, Trash2, X, Plus, Shuffle,
  Heart, Sparkles, MoreHorizontal, Music2, Pause, GripVertical,
  Users, SkipForward, Search, ArrowUpDown, ArrowUp, ArrowDown
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
import { sendPlaybackMessage } from '@/lib/hooks/usePlaybackSync';
import { cn } from '@/lib/utils';
import { CollaborativePlaylistPanel } from '@/components/playlists/collaboration';
import { StartRadioButton } from '@/components/radio/StartRadioButton';
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

export const Route = createFileRoute('/playlists/$id')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
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
}

// Format duration as mm:ss
function formatDuration(seconds?: number | null) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type SortField = 'custom' | 'title' | 'artist' | 'album' | 'dateAdded' | 'duration';

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'custom', label: 'Custom Order' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'duration', label: 'Duration' },
];

function extractArtistTitle(songArtistTitle: string): [string, string] {
  if (songArtistTitle.includes(' - ')) {
    const parts = songArtistTitle.split(' - ');
    return [parts[0], parts.slice(1).join(' - ')];
  }
  return ['Unknown Artist', songArtistTitle];
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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

function AlphabetRail({
  availableLetters,
  onLetterSelect,
}: {
  availableLetters: Set<string>;
  onLetterSelect: (letter: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  const getLetterFromTouch = useCallback((clientY: number) => {
    if (!railRef.current) return null;
    const rect = railRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.floor((y / rect.height) * ALPHABET.length);
    return ALPHABET[Math.max(0, Math.min(idx, ALPHABET.length - 1))];
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    activeRef.current = true;
    const letter = getLetterFromTouch(e.touches[0].clientY);
    if (letter && availableLetters.has(letter)) onLetterSelect(letter);
  }, [getLetterFromTouch, availableLetters, onLetterSelect]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!activeRef.current) return;
    e.preventDefault();
    const letter = getLetterFromTouch(e.touches[0].clientY);
    if (letter && availableLetters.has(letter)) onLetterSelect(letter);
  }, [getLetterFromTouch, availableLetters, onLetterSelect]);

  const handleTouchEnd = useCallback(() => {
    activeRef.current = false;
  }, []);

  return (
    <div
      ref={railRef}
      className="fixed right-0.5 flex flex-col items-center justify-center z-30 select-none touch-none py-1"
      style={{ top: '30%', bottom: '15%' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {ALPHABET.map((letter) => (
        <button
          key={letter}
          type="button"
          className={cn(
            'w-5 text-[9px] font-semibold leading-none py-[2px] rounded-sm transition-colors',
            availableLetters.has(letter)
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground/30 pointer-events-none'
          )}
          onClick={() => {
            if (availableLetters.has(letter)) onLetterSelect(letter);
          }}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

/**
 * Text that scrolls horizontally when content overflows its container.
 * Pauses at each end so the user can read. No-ops when text fits.
 */
function MarqueeText({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const diff = inner.scrollWidth - outer.clientWidth;
    setOverflow(diff > 1 ? diff : 0);
  }, []);

  useEffect(() => {

    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure, children]);

  return (
    <div ref={outerRef} className="overflow-hidden whitespace-nowrap">
      <span
        ref={innerRef}
        className="inline-block"
        style={overflow > 0 ? {
          animation: `marquee-scroll ${3 + overflow * 0.04}s linear infinite`,
          ['--marquee-distance' as string]: `-${overflow}px`,
        } : undefined}
      >
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
  onPlayFromSong,
  onAddSongToQueue,
  onRemoveSong,
  onToggleStar,
  onStartRadioFromSong,
  isRemovePending,
  dragHandle,
}: SongRowProps & { dragHandle?: JSX.Element }) {
  const [artist, title] = song.songArtistTitle.includes(' - ')
    ? song.songArtistTitle.split(' - ')
    : ['Unknown Artist', song.songArtistTitle];

  const { open: menuOpen, onOpenChange: onMenuOpenChange, triggerProps: menuTriggerProps } = useScrollSafeMenu();

  return (
    <>
      {/* Drag Handle — only rendered on desktop */}
      {dragHandle}

      {/* Track Number / Equalizer */}
      <span className={cn(
        "w-8 text-sm tabular-nums text-right shrink-0 flex items-center justify-end",
        isCurrentSong ? "text-primary" : "text-muted-foreground"
      )}>
        {index + 1}
      </span>

      {/* Album Art Thumbnail */}
      <div className="relative w-8 h-8 shrink-0">
        {song.albumId ? (
          <img
            src={`/api/navidrome/rest/getCoverArt?id=${song.albumId}&size=80`}
            alt=""
            className="w-8 h-8 rounded shrink-0 object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="w-8 h-8 rounded shrink-0 bg-muted flex items-center justify-center">
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

      {/* Song Info - clickable with proper touch target */}
      <button
        type="button"
        onClick={() => onPlayFromSong(index)}
        className="min-w-0 flex-1 text-left py-0.5 min-h-[36px] sm:min-h-[32px] flex flex-col justify-center overflow-hidden"
      >
        {/* Mobile: single line with title + artist */}
        <div className={cn("text-sm sm:hidden", isCurrentSong && "text-primary")}>
          <MarqueeText>
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground"> — {artist}</span>
          </MarqueeText>
        </div>
        {/* Desktop: title only (artist is a separate column) */}
        <div className={cn("hidden sm:block text-sm font-medium truncate", isCurrentSong && "text-primary")}>
          {title}
        </div>
      </button>

      {/* Artist - desktop only (separate column) */}
      <span className="hidden sm:block text-sm text-muted-foreground truncate w-24 md:w-32 lg:w-40 shrink min-w-0">
        {artist}
      </span>

      {/* Album */}
      <span className="hidden sm:block text-sm text-muted-foreground truncate w-24 md:w-32 lg:w-40 shrink min-w-0">
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

      {/* Star toggle - desktop hover only (accessible via menu on mobile) */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-8 p-0 shrink-0 transition-opacity hidden sm:inline-flex",
          song.starred ? "opacity-100 text-rose-500 hover:text-rose-600" : "opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
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

      {/* Actions menu — controlled + scroll-guarded on mobile */}
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
      className={cn(
        "group flex items-center gap-3 px-3 py-1.5 hover:bg-accent/50 rounded-md transition-colors min-w-0",
        props.isCurrentSong && "bg-primary/10 border-l-2 border-l-primary"
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
      className={cn(
        "group flex items-center gap-3 px-3 py-1.5 hover:bg-accent/50 rounded-md transition-colors min-w-0",
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
            className="cursor-grab active:cursor-grabbing touch-none shrink-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        }
      />
    </div>
  );
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
}

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

  // Auto-scroll to now-playing song on mount
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || !currentSongId) return;
    const el = document.querySelector(`[data-song-id="${globalThis.CSS.escape(currentSongId)}"]`);
    if (el) {
      scrolledRef.current = true;
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }, [currentSongId, songs]);

  const sharedRowProps = {
    isPlaying,
    onPlayFromSong,
    onAddSongToQueue,
    onRemoveSong,
    onToggleStar,
    onStartRadioFromSong,
    isRemovePending,
  };

  return (
    <div className="overflow-hidden">
      {/* Column Headers - desktop only */}
      <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span className="w-6 shrink-0" /> {/* Drag handle space */}
        <span className="w-8 text-right shrink-0">#</span>
        <span className="w-8 shrink-0" /> {/* Art space */}
        <span className="flex-1 min-w-0">Title</span>
        <span className="w-24 md:w-32 lg:w-40 shrink min-w-0">Artist</span>
        <span className="w-24 md:w-32 lg:w-40 shrink min-w-0">Album</span>
        <span className="w-12 text-right shrink-0">Time</span>
        <span className="hidden lg:block w-28 text-right shrink-0">Added</span>
        <span className="w-[6.5rem] shrink-0" /> {/* Star + Play next + Actions space */}
      </div>

      <div>
        {isDesktop && !disableDnD ? (
          /* Desktop: DnD-enabled sortable rows */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={songs.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {songs.map((song, index) => (
                <SortableSongRow
                  key={song.id}
                  song={song}
                  index={index}
                  isCurrentSong={song.songId === currentSongId}
                  {...sharedRowProps}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          /* Plain rows — no DnD (mobile or when filtering/sorting) */
          songs.map((song, index) => (
            <PlainSongRow
              key={song.id}
              song={song}
              index={index}
              isCurrentSong={song.songId === currentSongId}
              {...sharedRowProps}
            />
          ))
        )}
      </div>
    </div>
  );
}

function playlistSongsToAudio(songs: PlaylistSong[]) {
  return songs.map((song) => {
    const parts = song.songArtistTitle.split(' - ');
    const artist = parts[0] || 'Unknown Artist';
    const title = parts.slice(1).join(' - ') || song.songArtistTitle;
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

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('custom');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const songListRef = useRef<HTMLDivElement>(null);

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
        throw new Error('Failed to delete playlist');
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

    const parts = song.songArtistTitle.split(' - ');
    const artist = parts[0] || 'Unknown Artist';
    const title = parts.slice(1).join(' - ') || song.songArtistTitle;

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
    onSuccess: (_data, { songId, star }) => {
      // Invalidate feedback cache so PlayerBar heart icon updates
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      // Propagate the star change to the user's other devices. See #138.
      sendPlaybackMessage('feedback_update', { songId, liked: star });
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
    const sortByTitle = sortField === 'title' || sortField === 'custom';
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
    if (!songListRef.current) return;
    const sortByTitle = sortField === 'title' || sortField === 'custom';

    for (const song of filteredSongs) {
      const [artist, title] = extractArtistTitle(song.songArtistTitle);
      const text = sortByTitle ? title : sortField === 'artist' ? artist : (song.album || title);
      const first = text.trim().charAt(0).toUpperCase();
      const match = letter === '#' ? (first < 'A' || first > 'Z') : first === letter;

      if (match) {
        const el = songListRef.current.querySelector(`[data-song-id="${song.songId}"]`);
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
          break;
        }
      }
    }
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

    const audioSongs = playlistSongsToAudio(playlist.songs);
    const shuffled = [...audioSongs].sort(() => Math.random() - 0.5);
    setPlaylist(shuffled);
    playSong(shuffled[0].id, shuffled);
    setIsPlaying(true);
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

  return (
    <PageLayout
      title=""
      backLink="/playlists"
      backLabel="Playlists"
      compact
      fullWidth
      className="px-3 sm:px-4 lg:px-6"
    >
      {/* Compact Header — icon + title + count + action buttons in one row */}
      <div className="flex items-center gap-3 px-3 sm:px-4 lg:px-6 pb-3 border-b border-border/50">
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
            isCollaborationPanelOpen ? "lg:mr-[400px]" : ""
          )}>
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
                <div className="flex items-center gap-2 py-2 pr-6 sm:pr-0">
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
                  />

                  {/* Alphabet rail — mobile only, when 20+ songs */}
                  {filteredSongs.length >= 20 && (
                    <div className="sm:hidden">
                      <AlphabetRail
                        availableLetters={availableLetters}
                        onLetterSelect={handleLetterSelect}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

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
