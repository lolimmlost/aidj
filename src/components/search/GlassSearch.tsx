import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, Search as SearchIcon, X } from 'lucide-react';
import { getSongsByIds } from '@/lib/services/navidrome';
import { GlassArtistAvatar, GlassCover, GlassSectionHead, TILE, rowClass, stripClass, tileCaption, type GlassArtist } from '@/components/glass/rows';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types/song';
import type { RecentEntry } from '@/lib/utils/recent-searches';

/**
 * Glass search pieces: the Top result card, artist strips and rows, and (empty box) recent
 * searches as rows plus a recently-played strip. Rows, covers and the ⋯ sheet are shared
 * (glass/rows, glass/useGlassSongSheet).
 */

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
            <GlassArtistAvatar artist={artist} image={artistImage} size={84} />
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{artist.name}</span>
              <span className="mt-1 inline-block rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold">Artist</span>
              {artist.albumCount ? <span className="ml-2 text-xs text-muted-foreground">{artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}</span> : null}
            </span>
          </Link>
        ) : (
          song && (
            <>
              <GlassCover albumId={song.albumId} size={84} className="rounded-lg shadow-lg" />
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
    <div className={stripClass}>
      {artists.map((a) => (
        <Link
          key={a.id}
          to="/library/artists/$id"
          params={{ id: a.id }}
          onClick={() => onOpen(a)}
          className="flex shrink-0 flex-col gap-2 [-webkit-tap-highlight-color:transparent]"
          style={{ width: TILE }}
        >
          <GlassArtistAvatar artist={a} image={images[a.name.toLowerCase()]} size={TILE} />
          {tileCaption(a.name, 'Artist')}
        </Link>
      ))}
    </div>
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
          <GlassArtistAvatar artist={a} image={images[a.name.toLowerCase()]} size={52} />
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
                  <GlassArtistAvatar artist={{ id: e.id, name: e.name }} image={images[e.name.toLowerCase()]} size={48} />
                ) : (
                  <GlassCover albumId={e.kind === 'song' ? e.song.albumId : e.id} size={48} className="rounded-md" />
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
      <div className={stripClass}>
        {songs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPlay(s)}
            aria-label={`Play ${s.title || s.name} by ${s.artist}`}
            className="flex w-[104px] shrink-0 flex-col gap-1.5 text-left [-webkit-tap-highlight-color:transparent]"
          >
            <GlassCover albumId={s.albumId} size={104} className="rounded-[10px]" />
            <span className="w-full truncate text-xs font-semibold">{s.title || s.name}</span>
            <span className="-mt-1.5 w-full truncate text-[11px] text-muted-foreground">{s.artist}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
