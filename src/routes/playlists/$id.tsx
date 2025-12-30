import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRef, useCallback, useState } from 'react';
import {
  ListMusic, Play, Trash2, X, ListPlus, Plus, Shuffle,
  Heart, Sparkles, ChevronLeft, MoreHorizontal, Music2, Pause, GripVertical,
  Users, PanelRightClose, PanelRight
} from 'lucide-react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAudioStore } from '@/lib/stores/audio';
import { playPlaylist, loadPlaylistIntoQueue } from '@/lib/utils/playlist-helpers';
import { cn } from '@/lib/utils';
import { CollaborativePlaylistPanel } from '@/components/playlists/collaboration';
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
import { useVirtualizer } from '@tanstack/react-virtual';

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
}

interface PlaylistDetail {
  id: string;
  name: string;
  description?: string | null;
  songs: PlaylistSong[];
  createdAt: Date;
  updatedAt: Date;
}

interface SortableSongRowProps {
  song: PlaylistSong;
  index: number;
  isCurrentSong: boolean;
  isPlaying: boolean;
  onPlayFromSong: (index: number) => void;
  onAddSongToQueue: (song: PlaylistSong, position: 'now' | 'next' | 'end') => void;
  onRemoveSong: (songId: string) => void;
  isRemovePending: boolean;
}

function SortableSongRow({
  song,
  index,
  isCurrentSong,
  isPlaying,
  onPlayFromSong,
  onAddSongToQueue,
  onRemoveSong,
  isRemovePending,
}: SortableSongRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [artist, title] = song.songArtistTitle.includes(' - ')
    ? song.songArtistTitle.split(' - ')
    : ['Unknown Artist', song.songArtistTitle];

  // Format duration as mm:ss
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2.5 hover:bg-accent/50 rounded-sm transition-colors",
        isCurrentSong && "bg-accent/30",
        isDragging && "opacity-50 bg-accent shadow-lg"
      )}
    >
      {/* Drag Handle - visible on mobile, hover on desktop */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-1 min-h-[44px] min-w-[32px] flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100"
      >
        <GripVertical className="h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground/50" />
      </div>

      {/* Track Number */}
      <span className={cn(
        "w-5 sm:w-6 text-xs sm:text-sm tabular-nums text-right shrink-0",
        isCurrentSong ? "text-primary" : "text-muted-foreground"
      )}>
        {isCurrentSong && isPlaying ? (
          <Music2 className="h-3 w-3 sm:h-4 sm:w-4 text-primary animate-pulse" />
        ) : (
          index + 1
        )}
      </span>

      {/* Song Info - clickable with proper touch target */}
      <button
        type="button"
        onClick={() => onPlayFromSong(index)}
        className="min-w-0 flex-1 text-left py-2 min-h-[44px] flex flex-col justify-center"
      >
        {/* Mobile: single line */}
        <p className={cn(
          "text-sm truncate sm:hidden",
          isCurrentSong && "text-primary"
        )}>
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground"> — {artist}</span>
        </p>
        {/* Desktop: two lines */}
        <p className={cn(
          "hidden sm:block text-sm font-medium truncate",
          isCurrentSong && "text-primary"
        )}>
          {title}
        </p>
        <p className="hidden sm:block text-xs text-muted-foreground truncate">
          {artist}
        </p>
      </button>

      {/* Album - desktop only */}
      <span className="hidden md:block text-xs text-muted-foreground truncate shrink-0 w-32 lg:w-48">
        {song.album || '—'}
      </span>

      {/* Duration - desktop only */}
      <span className="hidden sm:block text-xs text-muted-foreground tabular-nums shrink-0 w-12 text-right">
        {formatDuration(song.duration) || '—'}
      </span>

      {/* Date added - large desktop only */}
      <span className="hidden xl:block text-xs text-muted-foreground shrink-0 w-24 text-right">
        {new Date(song.addedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })}
      </span>

      {/* Actions menu - Always visible on mobile, hover on desktop */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 min-h-[44px] min-w-[44px] p-0 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'now'); }}
            className="min-h-[44px]"
          >
            <Play className="mr-2 h-4 w-4" />
            Play Now
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'next'); }}
            className="min-h-[44px]"
          >
            <Play className="mr-2 h-4 w-4" />
            Play Next
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onAddSongToQueue(song, 'end'); }}
            className="min-h-[44px]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add to End
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onRemoveSong(song.songId); }}
            disabled={isRemovePending}
            className="min-h-[44px] text-destructive focus:text-destructive"
          >
            <X className="mr-2 h-4 w-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  isRemovePending: boolean;
}

