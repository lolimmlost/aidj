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
  ListMusic,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';

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
  const { addPlaylistToQueue } = useAudioStore();

  // Fetch all playlists
  const { data, isLoading, error } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const response = await fetch('/api/playlists/');
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }
      const json = await response.json();
      return json.data as { playlists: Playlist[] };
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

  const handleAddToQueue = (playlist: Playlist, songs?: PlaylistSong[]) => {
    if (!songs || songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    // Convert playlist songs to audio store format
    const audioSongs = songs.map((song) => ({
      id: song.songId,
      title: song.songArtistTitle.split(' - ')[1] || song.songArtistTitle,
      artist: song.songArtistTitle.split(' - ')[0] || 'Unknown Artist',
      url: `/api/stream/${song.songId}`,
    }));

    addPlaylistToQueue(audioSongs, false);
    toast.success(`Added ${songs.length} songs to queue`, {
      description: `From "${playlist.name}"`,
    });

    onAddToQueue?.(playlist.id, songs);
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
      {/* Sync Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="outline"
          className="min-h-[44px]"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Navidrome'}
        </Button>
      </div>

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
                                className="text-sm p-2 hover:bg-accent rounded flex items-center gap-2"
                              >
                                <span className="text-muted-foreground w-6">{index + 1}.</span>
                                <span className="truncate flex-1">{song.songArtistTitle}</span>
                              </div>
                            ))}
                          </div>
                          <Button
                            onClick={() => handleAddToQueue(playlist, expandedPlaylistData.songs)}
                            variant="secondary"
                            size="sm"
                            className="w-full min-h-[44px]"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add All to Queue
                          </Button>
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
