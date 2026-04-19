import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { search, getArtists } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NavidromeErrorBoundary } from '@/components/navidrome-error-boundary';
import { Search as SearchIcon, Plus, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';
import { AddToQueueButton } from '@/components/playlists/AddToQueueButton';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { ArtistCard } from '@/components/library/ArtistsList';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useArtistMetadata, useAddArtistToLibrary } from '@/lib/hooks/useArtistMetadata';
import { PageLayout } from '@/components/ui/page-layout';
import { toast } from '@/lib/toast';

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

  const { data: songs = [], isLoading: isLoadingSongs, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0,
  });

  // Reuse the cached full artist list from the browse page (shared query key).
  // First visit costs one fetch; subsequent searches filter client-side for
  // instant results and give us albumCount for free (missing from search3.view).
  const { data: allArtists = [], isLoading: isLoadingAllArtists } = useQuery({
    queryKey: ['artists'],
    queryFn: () => getArtists(0, 5000),
    enabled: query.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allArtistImages = {} } = useQuery({
    queryKey: ['all-artist-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/all-artist-images');
      if (!res.ok) return {};
      const json = await res.json() as { data?: { images?: Record<string, string> } };
      return json.data?.images ?? {};
    },
    enabled: query.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const matchedArtists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allArtists
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [allArtists, query]);

  const isLoading = isLoadingSongs || (isLoadingAllArtists && allArtists.length === 0);

  // Fetch feedback for displayed songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Input change:', e.target.value);
    setQuery(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    setAIUserActionInProgress(true);
    playSong(songId, [song]);
    setTimeout(() => setAIUserActionInProgress(false), 1000);
  };

  return (
    <NavidromeErrorBoundary>
      <PageLayout
        title="Search Library"
        icon={<SearchIcon className="h-5 w-5" />}
        backLink="/dashboard"
        backLabel="Dashboard"
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
                  {isLoading
                    ? 'Searching...'
                    : `Found ${matchedArtists.length} artist${matchedArtists.length !== 1 ? 's' : ''} and ${songs.length} song${songs.length !== 1 ? 's' : ''}`}
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
        ) : songs.length === 0 && matchedArtists.length === 0 ? (
          <ArtistAddFallback query={query.trim()} />
        ) : (
          <div aria-live="polite" className="space-y-6">
            {matchedArtists.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between px-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Artists in library
                    </h2>
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      • Available
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{matchedArtists.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {matchedArtists.map((artist) => (
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      savedImageUrl={allArtistImages[artist.name.toLowerCase()]}
                    />
                  ))}
                </div>
              </section>
            )}

            {songs.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Songs
                  </h2>
                  <span className="text-xs text-muted-foreground">{songs.length}</span>
                </div>
                <div className="space-y-2">
            {songs.map((song) => (
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
                  <div className="sm:hidden space-y-1.5">
                    {/* Row 1: Track number, song info (tappable) */}
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleSongClick(song.id)}
                    >
                      <div className="w-6 text-right text-xs text-muted-foreground flex-shrink-0">
                        {song.track}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{song.name || song.title || 'Unknown Song'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {song.artist || 'Unknown Artist'}
                          {' • '}{Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: All action buttons together */}
                    <div className="flex items-center gap-1 pl-8">
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
            ))}
                </div>
              </section>
            )}
          </div>
        )}
      </PageLayout>
    </NavidromeErrorBoundary>
  );
}

// When Navidrome returns no results, try Aurral to resolve the query to a
// MusicBrainz artist and offer a one-click "Add to Lidarr" fallback. If Aurral
// can't resolve it either, fall back to a clear "not available" state.
function ArtistAddFallback({ query }: { query: string }) {
  const { data: metadata, isLoading, isError } = useArtistMetadata(query, {
    enabled: query.length > 0,
  });
  const addArtist = useAddArtistToLibrary();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Searching MusicBrainz for "{query}"…
          </p>
        </CardContent>
      </Card>
    );
  }

  // Distinguish "MusicBrainz has no match" from "Aurral service unreachable".
  // The metadata endpoint returns null for both, but isError flags fetch/timeout failures.
  if (isError) {
    return (
      <Card>
        <CardContent className="p-8 sm:p-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive opacity-70" />
          <h3 className="font-semibold text-lg">MusicBrainz lookup unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Couldn't reach the metadata service. "{query}" isn't in your library, and we
            can't offer to add it right now.
          </p>
          <p className="text-xs text-muted-foreground">Try again in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  if (!metadata || !metadata.mbid) {
    return (
      <Card>
        <CardContent className="p-8 sm:p-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
          <h3 className="font-semibold text-lg">No results for "{query}"</h3>
          <p className="text-sm text-muted-foreground">
            Not in your library, and MusicBrainz couldn't match this artist either.
          </p>
          <p className="text-xs text-muted-foreground">
            Try different keywords, check spelling, or search by the artist's official name.
          </p>
        </CardContent>
      </Card>
    );
  }

  const alreadyMonitored = metadata.lidarrMonitored;
  const topGenres = metadata.genres.slice(0, 3);
  const formedLabel = metadata.formedYear ? `formed ${metadata.formedYear}` : null;
  const countryLabel = metadata.country ?? null;
  const details = [countryLabel, formedLabel].filter(Boolean).join(' • ');

  const handleAdd = () => {
    if (!metadata.mbid) return;
    addArtist.mutate(
      { mbid: metadata.mbid, artistName: metadata.artistName },
      {
        onSuccess: () => {
          toast.success(`${metadata.artistName} queued for download via Lidarr`);
        },
        onError: (err) => {
          toast.error(`Failed to add artist: ${err.message}`);
        },
      },
    );
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">
            Not in your library. Found on MusicBrainz:
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          {metadata.coverImageUrl ? (
            <img
              src={metadata.coverImageUrl}
              alt={metadata.artistName}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover flex-shrink-0 border"
              loading="lazy"
            />
          ) : (
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <SearchIcon className="h-10 w-10 text-muted-foreground opacity-50" />
            </div>
          )}

          <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
            <h3 className="font-semibold text-xl truncate">{metadata.artistName}</h3>
            {metadata.disambiguation && (
              <p className="text-sm text-muted-foreground truncate">{metadata.disambiguation}</p>
            )}
            {details && (
              <p className="text-xs text-muted-foreground">{details}</p>
            )}
            {topGenres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1">
                {topGenres.map((genre) => (
                  <span
                    key={genre}
                    className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-1 border-t">
          {alreadyMonitored ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Already monitored in Lidarr — songs will appear as they download.</span>
            </div>
          ) : addArtist.isSuccess ? (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 py-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Queued for download. Lidarr will notify when it finishes.</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1 text-center sm:text-left">
                Add to Lidarr to monitor this artist and auto-download new releases.
              </p>
              <Button
                onClick={handleAdd}
                disabled={addArtist.isPending}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {addArtist.isPending ? (
                  <>
                    <Download className="h-4 w-4 mr-2 animate-pulse" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Lidarr
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
