import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, Check, Loader2, Wrench } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { GlassSheet } from '@/components/glass/GlassSheet';
import { getCoverArtUrl } from '@/components/ui/album-art';
import type { KnownTechniquePick, KnownTransition, TransitionRole, TransitionStatus } from '@/lib/db/schema/known-transitions.schema';
import type { SavedSet } from '@/lib/dj-lab/sets';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { ROLE_META, STATUS_META } from './transition-meta';

interface Step {
  fromId: string;
  toId: string;
  fromTitle: string;
  fromArtist: string;
  toTitle: string;
  toArtist: string;
  take: KnownTechniquePick;
}

const ROLES = Object.keys(ROLE_META) as TransitionRole[];
const SWIPE_PX = 90;

/** Every transition of a set, in play order (the take is how it was mixed in THIS set). */
function stepsOf(set: SavedSet): Step[] {
  const out: Step[] = [];
  for (let i = 1; i < set.tracks.length; i++) {
    const a = set.tracks[i - 1];
    const b = set.tracks[i];
    if (!b.kind || b.bars == null || a.id === b.id) continue;
    out.push({
      fromId: a.id, toId: b.id, fromTitle: a.title, fromArtist: a.artist, toTitle: b.title, toArtist: b.artist,
      take: { kind: b.kind, bars: b.bars, entryA: b.cues?.entryA ?? null, cueB: b.cues?.cueB ?? null },
    });
  }
  return out;
}

const Cover = ({ id }: { id: string }) => (
  <img src={getCoverArtUrl(id, 160) ?? undefined} alt="" className="size-16 shrink-0 rounded-xl bg-foreground/10 object-cover" />
);

/**
 * After a Lab set: one card per transition, in play order. Proven / Needs work saves it (with the take
 * played in this set as your pick); swipe it away, or Skip, to leave it untouched. Role chips are optional.
 */
export function SetReview({ set, onClose }: { set: SavedSet | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const steps = useMemo(() => (set ? stepsOf(set) : []), [set]);
  const [i, setI] = useState(0);
  const [tally, setTally] = useState({ proven: 0, needs_work: 0, skipped: 0 });
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x0: number } | null>(null);

  // Make sure this set's pairs are in the book (the automatic import may still be waiting), then load it.
  const { data: rows, isLoading } = useQuery({
    queryKey: ['known-transitions', 'review', set?.id],
    enabled: !!set,
    queryFn: async () => {
      await fetch('/api/dj/known-transitions/import', { method: 'POST' }).catch(() => {});
      const res = await fetch('/api/dj/known-transitions');
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()).data as KnownTransition[];
      queryClient.setQueryData(['known-transitions'], data);
      return data;
    },
  });
  const byPair = useMemo(() => new Map((rows ?? []).map((r) => [`${r.fromSongId}>${r.toSongId}`, r])), [rows]);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { status?: TransitionStatus; role?: TransitionRole | null; preferred?: KnownTechniquePick } }) => {
      const res = await fetch(`/api/dj/known-transitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Couldn’t save');
      return (await res.json()).data as KnownTransition;
    },
    onSuccess: (row) => {
      const swap = (old?: KnownTransition[]) => old?.map((r) => (r.id === row.id ? row : r));
      queryClient.setQueryData<KnownTransition[]>(['known-transitions', 'review', set?.id], swap);
      queryClient.setQueryData<KnownTransition[]>(['known-transitions'], swap);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = () => {
    onClose();
    setI(0);
    setTally({ proven: 0, needs_work: 0, skipped: 0 });
    setDx(0);
  };

  const step = steps[i];
  const row = step ? byPair.get(`${step.fromId}>${step.toId}`) : undefined;
  const done = !!set && i >= steps.length;

  const next = (kind: 'proven' | 'needs_work' | 'skipped') => {
    setTally((t) => ({ ...t, [kind]: t[kind] + 1 }));
    setDx(0);
    setI((n) => n + 1);
  };
  const judge = (status: 'proven' | 'needs_work') => {
    if (!step) return;
    if (row) patch.mutate({ id: row.id, body: { status, preferred: step.take } });
    else toast.error('This pair isn’t in your book yet: sync Lab sets');
    next(status);
  };

  return (
    <GlassSheet
      open={!!set}
      onOpenChange={(o) => !o && close()}
      tall
      title="Review the set"
      subtitle={done ? 'All done' : steps.length ? `Transition ${Math.min(i + 1, steps.length)} of ${steps.length}` : 'No transitions in this set'}
      description="Mark each transition proven or needs work, or swipe it away"
      footer={
        !done && step ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <button
              type="button"
              onClick={() => judge('needs_work')}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-rose-300/60 text-[15px] font-semibold text-rose-300 [-webkit-tap-highlight-color:transparent]"
            >
              <Wrench className="size-4" /> Needs work
            </button>
            <button type="button" onClick={() => next('skipped')} className="h-12 px-3 text-[13px] font-semibold text-muted-foreground">
              Skip
            </button>
            <button
              type="button"
              onClick={() => judge('proven')}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground [-webkit-tap-highlight-color:transparent]"
            >
              <Check className="size-4" /> Proven
            </button>
          </div>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {!isLoading && done && (
        <div className="py-10 text-center">
          <p className="font-display text-2xl font-extrabold">Nice set</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tally.proven} proven · {tally.needs_work} need work · {tally.skipped} left as they were
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/dj/transitions" onClick={close} className="glass-flat flex h-11 items-center rounded-full px-5 text-[14px] font-semibold">
              Known transitions
            </Link>
            <button type="button" onClick={close} className="h-11 rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground">
              Done
            </button>
          </div>
        </div>
      )}

      {!isLoading && step && (
        <div
          className="glass-flat mt-2 touch-pan-y select-none rounded-3xl p-4"
          style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)`, opacity: 1 - Math.min(0.6, Math.abs(dx) / 300), transition: dragging ? 'none' : 'transform 200ms, opacity 200ms' }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            drag.current = { x0: e.clientX };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) setDx(e.clientX - drag.current.x0);
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
            if (Math.abs(dx) > SWIPE_PX) next('skipped'); // swiped away: no action
            else setDx(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
            setDx(0);
          }}
        >
          <div className="flex items-center gap-3">
            <Cover id={step.fromId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold">{step.fromTitle}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{step.fromArtist}</span>
            </span>
          </div>
          <div className="my-3 flex items-center gap-2 pl-5">
            <ArrowDown className="size-4 text-primary" aria-hidden />
            <span className="rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[11px] text-primary">
              {step.take.kind.toUpperCase()} {step.take.bars} BARS
              {step.take.entryA != null ? ` · OUT ${step.take.entryA} → IN ${step.take.cueB}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Cover id={step.toId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold">{step.toTitle}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{step.toArtist}</span>
            </span>
          </div>

          {row && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              {row.plays}× IN YOUR LAB SETS · NOW: {STATUS_META[row.status].label.toUpperCase()}
              {row.preferred ? ` · PICK ${row.preferred.kind.toUpperCase()} ${row.preferred.bars}` : ''}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {ROLES.map((r) => {
              const on = row?.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={!row}
                  aria-pressed={on}
                  onClick={() => row && patch.mutate({ id: row.id, body: { role: on ? null : r } })}
                  className={cn('h-8 rounded-full border px-3 font-mono text-[11px] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]', on ? ROLE_META[r].on : ROLE_META[r].cls)}
                >
                  {ROLE_META[r].label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">Swipe the card away to leave it as it is</p>
        </div>
      )}
    </GlassSheet>
  );
}
