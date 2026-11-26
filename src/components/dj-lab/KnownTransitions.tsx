import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, Loader2, RefreshCw, Search, Star, X } from 'lucide-react';
import { GlassSheet, SheetLabel } from '@/components/glass/GlassSheet';
import { getCoverArtUrl } from '@/components/ui/album-art';
import type { KnownTechniquePick, KnownTransition, TransitionRole, TransitionStatus } from '@/lib/db/schema/known-transitions.schema';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { SavedSet } from '@/lib/dj-lab/sets';
import { SetReview } from './SetReview';
import { ROLE_META, ROLES, STATUS_META } from './transition-meta';

/** Role chips: what a pair does to the night. Colours match the Set prep canvas. */
type Filter = 'all' | 'untagged' | 'proven' | 'needs_work' | TransitionRole;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'untagged', label: 'Untagged' },
  { id: 'proven', label: 'Proven' },
  { id: 'needs_work', label: 'Needs work' },
  ...ROLES.map((r) => ({ id: r as Filter, label: ROLE_META[r].label })),
];

const techLabel = (t: { kind: string; bars: number }) => `${t.kind} ${t.bars}`.toUpperCase();
const sameTake = (a: KnownTechniquePick | null | undefined, b: KnownTechniquePick) =>
  !!a && a.kind === b.kind && a.bars === b.bars && a.entryA === b.entryA && a.cueB === b.cueB;
const Mono = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-full border border-foreground/15 px-1.5 font-mono text-[10px] tracking-[0.04em] text-muted-foreground', className)}>
    {children}
  </span>
);

function Cover({ id }: { id: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <span className="size-10 shrink-0 rounded-md bg-foreground/10" />
  ) : (
    <img src={getCoverArtUrl(id, 96) ?? undefined} alt="" loading="lazy" onError={() => setBroken(true)} className="size-10 shrink-0 rounded-md bg-foreground/10 object-cover" />
  );
}

/** One pair: both covers, plays, your pick (or the top take), role and status. `thisSet` = the take a set played. */
function PairRow({ r, onOpen, thisSet }: { r: KnownTransition; onOpen: () => void; thisSet?: KnownTechniquePick }) {
  const top = r.preferred ?? r.techniques[0];
  const shown = thisSet ?? top;
  const starred = thisSet ? sameTake(r.preferred, thisSet) : !!r.preferred;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-2 text-left [-webkit-tap-highlight-color:transparent] active:opacity-70"
    >
      <span className="relative flex shrink-0">
        <Cover id={r.fromSongId} />
        <span className="-ml-3 mt-3 rounded-md ring-2 ring-background"><Cover id={r.toSongId} /></span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{r.fromTitle}</span>
        <span className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{r.toTitle}</span>
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Mono className="border-amber-400/50 text-amber-400">{r.plays}×</Mono>
          {shown && <Mono className={starred ? 'border-primary/60 text-primary' : undefined}>{starred ? '★ ' : ''}{techLabel(shown)}</Mono>}
          {r.role ? <Mono className={ROLE_META[r.role].cls}>{ROLE_META[r.role].label.toUpperCase()}</Mono> : <Mono>TAG IT</Mono>}
          {r.status === 'proven' && <Mono className="border-amber-400/50 text-amber-400">★ PROVEN</Mono>}
          {r.status === 'needs_work' && <Mono className="border-rose-400/50 text-rose-300">NEEDS WORK</Mono>}
        </span>
      </span>
    </button>
  );
}

/** "Today 6:40 PM", "Yesterday 9:04 PM", "Mon, Nov 24 9:04 PM" */
function shortWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}

