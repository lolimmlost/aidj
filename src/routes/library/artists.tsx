import { createFileRoute, redirect } from '@tanstack/react-router';
import { ArtistsList } from '@/components/library/ArtistsList';

export const Route = createFileRoute('/library/artists')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    return {};
  },
  component: ArtistsList,
});
