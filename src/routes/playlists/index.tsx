import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListMusic } from 'lucide-react';
import { PlaylistCard } from '@/components/playlists/PlaylistCard';
import { CreatePlaylistDialog } from '@/components/playlists/CreatePlaylistDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudioStore } from '@/lib/stores/audio';
import { playPlaylist } from '@/lib/utils/playlist-helpers';

export const Route = createFileRoute('/playlists/')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: PlaylistsPage,
});

interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  songCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function PlaylistsPage() {
  const { setPlaylist, playSong } = useAudioStore();

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

  const handlePlayPlaylist = async (playlistId: string) => {
    try {
      await playPlaylist(playlistId, setPlaylist, playSong);
      toast.success('Playing playlist');
    } catch (error) {
      console.error('Failed to play playlist:', error);
      if (error instanceof Error && error.message === 'Playlist is empty') {
        toast.error('This playlist is empty');
      } else {
        toast.error('Failed to load playlist');
      }
    }
  };

  const playlists = data?.playlists || [];

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <ListMusic className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Playlists</h1>
        </div>
        <div className="flex items-center gap-3">
          <CreatePlaylistDialog />
          <Link to="/dashboard" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
            ← Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="text-center py-8 text-destructive">
          Error loading playlists: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {!isLoading && !error && playlists.length === 0 && (
        <div className="text-center py-12">
          <ListMusic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No playlists yet</h2>
          <p className="text-muted-foreground mb-4">
            Create your first playlist to start organizing your music
          </p>
          <CreatePlaylistDialog />
        </div>
      )}

      {!isLoading && !error && playlists.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              id={playlist.id}
              name={playlist.name}
              description={playlist.description}
              songCount={playlist.songCount}
              createdAt={playlist.createdAt}
              onPlay={handlePlayPlaylist}
            />
          ))}
        </div>
      )}
    </div>
  );
}
