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
import { Link } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';

export function ArtistsList() {
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
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Artists</h1>
            </div>
            <Link to="/dashboard" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
              ← Dashboard
            </Link>
          </div>

          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="mb-4 min-h-[44px] w-full sm:w-auto"
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger className="min-h-[44px]">
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
                <Button variant="outline" onClick={handleClearFilters} className="min-h-[44px]">
                  Clear Filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-busy="true" aria-live="polite">
          {[...Array(12)].map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full" />
                  <Skeleton className="h-5 w-32 sm:w-40" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {sortedArtists.map((artist) => (
            <Card key={artist.id} className="cursor-pointer transition-shadow hover:shadow-md border-border/50">
              <CardContent className="p-4 sm:p-6 hover:bg-accent hover:text-accent-foreground">
                <Link
                  to="/library/artists/id"
                  params={{id: artist.id}}
                  className="flex items-center gap-3 h-full min-h-[44px]"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm sm:text-base">{artist.name}</div>
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