function VirtualizedPlaylistSongs({
  songs,
  currentSongId,
  isPlaying,
  sensors,
  onDragEnd,
  onPlayFromSong,
  onAddSongToQueue,
  onRemoveSong,
  isRemovePending,
}: VirtualizedPlaylistSongsProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 56, []), // Height of each row
    overscan: 5,
    getItemKey: (index) => songs[index].id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div>
      {/* Column Headers - desktop only */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1">
        <span className="w-4" /> {/* Drag handle space */}
        <span className="w-6 text-right">#</span>
        <span className="flex-1">Title</span>
        <span className="hidden md:block w-32 lg:w-48">Album</span>
        <span className="w-12 text-right">Time</span>
        <span className="hidden xl:block w-24 text-right">Added</span>
        <span className="w-8" /> {/* Actions space */}
      </div>

      {/* Virtualized Song Rows with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={songs.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={parentRef}
            className="overflow-auto"
            style={{
              height: Math.min(songs.length * 56, 600),
              contain: 'strict',
            }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const song = songs[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <SortableSongRow
                      song={song}
                      index={virtualRow.index}
                      isCurrentSong={song.songId === currentSongId}
                      isPlaying={isPlaying}
                      onPlayFromSong={onPlayFromSong}
                      onAddSongToQueue={onAddSongToQueue}
                      onRemoveSong={onRemoveSong}
                      isRemovePending={isRemovePending}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PlaylistDetailPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPlaylist, playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress, currentSong, isPlaying } = useAudioStore();

  // Collaboration panel state
  const [isCollaborationPanelOpen, setIsCollaborationPanelOpen] = useState(false);

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

  const handlePlayAll = async () => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    try {
      await playPlaylist(id, setPlaylist, playSong);
      setIsPlaying(true); // Explicitly start playback
      toast.success('Playing playlist');
    } catch (error) {
      console.error('Failed to play playlist:', error);
      toast.error('Failed to load playlist');
    }
  };

  const handlePlayFromSong = async (startIndex: number) => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    try {
      // Load playlist with full metadata from Navidrome
      const audioSongs = await loadPlaylistIntoQueue(id);

      if (audioSongs.length === 0) {
        toast.error('Failed to load playlist songs');
        return;
      }

      // Set playlist and start playing from the selected song
      setPlaylist(audioSongs);
      playSong(audioSongs[startIndex].id, audioSongs);
      setIsPlaying(true);

      const songTitle = audioSongs[startIndex].title || audioSongs[startIndex].name;
      toast.success(`Playing from "${songTitle}"`, {
        description: `From "${playlist.name}"`,
      });
    } catch (error) {
      console.error('Failed to play playlist:', error);
      toast.error('Failed to load playlist');
    }
  };

  const handleAddSongToQueue = async (song: PlaylistSong, position: 'now' | 'next' | 'end') => {
    if (position === 'now') {
      // Load full playlist with metadata and play from this song
      try {
        const audioSongs = await loadPlaylistIntoQueue(id);
        const songIndex = audioSongs.findIndex(s => s.id === song.songId);

        if (songIndex !== -1) {
          setPlaylist(audioSongs);
          playSong(song.songId, audioSongs);
          setIsPlaying(true);
          const songTitle = audioSongs[songIndex].title || audioSongs[songIndex].name;
          toast.success(`Now playing "${songTitle}"`);
        } else {
          toast.error('Song not found in playlist');
        }
      } catch (error) {
        console.error('Failed to play song:', error);
        toast.error('Failed to load song');
      }
    } else {
      // For queue operations, use simple format (will be enhanced later)
      const audioSong = {
        id: song.songId,
        name: song.songArtistTitle.split(' - ')[1] || song.songArtistTitle,
        title: song.songArtistTitle.split(' - ')[1] || song.songArtistTitle,
        artist: song.songArtistTitle.split(' - ')[0] || 'Unknown Artist',
        albumId: '',
        duration: 0,
        track: 0,
        url: `/api/navidrome/stream/${song.songId}`,
      };

      if (position === 'next') {
        setAIUserActionInProgress(true);
        addToQueueNext([audioSong]);
        toast.success(`Added "${audioSong.title}" to play next`);
        setTimeout(() => setAIUserActionInProgress(false), 2000);
      } else {
        setAIUserActionInProgress(true);
        addToQueueEnd([audioSong]);
        toast.success(`Added "${audioSong.title}" to end of queue`);
        setTimeout(() => setAIUserActionInProgress(false), 2000);
      }
    }
  };

  const handleRemoveSong = (songId: string) => {
    removeSongMutation.mutate(songId);
  };

  const handleDeletePlaylist = () => {
    deletePlaylistMutation.mutate();
  };

  const handleAddToQueue = (position: 'next' | 'end') => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    const audioSongs = playlist.songs.map((song) => ({
      id: song.songId,
      name: song.songArtistTitle.split(' - ')[1] || song.songArtistTitle,
      title: song.songArtistTitle.split(' - ')[1] || song.songArtistTitle,
      artist: song.songArtistTitle.split(' - ')[0] || 'Unknown Artist',
      albumId: '',
      duration: 0,
      track: 1,
      url: `/api/navidrome/stream/${song.songId}`,
    }));

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

  const handleShufflePlay = async () => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    try {
      const audioSongs = await loadPlaylistIntoQueue(id);
      if (audioSongs.length === 0) {
        toast.error('Failed to load playlist songs');
        return;
      }

      // Shuffle the songs
      const shuffled = [...audioSongs].sort(() => Math.random() - 0.5);
      setPlaylist(shuffled);
      playSong(shuffled[0].id, shuffled);
      setIsPlaying(true);
      toast.success('Shuffling playlist', {
        description: `Playing ${playlist.name}`,
      });
    } catch (error) {
      console.error('Failed to shuffle play:', error);
      toast.error('Failed to load playlist');
    }
  };

  // Determine playlist icon based on type
  const playlistIconType = isLikedSongsPlaylist ? 'heart' : isSmartPlaylist ? 'sparkles' : 'list';

  // Helper to get playlist gradient colors
  const getPlaylistGradient = () => {
    if (isLikedSongsPlaylist) return 'from-rose-500/20 via-pink-500/10 to-transparent';
    if (isSmartPlaylist) return 'from-violet-500/20 via-purple-500/10 to-transparent';
    return 'from-primary/20 via-primary/10 to-transparent';
  };

  if (error) {
    return (
      <div className="container mx-auto p-3 sm:p-6">
        <div className="text-center py-8 text-destructive">
          Error loading playlist: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
        <div className="text-center">
          <Button asChild variant="outline">
            <Link to="/playlists">← Back to Playlists</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="container mx-auto p-3 sm:p-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Playlist not found</p>
        </div>
        <div className="text-center">
          <Button asChild variant="outline">
            <Link to="/playlists">← Back to Playlists</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Check if a song from this playlist is currently playing
  const isCurrentlyPlayingFromPlaylist = playlist.songs.some(
    song => song.songId === currentSong?.id
  );

  return (
    <div className="min-h-screen">
      {/* Hero Header with Gradient */}
      <div className={cn(
        "relative bg-gradient-to-b pb-8",
        getPlaylistGradient()
      )}>
        <div className="container mx-auto px-3 sm:px-6">
          {/* Back button with proper touch target */}
          <div className="pt-4 pb-6">
            <Link
              to="/playlists"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] py-2 pr-2 -ml-1"
            >
              <ChevronLeft className="h-5 w-5" />
              <span>Back to Playlists</span>
            </Link>
          </div>

          {/* Playlist Info */}
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
            {/* Playlist Cover/Icon */}
            <div className={cn(
              "w-40 h-40 sm:w-52 sm:h-52 rounded-lg shadow-2xl flex items-center justify-center",
              isLikedSongsPlaylist
                ? "bg-gradient-to-br from-rose-500 to-pink-600"
                : isSmartPlaylist
                  ? "bg-gradient-to-br from-violet-500 to-purple-600"
                  : "bg-gradient-to-br from-primary/80 to-primary"
            )}>
              {playlistIconType === 'heart' && <Heart className="h-20 w-20 sm:h-24 sm:w-24 text-white" />}
              {playlistIconType === 'sparkles' && <Sparkles className="h-20 w-20 sm:h-24 sm:w-24 text-white" />}
              {playlistIconType === 'list' && <ListMusic className="h-20 w-20 sm:h-24 sm:w-24 text-white" />}
            </div>

            {/* Playlist Details */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {isSmartPlaylist ? 'Smart Playlist' : isLikedSongsPlaylist ? 'Your Library' : 'Playlist'}
              </p>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 truncate">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-muted-foreground mb-3 line-clamp-2">{playlist.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {playlist.songs.length} {playlist.songs.length === 1 ? 'song' : 'songs'}
                </span>
                <span>•</span>
                <span>Created {new Date(playlist.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 mt-8">
            {/* Main Play Button */}
            <Button
              onClick={handlePlayAll}
              disabled={playlist.songs.length === 0}
              size="lg"
              className={cn(
                "rounded-full h-14 w-14 p-0 shadow-lg",
                isLikedSongsPlaylist
                  ? "bg-rose-500 hover:bg-rose-600"
                  : isSmartPlaylist
                    ? "bg-violet-500 hover:bg-violet-600"
                    : "bg-primary hover:bg-primary/90"
              )}
            >
              {isCurrentlyPlayingFromPlaylist && isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-1" />
              )}
            </Button>

            {/* Shuffle Button */}
            <Button
              onClick={handleShufflePlay}
              disabled={playlist.songs.length === 0}
              variant="ghost"
              size="lg"
              className="rounded-full h-12 w-12 p-0"
            >
              <Shuffle className="h-5 w-5" />
            </Button>

            {/* Add to Queue Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={playlist.songs.length === 0}
                  className="rounded-full h-12 w-12 p-0"
                >
                  <ListPlus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  onClick={() => handleAddToQueue('next')}
                  className="min-h-[44px]"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Play Next
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAddToQueue('end')}
                  className="min-h-[44px]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add to End
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  className="rounded-full h-12 w-12 p-0"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
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

            {/* Collaboration Toggle Button - only show for regular playlists */}
            {!isLikedSongsPlaylist && !isSmartPlaylist && (
              <Button
                onClick={() => setIsCollaborationPanelOpen(!isCollaborationPanelOpen)}
                variant={isCollaborationPanelOpen ? "secondary" : "outline"}
                size="lg"
                className={cn(
                  "rounded-full gap-2 px-4",
                  isCollaborationPanelOpen && "bg-primary/10 border-primary/30"
                )}
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Collaborate</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area with optional Collaboration Panel */}
      <div className="flex flex-1">
        {/* Song List */}
        <div className="flex-1">
          <div className={cn(
            "transition-all duration-300 px-3 sm:px-6 py-6",
            isCollaborationPanelOpen ? "lg:mr-[400px]" : "max-w-7xl mx-auto"
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
              <VirtualizedPlaylistSongs
                songs={playlist.songs}
                currentSongId={currentSong?.id}
                isPlaying={isPlaying}
                sensors={sensors}
                onDragEnd={handleDragEnd}
                onPlayFromSong={handlePlayFromSong}
                onAddSongToQueue={handleAddSongToQueue}
                onRemoveSong={handleRemoveSong}
                isRemovePending={removeSongMutation.isPending}
              />
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
    </div>
  );
}
