import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { ListMusic } from 'lucide-react';
import { SmartPlaylistBuilder } from '@/components/playlists/smart-playlist-builder';
import { PlaylistList } from '@/components/playlists/playlist-list';

export const Route = createFileRoute('/playlists/')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: PlaylistsPage,
});

function PlaylistsPage() {
  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <ListMusic className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Playlists</h1>
        </div>
        <div className="flex items-center gap-3">
          <SmartPlaylistBuilder />
          <Link to="/dashboard" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
            ← Dashboard
          </Link>
        </div>
      </div>

      <PlaylistList />
    </div>
  );
}
