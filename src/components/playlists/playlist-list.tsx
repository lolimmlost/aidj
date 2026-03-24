import { useState, useCallback, useMemo, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Link } from '@tanstack/react-router';
import { PlaylistExportDialog } from './export/playlist-export-dialog';
import { PlaylistImportDialog } from './import/playlist-import-dialog';
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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ListMusic,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  WifiOff,
  Play,
  ListPlus,
  Heart,
  Music,
  MoreHorizontal,
  GripVertical,
  Download,
  Upload,
  Trash2,
} from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';

// Sortable playlist card props
interface SortablePlaylistCardProps {
  playlist: Playlist;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedPlaylistData: (Playlist & { songs: PlaylistSong[] }) | null | undefined;
  isLoadingSongs: boolean;
  onAddToQueue: (playlist: Playlist, songs: PlaylistSong[], position: 'next' | 'end') => void;
  onPlayFromSong: (playlist: Playlist, songs: PlaylistSong[], startIndex: number) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onExport: (playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  formatDuration: (seconds?: number | null) => string;
  getSyncStatus: (playlist: Playlist) => { icon: typeof CheckCircle2; text: string; color: string } | null;
}

const SortablePlaylistCard = memo(function SortablePlaylistCard({
  playlist,
  isExpanded,
  onToggleExpand,
  expandedPlaylistData,
  isLoadingSongs,
  onAddToQueue,
  onPlayFromSong,
  onPlayPlaylist,
  onExport,
  onDelete,
  formatDuration,
  getSyncStatus,
}: SortablePlaylistCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: playlist.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const syncStatus = getSyncStatus(playlist);
  const displaySongCount = playlist.songCount ?? playlist.actualSongCount ?? 0;
  const isLikedSongs = playlist.name === 'Liked Songs' || playlist.description?.includes('starred songs');
  const isSmartPlaylist = !!playlist.smartPlaylistCriteria;

  const getPlaylistIcon = () => {
    if (isLikedSongs) return <Heart className="h-4 w-4 text-red-500 fill-red-500" />;
    if (isSmartPlaylist) return <Sparkles className="h-4 w-4 text-primary" />;
    return <ListMusic className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2.5 sm:p-3 rounded-xl border bg-card hover:bg-accent/50 transition-all duration-200 ${
        isLikedSongs ? 'ring-1 ring-red-500/20' : ''
      } ${isDragging ? 'shadow-2xl ring-2 ring-primary' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 flex items-center justify-center hover:bg-accent rounded opacity-60 sm:opacity-0 sm:group-hover:opacity-60 transition-opacity touch-none shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Icon */}
      <div className="shrink-0">{getPlaylistIcon()}</div>

      {/* Name + Meta */}
      <Link
        to="/playlists/$id"
        params={{ id: playlist.id }}
        className="flex-1 min-w-0"
      >
        <div className="font-medium text-sm truncate">{playlist.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{displaySongCount} {displaySongCount === 1 ? 'song' : 'songs'}</span>
          {!!playlist.totalDuration && (
            <>
              <span>·</span>
              <span>{formatDuration(playlist.totalDuration)}</span>
            </>
          )}
          {playlist.description && !isLikedSongs && !isSmartPlaylist && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline truncate">{playlist.description}</span>
            </>
          )}
        </div>
      </Link>

      {/* Smart Playlist Badges */}
      {isSmartPlaylist && playlist.smartPlaylistCriteria?.genre && playlist.smartPlaylistCriteria.genre.length > 0 && (
        <div className="hidden lg:flex gap-1 shrink-0">
          {playlist.smartPlaylistCriteria.genre.slice(0, 2).map((g) => (
            <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">
              {g}
            </Badge>
          ))}
        </div>
      )}

      {/* Sync Status */}
      {syncStatus && playlist.lastSynced && (
        <syncStatus.icon className={`h-3 w-3 shrink-0 hidden sm:block ${syncStatus.color}`} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onPlayPlaylist(playlist)}
          className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          aria-label="Play playlist"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleExpand}
          className="hidden sm:flex p-2 min-h-[36px] min-w-[36px] items-center justify-center rounded-md hover:bg-accent transition-colors"
          aria-label={isExpanded ? 'Hide songs' : 'Show songs'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to="/playlists/$id" params={{ id: playlist.id }}>
                View Details
              </Link>
            </DropdownMenuItem>
            {expandedPlaylistData?.songs && expandedPlaylistData.songs.length > 0 && isExpanded && (
              <>
                <DropdownMenuItem
                  onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'next')}
                  className="min-h-[44px]"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Play Next
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'end')}
                  className="min-h-[44px]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add to Queue
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() => onExport(playlist)}
              className="min-h-[44px]"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Playlist
            </DropdownMenuItem>
            {playlist.name !== '❤️ Liked Songs' && (
              <DropdownMenuItem
                onClick={() => onDelete(playlist)}
                className="min-h-[44px] text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Playlist
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded Song List - Desktop only */}
      {isExpanded && (
        <div className="hidden sm:block col-span-full border rounded-lg bg-muted/30 -mt-1 ml-8">
          {isLoadingSongs ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-3/4" />
            </div>
          ) : expandedPlaylistData?.songs && expandedPlaylistData.songs.length > 0 ? (
            <>
              <div className="max-h-48 overflow-y-auto">
                {expandedPlaylistData.songs.slice(0, 10).map((song, index) => (
                  <div
                    key={song.id}
                    className="group/song flex items-center gap-3 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors text-sm"
                    onClick={() => onPlayFromSong(playlist, expandedPlaylistData.songs, index)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPlayFromSong(playlist, expandedPlaylistData.songs, index);
                      }
                    }}
                  >
                    <span className="text-xs text-muted-foreground w-5 text-right">
                      {index + 1}
                    </span>
                    <span className="truncate flex-1">{song.songArtistTitle}</span>
                    <Play className="h-3.5 w-3.5 opacity-0 group-hover/song:opacity-100 transition-opacity text-primary flex-shrink-0" />
                  </div>
                ))}
                {expandedPlaylistData.songs.length > 10 && (
                  <Link
                    to="/playlists/$id"
                    params={{ id: playlist.id }}
                    className="block px-3 py-2 text-sm text-center text-primary hover:bg-accent/50 transition-colors font-medium"
                  >
                    View all {expandedPlaylistData.songs.length} songs
                  </Link>
                )}
              </div>

              {/* Quick Add to Queue */}
              <div className="p-2 border-t border-border/30">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'next')}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Play Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'end')}
                  >
                    <ListPlus className="mr-1 h-3 w-3" />
                    Add to Queue
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              <Music className="h-6 w-6 mx-auto mb-1 opacity-50" />
              <p className="text-sm">No songs in this playlist</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

