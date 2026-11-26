import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Heart, ListMusic, Disc3, Search, Sparkles } from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { FEATURED_MIX_ID } from '@/lib/config/featured-mix';
import { mixDisplayTitle } from '@/lib/utils/mix-tracklist';
import { useMixSong } from './FeaturedMixCard';
import { cn } from '@/lib/utils';
import { GlassBackdrop } from '@/components/glass/GlassBackdrop';

/**
 * Glass UI prototype: the mobile Home (drafts N / O). One list in the spirit
 * of a library tab: a stats caption, filter chips, four "jump back in" tiles
 * and two-line rows. Light or dark follows the app theme; the glow behind it
 * comes from the playing song's cover.
 */

interface PlaylistRow {
  id: string;
  name: string;
  navidromeId: string | null;
  songCount: number | null;
  actualSongCount?: number | null;
  smartPlaylistCriteria: unknown;
  updatedAt: string | null;
}

type Filter = 'all' | 'playlists' | 'mixes' | 'new';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'mixes', label: 'Mixes' },
  { id: 'new', label: 'New' },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LIKED_NAME = '❤️ Liked Songs';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function isLiked(p: PlaylistRow) {
  return p.name === LIKED_NAME;
}

function songCount(p: PlaylistRow) {
  return p.actualSongCount ?? p.songCount ?? 0;
}

function updatedAgo(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const diff = now - new Date(iso).getTime();
  if (!(diff >= 0) || diff > WEEK_MS) return null;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return days === 0 ? 'updated today' : days === 1 ? 'updated yesterday' : `updated ${days}d ago`;
}

/** A stable tint for playlists with no cover (hue from the name). */
function nameHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function PlaylistArt({ p, size }: { p: PlaylistRow; size: 'tile' | 'row' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'tile' ? 'size-[54px]' : 'size-12 rounded-[10px]';
  if (isLiked(p)) {
    return (
      <span className={cn(box, 'grid shrink-0 place-items-center bg-gradient-to-br from-[oklch(0.5_0.24_285)] to-[oklch(0.72_0.17_300)] text-white')}>
        <Heart className="size-5 fill-current" aria-hidden />
      </span>
    );
  }
  if (p.navidromeId && !failed) {
    return (
      <img
        src={getCoverArtUrl(`pl-${p.navidromeId}`, 120) ?? undefined}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(box, 'shrink-0 object-cover bg-muted')}
      />
    );
  }
  const hue = nameHue(p.name);
  return (
    <span
      className={cn(box, 'grid shrink-0 place-items-center text-white/90')}
      style={{ background: `linear-gradient(135deg, oklch(0.45 0.12 ${hue}), oklch(0.7 0.1 ${(hue + 40) % 360}))` }}
    >
      {p.smartPlaylistCriteria ? <Sparkles className="size-5" aria-hidden /> : <ListMusic className="size-5" aria-hidden />}
    </span>
  );
}

