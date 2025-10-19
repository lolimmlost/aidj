import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListPlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';

interface AddToPlaylistButtonProps {
  songId: string;
  artistName: string;
  songTitle: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  songCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function AddToPlaylistButton({
  songId,
  artistName,
  songTitle,
  variant = 'ghost',
  size = 'sm',
  showLabel = false,
}: AddToPlaylistButtonProps) {
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const response = await fetch('/api/playlists/');
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }
      const json = await response.json();
      return json.data as { playlists: Playlist[] };
    },
    enabled: open, // Only fetch when dropdown is open
  });

  const addSongMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const response = await fetch(`/api/playlists/${playlistId}/songs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          artistName,
          songTitle,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to add song');
      }

      return response.json();
    },
    onSuccess: (_, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });

      const playlist = data?.playlists.find(p => p.id === playlistId);
      toast.success(`Added to ${playlist?.name || 'playlist'}`, {
        description: `${artistName} - ${songTitle}`,
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      if (error.message.includes('already in playlist')) {
        toast.info('Song already in playlist', {
          description: 'This song is already in the selected playlist',
        });
      } else {
        toast.error('Failed to add song to playlist', {
          description: error.message,
        });
      }
    },
  });

  const handleAddToPlaylist = (playlistId: string) => {
    addSongMutation.mutate(playlistId);
  };

  const handleCreateNew = () => {
    setOpen(false);
    setCreateDialogOpen(true);
  };

  const playlists = data?.playlists || [];

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className="min-h-[44px]"
            aria-label="Add to playlist"
          >
            <ListPlus className={showLabel ? 'mr-2 h-4 w-4' : 'h-4 w-4'} />
            {showLabel && 'Add to Playlist'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Add to Playlist</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading && (
            <DropdownMenuItem disabled>Loading playlists...</DropdownMenuItem>
          )}

          {!isLoading && playlists.length === 0 && (
            <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
          )}

          {!isLoading && playlists.map((playlist) => (
            <DropdownMenuItem
              key={playlist.id}
              onClick={() => handleAddToPlaylist(playlist.id)}
              disabled={addSongMutation.isPending}
            >
              {playlist.name}
              <span className="ml-auto text-xs text-muted-foreground">
                {playlist.songCount}
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Playlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreatePlaylistDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
