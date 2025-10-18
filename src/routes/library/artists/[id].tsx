import { createFileRoute, Link, useParams, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getAlbums } from '@/lib/services/navidrome';
import { Loader2, Music } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/library/artists/id')({
  component: ArtistAlbums,
});

function ArtistAlbums() {
  const { id } = useParams({ from: '/library/artists/id' }) as { id: string };
  const navigate = useNavigate();

  const { data: albums = [], isLoading: loadingAlbums, error } = useQuery({
    queryKey: ['albums', id],
    queryFn: () => getAlbums(id, 0, 50),
  });

  if (error) {
    return <div className="container mx-auto p-6">Error loading albums: {error.message}</div>;
  }

  const sortedAlbums = [...albums].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <Card className="fade-in">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <Music className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Artist Albums</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1">
                  {albums.length} {albums.length === 1 ? 'album' : 'albums'}
                </p>
              </div>
            </div>
            <Link to="/dashboard" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
              ← Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>

      {loadingAlbums ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedAlbums.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No albums found for this artist.</p>
            <p className="text-sm mt-2 text-muted-foreground">Check your library configuration.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {sortedAlbums.map((album) => (
              <Card key={album.id} className="cursor-pointer transition-shadow hover:shadow-md border-border/50 overflow-hidden">
                <CardContent className="p-0">
                  <div
                    className="block p-3 sm:p-4 hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
                    onClick={() => navigate({ to: '/library/artists/id/albums/albumId', params: { id, albumId: album.id } })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        navigate({ to: '/library/artists/id/albums/albumId', params: { id, albumId: album.id } });
                      }
                    }}
                  >
                    <div className="aspect-square w-full rounded-lg mb-2 sm:mb-3 overflow-hidden bg-muted">
                      <img
                        src={album.artwork || '/placeholder-album.jpg'}
                        alt={album.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold line-clamp-2 text-xs sm:text-sm text-foreground">{album.name}</div>
                      {album.year ? <div className="text-xs text-muted-foreground">{album.year}</div> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="text-center pt-4 border-t">
        <Link to="/dashboard" className="text-primary hover:underline">← Back to Dashboard</Link>
      </div>
    </div>
  );
}