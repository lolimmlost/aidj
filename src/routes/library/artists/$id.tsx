import { createFileRoute, Link, useParams, useNavigate, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAlbums, getArtistDetail, getSongsByArtist } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2, Music, ArrowLeft, Disc, ListMusic, Play, Plus, ListPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Breadcrumb, breadcrumbItems } from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';

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

  // Fetch feedback for all songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);
  const feedback = feedbackData?.feedback || {};

  const error = artistError || albumsError || songsError;
  const isLoading = loadingArtist || loadingAlbums || loadingSongs;

  // Build breadcrumb items
  const breadcrumbPath = [
    breadcrumbItems.dashboard,
    breadcrumbItems.artists,
    {
      label: artist?.name || 'Loading...',
    },
  ];

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
      <div className="container mx-auto p-3 sm:p-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            breadcrumbItems.dashboard,
            breadcrumbItems.artists,
            { label: 'Error' },
          ]}
          className="mb-4"
        />

        <Card className="p-6 bg-destructive/10 border-destructive">
          <h2 className="text-xl font-bold text-destructive mb-2">
            Error loading artist
          </h2>
          <p className="text-sm mb-4">{error.message}</p>
          <Button variant="outline" asChild>
            <Link to="/library/artists">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Artists
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const sortedAlbums = [...albums].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedSongs = [...songs].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));

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
            {album.artwork ? (
              <img
                src={album.artwork}
                alt={`Album cover for ${album.name}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Disc className="h-12 w-12 text-muted-foreground" />
            )}
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
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbPath} />

      {/* Header Card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Artist Info */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <Music className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <div>
                {loadingArtist ? (
                  <>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                      {artist?.name || 'Unknown Artist'}
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1">
                      {albums.length} {albums.length === 1 ? 'album' : 'albums'}
                      {' '}&bull;{' '}
                      {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Back Button */}
            <Button
              variant="outline"
              asChild
              className="min-h-[44px]"
            >
              <Link to="/library/artists">
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Back to Artists</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Bottom Navigation */}
      <div className="text-center pt-4 border-t">
        <Button variant="ghost" asChild className="min-h-[44px]">
          <Link to="/library/artists">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back to Artists
          </Link>
        </Button>
      </div>
    </div>
  );
}