export function GlassHome() {
  const [filter, setFilter] = useState<Filter>('all');
  const [now] = useState(() => Date.now());

  const { data: stats } = useQuery<{ current: { totalPlays: number } }>({
    queryKey: ['listening-stats', 'week'],
    queryFn: async () => {
      const res = await fetch('/api/listening-history/stats?preset=week');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const response = await fetch('/api/playlists');
      if (!response.ok) return { playlists: [] };
      const json = await response.json();
      return json.data || { playlists: [] };
    },
  });

  const { data: mix } = useMixSong(FEATURED_MIX_ID);
  const playSong = useAudioStore((s) => s.playSong);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playlist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const currentSong = useMemo(() => playlist[currentSongIndex], [playlist, currentSongIndex]);


  const sorted: PlaylistRow[] = useMemo(() => {
    const list: PlaylistRow[] = playlistsData?.playlists ?? [];
    return [...list].sort((a, b) => {
      if (isLiked(a) !== isLiked(b)) return isLiked(a) ? -1 : 1;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    });
  }, [playlistsData]);

  const tiles = sorted.slice(0, 4);
  const listPlaylists =
    filter === 'all' ? sorted.slice(4)
      : filter === 'playlists' ? sorted
        : filter === 'new' ? sorted.filter((p) => updatedAgo(p.updatedAt, now))
          : [];
  const showMix = !!mix && (filter === 'all' || filter === 'mixes');
  const mixIsCurrent = !!mix && currentSong?.id === mix.id;

  const playMix = () => {
    if (!mix) return;
    if (mixIsCurrent) {
      setIsPlaying(!isPlaying);
      return;
    }
    playSong(mix.id, [{
      id: mix.id,
      name: mix.title,
      title: mix.title,
      artist: mix.artist,
      artistId: mix.artistId,
      album: mix.album,
      albumId: mix.albumId,
      url: `/api/navidrome/stream/${mix.id}`,
      duration: mix.duration,
      track: mix.track ?? 0,
    }]);
    setIsPlaying(true);
  };

  const day = DAYS[new Date(now).getDay()];
  const listTitle = { all: 'Recent', playlists: 'Playlists', mixes: 'Mixes', new: 'New this week' }[filter];

  return (
    <div className="glass-home relative min-h-[100dvh]">
      <GlassBackdrop />

      <div className="relative px-[18px] pt-[calc(env(safe-area-inset-top)+3.75rem)] pb-6">
        <header className="flex items-end justify-between pb-3">
          <div className="flex flex-col gap-1">
            {stats && (
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                {day} · {stats.current.totalPlays} PLAYS THIS WEEK
              </span>
            )}
            <h1 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.03em]">Home</h1>
          </div>
          <Link to="/library/search" aria-label="Search" className="glass-surface grid size-11 place-items-center rounded-full text-foreground">
            <Search className="size-[18px]" aria-hidden />
          </Link>
        </header>

        <div role="group" aria-label="Filter" className="flex gap-2 pb-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'h-[34px] rounded-full px-[15px] text-[13px] font-semibold transition-colors touch-manipulation',
                filter === f.id ? 'border border-foreground bg-foreground text-background' : 'glass-surface text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filter === 'all' && tiles.length > 0 && (
          <section aria-label="Jump back in" className="mb-5 grid grid-cols-2 gap-2">
            {tiles.map((p) => (
              <Link
                key={p.id}
                to="/playlists/$id"
                params={{ id: p.id }}
                className="glass-surface flex h-[54px] items-center gap-2.5 overflow-hidden rounded-[14px] pr-2.5 text-foreground"
              >
                <PlaylistArt p={p} size="tile" />
                <span className="truncate text-[13px] font-semibold">{isLiked(p) ? 'Liked Songs' : p.name}</span>
              </Link>
            ))}
          </section>
        )}

        <section aria-labelledby="glass-home-list">
          <h2 id="glass-home-list" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em]">{listTitle}</h2>
          <ul className="flex flex-col">
            {showMix && mix && (
              <li>
                <button
                  type="button"
                  onClick={playMix}
                  className="flex w-full items-center gap-3 rounded-xl px-1.5 py-[7px] text-left transition-colors active:bg-foreground/5"
                >
                  <img src={getCoverArtUrl(mix.albumId, 120) ?? undefined} alt="" className="size-12 shrink-0 rounded-full bg-muted object-cover" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{mixDisplayTitle(mix.title)}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      Mix · {Math.round(mix.duration / 60)} min{mix.album ? ` · ${mix.album}` : ''}
                    </span>
                  </span>
                  <Disc3 className={cn('size-5 shrink-0 text-primary', mixIsCurrent && isPlaying && 'motion-safe:animate-[spin_4s_linear_infinite]')} aria-hidden />
                </button>
              </li>
            )}
            {listPlaylists.map((p) => {
              const ago = updatedAgo(p.updatedAt, now);
              const kind = isLiked(p) ? 'Liked songs' : p.smartPlaylistCriteria ? 'Smart playlist' : 'Playlist';
              return (
                <li key={p.id}>
                  <Link
                    to="/playlists/$id"
                    params={{ id: p.id }}
                    className="flex items-center gap-3 rounded-xl px-1.5 py-[7px] text-foreground transition-colors active:bg-foreground/5"
                  >
                    <PlaylistArt p={p} size="row" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold">{isLiked(p) ? 'Liked Songs' : p.name}</span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {kind} · {songCount(p)}{ago ? ` · ${ago}` : ''}
                      </span>
                    </span>
                    {ago && <span aria-label="Updated this week" className="size-2 shrink-0 rounded-full bg-primary" />}
                  </Link>
                </li>
              );
            })}
            {!showMix && listPlaylists.length === 0 && (
              <li className="px-1.5 py-6 text-sm text-muted-foreground">
                {filter === 'new' ? 'No playlists changed this week.' : 'Nothing here yet.'}
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
