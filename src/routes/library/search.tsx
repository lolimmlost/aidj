import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { loginRedirect } from '~/lib/auth/login-redirect';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollSafeMenu } from '@/lib/hooks/useScrollSafeMenu';
import { useQuery } from '@tanstack/react-query';
import { search, getArtists } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NavidromeErrorBoundary } from '@/components/navidrome-error-boundary';
import { Search as SearchIcon, Plus, CheckCircle2, AlertCircle, X, Clock, Play, Disc3, MoreHorizontal, ListPlus, Radio, Music, User } from 'lucide-react';
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
import { useArtistMetadata, ServiceRestartingError } from '@/lib/hooks/useArtistMetadata';
import { ArtistRequestPanel } from '@/components/library/ArtistRequestPanel';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types/song';
import type { RecentEntry } from '@/lib/utils/recent-searches';
import { useRecentSearches } from '@/lib/hooks/useRecentSearches';
import { findLibraryArtistByName } from '@/lib/utils/artist-name-match';
import { compactName, searchVariants } from '@/lib/utils/search-variants';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { GlassBackdrop } from '@/components/glass/GlassBackdrop';
import {
  GlassAlbums, GlassArtistRows, GlassArtistStrip, GlassRecent, GlassRecentlyPlayed, GlassSectionHead, GlassSongRow, GlassTopResult, useGlassSongSheet,
} from '@/components/search/GlassSearch';

export const Route = createFileRoute('/library/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q.trim().length > 0 ? search.q : undefined,
  }),
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
    }
  },
  component: SearchPage,
});

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Glass "All" tab: rows / tiles per section before "See all N". */
const GLASS_ALL_SONGS = 5;
const GLASS_ALL_TILES = 8;

/** Pause after the last keystroke before the search runs. */
const SEARCH_DEBOUNCE_MS = 300;

type ArtistWithCounts = { id: string; name: string; albumCount?: number; songCount?: number };

