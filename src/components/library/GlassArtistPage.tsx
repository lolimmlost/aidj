import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, Shuffle } from 'lucide-react';
import { StartRadioButton } from '@/components/radio/StartRadioButton';
import { getArtists } from '@/lib/services/navidrome';
import type { Album, Song } from '@/lib/services/navidrome/types';
import { useAudioStore } from '@/lib/stores/audio';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { findLibraryArtistByName } from '@/lib/utils/artist-name-match';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Avatar, GlassAlbums, GlassSectionHead, GlassSongRow, fmt, useGlassSongSheet, type GlassAlbum,
} from '@/components/search/GlassSearch';

/**
 * Glass UI (phones) artist page, canvas AT (picked over AU on 2026-11-25):
 * full-bleed photo hero, Popular, Releases, Fans also like, About.
 */

export interface GlassArtistMeta {
  coverImageUrl?: string | null;
  genres?: string[];
  bio?: unknown;
  formedYear?: string | number | null;
  similarArtists?: { name: string; image?: string }[];
}

interface Props {
  artistId: string;
  name: string;
  albums: Album[];
  songs: Song[];
  metadata?: GlassArtistMeta | null;
  imageUrl?: string;
  /** saved artist photos by lower-cased name (similar artists) */
  images: Record<string, string>;
}

function bioText(bio: unknown): string | null {
  if (!bio) return null;
  if (typeof bio === 'string') return bio.replace(/<[^>]+>/g, '').trim() || null;
  if (typeof bio === 'object') {
    const o = bio as Record<string, unknown>;
    for (const k of ['content', 'summary', 'text', 'value']) if (typeof o[k] === 'string') return bioText(o[k]);
  }
  return null;
}

const SONGS_SHOWN = 5;
const TILES_SHOWN = 8;

