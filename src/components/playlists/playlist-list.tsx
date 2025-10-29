import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { SmartPlaylistEditor } from './smart-playlist-editor';

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
  const queryClient = useQueryClient();
  const { addToQueueNext, addToQueueEnd, setAIUserActionInProgress } = useAudioStore();

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

  const playlists = data?.playlists || [];
  const navidromeAvailable = data?.navidromeAvailable ?? true;

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
      {/* Header with Actions */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          {!navidromeAvailable && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <WifiOff className="h-4 w-4" />
              <span>Offline - Showing cached playlists</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* New Smart Playlist Editor */}
          <SmartPlaylistEditor
            trigger={
              <Button className="min-h-[44px]">
                <Sparkles className="mr-2 h-4 w-4" />
                New Smart Playlist
              </Button>
            }
          />

          {/* Sync Button */}
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !navidromeAvailable}
            variant="outline"
            className="min-h-[44px]"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Navidrome'}
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

      {/* Playlist Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((playlist) => {
          const isExpanded = expandedPlaylistId === playlist.id;
          const syncStatus = getSyncStatus(playlist);
          const displaySongCount = playlist.songCount ?? playlist.actualSongCount ?? 0;

          return (
            <Card key={playlist.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {playlist.smartPlaylistCriteria ? (
                      <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                    ) : (
                      <ListMusic className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <CardTitle className="truncate text-base">{playlist.name}</CardTitle>
                  </div>
                  {syncStatus && (
                    <div className="flex items-center gap-1 text-xs">
                      <syncStatus.icon className={`h-4 w-4 ${syncStatus.color}`} />
                      <span className={syncStatus.color}>{syncStatus.text}</span>
                    </div>
                  )}
                </div>
                {playlist.description && (
                  <CardDescription className="line-clamp-2 text-sm">
                    {playlist.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {/* Metadata */}
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{displaySongCount} {displaySongCount === 1 ? 'song' : 'songs'}</p>
                    {!!playlist.totalDuration && (
                      <p>Duration: {formatDuration(playlist.totalDuration)}</p>
                    )}
                    {!!playlist.lastSynced && (
                      <p className="text-xs">
                        Last synced: {formatLastSynced(playlist.lastSynced)}
                      </p>
                    )}
                  </div>

                  {/* Smart Playlist Criteria Display */}
                  {!!playlist.smartPlaylistCriteria && (
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium mb-1">Filters:</p>
                      <div className="flex flex-wrap gap-1">
                        {playlist.smartPlaylistCriteria.genre?.map((g) => (
                          <span key={g} className="px-2 py-0.5 bg-primary/10 rounded">
                            {g}
                          </span>
                        ))}
                        {!!(playlist.smartPlaylistCriteria.yearFrom && playlist.smartPlaylistCriteria.yearTo) && (
                          <span className="px-2 py-0.5 bg-primary/10 rounded">
                            {playlist.smartPlaylistCriteria.yearFrom}-{playlist.smartPlaylistCriteria.yearTo}
                          </span>
                        )}
                        {!!playlist.smartPlaylistCriteria.rating && (
                          <span className="px-2 py-0.5 bg-primary/10 rounded">
                            ⭐ {playlist.smartPlaylistCriteria.rating}+
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleToggleExpand(playlist.id)}
                      className="flex-1 min-h-[44px]"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="mr-2 h-4 w-4" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          Expand
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="min-h-[44px] px-3"
                    >
                      <Link to="/playlists/$id" params={{ id: playlist.id }}>
                        View
                      </Link>
                    </Button>
                  </div>

                  {/* Expanded Song List */}
                  {isExpanded && (
                    <div className="pt-3 border-t space-y-2">
                      {isLoadingSongs ? (
                        <Skeleton className="h-20" />
                      ) : expandedPlaylistData?.songs && expandedPlaylistData.songs.length > 0 ? (
                        <>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {expandedPlaylistData.songs.map((song, index) => (
                              <div
                                key={song.id}
                                className="group text-sm p-2 hover:bg-accent rounded flex items-center gap-2 cursor-pointer transition-colors"
                                onClick={() => handlePlayFromSong(playlist, expandedPlaylistData.songs, index)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handlePlayFromSong(playlist, expandedPlaylistData.songs, index);
                                  }
                                }}
                              >
                                <span className="text-muted-foreground w-6">{index + 1}.</span>
                                <span className="truncate flex-1">{song.songArtistTitle}</span>
                                <Play className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary flex-shrink-0" />
                              </div>
                            ))}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full min-h-[44px]"
                              >
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-48">
                              <DropdownMenuItem
                                onClick={() => handleAddToQueue(playlist, expandedPlaylistData.songs, 'next')}
                                className="min-h-[44px]"
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Play Next
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleAddToQueue(playlist, expandedPlaylistData.songs, 'end')}
                                className="min-h-[44px]"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add to End
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No songs in this playlist
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
