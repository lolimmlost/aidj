import { createFileRoute, Link, useParams, useNavigate, redirect, Outlet, useLocation } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { getAlbums, getArtistDetail, getSongsByArtist } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import {
  Loader2, Music, Disc, ListMusic, Play, Plus, ListPlus, SkipForward,
  Shuffle, Heart, Share2, MoreHorizontal, ChevronLeft, ChevronRight,
  Clock, Disc3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { useArtistMetadata } from '@/lib/hooks/useArtistMetadata';
import { ArtistMetadataHero } from '@/components/library/ArtistMetadataHero';
import { StartRadioButton } from '@/components/radio/StartRadioButton';
import { cn } from '@/lib/utils';
import { getArtistGradient } from '@/lib/utils/artist-avatar';

/** Album cover with Navidrome getCoverArt proxy fallback, then placeholder */
function AlbumCoverArt({ albumId, artwork, name }: { albumId: string; artwork?: string; name: string }) {
  const [error, setError] = useState(false);
  const [proxyError, setProxyError] = useState(false);
  const proxyUrl = `/api/navidrome/rest/getCoverArt?id=${albumId}&size=300`;

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

  const src = error || !artwork ? proxyUrl : artwork;

  return (
    <img
      src={src}
      alt={`Album cover for ${name}`}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => {
        if (!error && artwork) setError(true);
        else setProxyError(true);
      }}
    />
  );
}

export const Route = createFileRoute('/library/artists/$id')({
  beforeLoad: async ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' });
  },
  component: ArtistDetail,
});

