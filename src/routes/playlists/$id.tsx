import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListMusic, Play, Trash2, X, ListPlus, Plus, Shuffle,
  Heart, Sparkles, ChevronLeft, MoreHorizontal, Music2, Pause, GripVertical
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
  },
  component: PlaylistDetailPage,
});

interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group grid grid-cols-[auto_auto_1fr_auto] sm:grid-cols-[24px_40px_1fr_100px_auto] gap-2 sm:gap-4 px-2 sm:px-4 py-3 rounded-md transition-colors",
        isCurrentSong
          ? "bg-accent"
          : "hover:bg-accent/50",
        isDragging && "opacity-50 bg-accent shadow-lg"
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Track Number / Play Icon */}
      <div className="flex items-center justify-center w-6 sm:w-auto">
        <button
          type="button"
          onClick={() => onPlayFromSong(index)}
          className="relative w-6 h-6 flex items-center justify-center"
          aria-label={`Play ${song.songArtistTitle}`}
        >
          <span className={cn(
            "text-sm tabular-nums transition-opacity",
            isCurrentSong
              ? "text-primary font-medium"
              : "text-muted-foreground",
            "group-hover:opacity-0"
          )}>
            {isCurrentSong && isPlaying ? (
              <Music2 className="h-4 w-4 text-primary animate-pulse" />
            ) : (
              index + 1
            )}
          </span>
          <Play className="h-4 w-4 absolute opacity-0 group-hover:opacity-100 transition-opacity text-foreground" />
        </button>
      </div>

      {/* Song Info */}
      <div
        className="min-w-0 cursor-pointer"
        onClick={() => onPlayFromSong(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlayFromSong(index);
          }
        }}
      >
        <p className={cn(
          "font-medium truncate",
          isCurrentSong && "text-primary"
        )}>
          {title}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {artist}
        </p>
      </div>

      {/* Date Added (hidden on mobile) */}
      <div className="hidden sm:flex items-center justify-end text-sm text-muted-foreground">
        {new Date(song.addedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ListPlus className="h-4 w-4" />
              <span className="sr-only">Add to queue</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAddSongToQueue(song, 'now');
              }}
              className="min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play Now
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAddSongToQueue(song, 'next');
              }}
              className="min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play Next
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAddSongToQueue(song, 'end');
              }}
              className="min-h-[44px]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add to End
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveSong(song.songId);
          }}
          disabled={isRemovePending}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove song"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PlaylistDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPlaylist, playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress, currentSong, isPlaying } = useAudioStore();

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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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
          {/* Back button */}
          <div className="pt-4 pb-6">
            <Link
              to="/playlists"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Playlists
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
          </div>
        </div>
      </div>

      {/* Song List */}
      <div className="container mx-auto px-3 sm:px-6 py-6">
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
          <div className="space-y-1">
            {/* Table Header */}
            <div className="grid grid-cols-[auto_auto_1fr_auto] sm:grid-cols-[24px_40px_1fr_100px_auto] gap-2 sm:gap-4 px-2 sm:px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b">
              <span className="w-4" />
              <span className="text-center">#</span>
              <span>Title</span>
              <span className="hidden sm:block text-right">Added</span>
              <span className="w-20" />
            </div>

            {/* Song Rows with Drag and Drop */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={playlist.songs.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {playlist.songs.map((song, index) => (
                  <SortableSongRow
                    key={song.id}
                    song={song}
                    index={index}
                    isCurrentSong={song.songId === currentSong?.id}
                    isPlaying={isPlaying}
                    onPlayFromSong={handlePlayFromSong}
                    onAddSongToQueue={handleAddSongToQueue}
                    onRemoveSong={handleRemoveSong}
                    isRemovePending={removeSongMutation.isPending}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
