import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, X } from 'lucide-react';
import { GlassBackdrop } from '@/components/glass/GlassBackdrop';
import { AlphabetRail, letterOf } from '@/components/glass/AlphabetRail';
import { getArtists } from '@/lib/services/navidrome';
import { getArtistGradient, getArtistInitials } from '@/lib/utils/artist-avatar';
import { cn } from '@/lib/utils';

type Artist = { id: string; name: string; albumCount?: number; songCount?: number };
type Sort = 'az' | 'albums' | 'songs';
type Item = { kind: 'head'; letter: string } | { kind: 'artist'; artist: Artist };

const SORTS: { id: Sort; label: string }[] = [
  { id: 'az', label: 'A–Z' },
  { id: 'albums', label: 'Most albums' },
  { id: 'songs', label: 'Most songs' },
];
const ROW_H = 64;
const HEAD_H = 40;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** "The Blush Tribe" files under B, like every music app. */
const sortName = (name: string) => name.replace(/^the\s+/i, '');

function Avatar({ name, url }: { name: string; url?: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="size-12 shrink-0 rounded-full bg-foreground/10 object-cover" />;
  }
  return (
    <span className={cn('grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br', getArtistGradient(name))}>
      <span className="text-sm font-black text-white/90">{getArtistInitials(name)}</span>
    </span>
  );
}

/**
 * Glass UI (phones): Artists as an A–Z list. Round 48 px avatars, a find
 * field, letter sections with an index rail, or Most albums / Most songs.
 * Virtualized against the app scroller, since libraries run to thousands.
 */
export function GlassArtistsList() {
  const [sort, setSort] = useState<Sort>('az');
  const [query, setQuery] = useState('');

  const { data: artists = [], isLoading, error } = useQuery({
    queryKey: ['artists'],
    queryFn: () => getArtists(0, 10000),
    staleTime: 5 * 60 * 1000,
  });
  const { data: images = {} } = useQuery({
    queryKey: ['all-artist-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/all-artist-images');
      if (!res.ok) return {};
      return ((await res.json()).data?.images || {}) as Record<string, string>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Ghost artists (tag residue with no albums or songs) are left out.
  const real = useMemo(
    () => (artists as Artist[]).filter((a) => (a.albumCount ?? 0) > 0 || (a.songCount ?? 0) > 0),
    [artists],
  );

  const q = query.trim().toLowerCase();
  const items = useMemo((): Item[] => {
    let list = q ? real.filter((a) => a.name.toLowerCase().includes(q)) : real;
    if (sort === 'albums') list = [...list].sort((a, b) => (b.albumCount ?? 0) - (a.albumCount ?? 0) || a.name.localeCompare(b.name));
    else if (sort === 'songs') list = [...list].sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0) || a.name.localeCompare(b.name));
    else {
      // Letters first, then everything else under '#', like the iOS index.
      list = [...list].sort((a, b) => {
        const la = letterOf(sortName(a.name)) === '#';
        const lb = letterOf(sortName(b.name)) === '#';
        if (la !== lb) return la ? 1 : -1;
        return sortName(a.name).localeCompare(sortName(b.name), undefined, { sensitivity: 'base' });
      });
    }
    if (sort !== 'az') return list.map((artist) => ({ kind: 'artist', artist }));
    const out: Item[] = [];
    let last = '';
    for (const artist of list) {
      const l = letterOf(sortName(artist.name)) || '#';
      if (l !== last) {
        out.push({ kind: 'head', letter: l });
        last = l;
      }
      out.push({ kind: 'artist', artist });
    }
    return out;
  }, [real, q, sort]);

  const letters = useMemo(() => new Set(items.flatMap((i) => (i.kind === 'head' ? [i.letter] : []))), [items]);
  const shownCount = items.filter((i) => i.kind === 'artist').length;

  // Virtualize against the app shell's scroller (the Radix ScrollArea
  // viewport in AppLayout), same as the playlist page.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const viewport = list.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
    setScrollEl(viewport);
    if (!viewport) return;
    const measure = () => {
      const offset = list.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      setScrollMargin((prev) => (Math.abs(prev - offset) > 0.5 ? offset : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => (items[i].kind === 'head' ? HEAD_H : ROW_H),
    overscan: 10,
    scrollMargin,
    getItemKey: (i) => {
      const it = items[i];
      return it.kind === 'head' ? `h-${it.letter}` : it.artist.id;
    },
  });

  const jump = (letter: string) => {
    const idx = items.findIndex((i) => i.kind === 'head' && i.letter === letter);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'start' });
  };

  return (
    <div className="glass-page glass-home relative min-h-screen bg-background md:bg-transparent pb-6">
      <GlassBackdrop className="md:hidden" />
      <div className="relative mx-auto w-full max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+var(--top-bar)+0.5rem)] md:px-8 md:pt-8">
        <h1 className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.03em]">Artists</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {isLoading ? 'Loading…' : q ? `${shownCount} of ${real.length}` : `${real.length} in your library`}
        </p>

        <label className="glass-flat mt-4 flex h-11 items-center gap-2.5 rounded-xl px-3">
          <Search className="size-[18px] shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an artist"
            aria-label="Find an artist"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-foreground/70"
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="grid size-6 place-items-center rounded-full text-muted-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <div role="tablist" aria-label="Order" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                'h-9 shrink-0 rounded-full px-4 text-sm font-semibold [-webkit-tap-highlight-color:transparent]',
                sort === s.id ? 'border border-foreground bg-foreground text-background' : 'glass-surface text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error != null && <p className="py-10 text-center text-sm text-destructive">Couldn’t load artists.</p>}
        {isLoading && (
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <span className="size-12 animate-pulse rounded-full bg-foreground/10" />
                <span className="h-4 w-40 animate-pulse rounded bg-foreground/10" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && error == null && shownCount === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">{q ? 'No artist matches.' : 'No artists yet.'}</p>
        )}

        <div ref={listRef} className="relative mt-2 w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vr) => {
            const it = items[vr.index];
            return (
              <div
                key={vr.key}
                data-index={vr.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${vr.start - virtualizer.options.scrollMargin}px)` }}
              >
                {it.kind === 'head' ? (
                  <div className="flex h-10 items-end pb-1 font-display text-[17px] font-bold">{it.letter}</div>
                ) : (
                  <Link
                    to="/library/artists/$id"
                    params={{ id: it.artist.id }}
                    // pr-6 keeps names clear of the letter rail
                    className={cn('flex h-16 items-center gap-3 [-webkit-tap-highlight-color:transparent] active:opacity-70', sort === 'az' && 'pr-6')}
                  >
                    <Avatar name={it.artist.name} url={images[it.artist.name.toLowerCase()]} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{it.artist.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {[
                          it.artist.albumCount ? plural(it.artist.albumCount, 'album') : null,
                          it.artist.songCount ? plural(it.artist.songCount, 'song') : null,
                        ].filter(Boolean).join(' · ') || 'Artist'}
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {sort === 'az' && !q && shownCount >= 20 && <AlphabetRail availableLetters={letters} onLetterSelect={jump} />}
    </div>
  );
}
