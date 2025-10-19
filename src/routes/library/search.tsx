import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { search } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NavidromeErrorBoundary } from '@/components/navidrome-error-boundary';
import { Search as SearchIcon } from 'lucide-react';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';

export const Route = createFileRoute('/library/search')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: SearchPage,
});

function SearchPage() {
  const [query, setQuery] = useState('');
  const { playSong } = useAudioStore();

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Input change:', e.target.value);
    setQuery(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    playSong(songId, songs);
  };

  return (
    <NavidromeErrorBoundary>
      <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <SearchIcon className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Search Music Library</h1>
          </div>
          <Link to="/dashboard" className="text-primary hover:underline text-sm min-h-[44px] flex items-center">
            ← Dashboard
          </Link>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-2">
              <label htmlFor="search-input" className="text-sm font-medium">
                Search for songs, artists, or albums
              </label>
              <Input
                id="search-input"
                type="text"
                placeholder="Type to search..."
                value={query}
                onChange={handleInputChange}
                className="min-h-[44px]"
                aria-label="Search library"
              />
              {query.trim().length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {isLoading ? 'Searching...' : `Found ${songs.length} result${songs.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-6 text-center">
              <p className="text-destructive font-medium">Error searching: {error.message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            {[...Array(8)].map((_, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-8" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/4" />
                    </div>
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : query.trim().length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <SearchIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                Enter a search term above to find songs in your library.
              </p>
            </CardContent>
          </Card>
        ) : songs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="font-semibold text-lg mb-2">No results found for "{query}"</h3>
              <p className="text-sm text-muted-foreground">Try different keywords or check your spelling.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" aria-live="polite">
            {songs.map((song) => (
              <Card
                key={song.id}
                className="transition-all hover:shadow-md hover:border-primary/50"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 text-right text-sm text-muted-foreground">
                      {song.track}
                    </div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleSongClick(song.id)}
                    >
                      <div className="font-semibold truncate">{song.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {song.artist} • {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AddToPlaylistButton
                        songId={song.id}
                        artistName={song.artist || 'Unknown Artist'}
                        songTitle={song.name || song.title || 'Unknown Song'}
                      />
                      <div
                        className="text-muted-foreground cursor-pointer p-2 hover:text-primary"
                        onClick={() => handleSongClick(song.id)}
                      >
                        ▶
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </NavidromeErrorBoundary>
  );
}