import { createFileRoute, Link, useParams, useNavigate, redirect, Outlet, useMatch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAlbums, getArtistDetail, getSongsByArtist } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2, Music, Disc, ListMusic, Play, Plus, ListPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { PageLayout } from '@/components/ui/page-layout';
import { useArtistMetadata } from '@/lib/hooks/useArtistMetadata';
import { ArtistMetadataHero } from '@/components/library/ArtistMetadataHero';

/** Album cover with Navidrome getCoverArt proxy fallback, then placeholder */
function AlbumCoverArt({ albumId, artwork, name }: { albumId: string; artwork?: string; name: string }) {
  const [error, setError] = useState(false);
  const [proxyError, setProxyError] = useState(false);
  const proxyUrl = `/api/navidrome/rest/getCoverArt?id=${albumId}&size=300`;

  // Both sources failed — show placeholder
  if ((error && !artwork && proxyError) || (error && artwork && proxyError)) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex flex-col items-center justify-center gap-1.5">
        <Disc className="h-8 w-8 text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground/50 font-medium px-2 text-center line-clamp-2">
          {name}
        </span>
      </div>
    );
  }

  // Try artwork first, then proxy
  const src = error || !artwork ? proxyUrl : artwork;

  return (
    <img
      src={src}
      alt={`Album cover for ${name}`}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => {
        if (!error && artwork) {
          setError(true);
        } else {
          setProxyError(true);
        }
      }}
    />
  );
}

export const Route = createFileRoute('/library/artists/$id')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: ArtistDetail,
});

