import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ListPlus, Lock, Star } from 'lucide-react';
import type { KnownTransition } from '@/lib/db/schema/known-transitions.schema';
import { fitOctave, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { MAX_STRETCH, type LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';
import { exitsFrom, landsTake, takeLabel, takeOf } from '@/lib/dj-lab/known-takes';
import { labLog } from '@/lib/dj-lab/log';
import { canonicalNavidromeId } from '@/lib/utils/navidrome-id';
import { cn } from '@/lib/utils';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { ROLE_META } from './transition-meta';

type Pool = { song: LabSong; analysis: TrackAnalysis }[];

/** Your known transitions book (shares the DJ tab's cache). Refreshed after each set by the review/import. */
export function useKnownBook() {
  return useQuery({
    queryKey: ['known-transitions'],
    queryFn: async () => {
      const res = await fetch('/api/dj/known-transitions');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()).data as KnownTransition[];
    },
    staleTime: 60_000,
  });
}

/** The known row for the pair playing now → locked next, if any. */
export function useKnownPair(fromId: string | undefined, toId: string | undefined) {
  const { data } = useKnownBook();
  return useMemo(() => {
    if (!fromId || !toId || !data) return undefined;
    const from = canonicalNavidromeId(fromId);
    const to = canonicalNavidromeId(toId);
    return data.find((r) => r.fromSongId === from && r.toSongId === to);
  }, [data, fromId, toId]);
}

const Chip = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-full border border-foreground/15 px-1.5 font-mono text-[10px] tracking-[0.04em] text-muted-foreground', className)}>
    {children}
  </span>
);

/**
 * B's tempo at the octave it mixes at, and how far it stretches to the set tempo (%), or a tempo jump when
 * it's past the stretch limit (the way the engine decides at lock).
 */
function tempoOf(a: TrackAnalysis, setBpm: number) {
  const bpm = fitOctave(a, setBpm).bpm;
  const stretch = setBpm / bpm - 1;
  return { bpm, pct: stretch * 100, jump: Math.abs(stretch) > MAX_STRETCH };
}

/** Whether the locked plan landed on your take: "✓ your take" or where it moved to. */
export function TakeLine({ row, plan }: { row: KnownTransition | undefined; plan: { kind: string; N: number; entryA: number; cueB: number } | undefined }) {
  const take = takeOf(row);
  if (!row || !take) return null;
  if (!plan) return <Chip className="border-amber-400/50 text-amber-400">★ YOUR TAKE · {takeLabel(take)}</Chip>;
  return landsTake(plan as Parameters<typeof landsTake>[0], take) ? (
    <Chip className="border-amber-400/50 text-amber-400">
      <Check className="mr-0.5 size-3" /> YOUR TAKE · {takeLabel(take)}
    </Chip>
  ) : (
    <Chip className="border-warning/50 text-warning" >
      TAKE MOVED · {takeLabel({ kind: plan.kind, bars: plan.N, entryA: plan.entryA, cueB: plan.cueB })} (YOURS {takeLabel(take)})
    </Chip>
  );
}

/**
 * Set prep "Next up": the transitions you've mixed out of the playing song, proven first. Locking one
 * mixes it with your picked take (the engine's known-take recipe); needs work ones get the rules again.
 */
