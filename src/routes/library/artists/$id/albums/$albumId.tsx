import { createFileRoute, useParams, redirect, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getSongs, getAlbumDetail, getArtistDetail } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2, Play, Plus, ListPlus, ArrowLeft, Disc } from 'lucide-react';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumb, breadcrumbItems } from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export const Route = createFileRoute('/library/artists/$id/albums/$albumId')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: AlbumSongs,
});

function AlbumSongs() {
  const { id: artistId, albumId } = useParams({ from: '/library/artists/$id/albums/$albumId' }) as { id: string; albumId: string };
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress } = useAudioStore();

  // Fetch album details
  const {
    data: album,
    isLoading: loadingAlbum,
    error: albumError,
  } = useQuery({
    queryKey: ['albumDetail', albumId],
    queryFn: () => getAlbumDetail(albumId),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch artist details for breadcrumb
  const {
    data: artist,
    isLoading: loadingArtist,
  } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => getArtistDetail(artistId),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch songs for this album
  const {
    data: songs = [],
    isLoading: loadingSongs,
    error: songsError,
  } = useQuery({
    queryKey: ['songs', albumId],
    queryFn: () => getSongs(albumId, 0, 100),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch feedback for all songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);
  const feedback = feedbackData?.feedback || {};

  const error = albumError || songsError;
  const isLoading = loadingAlbum || loadingArtist || loadingSongs;

  // Build breadcrumb items
  const breadcrumbPath = [
    breadcrumbItems.dashboard,
    breadcrumbItems.artists,
    {
      label: artist?.name || 'Artist',
      href: `/library/artists/${artistId}`,
    },
    {
      label: album?.name || 'Loading...',
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

  // Calculate total duration
  const totalDuration = songs.reduce((acc, song) => acc + song.duration, 0);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

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
            Error loading album
          </h2>
          <p className="text-sm mb-4">{error.message}</p>
          <Button variant="outline" asChild>
            <Link to={`/library/artists/${artistId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Artist
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  // Sort songs by track number
  const sortedSongs = [...songs].sort((a, b) => a.track - b.track);

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbPath} />

      {/* Header Card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Album Info */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                {album?.artwork ? (
                  <img
                    src={album.artwork}
                    alt={`Album cover for ${album.name}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                )}
              </div>
              <div>
                {loadingAlbum ? (
                  <>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                      {album?.name || 'Unknown Album'}
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1">
                      {artist?.name || album?.artist || 'Unknown Artist'}
                      {album?.year ? ` • ${album.year}` : ''}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                      {totalDuration > 0 && (
                        <>
                          {' '}&bull;{' '}
                          {totalHours > 0 ? `${totalHours} hr ${remainingMinutes} min` : `${totalMinutes} min`}
                        </>
                      )}
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
              <Link to={`/library/artists/${artistId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Back to Artist</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Songs List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedSongs.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Disc className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No songs found in this album.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedSongs.map((song) => (
            <div
              key={song.id}
              className="flex items-center p-3 sm:p-4 border rounded hover:bg-accent transition-colors min-h-[44px]"
            >
              <div className="w-6 sm:w-8 text-right mr-3 sm:mr-4 text-sm sm:text-base text-muted-foreground flex-shrink-0">
                {song.track}
              </div>
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
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="text-center pt-4 border-t">
        <Button variant="ghost" asChild className="min-h-[44px]">
          <Link to={`/library/artists/${artistId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back to Artist
          </Link>
        </Button>
      </div>
    </div>
  );
}
