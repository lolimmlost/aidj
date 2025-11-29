import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Users, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@tanstack/react-router';
import { PageLayout, PageSection, EmptyState, LoadingGrid } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';

export function ArtistsList() {
  const [genre, setGenre] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: artists = [], isLoading, error } = useQuery({
    queryKey: ['artists', genre],
    queryFn: () => getArtists(0, 50),
  });

  if (error) {
    return (
      <PageLayout
        title="Artists"
        icon={<Users className="h-5 w-5" />}
        backLink="/dashboard"
        backLabel="Dashboard"
      >
        <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          Error loading artists: {error.message}
        </div>
      </PageLayout>
    );
  }

  // Filter and sort
  let filteredArtists = artists;
  if (genre !== 'all') {
    filteredArtists = artists.filter(a => a.name.toLowerCase().includes(genre.toLowerCase()));
  }
  const sortedArtists = [...filteredArtists].sort((a, b) => a.name.localeCompare(b.name));

  const handleClearFilters = () => {
    setGenre('all');
  };

  return (
    <PageLayout
      title="Artists"
      description={`${sortedArtists.length} artists in your library`}
      icon={<Users className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="min-h-[44px] gap-2"
        >
          {showFilters ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
          {showFilters ? 'Hide Filters' : 'Filters'}
        </Button>
      }
    >
      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 sm:p-5 rounded-xl bg-muted/50 border border-border space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 max-w-xs">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Filter by name
              </label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Filter by genre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Artists</SelectItem>
                  <SelectItem value="rock">Rock</SelectItem>
                  <SelectItem value="pop">Pop</SelectItem>
                  <SelectItem value="jazz">Jazz</SelectItem>
                  <SelectItem value="classical">Classical</SelectItem>
                  <SelectItem value="hip hop">Hip Hop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {genre !== 'all' && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={handleClearFilters}
                  className="min-h-[44px] text-muted-foreground hover:text-foreground"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Artists Grid */}
      <PageSection>
        {isLoading ? (
          <LoadingGrid count={12} />
        ) : sortedArtists.length === 0 ? (
          <EmptyState
            title="No artists found"
            description="Try adjusting your filters or check your library configuration."
            icon={<Users className="h-6 w-6" />}
            action={
              genre !== 'all' && (
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {sortedArtists.map((artist) => (
              <Link
                key={artist.id}
                to="/library/artists/$id"
                params={{ id: artist.id }}
                className="group"
              >
                <div className={cn(
                  'flex items-center gap-4 p-4 sm:p-5 rounded-xl border transition-all duration-200',
                  'bg-card border-border hover:border-primary/30',
                  'hover:shadow-md hover:-translate-y-0.5'
                )}>
                  {/* Artist Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                    <span className="text-lg font-semibold text-primary">
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Artist Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {artist.name}
                    </h3>
                    {artist.albumCount && (
                      <p className="text-sm text-muted-foreground">
                        {artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                  >
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageSection>
    </PageLayout>
  );
}
