import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import {
  ListMusic, Play, Trash2, X, Plus, Shuffle,
  Heart, Sparkles, ChevronLeft, MoreHorizontal, Music2, Pause, GripVertical,
  Users
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
        "group flex items-center gap-3 px-3 py-2 hover:bg-accent/50 rounded-md transition-colors",
        isCurrentSong && "bg-accent/30",
        isDragging && "opacity-50 bg-accent shadow-lg"
      )}
    >
      {/* Drag Handle - visible on mobile, hover on desktop */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 w-6 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </div>

      {/* Track Number */}
      <span className={cn(
        "w-8 text-sm tabular-nums text-right shrink-0",
        isCurrentSong ? "text-primary" : "text-muted-foreground"
      )}>
        {isCurrentSong && isPlaying ? (
          <Music2 className="h-4 w-4 text-primary animate-pulse" />
        ) : (
          index + 1
        )}
      </span>

      {/* Song Info - clickable with proper touch target */}
      <button
        type="button"
        onClick={() => onPlayFromSong(index)}
        className="min-w-0 flex-1 text-left py-1 min-h-[40px] flex flex-col justify-center"
      >
        {/* Mobile: single line */}
        <p className={cn(
          "text-sm truncate sm:hidden",
          isCurrentSong && "text-primary"
        )}>
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground"> — {artist}</span>
        </p>
        {/* Desktop: single line with artist */}
        <p className={cn(
          "hidden sm:block text-sm font-medium truncate",
          isCurrentSong && "text-primary"
        )}>
          {title} <span className="font-normal text-muted-foreground">— {artist}</span>
        </p>
      </button>

      {/* Album - large screens only */}
      <span className="hidden lg:block text-sm text-muted-foreground truncate shrink-0 w-40 xl:w-48">
        {song.album || '—'}
      </span>

      {/* Duration */}
      <span className="hidden sm:block text-sm text-muted-foreground tabular-nums shrink-0 w-14 text-right">
        {formatDuration(song.duration) || '—'}
      </span>

      {/* Date added - extra large screens only */}
      <span className="hidden xl:block text-sm text-muted-foreground shrink-0 w-28 text-right">
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
            className="h-9 w-9 p-0 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
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

function PlaylistSongsList({
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
  return (
    <div>
      {/* Column Headers - desktop only */}
      <div className="hidden sm:flex items-center gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span className="w-6" /> {/* Drag handle space */}
        <span className="w-8 text-right">#</span>
        <span className="flex-1">Title</span>
        <span className="hidden lg:block w-40 xl:w-48">Album</span>
        <span className="w-14 text-right">Time</span>
        <span className="hidden xl:block w-28 text-right">Added</span>
        <span className="w-10" /> {/* Actions space */}
      </div>

      {/* Song list with drag and drop - no virtualization for reliability */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={songs.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="max-h-[calc(100vh-200px)] sm:max-h-[calc(100vh-250px)] overflow-y-auto">
            {songs.map((song, index) => (
              <SortableSongRow
                key={song.id}
                song={song}
                index={index}
                isCurrentSong={song.songId === currentSongId}
                isPlaying={isPlaying}
                onPlayFromSong={onPlayFromSong}
                onAddSongToQueue={onAddSongToQueue}
                onRemoveSong={onRemoveSong}
                isRemovePending={isRemovePending}
              />
            ))}
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
        "relative bg-gradient-to-b pb-3 sm:pb-4",
        getPlaylistGradient()
      )}>
        <div className="px-3 sm:px-4 lg:px-6">
          {/* Back button */}
          <div className="pt-1.5 pb-1.5 sm:pt-2 sm:pb-2">
            <Link
              to="/playlists"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </Link>
          </div>

          {/* Playlist Info - Two rows: header + buttons */}
          <div className="flex flex-col gap-4">
            {/* Row 1: Cover + Title */}
            <div className="flex flex-row gap-3 sm:gap-4 items-center">
              {/* Playlist Cover/Icon */}
              <div className={cn(
                "w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-lg shadow-lg flex items-center justify-center shrink-0",
                isLikedSongsPlaylist
                  ? "bg-gradient-to-br from-rose-500 to-pink-600"
                  : isSmartPlaylist
                    ? "bg-gradient-to-br from-violet-500 to-purple-600"
                    : "bg-gradient-to-br from-primary/80 to-primary"
              )}>
                {playlistIconType === 'heart' && <Heart className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-white" />}
                {playlistIconType === 'sparkles' && <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-white" />}
                {playlistIconType === 'list' && <ListMusic className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-white" />}
              </div>

              {/* Title + Count */}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold truncate leading-tight">
                  {playlist.name}
                </h1>
                <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {playlist.songs.length} songs
                </div>
              </div>
            </div>

            {/* Row 2: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Main Play Button */}
              <Button
                onClick={handlePlayAll}
                disabled={playlist.songs.length === 0}
                size="sm"
                className={cn(
                  "rounded-full h-10 w-10 sm:h-11 sm:w-11 lg:h-12 lg:w-12 p-0 shadow-lg",
                  isLikedSongsPlaylist
                    ? "bg-rose-500 hover:bg-rose-600"
                    : isSmartPlaylist
                      ? "bg-violet-500 hover:bg-violet-600"
                      : "bg-primary hover:bg-primary/90"
                )}
              >
                {isCurrentlyPlayingFromPlaylist && isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>

              {/* Shuffle button */}
              <Button
                onClick={handleShufflePlay}
                disabled={playlist.songs.length === 0}
                variant="ghost"
                size="sm"
                className="rounded-full h-9 w-9 sm:h-10 sm:w-10 p-0"
              >
                <Shuffle className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>

              {/* More Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-9 w-9 sm:h-10 sm:w-10 p-0"
                  >
                    <MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
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

              {/* Collaborate button - visible on all screens */}
              {!isLikedSongsPlaylist && !isSmartPlaylist && (
                <Button
                  onClick={() => setIsCollaborationPanelOpen(!isCollaborationPanelOpen)}
                  variant={isCollaborationPanelOpen ? "secondary" : "outline"}
                  size="sm"
                  className={cn(
                    "rounded-full h-9 w-9 p-0 sm:h-10 sm:w-auto sm:gap-2 sm:px-4",
                    isCollaborationPanelOpen && "bg-primary/10 border-primary/30"
                  )}
                >
                  <Users className="h-4 w-4 sm:shrink-0" />
                  <span className="hidden sm:inline text-sm">Collaborate</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area with optional Collaboration Panel */}
      <div className="flex flex-1">
        {/* Song List */}
        <div className="flex-1">
          <div className={cn(
            "transition-all duration-300 px-3 sm:px-4 lg:px-6 py-2 sm:py-3",
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
              <PlaylistSongsList
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
