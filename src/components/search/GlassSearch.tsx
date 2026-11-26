import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Play, Search as SearchIcon, X } from 'lucide-react';
import { getSongsByIds } from '@/lib/services/navidrome';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { LazyArtistAvatar } from '@/components/library/ArtistsList';
import { SongActionSheet, type ActionSheetSong } from '@/components/glass/SongActionSheet';
import { useAudioStore } from '@/lib/stores/audio';
import { queryKeys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types/song';
import type { RecentEntry } from '@/lib/utils/recent-searches';

/**
 * Glass UI (phones) search pieces, matching the glass playlist page and Lab:
 * two-line rows with a type tag and ⋯ (the shared action sheet), a Top
 * result card, round artist avatars, and (empty box) recent searches as rows
 * plus a recently-played strip.
 */

export type GlassArtist = { id: string; name: string; albumCount?: number; songCount?: number };

export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

function Cover({ albumId, size = 48, className }: { albumId?: string; size?: number; className?: string }) {
  const url = albumId ? getCoverArtUrl(albumId, size * 2) : null;
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn('shrink-0 bg-muted object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn('shrink-0 bg-gradient-to-br from-primary/40 to-primary/10', className)} style={{ width: size, height: size }} />
  );
}

export function Avatar({ artist, image, size }: { artist: GlassArtist; image?: string; size: number }) {
  return (
    <span className="block shrink-0 overflow-hidden rounded-full bg-muted" style={{ width: size, height: size }}>
      <LazyArtistAvatar artistId={artist.id} name={artist.name} savedImageUrl={image} />
    </span>
  );
}

/** Artist and album tiles share one size and caption style. */
const TILE = 120;
const tileCaption = (title: string, sub: string) => (
  <span className="w-full min-w-0 text-left">
    <span className="block truncate text-[13px] font-semibold">{title}</span>
    <span className="block truncate text-xs text-muted-foreground">{sub}</span>
  </span>
);

const rowClass =
  'flex min-h-[60px] w-full items-center gap-3 rounded-xl py-1.5 text-left transition-colors active:bg-foreground/5 [-webkit-tap-highlight-color:transparent]';

export function GlassSongRow({
  song, playing, onPlay, onMore, sub, cover = true,
}: { song: Song; playing: boolean; onPlay: () => void; onMore: () => void; /** replaces "Song · artist · 3:41" */ sub?: ReactNode; /** album pages: no cover per row */ cover?: boolean }) {
  const title = song.title || song.name || 'Unknown song';
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onPlay} className={cn(rowClass, 'min-w-0 flex-1')} aria-label={`Play ${title} by ${song.artist}`}>
        {cover && <Cover albumId={song.albumId} className="rounded-md" />}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-semibold', playing && 'text-primary')}>{title}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {sub ?? (
              <>
                Song · {song.artist || 'Unknown artist'}
                {song.duration ? ` · ${fmt(song.duration)}` : ''}
              </>
            )}
          </span>
        </span>
      </button>
      <button type="button" onClick={onMore} aria-label={`More for ${title}`} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground">
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

/** Spotify-style "Top result": an exact artist match, else the first song. */
export function GlassTopResult({
  artist, song, artistImage, onPlaySong, onOpenArtist,
}: {
  artist?: GlassArtist;
  song?: Song;
  artistImage?: string;
  onPlaySong: (song: Song) => void;
  onOpenArtist: (artist: GlassArtist) => void;
}) {
  if (!artist && !song) return null;
  return (
    <section aria-labelledby="glass-top-result" className="space-y-2">
      <h2 id="glass-top-result" className="font-display text-[17px] font-bold">Top result</h2>
      <div className="glass-surface relative flex items-center gap-4 rounded-[20px] p-4">
        {artist ? (
          <Link
            to="/library/artists/$id"
            params={{ id: artist.id }}
            onClick={() => onOpenArtist(artist)}
            className="flex min-w-0 flex-1 items-center gap-4 [-webkit-tap-highlight-color:transparent]"
          >
            <Avatar artist={artist} image={artistImage} size={84} />
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{artist.name}</span>
              <span className="mt-1 inline-block rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold">Artist</span>
              {artist.albumCount ? <span className="ml-2 text-xs text-muted-foreground">{artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}</span> : null}
            </span>
          </Link>
        ) : (
          song && (
            <>
              <Cover albumId={song.albumId} size={84} className="rounded-lg shadow-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-xl font-extrabold tracking-[-0.02em]">{song.title || song.name}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-foreground">Song</span>
                  <span className="truncate">{song.artist}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => onPlaySong(song)}
                aria-label={`Play ${song.title || song.name}`}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
              >
                <Play className="ml-0.5 size-5 fill-current" />
              </button>
            </>
          )
        )}
      </div>
    </section>
  );
}