export function KnownExits({ engine, snap, pool, className }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool; className?: string }) {
  const { data: book } = useKnownBook();
  const now = snap.now;
  const next = snap.next;
  const exits = useMemo(() => (now && book ? exitsFrom(book, now.song.id) : []), [book, now]);
  const bySong = useMemo(() => new Map(pool.map((p) => [canonicalNavidromeId(p.song.id), p])), [pool]);
  const played = useMemo(() => new Set(snap.history.map((h) => canonicalNavidromeId(h.song.id))), [snap.history]);
  const queued = useMemo(() => new Set(snap.queue.map((q) => canonicalNavidromeId(q.id))), [snap.queue]);
  if (!now || !exits.length) return null;
  const frozen = next?.state === 'committed' || next?.state === 'mixing';
  const proven = exits.filter((r) => r.status === 'proven').length;

  return (
    <section aria-labelledby="lab-known-exits" className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="lab-known-exits" className="font-display text-[17px] font-bold">
          Your exits
        </h2>
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
          {proven ? `${proven} PROVEN · ` : ''}
          {exits.length} KNOWN
        </span>
      </div>
      <ul className="glass-flat divide-y divide-foreground/10 overflow-hidden rounded-2xl">
        {exits.map((r) => {
          const entry = bySong.get(r.toSongId);
          const song = entry?.song;
          const tempo = entry ? tempoOf(entry.analysis, snap.setBpm) : null;
          const isNext = !!next && canonicalNavidromeId(next.song.id) === r.toSongId;
          const done = played.has(r.toSongId);
          const inQueue = queued.has(r.toSongId);
          const take = takeOf(r);
          const shown = take ?? r.techniques[0];
          const lock = () => {
            if (!song) return;
            labLog('known exit lock', { song: `${song.artist} – ${song.title}`, status: r.status, take: take ? takeLabel(take) : undefined });
            void engine.lock(song);
          };
          return (
            <li key={r.id} className={cn('flex items-center gap-2.5 px-2.5 py-2', (done || !song) && 'opacity-50')}>
              <span className="relative shrink-0">
                <img src={getCoverArtUrl(r.toSongId, 96) ?? undefined} alt="" loading="lazy" className="size-11 rounded-lg bg-foreground/10 object-cover" />
                {r.status === 'proven' && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-400 text-black">
                    <Star className="size-2.5 fill-current" aria-label="Proven" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{r.toTitle}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{r.toArtist}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {shown && <Chip className={take ? 'border-amber-400/50 text-amber-400' : undefined}>{take ? '★ ' : ''}{takeLabel(shown)}</Chip>}
                  {r.role && <Chip className={ROLE_META[r.role].cls}>{ROLE_META[r.role].label.toUpperCase()}</Chip>}
                  {r.status === 'needs_work' && <Chip className="border-rose-400/50 text-rose-300">NEEDS WORK</Chip>}
                  {tempo && (
                    <Chip className={tempo.jump ? 'border-warning/50 text-warning' : Math.abs(tempo.pct) <= 2 ? 'border-success/40 text-success' : undefined}>
                      {tempo.bpm.toFixed(1)} BPM · {tempo.jump ? 'JUMP' : `${tempo.pct >= 0 ? '+' : ''}${tempo.pct.toFixed(1)}%`}
                    </Chip>
                  )}
                  {r.setBpm != null && Math.abs(r.setBpm - snap.setBpm) >= 0.5 && <Chip>MIXED AT {Math.round(r.setBpm * 10) / 10}</Chip>}
                  <Chip>{r.plays}×</Chip>
                  {done && <Chip>PLAYED</Chip>}
                  {!song && <Chip>NOT IN CRATE</Chip>}
                </span>
              </span>
              {song && !done && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isNext || inQueue}
                    onClick={() => engine.enqueue([song])}
                    aria-label={`Queue ${r.toTitle}`}
                    className="grid size-9 place-items-center rounded-full text-muted-foreground disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                  >
                    <ListPlus className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={frozen || isNext || next?.state === 'loading'}
                    onClick={lock}
                    aria-label={isNext ? `${r.toTitle} is locked` : `Lock ${r.toTitle}${take ? ' with your take' : ''}`}
                    className={cn(
                      'flex h-9 items-center gap-1 rounded-full px-3 text-[12px] font-semibold disabled:opacity-60 [-webkit-tap-highlight-color:transparent]',
                      isNext ? 'bg-success/20 text-success' : take ? 'bg-amber-400 text-black' : 'border border-foreground/20',
                    )}
                  >
                    {isNext ? <Check className="size-3.5" /> : <Lock className="size-3.5" />}
                    {isNext ? 'Locked' : next && next.state !== 'failed' ? 'Swap' : 'Lock'}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
