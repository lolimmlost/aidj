import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import { ListMusic, Play, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAudioStore } from '@/lib/stores/audio';
import { playPlaylist } from '@/lib/utils/playlist-helpers';

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

function PlaylistDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPlaylist, playSong } = useAudioStore();

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

  const handlePlayAll = async () => {
    if (!playlist || playlist.songs.length === 0) {
      toast.error('This playlist is empty');
      return;
    }

    try {
      await playPlaylist(id, setPlaylist, playSong);
      toast.success('Playing playlist');
    } catch (error) {
      console.error('Failed to play playlist:', error);
      toast.error('Failed to load playlist');
    }
  };

  const handleRemoveSong = (songId: string) => {
    removeSongMutation.mutate(songId);
  };

  const handleDeletePlaylist = () => {
    deletePlaylistMutation.mutate();
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

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <ListMusic className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-muted-foreground mt-1">{playlist.description}</p>
            )}
          </div>
        </div>
        <Link to="/playlists" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
          ← Back to Playlists
        </Link>
      </div>

      {/* Playlist Info & Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Playlist Information</CardTitle>
          <CardDescription>
            {playlist.songs.length} {playlist.songs.length === 1 ? 'song' : 'songs'} • Created {new Date(playlist.createdAt).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handlePlayAll}
              disabled={playlist.songs.length === 0}
              className="min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play All
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="min-h-[44px]">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Playlist
                </Button>
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
          </div>
        </CardContent>
      </Card>

      {/* Song List */}
      {playlist.songs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ListMusic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No songs yet</h2>
            <p className="text-muted-foreground mb-4">
              Add songs to this playlist from the search page or library
            </p>
            <Button asChild>
              <Link to="/library/search">Search Library</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Songs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {playlist.songs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-muted-foreground text-sm w-8 flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{song.songArtistTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(song.addedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSong(song.songId)}
                    disabled={removeSongMutation.isPending}
                    className="min-h-[44px] min-w-[44px]"
                    aria-label="Remove song"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