/** Round avatars in a sideways strip (All tab). */
export function GlassArtistStrip({
  artists, images, onOpen,
}: { artists: GlassArtist[]; images: Record<string, string>; onOpen: (a: GlassArtist) => void }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {artists.map((a) => (
        <Link
          key={a.id}
          to="/library/artists/$id"
          params={{ id: a.id }}
          onClick={() => onOpen(a)}
          className="flex shrink-0 flex-col gap-2 [-webkit-tap-highlight-color:transparent]"
          style={{ width: TILE }}
        >
          <Avatar artist={a} image={images[a.name.toLowerCase()]} size={TILE} />
          {tileCaption(a.name, 'Artist')}
        </Link>
      ))}
    </div>
  );
}

export type GlassAlbum = { id: string; name: string; artist: string; artistId?: string; /** second caption line; default: the album artist */ sub?: string };

/** Albums as square tiles matching the artist strip: a sideways strip (All) or a 2-up grid (Albums tab). */
export function GlassAlbums({
  albums, layout, onOpen,
}: { albums: GlassAlbum[]; layout: 'strip' | 'grid'; onOpen: (a: GlassAlbum) => void }) {
  const tile = (a: GlassAlbum, grid: boolean) => {
    const inner = (
      <>
        {grid ? (
          <span className="block aspect-square w-full overflow-hidden rounded-xl bg-muted">
            {getCoverArtUrl(a.id, 320) ? <img src={getCoverArtUrl(a.id, 320) ?? undefined} alt="" loading="lazy" className="size-full object-cover" /> : null}
          </span>
        ) : (
          <Cover albumId={a.id} size={TILE} className="rounded-xl" />
        )}
        {tileCaption(a.name, a.sub ?? a.artist)}
      </>
    );
    const cls = cn('flex flex-col gap-2 [-webkit-tap-highlight-color:transparent]', !grid && 'shrink-0');
    const style = grid ? undefined : { width: TILE };
    return a.artistId ? (
      <Link key={a.id} to="/library/artists/$id/albums/$albumId" params={{ id: a.artistId, albumId: a.id }} onClick={() => onOpen(a)} className={cls} style={style}>
        {inner}
      </Link>
    ) : (
      <span key={a.id} className={cls} style={style}>
        {inner}
      </span>
    );
  };
  return layout === 'strip' ? (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{albums.map((a) => tile(a, false))}</div>
  ) : (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">{albums.map((a) => tile(a, true))}</div>
  );
}

