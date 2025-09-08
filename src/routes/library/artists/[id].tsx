import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getAlbums } from '@/lib/services/navidrome';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/library/artists/id')({
  component: ArtistAlbums,
});

function ArtistAlbums() {
  const { id } = useParams({ from: '/library/artists/id' }) as { id: string };
  const navigate = useNavigate();

  const { data: albums = [], isLoading, error } = useQuery({
    queryKey: ['albums', id],
    queryFn: () => getAlbums(id, 0, 50), // Fetch first 50 albums for the artist
  });

  if (error) {
    return <div className="container mx-auto p-4">Error loading albums: {error.message}</div>;
  }

  // Sort albums alphabetically by name
  const sortedAlbums = [...albums].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Albums</h1>
      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedAlbums.map((album) => (
            <div
              key={album.id}
              className="block border rounded p-2 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate({ to: '/library/artists/id/albums/albumId', params: { id, albumId: album.id } })}
            >
              <img
                src={album.artwork || '/placeholder-album.jpg'}
                alt={album.name}
                className="w-full h-48 object-cover rounded mb-2"
                loading="lazy"
              />
              <div className="font-semibold line-clamp-1">{album.name}</div>
              {album.year && <div className="text-sm text-gray-600">{album.year}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}