export function GlassArtistPage({ artistId, name, albums, songs, metadata, imageUrl, images }: Props) {
  const [allSongs, setAllSongs] = useState(false);
  const [releaseFilter, setReleaseFilter] = useState<'all' | 'albums' | 'singles'>('all');
  const [allReleases, setAllReleases] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);

  const playSong = useAudioStore((s) => s.playSong);
  const playShuffled = useAudioStore((s) => s.playShuffled);
  const storePlaylist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const currentSongId = useMemo(() => storePlaylist[currentSongIndex]?.id, [storePlaylist, currentSongIndex]);

  const byPlays = useMemo(() => [...songs].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)), [songs]);
  const totalPlays = useMemo(() => songs.reduce((n, s) => n + (s.playCount ?? 0), 0), [songs]);
  const { data: feedback } = useSongFeedback(useMemo(() => songs.map((s) => s.id), [songs]));
  const sheet = useGlassSongSheet(feedback?.liked);

  // releases newest first; ≤ 3 songs in the library = a single / EP
  const songsPerAlbum = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of songs) m.set(s.albumId, (m.get(s.albumId) ?? 0) + 1);
    return m;
  }, [songs]);
  const releases = useMemo(
    () =>
      [...albums]
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
        .map((a) => {
          const single = (songsPerAlbum.get(a.id) ?? 0) <= 3;
          return { album: a, single, tile: { id: a.id, name: a.name, artist: name, artistId: a.artistId || artistId, sub: `${a.year ? `${a.year} · ` : ''}${single ? 'Single' : 'Album'}` } as GlassAlbum };
        }),
    [albums, songsPerAlbum, name, artistId],
  );
  const filtered = releases.filter((r) => releaseFilter === 'all' || (releaseFilter === 'singles' ? r.single : !r.single));
  const genre = metadata?.genres?.[0];
  const bio = bioText(metadata?.bio);

  // similar artists: open them in the library when they're there, else search for them
  const { data: libraryArtists = [] } = useQuery({ queryKey: ['artists'], queryFn: () => getArtists(0, 10000), staleTime: 5 * 60 * 1000 });
  const similar = (metadata?.similarArtists ?? []).slice(0, TILES_SHOWN).map((s) => ({
    name: s.name,
    image: images[s.name.toLowerCase()] ?? s.image,
    libraryId: findLibraryArtistByName(libraryArtists, s.name)?.id ?? null,
  }));

  const play = (song: Song, list: Song[]) => playSong(song.id, list);
  const playAll = () => byPlays.length && playSong(byPlays[0].id, byPlays);
  const shuffle = () => {
    if (!songs.length) return;
    playShuffled(songs);
    toast.success(`Shuffling ${songs.length} songs`);
  };

  const songRow = (s: Song, list: Song[], sub?: React.ReactNode) => (
    <GlassSongRow key={s.id} song={s} playing={s.id === currentSongId} onPlay={() => play(s, list)} onMore={() => sheet.open(s)} sub={sub} />
  );
  const playsSub = (s: Song) => `${s.playCount ? `${s.playCount} plays · ` : ''}${fmt(s.duration)}`;
  const similarStrip = similar.length > 0 && (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {similar.map((s) => {
        const inner = (
          <>
            <Avatar artist={{ id: s.libraryId ?? s.name, name: s.name }} image={s.image} size={120} />
            <span className="w-full min-w-0 text-left">
              <span className="block truncate text-[13px] font-semibold">{s.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.libraryId ? 'In your library' : 'Search for it'}</span>
            </span>
          </>
        );
        const cls = 'flex w-[120px] shrink-0 flex-col gap-2 [-webkit-tap-highlight-color:transparent]';
        return s.libraryId ? (
          <Link key={s.name} to="/library/artists/$id" params={{ id: s.libraryId }} className={cls}>{inner}</Link>
        ) : (
          <Link key={s.name} to="/library/search" search={{ q: s.name }} className={cls}>{inner}</Link>
        );
      })}
    </div>
  );

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold [-webkit-tap-highlight-color:transparent]', on ? 'bg-foreground text-background' : 'glass-flat')}
    >
      {label}
    </button>
  );

  const shownSongs = allSongs ? byPlays : byPlays.slice(0, SONGS_SHOWN);
  const shownReleases = allReleases ? filtered : filtered.slice(0, TILES_SHOWN);
  return (
    <div className="glass-home relative -mt-12 pb-6 md:mt-0">
      {/* photo hero: full bleed under the top bar on phones, a rounded card on wider screens */}
      <div className="relative -mx-4 h-[330px] overflow-hidden bg-muted md:mx-0 md:h-[360px] md:rounded-[28px]">
        {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0 bg-gradient-to-br from-primary/50 to-background" />}
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,color-mix(in_oklch,var(--background)_55%,transparent)_70%,var(--background)_100%)]" />
        <div className="absolute inset-x-4 bottom-3.5">
          <h1 className="font-display text-[40px] font-extrabold leading-none tracking-[-0.035em]">{name}</h1>
          <p className="mt-2 text-[13px] text-foreground/75">
            {[genre, `${releases.length} release${releases.length === 1 ? '' : 's'}`, totalPlays ? `${totalPlays} plays` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-1 flex h-14 items-center gap-1">
        {/* opens the Start radio sheet (length + artist variety), like the other pages */}
        <StartRadioButton
          seed={{ kind: 'artist', artistId }}
          label={`Start ${name} radio`}
          size="icon"
          variant="ghost"
          className="size-11 rounded-full p-0 text-foreground/80 [&_svg]:size-[22px]"
        />
        <span className="flex-1" />
        <button type="button" onClick={shuffle} aria-label="Shuffle" className="grid size-11 place-items-center rounded-full text-foreground/80">
          <Shuffle className="size-[22px]" />
        </button>
        <button
          type="button"
          onClick={playAll}
          aria-label={`Play ${name}`}
          className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </button>
      </div>

      <div className="mt-3 space-y-5">
        <section className="space-y-1">
          <GlassSectionHead title="Popular" count={byPlays.length} shown={allSongs ? byPlays.length : SONGS_SHOWN} onSeeAll={() => setAllSongs(true)} />
          <div className="flex flex-col">{shownSongs.map((s) => songRow(s, byPlays, playsSub(s)))}</div>
        </section>

        {releases.length > 0 && (
          <section className="space-y-2">
            <GlassSectionHead title="Releases" count={filtered.length} shown={allReleases ? filtered.length : TILES_SHOWN} onSeeAll={() => setAllReleases(true)} />
            {releases.some((r) => r.single) && releases.some((r) => !r.single) && (
              <div className="flex gap-2">
                {chip('All', releaseFilter === 'all', () => setReleaseFilter('all'))}
                {chip('Albums', releaseFilter === 'albums', () => setReleaseFilter('albums'))}
                {chip('Singles', releaseFilter === 'singles', () => setReleaseFilter('singles'))}
              </div>
            )}
            <GlassAlbums albums={shownReleases.map((r) => r.tile)} layout={allReleases ? 'grid' : 'strip'} onOpen={() => {}} />
          </section>
        )}

        {similarStrip && (
          <section className="space-y-2">
            <GlassSectionHead title="Fans also like" />
            {similarStrip}
          </section>
        )}

        {(bio || genre) && (
          <section className="space-y-2">
            <GlassSectionHead title="About" />
            <button type="button" onClick={() => setBioOpen((o) => !o)} className="glass-surface block w-full overflow-hidden rounded-[20px] text-left [-webkit-tap-highlight-color:transparent]">
              {imageUrl && <img src={imageUrl} alt="" className="h-[150px] w-full object-cover" />}
              <span className="block px-3.5 pb-3.5 pt-3">
                <span className="mb-1 block text-[13px] font-semibold">
                  {[metadata?.genres?.slice(0, 2).join(' · '), metadata?.formedYear ? `formed ${metadata.formedYear}` : null].filter(Boolean).join(' · ') || name}
                </span>
                {bio && <span className={cn('block text-[13px] leading-relaxed text-foreground/70', !bioOpen && 'line-clamp-3')}>{bio}</span>}
              </span>
            </button>
          </section>
        )}
      </div>
      {sheet.element}
    </div>
  );
}