/** A set's transitions in play order: the newest set up front, chips for the earlier ones. */
function SetsView({
  sets,
  loading,
  byPair,
  onOpen,
  onReview,
}: {
  sets: SavedSet[];
  loading: boolean;
  byPair: Map<string, KnownTransition>;
  onOpen: (id: string) => void;
  onReview: (s: SavedSet) => void;
}) {
  const [setId, setSetId] = useState<string | null>(null);
  const set = sets.find((x) => x.id === setId) ?? sets[0];
  if (loading) return <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />;
  if (!set) return <p className="py-10 text-center text-sm text-muted-foreground">No saved Lab sets yet.</p>;
  const steps = set.tracks.slice(1).map((b, i) => ({ a: set.tracks[i], b }));
  const proven = steps.filter((st) => byPair.get(`${st.a.id}>${st.b.id}`)?.status === 'proven').length;
  return (
    <>
      <div role="tablist" aria-label="Set" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sets.map((x) => {
          const on = x.id === set.id;
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSetId(x.id)}
              className={cn(
                'flex h-12 shrink-0 flex-col items-start justify-center rounded-2xl px-3.5 text-left [-webkit-tap-highlight-color:transparent]',
                on ? 'border border-foreground bg-foreground text-background' : 'glass-surface text-foreground',
              )}
            >
              <span className="text-[13px] font-semibold leading-tight">{shortWhen(x.startedAt)}</span>
              <span className="font-mono text-[10px] leading-tight opacity-70">{x.tracks.length} SONGS</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
          {steps.length} TRANSITIONS · {proven} PROVEN{set.setBpm ? ` · ${Math.round(set.setBpm)} BPM` : ''}
        </p>
        <button
          type="button"
          onClick={() => onReview(set)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground [-webkit-tap-highlight-color:transparent]"
        >
          <ClipboardCheck className="size-4" /> Review
        </button>
      </div>

      <ol className="mt-1">
        {steps.map(({ a, b }, i) => {
          const r = byPair.get(`${a.id}>${b.id}`);
          const take = b.kind && b.bars != null ? { kind: b.kind, bars: b.bars, entryA: b.cues?.entryA ?? null, cueB: b.cues?.cueB ?? null } : undefined;
          return (
            <li key={`${i}-${b.id}`} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                {r ? (
                  <PairRow r={r} onOpen={() => onOpen(r.id)} thisSet={take} />
                ) : (
                  <span className="block py-2">
                    <span className="block truncate text-[15px] font-semibold">{a.title}</span>
                    <span className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{b.title}</span>
                      <span className="ml-1 shrink-0 font-mono text-[10px]">· NOT SYNCED YET</span>
                    </span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * DJ tab: the known transitions book. Pairs come from the saved Lab sets (technique, bars, cue bars,
 * beat-matched tempo); the DJ tags each with a role and marks it proven or an idea. Set prep builds on it.
 */
export function KnownTransitions({ canImport }: { canImport: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reviewSet, setReviewSet] = useState<SavedSet | null>(null);
  // your sets in play order, newest up front, unless you ask for the whole book (sets are admin-only, like the Lab)
  const [viewPick, setViewPick] = useState<'sets' | 'all'>('sets');
  const view = canImport ? viewPick : 'all';
  const sets = useQuery({
    queryKey: ['lab-sets'],
    enabled: canImport,
    queryFn: async () => {
      const res = await fetch('/api/dj/lab-sets');
      if (!res.ok) throw new Error('Failed to load sets');
      return (await res.json()).data as SavedSet[];
    },
    staleTime: 60_000,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['known-transitions'],
    queryFn: async () => {
      const res = await fetch('/api/dj/known-transitions');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()).data as KnownTransition[];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dj/known-transitions/import', { method: 'POST' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Only admins can import Lab sets' : 'Import failed');
      return (await res.json()).data as { sets: number; pairs: number };
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['known-transitions'] });
      toast.success(`${d.pairs} pairs from ${d.sets} Lab sets`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { role?: TransitionRole | null; status?: TransitionStatus; preferred?: KnownTechniquePick | null } }) => {
      const res = await fetch(`/api/dj/known-transitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Couldn’t save');
      return (await res.json()).data as KnownTransition;
    },
    // instant: the chip lights up on tap, rolled back if the save fails
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['known-transitions'] });
      const prev = queryClient.getQueryData<KnownTransition[]>(['known-transitions']);
      queryClient.setQueryData<KnownTransition[]>(['known-transitions'], (old) => old?.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['known-transitions'], ctx.prev);
      toast.error(e.message);
    },
  });

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === 'untagged' && r.role) return false;
        if ((filter === 'proven' || filter === 'needs_work') && r.status !== filter) return false;
        if (ROLES.includes(filter as TransitionRole) && r.role !== filter) return false;
        if (!q) return true;
        return [r.fromTitle, r.fromArtist, r.toTitle, r.toArtist].some((s) => s.toLowerCase().includes(q));
      }),
    [rows, filter, q],
  );
  const byPair = useMemo(() => new Map(rows.map((r) => [`${r.fromSongId}>${r.toSongId}`, r])), [rows]);
  const open = rows.find((r) => r.id === openId) ?? null;
  const tagged = rows.filter((r) => r.role).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {isLoading ? 'Loading…' : `${rows.length} pairs · ${tagged} tagged`}
        </p>
        {canImport && (
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="glass-flat flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
          >
            <RefreshCw className={cn('size-4', sync.isPending && 'animate-spin')} />
            {sync.isPending ? 'Reading Lab sets…' : 'Sync Lab sets'}
          </button>
        )}
      </div>

      {canImport && (
        <div role="tablist" aria-label="View" className="glass-flat mt-3 grid grid-cols-2 rounded-full p-1">
          {(
            [
              ['sets', 'By set'],
              ['all', 'All pairs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setViewPick(id)}
              className={cn('h-9 rounded-full text-[14px] font-semibold [-webkit-tap-highlight-color:transparent]', view === id ? 'bg-foreground text-background' : 'text-muted-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {view === 'all' && (
        <>
      <label className="glass-flat mt-3 flex h-11 items-center gap-2.5 rounded-xl px-3">
        <Search className="size-[18px] shrink-0" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a song"
          aria-label="Find a song"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-foreground/70"
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="grid size-6 place-items-center rounded-full text-muted-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </label>

      <div role="tablist" aria-label="Show" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'h-9 shrink-0 rounded-full px-4 text-sm font-semibold [-webkit-tap-highlight-color:transparent]',
              filter === f.id ? 'border border-foreground bg-foreground text-background' : 'glass-surface text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="py-14 text-center">
          <p className="font-display text-lg font-bold">No known transitions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canImport ? 'Tap “Sync Lab sets” to pull in every transition from your saved Lab sets.' : 'They come from saved Lab sets.'}
          </p>
        </div>
      )}
      {rows.length > 0 && shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches.</p>}
        </>
      )}

      {view === 'all' && (
        <ul className="mt-2">
          {shown.map((r) => (
            <li key={r.id}>
              <PairRow r={r} onOpen={() => setOpenId(r.id)} />
            </li>
          ))}
        </ul>
      )}

      {view === 'sets' && <SetsView sets={sets.data ?? []} loading={sets.isLoading} byPair={byPair} onOpen={setOpenId} onReview={setReviewSet} />}

      <SetReview set={reviewSet} onClose={() => setReviewSet(null)} />

      <GlassSheet
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title="Transition"
        subtitle={open ? `${open.fromTitle} → ${open.toTitle}` : undefined}
        description="Tag what this transition does and how sure you are of it"
      >
        {open && (
          <>
            <div className="glass-flat mt-1 rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <Cover id={open.fromSongId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{open.fromTitle}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{open.fromArtist}</span>
                </span>
              </div>
              <div className="my-1.5 ml-[14px] flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <ArrowRight className="size-3.5 rotate-90" aria-hidden />
                {open.plays}× in your Lab sets{open.setBpm ? ` · at ${Math.round(open.setBpm * 10) / 10} BPM` : ''}
              </div>
              <div className="flex items-center gap-3">
                <Cover id={open.toSongId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{open.toTitle}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{open.toArtist}</span>
                </span>
              </div>
            </div>

            {open.techniques.length > 0 && (
              <>
                <SheetLabel>HOW YOU MIXED IT · TAP YOUR BEST TAKE</SheetLabel>
                <div className="flex flex-col gap-1.5 px-1">
                  {open.techniques.map((t) => {
                    const take: KnownTechniquePick = { kind: t.kind, bars: t.bars, entryA: t.entryA, cueB: t.cueB };
                    const on = sameTake(open.preferred, take);
                    return (
                      <button
                        key={`${t.kind}-${t.bars}`}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update.mutate({ id: open.id, patch: { preferred: on ? null : take } })}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-2.5 rounded-2xl border px-3 text-left [-webkit-tap-highlight-color:transparent] active:bg-foreground/10',
                          on ? 'border-primary bg-primary/15' : 'border-transparent',
                        )}
                      >
                        <Star className={cn('size-4 shrink-0', on ? 'fill-primary text-primary' : 'text-muted-foreground/50')} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[15px] font-semibold', on && 'text-primary')}>
                            {t.kind[0].toUpperCase() + t.kind.slice(1)} · {t.bars} bars
                          </span>
                          {on && <span className="block text-[11px] text-muted-foreground">Your pick: Set prep preselects this one</span>}
                        </span>
                        {t.entryA != null && <Mono>OUT {t.entryA} → IN {t.cueB}</Mono>}
                        <Mono className="border-amber-400/50 text-amber-400">{t.count}×</Mono>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <SheetLabel>{open.preferred ? 'WHAT YOUR PICK DOES TO THE NIGHT' : 'WHAT IT DOES TO THE NIGHT'}</SheetLabel>
            <div className="flex flex-wrap gap-2 px-1">
              {ROLES.map((role) => {
                const on = open.role === role;
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update.mutate({ id: open.id, patch: { role: on ? null : role } })}
                    className={cn('h-9 rounded-full border px-3.5 font-mono text-[12px] [-webkit-tap-highlight-color:transparent]', on ? ROLE_META[role].on : ROLE_META[role].cls)}
                  >
                    {ROLE_META[role].label}
                  </button>
                );
              })}
            </div>

            <SheetLabel>HOW SURE</SheetLabel>
            <div className="grid grid-cols-2 gap-2 px-1 pb-2">
              {(Object.keys(STATUS_META) as TransitionStatus[]).map((s) => {
                const on = open.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update.mutate({ id: open.id, patch: { status: s } })}
                    className={cn(
                      'flex h-[60px] flex-col items-center justify-center rounded-2xl text-center [-webkit-tap-highlight-color:transparent]',
                      on ? 'bg-primary text-primary-foreground' : 'glass-flat',
                    )}
                  >
                    <span className="flex items-center gap-1 text-[14px] font-semibold">
                      {on && <Check className="size-3.5" />}
                      {STATUS_META[s].label}
                    </span>
                    <span className="px-1 text-[10px] leading-tight opacity-75">{STATUS_META[s].sub}</span>
                  </button>
                );
              })}
            </div>
            {update.isPending && <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />}
          </>
        )}
      </GlassSheet>
    </div>
  );
}