function SearchPage() {
  // Glass design (phones): see GlassHome
  const glass = useGlassUi();
  const navigate = useNavigate({ from: '/library/search' });
  const { q } = Route.useSearch();
  // `query` is the committed search (in the URL, drives every fetch).
  const query = q ?? '';
  // `input` is what's in the box. It updates synchronously on each keystroke;
  // binding the box straight to the URL made React re-assert the old value
  // while the navigation was in flight, which threw the cursor to the end
  // when you typed mid-word. The URL catches up after a pause.
  const [input, setInput] = useState(query);
  const committedRef = useRef(query);
  const { playSong, setAIUserActionInProgress } = useAudioStore();
  const [tab, setTab] = useState<Tab>('all');
  const { user } = Route.useRouteContext();
  const userId = user?.id;
  const { recent, recordRecent, removeRecent, clearRecent } = useRecentSearches(userId, query);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset tab when query clears
  useEffect(() => {
    if (!query.trim()) setTab('all');
  }, [query]);

  const commitQuery = (value: string) => {
    const next = value.trim().length > 0 ? value : '';
    if (next === committedRef.current) return;
    committedRef.current = next;
    navigate({
      search: () => (next ? { q: next } : {}),
      replace: true,
      // typing updates ?q= in place: don't jump to the top on each pause
      resetScroll: false,
    });
  };

  // Programmatic changes (recent entry, clear, "Did you mean"): box + URL now.
  const setQuery = (value: string) => {
    setInput(value);
    commitQuery(value);
  };

  // Typing: commit after the user pauses.
  useEffect(() => {
    const id = setTimeout(() => commitQuery(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- commitQuery only reads a ref + navigate
  }, [input]);

  // URL changed from outside (back/forward, a link with ?q=): follow it.
  useEffect(() => {
    if (query !== committedRef.current) {
      committedRef.current = query;
      setInput(query);
    }
  }, [query]);

  const { data: songs = [], isLoading: isLoadingSongs, error } = useQuery({
    queryKey: ['search', query],
    // Also search the query's number spellings ("two pac" → "2pac",
    // "21 pilots" → "twenty one pilots"); Navidrome only matches literal tokens.
    queryFn: async () => {
      const q = query.trim();
      const variants = searchVariants(q);
      const [main, ...extra] = await Promise.all([
        search(q, 0, 50),
        ...variants.map((v) => search(v, 0, 50).catch(() => [] as Song[])),
      ]);
      if (extra.length === 0) return main;
      const seen = new Set(main.map((s) => s.id));
      const merged = [...main];
      for (const list of extra) for (const s of list) if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
      return merged.slice(0, 50);
    },
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
    // Spacing/punctuation-blind, and the number spellings too: "2 pac" and
    // "two pac" both find 2Pac. Short compact needles would match too much.
    const compactNeedles = [needle, ...searchVariants(needle)].map(compactName).filter((n) => n.length >= 3);

    const matching = runtimeArtists.filter((a) => {
      const hasMusic = (a.albumCount ?? 0) > 0 || (a.songCount ?? 0) > 0;
      if (!hasMusic) return false;
      if (a.name.toLowerCase().includes(needle)) return true;
      const name = compactName(a.name);
      return compactNeedles.some((n) => name.includes(n));
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
  const glassSheet = useGlassSongSheet(feedbackData?.liked);
  const storePlaylist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const currentSongId = useMemo(() => storePlaylist[currentSongIndex]?.id, [storePlaylist, currentSongIndex]);
  const topArtist = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matchedArtists.find((a) => a.name.trim().toLowerCase() === needle);
  }, [matchedArtists, query]);
  const recordArtist = (a: { id: string; name: string }) => recordRecent({ kind: 'artist', id: a.id, name: a.name });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    const index = songs.findIndex(s => s.id === songId);
    if (index < 0) return;
    const song = songs[index];
    recordRecent({ kind: 'song', song });
    // Nothing else lined up (no queue playing): play out the results from this song on.
    // With a queue or source already playing, keep to just this song.
    const st = useAudioStore.getState();
    const busy = st.isPlaying && st.playlist.length - st.currentSongIndex - 1 > 0;
    setAIUserActionInProgress(true);
    playSong(song.id, busy ? [song] : songs.slice(index));
    setTimeout(() => setAIUserActionInProgress(false), 1000);
  };

  const playRecentSong = (song: Song) => {
    setAIUserActionInProgress(true);
    playSong(song.id, [song]);
    setTimeout(() => setAIUserActionInProgress(false), 1000);
  };

  const openRecent = (entry: RecentEntry) => {
    switch (entry.kind) {
      case 'query':
        setQuery(entry.term);
        break;
      case 'song':
        playRecentSong(entry.song);
        break;
      case 'artist':
        navigate({ to: '/library/artists/$id', params: { id: entry.id } });
        break;
      case 'album':
        if (entry.artistId) {
          navigate({ to: '/library/artists/$id/albums/$albumId', params: { id: entry.artistId, albumId: entry.id } });
        } else {
          setQuery(entry.name);
        }
        break;
    }
  };

  const showArtists = tab === 'all' || tab === 'artists';
  const showSongs = tab === 'all' || tab === 'songs';
  const showAlbums = tab === 'all' || tab === 'albums';

  return (
    <NavidromeErrorBoundary>
      <div className={cn("min-h-screen bg-background pb-24 md:pb-20", glass && "glass-page glass-home relative md:bg-transparent")}>
        {glass && <GlassBackdrop className="md:hidden" />}
        {/* Ambient backdrop */}
        <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", glass && "max-md:hidden")}>
          <div className="absolute -top-40 -left-40 size-[40rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-40 size-[36rem] rounded-full bg-fuchsia-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 size-[28rem] rounded-full bg-cyan-500/5 blur-3xl" />
        </div>

        {/* Sticky search header */}
        <header className={cn(
          "sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl pt-[calc(env(safe-area-inset-top)+var(--top-bar)+0.5rem)] md:pt-[env(safe-area-inset-top)]",
          glass && "max-md:border-transparent max-md:bg-background/40",
        )}>
          <div className={cn("mx-auto w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] px-4 sm:px-6 lg:px-8 pt-4 pb-3 sm:pt-5 sm:pb-4", glass && "max-md:pt-0 max-md:pb-2")}>
            <h1 className={cn("mb-3 text-2xl font-black tracking-tight sm:text-3xl", glass && "max-md:mb-2 max-md:text-[26px] max-md:font-extrabold max-md:leading-8 max-md:tracking-[-0.03em]")}>Search</h1>

            {/* Search input */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Songs, artists, albums..."
                value={input}
                onChange={handleInputChange}
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  commitQuery(input);
                  // The keyboard's Search key: run it and get the keyboard out of the way of the results.
                  e.currentTarget.blur();
                }}
                className={cn(
                  'w-full rounded-xl pl-10 pr-10 text-base outline-none transition-all',
                  glass
                    ? // same find field as the glass playlist page
                      'glass-flat h-11 py-0 text-[15px] font-semibold placeholder:text-foreground/70 focus:ring-2 focus:ring-primary/30 md:h-auto md:py-3'
                    : 'border border-border/60 bg-muted/40 py-3 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-muted/60 focus:ring-2 focus:ring-primary/20',
                )}
                aria-label="Search library"
              />
              {input.length > 0 && (
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
                className={cn("mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", glass && "max-md:mt-2")}
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all',
                      // an h- class also opts out of the 44 px coarse-pointer min-height
                      glass && 'max-md:h-9 max-md:py-0',
                      tab === t.id
                        ? glass ? 'border border-foreground bg-foreground text-background' : 'bg-primary text-primary-foreground shadow-md'
                        : glass ? 'glass-surface text-foreground' : 'border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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
              <p className={cn("mt-2 text-xs text-muted-foreground", glass && "max-md:hidden")}>
                {matchedArtists.length} artist{matchedArtists.length !== 1 ? 's' : ''} · {matchedAlbums.length} album{matchedAlbums.length !== 1 ? 's' : ''} · {songs.length} song{songs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className={cn("mx-auto w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8", glass && "max-md:pt-4")}>
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
              <ArtistAddFallback
                query={query.trim()}
                libraryArtists={allArtists as ArtistWithCounts[]}
                onSearchName={setQuery}
              />
            ) : (
              <>
              {glass && (
                <div aria-live="polite" className="space-y-5 md:hidden">
                  {tab === 'all' && (
                    <GlassTopResult
                      artist={topArtist}
                      song={topArtist ? undefined : songs[0]}
                      artistImage={topArtist ? allArtistImages[topArtist.name.toLowerCase()] : undefined}
                      onPlaySong={(s) => handleSongClick(s.id)}
                      onOpenArtist={recordArtist}
                    />
                  )}
                  {showSongs && songs.length > 0 && (
                    <section className="space-y-1">
                      <GlassSectionHead
                        title="Songs"
                        count={songs.length}
                        shown={tab === 'all' ? GLASS_ALL_SONGS : songs.length}
                        onSeeAll={() => setTab('songs')}
                      />
                      <div className="flex flex-col">
                        {(tab === 'all' ? songs.slice(0, GLASS_ALL_SONGS) : songs).map((song) => (
                          <GlassSongRow
                            key={song.id}
                            song={song}
                            playing={song.id === currentSongId}
                            onPlay={() => handleSongClick(song.id)}
                            onMore={() => glassSheet.open(song)}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {showArtists && matchedArtists.length > 0 && (
                    <section className="space-y-2">
                      <GlassSectionHead
                        title="Artists"
                        count={matchedArtists.length}
                        shown={tab === 'all' ? GLASS_ALL_TILES : matchedArtists.length}
                        onSeeAll={() => setTab('artists')}
                      />
                      {tab === 'all' ? (
                        <GlassArtistStrip artists={matchedArtists.slice(0, GLASS_ALL_TILES)} images={allArtistImages} onOpen={recordArtist} />
                      ) : (
                        <GlassArtistRows artists={matchedArtists} images={allArtistImages} onOpen={recordArtist} />
                      )}
                    </section>
                  )}
                  {showAlbums && matchedAlbums.length > 0 && (
                    <section className="space-y-2">
                      <GlassSectionHead
                        title="Albums"
                        count={matchedAlbums.length}
                        shown={tab === 'all' ? GLASS_ALL_TILES : matchedAlbums.length}
                        onSeeAll={() => setTab('albums')}
                      />
                      <GlassAlbums
                        albums={tab === 'all' ? matchedAlbums.slice(0, GLASS_ALL_TILES) : matchedAlbums}
                        layout={tab === 'all' ? 'strip' : 'grid'}
                        onOpen={(album) => recordRecent({ kind: 'album', id: album.id, name: album.name, artist: album.artist, artistId: album.artistId })}
                      />
                    </section>
                  )}
                </div>
              )}
              <div aria-live="polite" className={cn("space-y-8", glass && "max-md:hidden")}>
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
                        <div
                          key={artist.id}
                          onClickCapture={() => recordRecent({ kind: 'artist', id: artist.id, name: artist.name })}
                        >
                          <ArtistCard
                            artist={artist}
                            savedImageUrl={allArtistImages[artist.name.toLowerCase()]}
                          />
                        </div>
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
                          <AlbumResultCard key={album.id} album={album} index={i} variant="scroll" onOpen={() => recordRecent({ kind: 'album', id: album.id, name: album.name, artist: album.artist, artistId: album.artistId })} />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {matchedAlbums.map((album, i) => (
                          <AlbumResultCard key={album.id} album={album} index={i} onOpen={() => recordRecent({ kind: 'album', id: album.id, name: album.name, artist: album.artist, artistId: album.artistId })} />
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
              </>
            )
          ) : (
            /* === Idle state === */
            <>
            {glass && (
              <div className="space-y-5 md:hidden">
                <GlassRecent
                  recent={recent}
                  images={allArtistImages}
                  onOpen={openRecent}
                  onRemove={removeRecent}
                  onClear={clearRecent}
                />
                <GlassRecentlyPlayed onPlay={playRecentSong} />
              </div>
            )}
            <div className={cn("space-y-8", glass && "max-md:hidden")}>
              {/* Recent searches */}
              {recent.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent searches
                    </h2>
                    <button
                      onClick={clearRecent}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((entry) => (
                      <button
                        key={recentEntryKey(entry)}
                        onClick={() => openRecent(entry)}
                        className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 text-sm transition-all hover:bg-muted/60 hover:border-border"
                      >
                        <RecentEntryIcon entry={entry} />
                        <span>{recentEntryLabel(entry)}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecent(entry);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              removeRecent(entry);
                            }
                          }}
                          className="ml-0.5 rounded-full p-0.5 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-foreground transition-all"
                          aria-label={`Remove ${recentEntryLabel(entry)}`}
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Recently played: same strip as the glass phone layout */}
              <GlassRecentlyPlayed onPlay={playRecentSong} />

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
            </>
          )}
          {glass && glassSheet.element}
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

function recentEntryKey(entry: RecentEntry): string {
  switch (entry.kind) {
    case 'query':
      return `query:${entry.term.toLowerCase()}`;
    case 'song':
      return `song:${entry.song.id}`;
    default:
      return `${entry.kind}:${entry.id}`;
  }
}

function recentEntryLabel(entry: RecentEntry): string {
  switch (entry.kind) {
    case 'query':
      return entry.term;
    case 'song':
      return entry.song.artist ? `${entry.song.name} · ${entry.song.artist}` : entry.song.name;
    case 'artist':
      return entry.name;
    case 'album':
      return entry.artist ? `${entry.name} · ${entry.artist}` : entry.name;
  }
}

function RecentEntryIcon({ entry }: { entry: RecentEntry }) {
  const className = 'h-3 w-3 text-muted-foreground';
  switch (entry.kind) {
    case 'query':
      return <Clock className={className} />;
    case 'song':
      return <Music className={className} />;
    case 'artist':
      return <User className={className} />;
    case 'album':
      return <Disc3 className={className} />;
  }
}

function AlbumResultCard({
  album,
  variant = 'grid',
  onOpen,
}: {
  album: { id: string; name: string; artist: string; artistId?: string };
  index?: number;
  variant?: 'grid' | 'scroll';
  onOpen?: () => void;
}) {
  const coverUrl = getCoverArtUrl(album.id, 300) ?? '';

  return (
    <Link
      to={album.artistId ? '/library/artists/$id/albums/$albumId' : '/library/search'}
      params={album.artistId ? { id: album.artistId, albumId: album.id } : undefined}
      onClick={onOpen}
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

function ArtistAddFallback({
  query,
  libraryArtists,
  onSearchName,
}: {
  query: string;
  libraryArtists: readonly ArtistWithCounts[];
  onSearchName: (name: string) => void;
}) {
  const { data: metadata, isLoading, isError, error, refetch, isFetching } = useArtistMetadata(query, {
    enabled: query.length > 0,
  });

  const [elapsed, setElapsed] = useState(0);
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const restarting = error instanceof ServiceRestartingError;
    return (
      <Card className={restarting ? 'border-amber-500/30' : 'border-destructive/30'}>
        <CardContent className="p-8 sm:p-12 text-center space-y-3">
          {restarting ? (
            <Clock className="h-10 w-10 mx-auto text-amber-600 dark:text-amber-400 opacity-80" />
          ) : (
            <AlertCircle className="h-10 w-10 mx-auto text-destructive opacity-80" />
          )}
          <h3 className="font-semibold text-lg">
            {restarting ? 'Download service is restarting' : 'MusicBrainz lookup unavailable'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {restarting
              ? `"${query}" isn't in your library. The lookup service that finds and downloads new artists isn't responding right now. It restarts itself within a few minutes, so try again shortly.`
              : `Couldn't reach the metadata service. "${query}" isn't in your library and we can't offer to add it right now.`}
          </p>
          {!restarting && <p className="text-xs text-muted-foreground font-mono break-all">{msg}</p>}
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

  // MusicBrainz resolves aliases the library search can't ("21 pilots" →
  // "Twenty One Pilots"). If the resolved artist is already in the library,
  // point there instead of offering to download it again.
  const inLibrary = findLibraryArtistByName(libraryArtists, metadata.artistName);
  if (inLibrary) {
    return (
      <Card className="border-green-500/30">
        <CardContent className="p-6 sm:p-8 space-y-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-lg">
                Did you mean <span className="break-words">{inLibrary.name}</span>?
              </h3>
              <p className="text-sm text-muted-foreground">
                Nothing in your library matches "{query}", but MusicBrainz knows it as{' '}
                {metadata.artistName}, and that artist is already in your library.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-start gap-2">
            <Button asChild size="sm">
              <Link to="/library/artists/$id" params={{ id: inLibrary.id }}>
                <User className="h-4 w-4 mr-1.5" />
                Open {inLibrary.name}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSearchName(inLibrary.name)}>
              <SearchIcon className="h-4 w-4 mr-1.5" />
              Search "{inLibrary.name}"
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topGenres = metadata.genres.slice(0, 3);
  const formedLabel = metadata.formedYear ? `formed ${metadata.formedYear}` : null;
  const countryLabel = metadata.country ?? null;
  const details = [countryLabel, formedLabel].filter(Boolean).join(' · ');

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

        <div className="pt-4 border-t">
          <ArtistRequestPanel
            mbid={metadata.mbid!}
            artistName={metadata.artistName}
            releaseGroups={metadata.releaseGroups}
          />
        </div>
      </CardContent>
    </Card>
  );
}
