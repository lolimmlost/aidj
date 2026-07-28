import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollSafeMenu } from '@/lib/hooks/useScrollSafeMenu';
import { useQuery } from '@tanstack/react-query';
import { search, getArtists } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NavidromeErrorBoundary } from '@/components/navidrome-error-boundary';
import { Search as SearchIcon, Plus, Download, CheckCircle2, AlertCircle, X, Clock, Play, Disc3, MoreHorizontal, ListPlus, Radio } from 'lucide-react';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';
import { AddToQueueButton } from '@/components/playlists/AddToQueueButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { ArtistCard } from '@/components/library/ArtistsList';
import { AlbumArt, getCoverArtUrl } from '@/components/ui/album-art';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useArtistMetadata, useAddArtistToLibrary } from '@/lib/hooks/useArtistMetadata';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/library/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q.trim().length > 0 ? search.q : undefined,
  }),
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: SearchPage,
});

const RECENT_KEY = 'aidj.search.recent';
const MAX_RECENT = 10;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
] as const;
type Tab = (typeof TABS)[number]['id'];

type ArtistWithCounts = { id: string; name: string; albumCount?: number; songCount?: number };

function SearchPage() {
  const navigate = useNavigate({ from: '/library/search' });
  const { q } = Route.useSearch();
  const query = q ?? '';
  const { playSong, setAIUserActionInProgress } = useAudioStore();
  const [tab, setTab] = useState<Tab>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveRecent = (next: string[]) => {
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  // Auto-save recent search after typing pause
  useEffect(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const term = query.trim();
    if (!term) return;
    commitTimer.current = setTimeout(() => {
      saveRecent([term, ...recent.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT));
    }, 1200);
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset tab when query clears
  useEffect(() => {
    if (!query.trim()) setTab('all');
  }, [query]);

  const setQuery = (value: string) => {
    navigate({
      search: () => (value.trim().length > 0 ? { q: value } : {}),
      replace: true,
    });
  };

  const { data: songs = [], isLoading: isLoadingSongs, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0,
  });

  const { data: allArtists = [], isLoading: isLoadingAllArtists } = useQuery({
    queryKey: ['artists'],
    queryFn: () => getArtists(0, 10000),
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
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const runtimeArtists = allArtists as ArtistWithCounts[];

    const matching = runtimeArtists.filter((a) => {
      const hasMusic = (a.albumCount ?? 0) > 0 || (a.songCount ?? 0) > 0;
      return hasMusic && a.name.toLowerCase().includes(needle);
    });

    const byName = new Map<string, ArtistWithCounts>();
    for (const artist of matching) {
      const key = artist.name.trim().toLowerCase();
      const existing = byName.get(key);
      const score = (artist.albumCount ?? 0) * 100 + (artist.songCount ?? 0);
      const existingScore = existing ? (existing.albumCount ?? 0) * 100 + (existing.songCount ?? 0) : -1;
      if (!existing || score > existingScore) {
        byName.set(key, artist);
      }
    }

    return Array.from(byName.values()).slice(0, 20);
  }, [allArtists, query]);

  const matchedAlbums = useMemo(() => {
    if (songs.length === 0) return [];
    const albumMap = new Map<string, { id: string; name: string; artist: string; artistId?: string }>();
    for (const song of songs) {
      if (song.albumId && song.album && !albumMap.has(song.albumId)) {
        albumMap.set(song.albumId, {
          id: song.albumId,
          name: song.album,
          artist: song.artist || 'Unknown Artist',
          artistId: (song as { artistId?: string }).artistId,
        });
      }
    }
    return Array.from(albumMap.values());
  }, [songs]);

  const isLoading = isLoadingSongs || (isLoadingAllArtists && allArtists.length === 0);
  const hasQuery = query.trim().length > 0;

  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    setAIUserActionInProgress(true);
    playSong(songId, [song]);
    setTimeout(() => setAIUserActionInProgress(false), 1000);
  };

  const showArtists = tab === 'all' || tab === 'artists';
  const showSongs = tab === 'all' || tab === 'songs';
  const showAlbums = tab === 'all' || tab === 'albums';

  return (
    <NavidromeErrorBoundary>
      <div className="min-h-screen bg-background pb-24 md:pb-20">
        {/* Ambient backdrop */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -left-40 size-[40rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-40 size-[36rem] rounded-full bg-fuchsia-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 size-[28rem] rounded-full bg-cyan-500/5 blur-3xl" />
        </div>

        {/* Sticky search header */}
        <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl pt-[calc(env(safe-area-inset-top)+3.5rem)] md:pt-[env(safe-area-inset-top)]">
          <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] px-4 sm:px-6 lg:px-8 pt-4 pb-3 sm:pt-5 sm:pb-4">
            <h1 className="mb-3 text-2xl font-black tracking-tight sm:text-3xl">Search</h1>

            {/* Search input */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Songs, artists, albums..."
                value={query}
                onChange={handleInputChange}
                className={cn(
                  'w-full rounded-xl border border-border/60 bg-muted/40 pl-10 pr-10 py-3 text-base outline-none transition-all',
                  'placeholder:text-muted-foreground/60',
                  'focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:bg-muted/60',
                )}
                aria-label="Search library"
              />
              {hasQuery && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Tab filters */}
            {hasQuery && (
              <div
                role="tablist"
                aria-label="Filter results"
                className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all',
                      tab === t.id
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {t.label}
                    {t.id === 'songs' && hasQuery && !isLoading && (
                      <span className="ml-1.5 text-xs opacity-70">{songs.length}</span>
                    )}
                    {t.id === 'artists' && hasQuery && !isLoading && (
                      <span className="ml-1.5 text-xs opacity-70">{matchedArtists.length}</span>
                    )}
                    {t.id === 'albums' && hasQuery && !isLoading && (
                      <span className="ml-1.5 text-xs opacity-70">{matchedAlbums.length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Result summary */}
            {hasQuery && !isLoading && (
              <p className="mt-2 text-xs text-muted-foreground">
                {matchedArtists.length} artist{matchedArtists.length !== 1 ? 's' : ''} · {matchedAlbums.length} album{matchedAlbums.length !== 1 ? 's' : ''} · {songs.length} song{songs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && (
            <Card className="border-destructive mb-6">
              <CardContent className="p-6 text-center">
                <p className="text-destructive font-medium">Error searching: {error.message}</p>
              </CardContent>
            </Card>
          )}

          {hasQuery ? (
            /* === Active search results === */
            isLoading ? (
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                {[...Array(6)].map((_, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20">
                    <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : songs.length === 0 && matchedArtists.length === 0 && matchedAlbums.length === 0 ? (
              <ArtistAddFallback query={query.trim()} />
            ) : (
              <div aria-live="polite" className="space-y-8">
                {/* Artists section */}
                {showArtists && matchedArtists.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-baseline justify-between px-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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

                {/* Albums section */}
                {showAlbums && matchedAlbums.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-baseline justify-between px-1">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Albums
                      </h2>
                      {tab === 'all' && matchedAlbums.length > 6 && (
                        <button
                          onClick={() => setTab('albums')}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          See all
                        </button>
                      )}
                      {tab === 'albums' && (
                        <span className="text-xs text-muted-foreground">{matchedAlbums.length}</span>
                      )}
                    </div>
                    {tab === 'all' ? (
                      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {matchedAlbums.slice(0, 8).map((album, i) => (
                          <AlbumResultCard key={album.id} album={album} index={i} variant="scroll" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {matchedAlbums.map((album, i) => (
                          <AlbumResultCard key={album.id} album={album} index={i} />
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Songs section */}
                {showSongs && songs.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-baseline justify-between px-1">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Songs
                      </h2>
                      <span className="text-xs text-muted-foreground">{songs.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {songs.map((song) => (
                        <SongRow
                          key={song.id}
                          song={song}
                          feedbackData={feedbackData}
                          onPlay={handleSongClick}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )
          ) : (
            /* === Idle state === */
            <div className="space-y-8">
              {/* Recent searches */}
              {recent.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent searches
                    </h2>
                    <button
                      onClick={() => saveRecent([])}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 text-sm transition-all hover:bg-muted/60 hover:border-border"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{term}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            saveRecent(recent.filter((r) => r !== term));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              saveRecent(recent.filter((r) => r !== term));
                            }
                          }}
                          className="ml-0.5 rounded-full p-0.5 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-foreground transition-all"
                          aria-label={`Remove ${term}`}
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty prompt */}
              <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <SearchIcon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Search your library</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Find any song, artist, or album. Not in your library? We'll check MusicBrainz and offer to add it.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </NavidromeErrorBoundary>
  );
}

// --- Song row component ---

function SongRow({
  song,
  feedbackData,
  onPlay,
}: {
  song: { id: string; name?: string; title?: string; artist?: string; album?: string; albumId?: string; artistId?: string; duration: number; };
  feedbackData: { feedback: Record<string, string | null> } | undefined;
  onPlay: (id: string) => void;
}) {
  const songTitle = song.name || song.title || 'Unknown Song';
  const artistName = song.artist || 'Unknown Artist';
  const { addToQueueNext, addToQueueEnd, setAIUserActionInProgress, setIsPlaying, startRadio } = useAudioStore();
  const { open: mobileMenuOpen, onOpenChange: onMobileMenuChange, triggerProps: mobileTriggerProps } = useScrollSafeMenu();

  const queueSong = {
    id: song.id, name: songTitle, title: songTitle,
    artist: artistName, album: song.album || '', albumId: song.albumId || '',
    url: `/api/navidrome/stream/${song.id}`, duration: song.duration, track: 0,
  };

  const handleAddToQueue = (position: 'next' | 'end') => {
    setAIUserActionInProgress(true);
    if (position === 'next') {
      addToQueueNext([queueSong]);
      toast.success(`Added "${songTitle}" to play next`);
    } else {
      addToQueueEnd([queueSong]);
      toast.success(`Added "${songTitle}" to end of queue`);
    }
    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl p-2.5 sm:p-3 transition-all hover:bg-muted/40">
      <AlbumArt
        albumId={song.albumId}
        songId={song.id}
        artist={artistName}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div
          className="font-semibold text-sm truncate cursor-pointer hover:underline"
          onClick={() => onPlay(song.id)}
        >
          {songTitle}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {song.artistId ? (
            <Link
              to="/library/artists/$id"
              params={{ id: song.artistId }}
              className="hover:text-foreground hover:underline"
            >
              {artistName}
            </Link>
          ) : (
            artistName
          )}
          {song.album && song.albumId && song.artistId ? (
            <>
              {' · '}
              <Link
                to="/library/artists/$id/albums/$albumId"
                params={{ id: song.artistId, albumId: song.albumId }}
                className="hover:text-foreground hover:underline"
              >
                {song.album}
              </Link>
            </>
          ) : song.album ? (
            ` · ${song.album}`
          ) : null}
          {' · '}{Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
        </div>
      </div>

      {/* Mobile: compact ... menu (scroll-safe to prevent accidental opens) */}
      <DropdownMenu open={mobileMenuOpen} onOpenChange={onMobileMenuChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9 flex-shrink-0 text-muted-foreground"
            {...mobileTriggerProps}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => { onPlay(song.id); setIsPlaying(true); }} className="min-h-[44px]">
            <Play className="mr-2 h-4 w-4" /> Play Now
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAddToQueue('next')} className="min-h-[44px]">
            <ListPlus className="mr-2 h-4 w-4" /> Play Next
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAddToQueue('end')} className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" /> Add to End
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void startRadio({ kind: 'song', songId: song.id })} className="min-h-[44px]">
            <Radio className="mr-2 h-4 w-4" /> Start Radio
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Desktop: inline action buttons */}
      <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <SongFeedbackButtons
          songId={song.id}
          artistName={artistName}
          songTitle={songTitle}
          currentFeedback={(feedbackData?.feedback[song.id] as 'thumbs_up' | 'thumbs_down' | null) || null}
          source="search"
        />
        <AddToPlaylistButton
          songId={song.id}
          artistName={artistName}
          songTitle={songTitle}
          size="icon"
          className="h-8 w-8"
        />
        <AddToQueueButton
          songId={song.id}
          artistName={artistName}
          songTitle={songTitle}
        />
        <button
          className="text-muted-foreground cursor-pointer p-2 hover:text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
          onClick={() => onPlay(song.id)}
          aria-label={`Play ${songTitle}`}
        >
          <Play className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}

// --- Album result card ---

function AlbumResultCard({
  album,
  variant = 'grid',
}: {
  album: { id: string; name: string; artist: string; artistId?: string };
  index?: number;
  variant?: 'grid' | 'scroll';
}) {
  const coverUrl = getCoverArtUrl(album.id, 300) ?? '';

  return (
    <Link
      to={album.artistId ? '/library/artists/$id/albums/$albumId' : '/library/search'}
      params={album.artistId ? { id: album.artistId, albumId: album.id } : undefined}
      className={cn(
        'group flex flex-col gap-3 text-left rounded-xl p-2 -m-2 transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        variant === 'scroll' && 'w-40 shrink-0 sm:w-44',
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-md ring-1 ring-border/30 shadow-lg">
        <img
          src={coverUrl}
          alt={`Album cover for ${album.name}`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className="hidden size-full bg-gradient-to-br from-muted to-muted/50 flex flex-col items-center justify-center gap-1.5">
          <Disc3 className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span
          className="absolute bottom-2 right-2 grid size-10 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          aria-hidden
        >
          <Play className="size-4 fill-current" />
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-semibold">{album.name}</p>
        <p className="truncate text-xs text-muted-foreground">{album.artist}</p>
      </div>
    </Link>
  );
}

// --- Aurral fallback for unknown artists ---

function ArtistAddFallback({ query }: { query: string }) {
  const { data: metadata, isLoading, isError, error, refetch, isFetching } = useArtistMetadata(query, {
    enabled: query.length > 0,
  });
  const addArtist = useAddArtistToLibrary();

  const [elapsed, setElapsed] = useState(0);
  /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [isLoading, query]);
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect, react-hooks/set-state-in-effect */

  if (isLoading) {
    const slow = elapsed >= 4;
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
            {elapsed > 0 && <span className="ml-1 tabular-nums">({elapsed}s)</span>}
          </p>
          {slow && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              Still searching — the metadata service is slow. Hang tight or try again in a moment.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-8 sm:p-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive opacity-80" />
          <h3 className="font-semibold text-lg">MusicBrainz lookup unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Couldn't reach the metadata service. "{query}" isn't in your library and
            we can't offer to add it right now.
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all">{msg}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-2"
          >
            {isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const mbArtistName = metadata?.artistName?.trim();
  const hasValidMatch = !!(metadata && metadata.mbid && mbArtistName && mbArtistName !== '[no artist]');

  if (!hasValidMatch) {
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
  const details = [countryLabel, formedLabel].filter(Boolean).join(' · ');

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