/** One artist per row (Artists tab). */
export function GlassArtistRows({
  artists, images, onOpen,
}: { artists: GlassArtist[]; images: Record<string, string>; onOpen: (a: GlassArtist) => void }) {
  return (
    <div className="flex flex-col">
      {artists.map((a) => (
        <Link
          key={a.id}
          to="/library/artists/$id"
          params={{ id: a.id }}
          onClick={() => onOpen(a)}
          className={cn(rowClass, 'min-h-0')}
        >
          <Avatar artist={a} image={images[a.name.toLowerCase()]} size={52} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{a.name}</span>
            <span className="block truncate text-[13px] text-muted-foreground">
              Artist{a.albumCount ? ` · ${a.albumCount} album${a.albumCount === 1 ? '' : 's'}` : ''}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Section heading, flush with the content's left edge (no inset), the same in
 * Search and the Lab. With `count` it shows "See all N" when the section shows
 * fewer than `count` (onSeeAll), otherwise the plain count.
 */
export function GlassSectionHead({
  title, action, count, shown, onSeeAll,
}: { title: string; action?: ReactNode; count?: number; shown?: number; onSeeAll?: () => void }) {
  if (action === undefined && count !== undefined) {
    action =
      onSeeAll && shown !== undefined && count > shown ? (
        <button type="button" onClick={onSeeAll} className="text-[13px] font-semibold text-primary">
          See all {count}
        </button>
      ) : (
        <span className="text-[13px] text-muted-foreground">{count}</span>
      );
  }
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-[17px] font-bold">{title}</h2>
      {action}
    </div>
  );
}

/** Recent searches as rows: thumbnail, name, type tag, ×. */
export function GlassRecent({
  recent, images, onOpen, onRemove, onClear,
}: {
  recent: RecentEntry[];
  images: Record<string, string>;
  onOpen: (e: RecentEntry) => void;
  onRemove: (e: RecentEntry) => void;
  onClear: () => void;
}) {
  if (!recent.length) return null;
  return (
    <section className="space-y-1">
      <GlassSectionHead
        title="Recent searches"
        action={
          <button type="button" onClick={onClear} className="text-[13px] font-semibold text-muted-foreground">
            Clear all
          </button>
        }
      />
      <div className="flex flex-col">
        {recent.map((e) => {
          const key = e.kind === 'query' ? `q:${e.term}` : e.kind === 'song' ? `s:${e.song.id}` : `${e.kind}:${e.id}`;
          const label = e.kind === 'query' ? e.term : e.kind === 'song' ? e.song.title || e.song.name || 'Song' : e.name;
          const sub =
            e.kind === 'query' ? 'Search' : e.kind === 'song' ? `Song · ${e.song.artist}` : e.kind === 'album' ? `Album · ${e.artist}` : 'Artist';
          return (
            <div key={key} className="flex items-center gap-1">
              <button type="button" onClick={() => onOpen(e)} className={cn(rowClass, 'min-w-0 flex-1')}>
                {e.kind === 'query' ? (
                  <span className="grid size-12 shrink-0 place-items-center rounded-md bg-foreground/10">
                    <SearchIcon className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                ) : e.kind === 'artist' ? (
                  <Avatar artist={{ id: e.id, name: e.name }} image={images[e.name.toLowerCase()]} size={48} />
                ) : (
                  <Cover albumId={e.kind === 'song' ? e.song.albumId : e.id} className="rounded-md" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{label}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
                </span>
              </button>
              <button type="button" onClick={() => onRemove(e)} aria-label={`Remove ${label}`} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Empty box (canvas AJ): recently played as a sideways strip of covers under
 * the recent searches. Only rendered with an empty box, so typing gives the
 * results the whole screen.
 */
export function GlassRecentlyPlayed({ onPlay }: { onPlay: (song: Song) => void }) {
  const { data: songs = [] } = useQuery({
    queryKey: ['listening-history', 'recent', 'songs', 12],
    queryFn: async (): Promise<Song[]> => {
      const res = await fetch('/api/listening-history/recent?limit=12');
      if (!res.ok) return [];
      const { history = [] } = (await res.json()) as { history?: { songId: string }[] };
      const ids = history.map((h) => h.songId);
      if (!ids.length) return [];
      // full songs (cover, duration, stream url) in play order; ones gone from the library drop out
      // Navidrome's native API returns `title`, not the Subsonic `name` the player and scrobbles read
      const byId = new Map((await getSongsByIds(ids)).map((s): [string, Song] => [s.id, { ...s, name: s.name || s.title || '', title: s.title || s.name }]));
      return ids.map((id) => byId.get(id)).filter((s): s is Song => !!s);
    },
    staleTime: 60_000,
  });
  if (!songs.length) return null;
  return (
    <section className="space-y-2.5">
      <GlassSectionHead title="Recently played" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {songs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPlay(s)}
            aria-label={`Play ${s.title || s.name} by ${s.artist}`}
            className="flex w-[104px] shrink-0 flex-col gap-1.5 text-left [-webkit-tap-highlight-color:transparent]"
          >
            <Cover albumId={s.albumId} size={104} className="rounded-[10px]" />
            <span className="w-full truncate text-xs font-semibold">{s.title || s.name}</span>
            <span className="-mt-1.5 w-full truncate text-[11px] text-muted-foreground">{s.artist}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The ⋯ sheet for search results: play next, queue, add to playlist, like
 * (the library star, same as the player heart), radio, go to artist/album.
 */
export function useGlassSongSheet(likedIds: string[] | undefined) {
  const [sheet, setSheet] = useState<Song | null>(null);
  const queryClient = useQueryClient();
  const addToQueueNext = useAudioStore((s) => s.addToQueueNext);
  const addToQueueEnd = useAudioStore((s) => s.addToQueueEnd);
  const startRadio = useAudioStore((s) => s.startRadio);
  const setAIUserActionInProgress = useAudioStore((s) => s.setAIUserActionInProgress);
  const liked = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  const toQueue = (song: Song) => ({
    ...song,
    title: song.title || song.name || '',
    name: song.name || song.title || '',
    url: song.url || `/api/navidrome/stream/${song.id}`,
  });
  const queue = (song: Song, where: 'next' | 'end') => {
    setAIUserActionInProgress(true);
    if (where === 'next') addToQueueNext([toQueue(song)]);
    else addToQueueEnd([toQueue(song)]);
    toast.success(where === 'next' ? `“${song.title || song.name}” plays next` : `Added “${song.title || song.name}” to the queue`);
    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };
  const toggleLike = async (id: string, star: boolean) => {
    // flip the heart right away in every cached feedback list ({ liked: string[] }); the refetch confirms
    queryClient.setQueriesData({ queryKey: queryKeys.feedback.all() }, (old: unknown) => {
      const o = old as { liked?: string[] } | undefined;
      if (!o || !Array.isArray(o.liked)) return old;
      const liked = o.liked.filter((x) => x !== id);
      return { ...o, liked: star ? [...liked, id] : liked };
    });
    try {
      const res = await fetch(`/api/navidrome/star?id=${id}`, { method: star ? 'POST' : 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(star ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      toast.error('Couldn’t update Liked Songs');
    } finally {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    }
  };

  const sheetSong: ActionSheetSong | null = sheet
    ? {
        songId: sheet.id,
        title: sheet.title || sheet.name || 'Unknown song',
        artist: sheet.artist || 'Unknown artist',
        albumId: sheet.albumId,
        artistId: sheet.artistId,
        starred: liked.has(sheet.id),
      }
    : null;

  const element = (
    <SongActionSheet
      song={sheetSong}
      onOpenChange={(o) => {
        if (!o) setSheet(null);
      }}
      onPlayNext={() => sheet && queue(sheet, 'next')}
      onAddToQueue={() => sheet && queue(sheet, 'end')}
      onToggleLike={(s) => void toggleLike(s.songId, !s.starred)}
      onStartRadio={(s) => void startRadio({ kind: 'song', songId: s.songId })}
    />
  );
  return { open: setSheet, element };
}
