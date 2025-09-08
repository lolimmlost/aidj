import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const Route = createFileRoute('/library/artists')({
  loader: async () => {
    return {};
  },
  component: ArtistsList,
});

function ArtistsList() {
  const [genre, setGenre] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: artists = [], isLoading, error } = useQuery({
    queryKey: ['artists', genre],
    queryFn: () => getArtists(0, 50),
  });

  if (error) {
    return <div>Error loading artists: {error.message}</div>;
  }

  // Sort alphabetically
  let filteredArtists = artists;
  if (genre !== 'all') {
    filteredArtists = artists.filter(a => a.name.toLowerCase().includes(genre.toLowerCase()));
  }
  const sortedArtists = [...filteredArtists].sort((a, b) => a.name.localeCompare(b.name));

  const handleClearFilters = () => {
    setGenre('all');
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <Button onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger>
                <SelectValue placeholder="Genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="rock">Rock</SelectItem>
                <SelectItem value="pop">Pop</SelectItem>
                <SelectItem value="jazz">Jazz</SelectItem>
                <SelectItem value="classical">Classical</SelectItem>
                <SelectItem value="hip hop">Hip Hop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* No year filter as artist data doesn't include year */}
          <div className="flex items-end gap-2">
            <Button onClick={handleClearFilters}>Clear</Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedArtists.map((artist) => (
            <div key={artist.id} className="border rounded p-4">
              <Link
                to="/library/artists/id"
                params={{id: artist.id}}
                className="font-semibold cursor-pointer text-blue-600 hover:underline"
              >
                {artist.name}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}