function ArtistDetail() {
  const { id } = useParams({ from: '/library/artists/$id' }) as { id: string };
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'albums' | 'songs'>('all');
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const discographyRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const isChildRoute = location.pathname.includes('/albums/');

  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress } = useAudioStore();

  const { data: artist, isLoading: loadingArtist, error: artistError } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtistDetail(id),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: albums = [], isLoading: loadingAlbums, error: albumsError } = useQuery({
    queryKey: ['albums', id],
    queryFn: () => getAlbums(id, 0, 50),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: songs = [], isLoading: loadingSongs, error: songsError } = useQuery({
    queryKey: ['artistSongs', id],
    queryFn: () => getSongsByArtist(id, 0, 100),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: artistMetadata, isLoading: loadingMetadata } = useArtistMetadata(artist?.name, {
    navidromeId: id,
    enabled: !!artist?.name,
  });

  // Fetch unified artist images (Aurral + Deezer) for fallback
  const { data: savedArtistImages = {} } = useQuery({
    queryKey: ['all-artist-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/all-artist-images');
      if (!res.ok) return {};
      const json = await res.json();
      return (json.data?.images || {}) as Record<string, string>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const error = artistError || albumsError || songsError;
  const isLoading = loadingArtist || loadingAlbums || loadingSongs;

  if (isChildRoute) return <Outlet />;

  const handleSongClick = (songId: string) => playSong(songId, songs);

  const handleShuffleAll = () => {
    if (songs.length > 0) {
      const shuffled = [...songs].sort(() => Math.random() - 0.5);
      playSong(shuffled[0].id, shuffled);
      setIsPlaying(true);
      toast.success(`Shuffling ${songs.length} songs`);
    }
  };

  const handleAddToQueue = (song: typeof songs[0], position: 'now' | 'next' | 'end') => {
    const songName = song.name || song.title || 'Unknown';
    const audioSong = {
      id: song.id, name: songName, title: songName,
      artist: song.artist, album: song.album, albumId: song.albumId,
      url: `/api/navidrome/stream/${song.id}`, duration: song.duration, track: song.track,
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

  const scrollDiscography = (dir: number) => {
    discographyRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  };

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-10">
        <Card className="p-6 bg-destructive/10 border-destructive">
          <h2 className="text-xl font-bold text-destructive mb-2">Error loading artist</h2>
          <p className="text-sm mb-4">{error.message}</p>
          <Button variant="outline" asChild>
            <Link to="/library/artists">Back to Artists</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const artistName = artist?.name || 'Unknown Artist';
  const gradient = getArtistGradient(artistName);
  const sortedAlbums = [...albums].sort((a, b) => (b.year || 0) - (a.year || 0));
  const sortedSongs = [...songs].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  // Top tracks by play count (or just first 5 if no play count)
  const topTracks = [...songs].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 5);

  const formatDuration = (d: number) =>
    `${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')}`;

  const renderSongRow = (song: typeof songs[0], index?: number) => (
    <div
      key={song.id}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 hover:bg-card/60 cursor-pointer"
      onMouseEnter={() => setHoveredTrack(song.id)}
      onMouseLeave={() => setHoveredTrack(null)}
      onClick={() => handleSongClick(song.id)}
    >
      {index !== undefined && (
        <span className="w-6 text-center text-sm tabular-nums text-muted-foreground">
          {hoveredTrack === song.id ? (
            <Play className="h-4 w-4 text-primary mx-auto fill-current" />
          ) : (
            index + 1
          )}
        </span>
      )}
      <div className="hidden sm:block flex-shrink-0 w-10 h-10 rounded-md overflow-hidden bg-muted">
        <AlbumCoverArt albumId={song.albumId} artwork={undefined} name={song.album || 'Unknown'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{song.name || song.title || 'Unknown'}</p>
        <p className="text-xs text-muted-foreground truncate">{song.album}</p>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
        <Clock className="h-3 w-3" /> {formatDuration(song.duration)}
      </span>
      {/* Play Next - desktop hover only */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hidden sm:inline-flex"
        onClick={(e) => { e.stopPropagation(); handleAddToQueue(song, 'next'); }}
        title="Play Next"
      >
        <SkipForward className="h-4 w-4" />
      </Button>
      {/* Actions menu - always visible on mobile, hover on desktop */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddToQueue(song, 'now'); }} className="min-h-[44px]">
            <Play className="mr-2 h-4 w-4" /> Play Now
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddToQueue(song, 'next'); }} className="min-h-[44px]">
            <ListPlus className="mr-2 h-4 w-4" /> Play Next
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddToQueue(song, 'end'); }} className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" /> Add to End
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="relative">
      {/* ─── Hero ─── */}
      {/* mt-12 on mobile clears the fixed top bar (h-12); md: no top bar */}
      <div className="relative h-[28vh] sm:h-[32vh] md:h-[38vh] mt-12 md:mt-0 overflow-hidden">
        {/* Blurred BG — use artist image or gradient */}
        {artistMetadata?.coverImageUrl ? (
          <div className="absolute inset-0">
            <img
              src={artistMetadata.coverImageUrl}
              alt=""
              className="w-full h-full object-cover opacity-30 blur-3xl scale-110"
            />
          </div>
        ) : (
          <div className={cn('absolute inset-0 bg-gradient-to-br opacity-40 blur-3xl scale-110', gradient)} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 lg:px-10 pb-6 sm:pb-8">
          <Link
            to="/library/artists"
            className="hidden md:inline-flex group items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 w-fit"
          >
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Artists
          </Link>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 w-64 rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-40 rounded bg-muted/20 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:gap-1">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-foreground tracking-tight leading-none">
                  {artistName}
                </h1>

                {/* Meta line: pills + stats inline on mobile */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 mb-2 sm:mb-3">
                  {artistMetadata?.country && (
                    <span className="px-2.5 py-0.5 rounded-full bg-card/50 backdrop-blur-sm border border-border/50 text-[11px] font-medium text-foreground">
                      {artistMetadata.country}
                    </span>
                  )}
                  {artistMetadata?.formedYear && (
                    <span className="px-2.5 py-0.5 rounded-full bg-card/50 backdrop-blur-sm border border-border/50 text-[11px] font-medium text-muted-foreground">
                      Est. {artistMetadata.formedYear}
                    </span>
                  )}
                  {artistMetadata?.genres?.slice(0, 3).map((g) => (
                    <Badge key={g} variant="secondary" className="rounded-full text-[11px] py-0.5 bg-primary/10 text-primary border-0">
                      {g}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {albums.length} album{albums.length !== 1 ? 's' : ''} · {songs.length} song{songs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Actions — inline with compact sizing on mobile */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="rounded-full gap-1.5 px-4 sm:px-6 shadow-lg shadow-primary/25 sm:h-10 sm:text-sm"
                    onClick={handleShuffleAll}
                    disabled={songs.length === 0}
                  >
                    <Shuffle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Shuffle All
                  </Button>
                  <StartRadioButton
                    seed={{ kind: 'artist', artistId: id }}
                    label="Start Radio"
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 px-3 sm:px-4 sm:h-10 sm:text-sm border-border/50 bg-card/30 backdrop-blur-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-8 w-8 sm:h-10 sm:w-10 border-border/50 bg-card/30 backdrop-blur-sm"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: artistName, text: `Check out ${artistName}` }).catch(() => {});
                      }
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="px-4 sm:px-6 lg:px-10 py-6 space-y-10">

        {/* Enriched Metadata (About, Bio, Similar) */}
        {loadingMetadata && (
          <div className="rounded-xl bg-card/40 border border-border/50 p-4 sm:p-5 animate-pulse space-y-3">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
            <div className="h-3 w-3/5 rounded bg-muted" />
          </div>
        )}
        {artistMetadata && (
          <ArtistMetadataHero
            metadata={artistMetadata}
            artistImageUrl={artistMetadata?.coverImageUrl || savedArtistImages[artistName?.toLowerCase() || ''] || undefined}
          />
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Popular Tracks */}
            {topTracks.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Popular Tracks</h2>
                  {songs.length > 5 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setActiveTab('songs')}
                    >
                      Show All
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {topTracks.map((track, i) => renderSongRow(track, i))}
                </div>
              </section>
            )}

            {/* Discography — horizontal scroll */}
            {sortedAlbums.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Discography</h2>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="h-7 w-7 rounded-full border-border/50" onClick={() => scrollDiscography(-1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7 rounded-full border-border/50" onClick={() => scrollDiscography(1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div
                  ref={discographyRef}
                  className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide snap-x snap-mandatory"
                >
                  {sortedAlbums.map((album) => (
                    <div
                      key={album.id}
                      className="group flex-shrink-0 w-[160px] sm:w-[180px] snap-start cursor-pointer"
                      onClick={() => navigate({ to: '/library/artists/$id/albums/$albumId', params: { id, albumId: album.id } })}
                    >
                      <div className="relative mb-2.5">
                        <div className="aspect-square rounded-xl overflow-hidden bg-muted transition-all duration-200 group-hover:shadow-lg group-hover:shadow-primary/15 group-hover:-translate-y-0.5">
                          <AlbumCoverArt albumId={album.id} artwork={album.artwork} name={album.name} />
                        </div>
                        <Button
                          size="icon"
                          className="absolute bottom-2 right-2 w-9 h-9 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Play first song from this album
                            const albumSongs = songs.filter(s => s.albumId === album.id).sort((a, b) => (a.track || 0) - (b.track || 0));
                            if (albumSongs.length > 0) {
                              playSong(albumSongs[0].id, albumSongs);
                              setIsPlaying(true);
                            }
                          }}
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </Button>
                      </div>
                      <h3 className="text-sm font-bold text-foreground truncate">{album.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {album.year ? `${album.year} · ` : ''}{album.songCount || '?'} tracks
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Songs Tab (hidden by default, shown via tabs) */}
            {songs.length > 5 && (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'albums' | 'songs')}>
                <TabsList className="grid w-full grid-cols-3 mb-4 h-auto">
                  <TabsTrigger value="all" className="py-2.5 text-xs sm:text-sm">Overview</TabsTrigger>
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

                <TabsContent value="all">
                  {/* Overview is the content above — tabs just provide alternate views */}
                </TabsContent>

                <TabsContent value="albums">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                    {sortedAlbums.map((album) => (
                      <div
                        key={album.id}
                        className="group cursor-pointer"
                        onClick={() => navigate({ to: '/library/artists/$id/albums/$albumId', params: { id, albumId: album.id } })}
                      >
                        <div className="aspect-square rounded-xl overflow-hidden bg-muted mb-2 transition-all duration-200 group-hover:shadow-lg group-hover:-translate-y-0.5">
                          <AlbumCoverArt albumId={album.id} artwork={album.artwork} name={album.name} />
                        </div>
                        <h3 className="text-sm font-semibold truncate">{album.name}</h3>
                        {album.year ? <p className="text-xs text-muted-foreground">{album.year}</p> : null}
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="songs">
                  <div className="space-y-0.5">
                    {sortedSongs.map((song, i) => renderSongRow(song, i))}
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {sortedAlbums.length === 0 && songs.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No albums or songs found for this artist.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
