import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
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
  formatDuration: (seconds?: number | null) => string;
  formatLastSynced: (date?: Date | null) => string | null;
  getSyncStatus: (playlist: Playlist) => { icon: typeof CheckCircle2; text: string; color: string } | null;
}

function SortablePlaylistCard({
  playlist,
  isExpanded,
  onToggleExpand,
  expandedPlaylistData,
  isLoadingSongs,
  onAddToQueue,
  onPlayFromSong,
  formatDuration,
  formatLastSynced,
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

  const getPlaylistType = () => {
    if (isLikedSongs) return 'Liked Songs';
    if (isSmartPlaylist) {
      const criteria = playlist.smartPlaylistCriteria as { sort?: string };
      if (criteria?.sort === 'random') return 'Smart playlist: random';
      if (criteria?.sort === 'artist') return 'Smart playlist: artist';
      if (criteria?.sort) return `Smart playlist: ${criteria.sort}`;
      return 'Smart playlist: custom rules';
    }
    return null;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`group hover:shadow-lg transition-all duration-200 overflow-hidden ${
        isLikedSongs ? 'ring-1 ring-red-500/20' : ''
      } ${isDragging ? 'shadow-2xl ring-2 ring-primary' : ''}`}
    >
      <CardContent className="p-0">
        {/* Card Header */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            {/* Drag Handle - Always visible on mobile, hover on desktop */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-accent rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity touch-none"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getPlaylistIcon()}
              <h3 className="font-semibold truncate">{playlist.name}</h3>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/playlists/$id" params={{ id: playlist.id }}>
                    View Details
                  </Link>
                </DropdownMenuItem>
                {expandedPlaylistData?.songs && expandedPlaylistData.songs.length > 0 && isExpanded && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'next')}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Play Next
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'end')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add to Queue
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Playlist Type Label */}
          {getPlaylistType() && (
            <p className="text-xs text-muted-foreground mb-3">
              {getPlaylistType()}
            </p>
          )}

          {/* Description for regular playlists */}
          {playlist.description && !isLikedSongs && !isSmartPlaylist && (
            <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
              {playlist.description}
            </p>
          )}

          {/* Stats Row */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Music className="h-3.5 w-3.5" />
              <span>{displaySongCount} {displaySongCount === 1 ? 'song' : 'songs'}</span>
            </div>
            {!!playlist.totalDuration && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span>{formatDuration(playlist.totalDuration)}</span>
              </>
            )}
          </div>

          {/* Smart Playlist Filters */}
          {isSmartPlaylist && playlist.smartPlaylistCriteria?.genre && playlist.smartPlaylistCriteria.genre.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {playlist.smartPlaylistCriteria.genre.slice(0, 3).map((g) => (
                <Badge key={g} variant="secondary" className="text-xs">
                  {g}
                </Badge>
              ))}
              {playlist.smartPlaylistCriteria.genre.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{playlist.smartPlaylistCriteria.genre.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Sync Status */}
          {syncStatus && playlist.lastSynced && (
            <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
              <syncStatus.icon className={`h-3 w-3 ${syncStatus.color}`} />
              <span>Last synced: {formatLastSynced(playlist.lastSynced)}</span>
            </div>
          )}
        </div>

        {/* Action Bar - Desktop: Show Songs | Play, Mobile: View | Play */}
        <div className="flex border-t border-border/50">
          {/* On mobile: direct link to detail page. On desktop: expand songs */}
          <Link
            to="/playlists/$id"
            params={{ id: playlist.id }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-accent transition-colors sm:hidden"
          >
            <ListMusic className="h-4 w-4" />
            <span>View</span>
          </Link>
          <button
            onClick={onToggleExpand}
            className="hidden sm:flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>Hide Songs</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span>Show Songs</span>
              </>
            )}
          </button>
          <div className="w-px bg-border/50" />
          <Link
            to="/playlists/$id"
            params={{ id: playlist.id }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Play className="h-4 w-4" />
            <span>Play</span>
          </Link>
        </div>

        {/* Expanded Song List - Desktop only */}
        {isExpanded && (
          <div className="hidden sm:block border-t border-border/50 bg-muted/30">
            {isLoadingSongs ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : expandedPlaylistData?.songs && expandedPlaylistData.songs.length > 0 ? (
              <>
                <div className="max-h-56 overflow-y-auto">
                  {expandedPlaylistData.songs.slice(0, 10).map((song, index) => (
                    <div
                      key={song.id}
                      className="group/song flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
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
                      <span className="text-sm truncate flex-1">{song.songArtistTitle}</span>
                      <Play className="h-3.5 w-3.5 opacity-0 group-hover/song:opacity-100 transition-opacity text-primary flex-shrink-0" />
                    </div>
                  ))}
                  {expandedPlaylistData.songs.length > 10 && (
                    <Link
                      to="/playlists/$id"
                      params={{ id: playlist.id }}
                      className="block px-4 py-3 text-sm text-center text-primary hover:bg-accent/50 transition-colors font-medium"
                    >
                      View all {expandedPlaylistData.songs.length} songs
                    </Link>
                  )}
                </div>

                {/* Quick Add to Queue */}
                <div className="p-3 pt-0">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'next')}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Play Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => onAddToQueue(playlist, expandedPlaylistData.songs, 'end')}
                    >
                      <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                      Add to Queue
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No songs in this playlist</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const [orderedPlaylistIds, setOrderedPlaylistIds] = useState<string[]>([]);
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

  const handleToggleExpand = (playlistId: string) => {
    setExpandedPlaylistId(expandedPlaylistId === playlistId ? null : playlistId);
  };

  const handleAddToQueue = (playlist: Playlist, songs?: PlaylistSong[], position: 'next' | 'end' = 'end') => {
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
  };

  const handlePlayFromSong = async (playlist: Playlist, songs: PlaylistSong[], startIndex: number) => {
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
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatLastSynced = (date?: Date | null) => {
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
  };

  const getSyncStatus = (playlist: Playlist) => {
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
  };

  const rawPlaylists = data?.playlists || [];
  const navidromeAvailable = data?.navidromeAvailable ?? true;

  // Sync ordered IDs when playlists change
  // Use localStorage to persist order
  const storageKey = 'playlist-order';

  // Initialize order from localStorage or use default
  const getOrderedPlaylists = (): Playlist[] => {
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
  };

  const playlists = getOrderedPlaylists();

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

        {/* Sync Button - Only action here, main create buttons are in page header */}
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !navidromeAvailable}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync'}
        </Button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                formatDuration={formatDuration}
                formatLastSynced={formatLastSynced}
                getSyncStatus={getSyncStatus}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
