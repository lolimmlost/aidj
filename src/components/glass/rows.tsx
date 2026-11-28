import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { LazyArtistAvatar } from '@/components/library/ArtistsList';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types/song';

/**
 * Glass design building blocks shared by Search, artist and album pages and the Lab: album
 * covers, round artist avatars, two-line song rows with ⋯, album tiles and section headings.
 */

export type GlassArtist = { id: string; name: string; albumCount?: number; songCount?: number };

export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

/**
 * An album cover, or a tinted square when there's no art or it fails to load. `size` sets
 * width and height in px (else size it with className); `px` is the art resolution fetched.
 */
export function GlassCover({ albumId, size, px, className }: { albumId?: string; size?: number; px?: number; className?: string }) {
  const [broken, setBroken] = useState<string | undefined>();
  const url = albumId && broken !== albumId ? getCoverArtUrl(albumId, px ?? (size ? size * 2 : 160)) : null;
  const style = size ? { width: size, height: size } : undefined;
  return url ? (
    <img src={url} alt="" loading="lazy" onError={() => setBroken(albumId)} className={cn('shrink-0 bg-muted object-cover', className)} style={style} />
  ) : (
    <span className={cn('shrink-0 bg-gradient-to-br from-primary/40 to-primary/10', className)} style={style} />
  );
}

export function GlassArtistAvatar({ artist, image, size }: { artist: GlassArtist; image?: string; size: number }) {
  return (
    <span className="block shrink-0 overflow-hidden rounded-full bg-muted" style={{ width: size, height: size }}>
      <LazyArtistAvatar artistId={artist.id} name={artist.name} savedImageUrl={image} />
    </span>
  );
}

/** Artist and album tiles share one size and caption style. */
export const TILE = 120;
export const tileCaption = (title: string, sub: string) => (
  <span className="w-full min-w-0 text-left">
    <span className="block truncate text-[13px] font-semibold">{title}</span>
    <span className="block truncate text-xs text-muted-foreground">{sub}</span>
  </span>
);

/** A sideways strip that scrolls edge to edge, without a scrollbar. */
export const stripClass = '-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const rowClass =
  'flex min-h-[60px] w-full items-center gap-3 rounded-xl py-1.5 text-left transition-colors active:bg-foreground/5 [-webkit-tap-highlight-color:transparent]';

export function GlassSongRow({
  song, playing, onPlay, onMore, sub, cover = true,
}: { song: Song; playing: boolean; onPlay: () => void; onMore: () => void; /** replaces "Song · artist · 3:41" */ sub?: ReactNode; /** album pages: no cover per row */ cover?: boolean }) {
  const title = song.title || song.name || 'Unknown song';
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onPlay} className={cn(rowClass, 'min-w-0 flex-1')} aria-label={`Play ${title} by ${song.artist}`}>
        {cover && <GlassCover albumId={song.albumId} size={48} className="rounded-md" />}
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
          <GlassCover albumId={a.id} size={TILE} className="rounded-xl" />
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
    <div className={stripClass}>{albums.map((a) => tile(a, false))}</div>
  ) : (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">{albums.map((a) => tile(a, true))}</div>
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
