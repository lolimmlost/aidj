import { createFileRoute, useParams, redirect, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSongs, getAlbumDetail, getArtistDetail } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2, Play, Plus, ListPlus, Disc, Radio } from 'lucide-react';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { PageLayout } from '@/components/ui/page-layout';
import { StartRadioButton } from '@/components/radio/StartRadioButton';

/** Album cover with Navidrome proxy fallback, then gradient placeholder */
function AlbumCoverArt({ albumId, size = 300 }: { albumId: string; size?: number }) {
  const [error, setError] = useState(false);
  const proxyUrl = `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`;

  if (error) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
        <Disc className="h-12 w-12 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <img
      src={proxyUrl}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

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
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress, startRadio } = useAudioStore();

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

  const albumName = album?.name || 'Unknown Album';
  const artistName = artist?.name || album?.artist || 'Unknown Artist';
  const backPath = `/library/artists/${artistId}`;

  if (error) {
    return (
      <PageLayout
        title="Error"
        backLink={backPath}
        backLabel={artistName}
        compact
      >
        <Card className="p-6 bg-destructive/10 border-destructive">
          <h2 className="text-xl font-bold text-destructive mb-2">
            Error loading album
          </h2>
          <p className="text-sm mb-4">{error.message}</p>
          <Button variant="outline" asChild>
            <Link to={backPath}>
              Back to Artist
            </Link>
          </Button>
        </Card>
      </PageLayout>
    );
  }

  // Sort songs by track number
  const sortedSongs = [...songs].sort((a, b) => a.track - b.track);

  const durationText = totalDuration > 0
    ? ` • ${totalHours > 0 ? `${totalHours} hr ${remainingMinutes} min` : `${totalMinutes} min`}`
    : '';

  return (
    <PageLayout
      title=""
      backLink={backPath}
      backLabel={artistName}
      compact
    >
      {/* Album Art Hero */}
      {!isLoading && album && (
        <div className="relative rounded-xl overflow-hidden border bg-card">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
            <div className="flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 rounded-lg overflow-hidden shadow-lg bg-muted mx-auto sm:mx-0">
              <AlbumCoverArt albumId={albumId} size={400} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-end text-center sm:text-left">
              <p className="text-sm text-muted-foreground mb-1">Album</p>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1">{albumName}</h2>
              <p className="text-sm text-muted-foreground">
                {artistName}{album?.year ? ` • ${album.year}` : ''} • {songs.length} {songs.length === 1 ? 'song' : 'songs'}{durationText}
              </p>
              {album?.genre && (
                <p className="text-xs text-muted-foreground mt-1">{album.genre}</p>
              )}
              <div className="mt-3 flex justify-center sm:justify-start">
                <StartRadioButton
                  seed={{ kind: 'album', albumId }}
                  label="Start Radio"
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
          {sortedSongs.map((song, index) => (
            <div
              key={song.id}
              className="flex items-center p-3 sm:p-4 border rounded hover:bg-accent transition-colors min-h-[44px] gap-3"
            >
              <div className="w-6 text-right text-sm text-muted-foreground flex-shrink-0">
                {song.track || index + 1}
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
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void startRadio({ kind: 'song', songId: song.id });
                      }}
                      className="min-h-[44px]"
                    >
                      <Radio className="mr-2 h-4 w-4" />
                      Start Radio from Song
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
    </PageLayout>
  );
}
