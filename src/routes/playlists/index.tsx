import { createFileRoute, redirect } from '@tanstack/react-router';
import { ListMusic } from 'lucide-react';
import { SmartPlaylistBuilder } from '@/components/playlists/smart-playlist-builder';
import { PlaylistList } from '@/components/playlists/playlist-list';
import { PageLayout, PageSection } from '@/components/ui/page-layout';

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
    <PageLayout
      title="My Playlists"
      description="Manage and create your music collections"
      icon={<ListMusic className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={<SmartPlaylistBuilder />}
    >
      <PageSection>
        <PlaylistList />
      </PageSection>
    </PageLayout>
  );
}
