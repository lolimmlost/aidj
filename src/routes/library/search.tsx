import { createFileRoute, redirect } from '@tanstack/react-router';
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
import { AddToQueueButton } from '@/components/playlists/AddToQueueButton';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { VirtualizedList } from '@/components/ui/virtualized-list';
import { PageLayout } from '@/components/ui/page-layout';

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
  const { playSong, setAIUserActionInProgress } = useAudioStore();

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0,
  });

  // Fetch feedback for displayed songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Input change:', e.target.value);
    setQuery(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    setAIUserActionInProgress(true);
    playSong(songId, songs);
    setTimeout(() => setAIUserActionInProgress(false), 1000);
  };

  return (
    <NavidromeErrorBoundary>
      <PageLayout
        title="Search Library"
        icon={<SearchIcon className="h-5 w-5" />}
        backLink="/library"
        backLabel="Library"
        compact
      >
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
          <div aria-live="polite">
            {/* Virtualized search results for performance with large result sets */}
            <VirtualizedList
              items={songs}
              itemHeight={120} // Approximate height for mobile (2 rows)
              containerHeight={Math.min(600, window.innerHeight - 300)}
              getItemKey={(song) => song.id}
              gap={8}
              overscan={3}
              className="rounded-lg"
              renderItem={(song) => (
                <Card
                  key={song.id}
                  className="transition-all hover:shadow-md hover:border-primary/50"
                >
                  <CardContent className="p-3 sm:p-4">
                    {/* Desktop layout: single row */}
                    <div className="hidden sm:flex items-center gap-3">
                      <div className="w-8 text-right text-sm text-muted-foreground flex-shrink-0">
                        {song.track}
                      </div>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleSongClick(song.id)}
                      >
                        <div className="font-semibold truncate">{song.name || song.title || 'Unknown Song'}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {song.artist || 'Unknown Artist'}
                          {song.album && ` • ${song.album}`}
                          {' • '}{Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <SongFeedbackButtons
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                          currentFeedback={feedbackData?.feedback[song.id] || null}
                          source="search"
                        />
                        <AddToPlaylistButton
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                        />
                        <AddToQueueButton
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                        />
                        <div
                          className="text-muted-foreground cursor-pointer p-2 hover:text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
                          onClick={() => handleSongClick(song.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSongClick(song.id);
                            }
                          }}
                          aria-label={`Play ${song.name || song.title || 'song'}`}
                        >
                          ▶
                        </div>
                      </div>
                    </div>

                    {/* Mobile layout: two rows for better button visibility */}
                    <div className="sm:hidden space-y-2">
                      {/* Row 1: Track number, song info, play button */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 text-right text-xs text-muted-foreground flex-shrink-0">
                          {song.track}
                        </div>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleSongClick(song.id)}
                        >
                          <div className="font-semibold text-sm truncate">{song.name || song.title || 'Unknown Song'}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {song.artist || 'Unknown Artist'}
                            {' • '}{Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                          </div>
                        </div>
                        <div
                          className="text-muted-foreground cursor-pointer p-2 hover:text-primary min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                          onClick={() => handleSongClick(song.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSongClick(song.id);
                            }
                          }}
                          aria-label={`Play ${song.name || song.title || 'song'}`}
                        >
                          ▶
                        </div>
                      </div>

                      {/* Row 2: Action buttons - centered and always visible */}
                      <div className="flex items-center justify-center gap-1 pl-8">
                        <SongFeedbackButtons
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                          currentFeedback={feedbackData?.feedback[song.id] || null}
                          source="search"
                        />
                        <AddToPlaylistButton
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                        />
                        <AddToQueueButton
                          songId={song.id}
                          artistName={song.artist || 'Unknown Artist'}
                          songTitle={song.name || song.title || 'Unknown Song'}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          </div>
        )}
      </PageLayout>
    </NavidromeErrorBoundary>
  );
}
