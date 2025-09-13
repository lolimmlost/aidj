import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

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
    <div className="container mx-auto p-6 space-y-6">
      <Card className="fade-in">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-3xl font-bold tracking-tight">Artists</h1>
            </div>
            <Link to="/dashboard" className="text-primary hover:underline text-sm">
              ← Dashboard
            </Link>
          </div>
          
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="mb-4">
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
          
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    <SelectItem value="rock">Rock</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="jazz">Jazz</SelectItem>
                    <SelectItem value="classical">Classical</SelectItem>
                    <SelectItem value="hip hop">Hip Hop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={handleClearFilters}>Clear Filters</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 fade-in">
          {sortedArtists.map((artist) => (
            <Card key={artist.id} className="cursor-pointer transition-shadow hover:shadow-md border-border/50">
              <CardContent className="p-6 hover:bg-accent hover:text-accent-foreground">
                <Link
                  to="/library/artists/id"
                  params={{id: artist.id}}
                  className="flex items-center gap-3 h-full"
                >
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{artist.name}</div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {sortedArtists.length === 0 && !isLoading && (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">No artists found.</p>
            <p className="text-sm mt-2 text-muted-foreground">Try adjusting your filters or check your library configuration.</p>
          </CardContent>
        </Card>
      )}

      <div className="text-center pt-4 border-t">
        <Link to="/dashboard" className="text-primary hover:underline">← Back to Dashboard</Link>
      </div>
    </div>
  );
}