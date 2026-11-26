import { createFileRoute } from '@tanstack/react-router';
import { ArtistsList } from '@/components/library/ArtistsList';
import { GlassArtistsList } from '@/components/library/GlassArtistsList';
import { useIsPhone } from '@/components/glass/GlassSheet';
import { useGlassUi } from '@/lib/hooks/useGlassUi';

export const Route = createFileRoute('/library/artists/')({
  component: ArtistsPage,
});

function ArtistsPage() {
  // Glass UI on phones: the A–Z list (desktop keeps the card grid for now)
  const glass = useGlassUi();
  const phone = useIsPhone();
  return glass && phone ? <GlassArtistsList /> : <ArtistsList />;
}