function ArtistDetail() {
  const { id } = useParams({ from: '/library/artists/$id' }) as { id: string };
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'albums' | 'songs'>('all');

  // Check if a child route (album detail) is active
  const isChildRoute = (() => {
    try {
      useMatch({ from: '/library/artists/$id/albums/$albumId' });
      return true;
    } catch {
      return false;
    }
  })();

  // If a child route is active, just render the Outlet
  if (isChildRoute) {
    return <Outlet />;
  }
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress } = useAudioStore();

  // Fetch artist details for the header
  const {
    data: artist,
    isLoading: loadingArtist,
    error: artistError,
  } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtistDetail(id),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch albums for this artist
  const {
    data: albums = [],
    isLoading: loadingAlbums,
    error: albumsError,
  } = useQuery({
    queryKey: ['albums', id],
    queryFn: () => getAlbums(id, 0, 50),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch songs for this artist
  const {
    data: songs = [],
    isLoading: loadingSongs,
    error: songsError,
  } = useQuery({
    queryKey: ['artistSongs', id],
    queryFn: () => getSongsByArtist(id, 0, 100),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch enriched metadata from Aurral (server-cached)
  const { data: artistMetadata, isLoading: loadingMetadata } = useArtistMetadata(artist?.name, {
    navidromeId: id,
    enabled: !!artist?.name,
  });

  // Fetch feedback for all songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);
  const feedback = feedbackData?.feedback || {};

  const error = artistError || albumsError || songsError;
  const isLoading = loadingArtist || loadingAlbums || loadingSongs;

  const handleSongClick = (songId: string) => {
    playSong(songId, songs);
  };

  const handleAddToQueue = (song: typeof songs[0], position: 'now' | 'next' | 'end') => {
    const songName = song.name || song.title || 'Unknown';
    const audioSong = {
      id: song.id,
      name: songName,
      title: songName,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      url: `/api/navidrome/stream/${song.id}`,
      duration: song.duration,
      track: song.track,
    };

    if (position === 'now') {
      playSong(song.id, songs);
      setIsPlaying(true);
      toast.success(`Now playing "${songName}"`);
    } else if (position === 'next') {
      setAIUserActionInProgress(true);
      addToQueueNext([audioSong]);
      toast.success(`Added "${songName}" to play next`);
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    } else {
      setAIUserActionInProgress(true);
      addToQueueEnd([audioSong]);
      toast.success(`Added "${songName}" to end of queue`);
      setTimeout(() => setAIUserActionInProgress(false), 2000);
    }
  };

  if (error) {
    return (
      <PageLayout
        title="Error"
        backLink="/library/artists"
        backLabel="Artists"
        compact
      >
        <Card className="p-6 bg-destructive/10 border-destructive">
          <h2 className="text-xl font-bold text-destructive mb-2">
            Error loading artist
          </h2>
          <p className="text-sm mb-4">{error.message}</p>
          <Button variant="outline" asChild>
            <Link to="/library/artists">
              Back to Artists
            </Link>
          </Button>
        </Card>
      </PageLayout>
    );
  }

  const sortedAlbums = [...albums].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedSongs = [...songs].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));

  const artistName = artist?.name || 'Unknown Artist';

  const renderAlbumCard = (album: typeof albums[0]) => (
    <Card
      key={album.id}
      className="cursor-pointer transition-shadow hover:shadow-md border-border/50 overflow-hidden"
    >
      <CardContent className="p-0">
        <div
          className="block p-3 sm:p-4 hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
          onClick={() =>
            navigate({
              to: '/library/artists/$id/albums/$albumId',
              params: { id, albumId: album.id },
            })
          }
          role="button"
          tabIndex={0}
          aria-label={`View album: ${album.name}${album.year ? ` (${album.year})` : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate({
                to: '/library/artists/$id/albums/$albumId',
                params: { id, albumId: album.id },
              });
            }
          }}
        >
          <div className="aspect-square w-full rounded-lg mb-2 sm:mb-3 overflow-hidden bg-muted flex items-center justify-center">
            <AlbumCoverArt albumId={album.id} artwork={album.artwork} name={album.name} />
          </div>
          <div className="space-y-1">
            <div className="font-semibold line-clamp-2 text-xs sm:text-sm text-foreground">
              {album.name}
            </div>
            {album.year ? (
              <div className="text-xs text-muted-foreground">
                {album.year}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderSongRow = (song: typeof songs[0]) => (
    <div
      key={song.id}
      className="flex items-center p-3 sm:p-4 border rounded hover:bg-accent transition-colors min-h-[44px]"
    >
      <div
        className="flex-1 min-w-0 cursor-pointer hover:text-accent-foreground"
        onClick={() => handleSongClick(song.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSongClick(song.id);
          }
        }}
      >
        <div className="font-medium truncate text-sm sm:text-base">{song.name || song.title || 'Unknown'}</div>
        <div className="text-xs sm:text-sm text-muted-foreground">
          {song.album && <span>{song.album} • </span>}
          {Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
        </div>
      </div>
      <div className="ml-2 flex items-center gap-2 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="h-9 w-9 p-0 bg-green-600 hover:bg-green-700 text-white shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <ListPlus className="h-4 w-4" />
              <span className="sr-only">Add to queue</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleAddToQueue(song, 'now');
              }}
              className="min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play Now
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleAddToQueue(song, 'next');
              }}
              className="min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play Next
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleAddToQueue(song, 'end');
              }}
              className="min-h-[44px]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add to End
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SongFeedbackButtons
          songId={song.id}
          artistName={song.artist || 'Unknown Artist'}
          songTitle={song.name || song.title || 'Unknown'}
          currentFeedback={feedback[song.id] || null}
          source="library"
          size="sm"
        />
      </div>
    </div>
  );

  return (
    <PageLayout
      title={artistName}
      description={`${albums.length} ${albums.length === 1 ? 'album' : 'albums'} \u2022 ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`}
      backLink="/library/artists"
      backLabel="Artists"
      compact
    >
      {/* Enriched Artist Metadata */}
      {loadingMetadata && (
        <div className="rounded-xl border bg-card overflow-hidden animate-pulse">
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-4 w-14 rounded bg-muted" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-5 w-12 rounded-full bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
                <div className="h-5 w-10 rounded-full bg-muted" />
                <div className="h-5 w-14 rounded-full bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-4/5 rounded bg-muted" />
                <div className="h-3 w-3/5 rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      )}
      {artistMetadata && (
        <ArtistMetadataHero
          metadata={artistMetadata}
          artistImageUrl={`/api/navidrome/rest/getCoverArt?id=${id}&size=300`}
        />
      )}

      {/* Tabs for Albums/Songs */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'albums' | 'songs')}>
          <TabsList className="grid w-full grid-cols-3 mb-4 h-auto">
            <TabsTrigger value="all" className="py-2.5 text-xs sm:text-sm">
              All
            </TabsTrigger>
            <TabsTrigger value="albums" className="py-2.5 text-xs sm:text-sm">
              <Disc className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Albums ({albums.length})</span>
              <span className="sm:hidden ml-1">{albums.length}</span>
            </TabsTrigger>
            <TabsTrigger value="songs" className="py-2.5 text-xs sm:text-sm">
              <ListMusic className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Songs ({songs.length})</span>
              <span className="sm:hidden ml-1">{songs.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* All Content */}
          <TabsContent value="all" className="space-y-6">
            {/* Albums Section */}
            {sortedAlbums.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Disc className="h-5 w-5" />
                  Albums
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {sortedAlbums.map(renderAlbumCard)}
                </div>
              </div>
            )}

            {/* Songs Section */}
            {sortedSongs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <ListMusic className="h-5 w-5" />
                  Songs
                </h2>
                <div className="space-y-2">
                  {sortedSongs.slice(0, 20).map(renderSongRow)}
                  {sortedSongs.length > 20 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => setActiveTab('songs')}
                    >
                      View all {songs.length} songs
                    </Button>
                  )}
                </div>
              </div>
            )}

            {sortedAlbums.length === 0 && sortedSongs.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No albums or songs found for this artist.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Albums Tab */}
          <TabsContent value="albums">
            {sortedAlbums.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Disc className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No albums found.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {sortedAlbums.map(renderAlbumCard)}
              </div>
            )}
          </TabsContent>

          {/* Songs Tab */}
          <TabsContent value="songs">
            {sortedSongs.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <ListMusic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No songs found.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {sortedSongs.map(renderSongRow)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </PageLayout>
  );
}
