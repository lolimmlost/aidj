import { createFileRoute } from '@tanstack/react-router';
import { ArtistsList } from '@/components/library/ArtistsList';

export const Route = createFileRoute('/library/artists/')({
  component: ArtistsList,
});
