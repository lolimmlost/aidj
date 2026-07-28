import { createFileRoute, useParams, redirect, Link, useRouter, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSongs, getAlbumDetail, getArtistDetail } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Play, Plus, ListPlus, Disc, Radio, ChevronLeft, Clock, Shuffle } from 'lucide-react';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { StartRadioButton } from '@/components/radio/StartRadioButton';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';

export const Route = createFileRoute('/library/artists/$id/albums/$albumId')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: AlbumDetail,
});

function AlbumDetail() {
  const { id: artistId, albumId } = useParams({ from: '/library/artists/$id/albums/$albumId' }) as { id: string; albumId: string };
  const router = useRouter();
  const navigate = useNavigate();
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress, startRadio } = useAudioStore();
  const [coverError, setCoverError] = useState(false);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);

  const coverUrl = `/api/navidrome/rest/getCoverArt?id=${albumId}&size=600`;

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

  const {
    data: artist,
    isLoading: loadingArtist,
  } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => getArtistDetail(artistId),
    retry: 1,
    refetchOnWindowFocus: false,
  });

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

  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);
  const feedback = feedbackData?.feedback || {};

  const error = albumError || songsError;
  const isLoading = loadingAlbum || loadingArtist || loadingSongs;

  const sortedSongs = [...songs].sort((a, b) => {
    const discA = typeof a.discNumber === 'string' ? parseInt(a.discNumber) || 1 : (a.discNumber ?? 1);
    const discB = typeof b.discNumber === 'string' ? parseInt(b.discNumber) || 1 : (b.discNumber ?? 1);
    if (discA !== discB) return discA - discB;
    return a.track - b.track;
  });

  const totalDuration = songs.reduce((acc, song) => acc + song.duration, 0);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const albumName = album?.name || 'Unknown Album';
  const artistName = artist?.name || album?.artist || 'Unknown Artist';

  const durationText = totalDuration > 0
    ? totalHours > 0 ? `${totalHours} hr ${remainingMinutes} min` : `${totalMinutes} min`
    : '';

  const handlePlayAll = () => {
    if (sortedSongs.length === 0) return;
    playSong(sortedSongs[0].id, sortedSongs);
    setIsPlaying(true);
  };

  const handleShuffle = () => {
    if (sortedSongs.length === 0) return;
    const shuffled = [...sortedSongs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0].id, shuffled);
    setIsPlaying(true);
  };

  const handleSongClick = (songId: string) => {
    playSong(songId, sortedSongs);
  };

  const handleAddToQueue = (song: typeof songs[0], position: 'now' | 'next' | 'end') => {
    const songName = song.name || song.title || 'Unknown';
    const audioSong = {
      id: song.id,
      name: songName,
      title: songName,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      albumId: song.albumId,
      url: `/api/navidrome/stream/${song.id}`,
      duration: song.duration,
      track: song.track,
    };

    if (position === 'now') {
      playSong(song.id, sortedSongs);
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

  const handleGoBack = () => {
    if (router.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: '/library/artists/$id', params: { id: artistId } });
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+4rem)] md:pt-[calc(env(safe-area-inset-top)+2rem)]">
          <button onClick={handleGoBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3">
            <Disc className="h-10 w-10 mx-auto text-destructive opacity-80" />
            <h2 className="text-lg font-semibold">Error loading album</h2>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button variant="outline" size="sm" onClick={handleGoBack}>Back to Artist</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Ambient backdrop from album art */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {!coverError && (
          <div
            className="absolute inset-0 scale-150 opacity-15 blur-3xl"
            style={{ backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/90 to-background" />
      </div>

      {/* Hero section */}
      <div className="mx-auto max-w-4xl 2xl:max-w-5xl px-4 sm:px-6 lg:px-8 pt-[calc(env(safe-area-inset-top)+4rem)] md:pt-[calc(env(safe-area-inset-top)+2rem)]">
        {/* Back navigation */}
        <button
          onClick={handleGoBack}
          className="inline-flex group items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        {isLoading ? (
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-8">
            <Skeleton className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl mx-auto sm:mx-0 flex-shrink-0" />
            <div className="flex-1 space-y-3 pt-2 text-center sm:text-left">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-10 w-40 mt-4" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-8">
            {/* Album art */}
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 mx-auto sm:mx-0 flex-shrink-0">
              {coverError ? (
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                  <Disc className="h-12 w-12 text-muted-foreground/40" />
                </div>
              ) : (
                <img
                  src={coverUrl}
                  alt={`Album cover for ${albumName}`}
                  className="w-full h-full object-cover"
                  onError={() => setCoverError(true)}
                />
              )}
            </div>

            {/* Album info */}
            <div className="flex-1 min-w-0 flex flex-col justify-end text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Album</p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-2">{albumName}</h1>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground justify-center sm:justify-start flex-wrap">
                <Link
                  to="/library/artists/$id"
                  params={{ id: artistId }}
                  className="font-semibold text-foreground hover:underline"
                >
                  {artistName}
                </Link>
                {album?.year && <span>· {album.year}</span>}
                <span>· {songs.length} {songs.length === 1 ? 'song' : 'songs'}</span>
                {durationText && <span>· {durationText}</span>}
              </div>
              {album?.genres && album.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 justify-center sm:justify-start">
                  {album.genres.slice(0, 4).map((genre) => {
                    const label = typeof genre === 'string' ? genre : (genre as { name: string }).name;
                    return (
                      <span key={label} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground">
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-4 justify-center sm:justify-start">
                <Button
                  onClick={handlePlayAll}
                  disabled={songs.length === 0}
                  className="rounded-full px-6 shadow-lg"
                >
                  <Play className="h-4 w-4 mr-2 fill-current" />
                  Play
                </Button>
                <Button
                  variant="outline"
                  onClick={handleShuffle}
                  disabled={songs.length === 0}
                  className="rounded-full"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Shuffle
                </Button>
                <StartRadioButton
                  seed={{ kind: 'album', albumId }}
                  label="Radio"
                  size="default"
                  variant="ghost"
                  className="rounded-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Track list */}
        {isLoading ? (
          <div className="space-y-2 mt-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg">
                <Skeleton className="w-6 h-4" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <Disc className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No songs found</h3>
            <p className="text-sm text-muted-foreground">This album doesn't have any tracks yet.</p>
          </div>
        ) : (
          <div className="mt-2">
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[2rem_1fr_auto] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/40 mb-1">
              <span className="text-right">#</span>
              <span>Title</span>
              <span className="flex items-center gap-1 pr-24">
                <Clock className="h-3 w-3" />
              </span>
            </div>

            {sortedSongs.map((song, index) => {
              const songName = song.name || song.title || 'Unknown';
              const isHovered = hoveredTrack === song.id;

              return (
                <div
                  key={song.id}
                  className="group grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-muted/30"
                  onMouseEnter={() => setHoveredTrack(song.id)}
                  onMouseLeave={() => setHoveredTrack(null)}
                >
                  {/* Track number / play button */}
                  <div className="text-right text-sm text-muted-foreground w-6 flex-shrink-0">
                    <button
                      onClick={() => handleSongClick(song.id)}
                      className="w-6 h-6 flex items-center justify-center"
                      aria-label={`Play ${songName}`}
                    >
                      {isHovered ? (
                        <Play className="h-3.5 w-3.5 fill-current text-foreground" />
                      ) : (
                        <span className="tabular-nums">{song.track || index + 1}</span>
                      )}
                    </button>
                  </div>

                  {/* Song info */}
                  <div
                    className="min-w-0 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSongClick(song.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSongClick(song.id); } }}
                  >
                    <p className="text-sm font-medium truncate">{songName}</p>
                    {song.artist && song.artist !== artistName && (
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    )}
                  </div>

                  {/* Actions + duration */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <SongFeedbackButtons
                        songId={song.id}
                        artistName={song.artist || 'Unknown Artist'}
                        songTitle={songName}
                        currentFeedback={(feedback[song.id] as 'thumbs_up' | 'thumbs_down' | undefined) || null}
                        source="library"
                        size="sm"
                      />
                      <AddToPlaylistButton
                        songId={song.id}
                        artistName={song.artist || 'Unknown Artist'}
                        songTitle={songName}
                        size="icon"
                        className="h-8 w-8"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ListPlus className="h-4 w-4" />
                            <span className="sr-only">Add to queue</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleAddToQueue(song, 'now')} className="min-h-[44px]">
                            <Play className="mr-2 h-4 w-4" /> Play Now
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAddToQueue(song, 'next')} className="min-h-[44px]">
                            <Plus className="mr-2 h-4 w-4" /> Play Next
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAddToQueue(song, 'end')} className="min-h-[44px]">
                            <Plus className="mr-2 h-4 w-4" /> Add to End
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void startRadio({ kind: 'song', songId: song.id })} className="min-h-[44px]">
                            <Radio className="mr-2 h-4 w-4" /> Start Radio
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <span className="tabular-nums text-xs text-muted-foreground w-10 text-right ml-1">
                      {Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-border/30 px-3 text-xs text-muted-foreground">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'}{durationText && ` · ${durationText}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