interface SmartPlaylistCriteria {
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  artists?: string[];
  rating?: number;
  recentlyAdded?: '7d' | '30d' | '90d';
}

interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  navidromeId?: string | null;
  lastSynced?: Date | null;
  songCount?: number | null;
  totalDuration?: number | null;
  smartPlaylistCriteria?: SmartPlaylistCriteria | null;
  createdAt: Date;
  updatedAt: Date;
  actualSongCount: number;
}

interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
}

interface PlaylistListProps {
  onAddToQueue?: (playlistId: string, songs: PlaylistSong[]) => void;
}

export function PlaylistList({ onAddToQueue }: PlaylistListProps) {
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [_orderedPlaylistIds, setOrderedPlaylistIds] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const queryClient = useQueryClient();
  const { addToQueueNext, addToQueueEnd, setAIUserActionInProgress } = useAudioStore();

  // DnD sensors - includes TouchSensor for mobile support
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

  // Fetch all playlists
  const { data, isLoading, error } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const response = await fetch('/api/playlists/');
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }
      const json = await response.json();
      return json.data as { playlists: Playlist[]; navidromeAvailable: boolean };
    },
  });

  // Fetch expanded playlist details
  const { data: expandedPlaylistData, isLoading: isLoadingSongs } = useQuery({
    queryKey: ['playlist', expandedPlaylistId],
    queryFn: async () => {
      if (!expandedPlaylistId) return null;
      const response = await fetch(`/api/playlists/${expandedPlaylistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch playlist details');
      }
      const json = await response.json();
      return json.data as Playlist & { songs: PlaylistSong[] };
    },
    enabled: !!expandedPlaylistId,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to sync playlists');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      const summary = data.data.summary;
      toast.success('Playlists synced', {
        description: `Added: ${summary.added}, Updated: ${summary.updated}, Deleted: ${summary.deleted}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Sync failed', {
        description: error.message,
      });
    },
  });

  const handleToggleExpand = useCallback((playlistId: string) => {
    setExpandedPlaylistId(prev => prev === playlistId ? null : playlistId);
  }, []);

  const handleAddToQueue = useCallback((playlist: Playlist, songs?: PlaylistSong[], position: 'next' | 'end' = 'end') => {
    if (!songs || songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    // Convert playlist songs to audio store format
    const audioSongs = songs.map((song) => ({
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
      toast.success(`Added ${songs.length} songs to play next`, {
        description: `From "${playlist.name}"`,
      });
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    } else {
      setAIUserActionInProgress(true);
      addToQueueEnd(audioSongs);
      toast.success(`Added ${songs.length} songs to end of queue`, {
        description: `From "${playlist.name}"`,
      });
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    }

    onAddToQueue?.(playlist.id, songs);
  }, [addToQueueNext, addToQueueEnd, setAIUserActionInProgress, onAddToQueue]);

  const handlePlayFromSong = useCallback(async (playlist: Playlist, songs: PlaylistSong[], startIndex: number) => {
    if (!songs || songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    try {
      // Load playlist with full metadata from Navidrome using helper
      const { loadPlaylistIntoQueue } = await import('@/lib/utils/playlist-helpers');
      const audioSongs = await loadPlaylistIntoQueue(playlist.id);

      if (audioSongs.length === 0) {
        toast.error('Failed to load playlist songs');
        return;
      }

      // Get audio store instance and set everything up
      const { setPlaylist, playSong, setIsPlaying } = useAudioStore.getState();

      // Set playlist and start playing from the selected song
      setPlaylist(audioSongs);
      playSong(audioSongs[startIndex].id, audioSongs);
      setIsPlaying(true);

      const songTitle = audioSongs[startIndex].title || audioSongs[startIndex].name;
      toast.success(`Playing from "${songTitle}"`, {
        description: `From "${playlist.name}"`,
      });
    } catch (error) {
      console.error('Failed to play from song:', error);
      toast.error('Failed to load playlist');
    }
  }, []);

  const handlePlayPlaylist = useCallback(async (playlist: Playlist) => {
    try {
      const { loadPlaylistIntoQueue } = await import('@/lib/utils/playlist-helpers');
      const audioSongs = await loadPlaylistIntoQueue(playlist.id);

      if (audioSongs.length === 0) {
        toast.error('This playlist is empty');
        return;
      }

      const { setPlaylist, playSong, setIsPlaying } = useAudioStore.getState();
      setPlaylist(audioSongs);
      playSong(audioSongs[0].id, audioSongs);
      setIsPlaying(true);

      toast.success(`Playing "${playlist.name}"`, {
        description: `${audioSongs.length} songs`,
      });
    } catch (error) {
      console.error('Failed to play playlist:', error);
      toast.error('Failed to load playlist');
    }
  }, []);

  const handleExport = useCallback((playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setExportDialogOpen(true);
  }, []);

  const { mutate: deletePlaylist, isPending: isDeleting } = useMutation({
    mutationFn: async (playlistId: string) => {
      const response = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete playlist');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);

  const handleDelete = useCallback((playlist: Playlist) => {
    setDeleteTarget(playlist);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deletePlaylist(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Deleted "${deleteTarget.name}"`);
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast.error('Failed to delete playlist', { description: err.message });
        setDeleteTarget(null);
      },
    });
  }, [deleteTarget, deletePlaylist]);

  const handleImportSuccess = useCallback((_playlistId: string) => {
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    toast.success('Playlist imported!', {
      description: 'The playlist has been added to your library',
    });
  }, [queryClient]);

  // Memoized utility functions to prevent unnecessary re-renders of child components
  const formatDuration = useCallback((seconds?: number | null) => {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  const formatLastSynced = useCallback((date?: Date | null) => {
    if (!date) return null;
    const now = new Date();
    const synced = new Date(date);
    const diffMs = now.getTime() - synced.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }, []);

  const getSyncStatus = useCallback((playlist: Playlist) => {
    // Check if playlist was deleted from Navidrome (sync conflict)
    if (playlist.description?.includes('[Deleted from Navidrome]')) {
      return { icon: XCircle, text: 'Deleted in Navidrome', color: 'text-destructive' };
    }

    if (!playlist.navidromeId) return null;
    if (!playlist.lastSynced) {
      return { icon: XCircle, text: 'Not synced', color: 'text-destructive' };
    }

    const lastSyncedDate = new Date(playlist.lastSynced);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSyncedDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSync < 1) {
      return { icon: CheckCircle2, text: 'Synced', color: 'text-green-500' };
    }
    return { icon: Clock, text: formatLastSynced(playlist.lastSynced), color: 'text-yellow-500' };
  }, [formatLastSynced]);

  const rawPlaylists = data?.playlists || [];
  const navidromeAvailable = data?.navidromeAvailable ?? true;

  // Use localStorage to persist order
  const storageKey = 'playlist-order';

  // Memoize ordered playlists computation to prevent recalculation on every render
  const playlists = useMemo((): Playlist[] => {
    if (rawPlaylists.length === 0) return [];

    // Try to get saved order from localStorage
    let savedOrder: string[] = [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        savedOrder = JSON.parse(saved);
      }
    } catch {
      // Ignore localStorage errors
    }

    // If we have a saved order, use it
    if (savedOrder.length > 0) {
      const playlistMap = new Map(rawPlaylists.map(p => [p.id, p]));
      const ordered: Playlist[] = [];

      // Add playlists in saved order
      for (const id of savedOrder) {
        const playlist = playlistMap.get(id);
        if (playlist) {
          ordered.push(playlist);
          playlistMap.delete(id);
        }
      }

      // Add any new playlists not in saved order
      for (const playlist of playlistMap.values()) {
        ordered.push(playlist);
      }

      return ordered;
    }

    return rawPlaylists;
  }, [rawPlaylists, _orderedPlaylistIds]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = playlists.findIndex((p) => p.id === active.id);
      const newIndex = playlists.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(playlists, oldIndex, newIndex);
      const newOrderIds = newOrder.map((p) => p.id);

      // Save to localStorage
      try {
        localStorage.setItem(storageKey, JSON.stringify(newOrderIds));
      } catch {
        // Ignore localStorage errors
      }

      // Force re-render by updating a state
      setOrderedPlaylistIds(newOrderIds);

      toast.success('Playlist order updated');
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading playlists: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="text-center py-12">
        <ListMusic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No playlists yet</h2>
        <p className="text-muted-foreground mb-4">
          Create your first playlist or sync from Navidrome
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          {!navidromeAvailable && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <WifiOff className="h-4 w-4" />
              <span>Offline - Showing cached playlists</span>
            </div>
          )}
          {navidromeAvailable && (
            <p className="text-sm text-muted-foreground">
              {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => setImportDialogOpen(true)}
            variant="outline"
            size="sm"
            className="min-h-[44px]"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !navidromeAvailable}
            variant="outline"
            size="sm"
            className="min-h-[44px]"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Fallback suggestion when Navidrome is offline and no cached playlists */}
      {!navidromeAvailable && playlists.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">No Cached Playlists Available</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Navidrome is currently unavailable and you have no cached playlists.
                Try creating an AI-generated playlist instead!
              </p>
              <Button variant="outline" asChild className="min-h-[44px]">
                <Link to="/dashboard">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Try AI Playlists
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Playlist Cards with Drag & Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={playlists.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="space-y-1.5">
            {playlists.map((playlist) => (
              <SortablePlaylistCard
                key={playlist.id}
                playlist={playlist}
                isExpanded={expandedPlaylistId === playlist.id}
                onToggleExpand={() => handleToggleExpand(playlist.id)}
                expandedPlaylistData={expandedPlaylistId === playlist.id ? expandedPlaylistData : undefined}
                isLoadingSongs={isLoadingSongs && expandedPlaylistId === playlist.id}
                onAddToQueue={handleAddToQueue}
                onPlayFromSong={handlePlayFromSong}
                onPlayPlaylist={handlePlayPlaylist}
                onExport={handleExport}
                onDelete={handleDelete}
                formatDuration={formatDuration}
                getSyncStatus={getSyncStatus}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Export Dialog */}
      {selectedPlaylist && (
        <PlaylistExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          playlistId={selectedPlaylist.id}
          playlistName={selectedPlaylist.name}
        />
      )}

      {/* Import Dialog */}
      <PlaylistImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={handleImportSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
