import { createFileRoute } from '@tanstack/react-router';
import { ArtistsList } from '@/components/library/ArtistsList';
import { GlassArtistsList } from '@/components/library/GlassArtistsList';
import { useGlassUi } from '@/lib/hooks/useGlassUi';

export const Route = createFileRoute('/library/artists/')({
  component: ArtistsPage,
});

function ArtistsPage() {
  // Glass design: the A–Z list at every size (a centred column on wider screens)
  const glass = useGlassUi();
  return glass ? <GlassArtistsList /> : <ArtistsList />;
}
