import { useMemo } from 'react';
import { ArrowUpToLine, ChevronDown, ChevronUp, ListPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';
import type { LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';
import { likedRun, previewQueue } from '@/lib/dj-lab/pick';
import type { LabVote } from '@/lib/dj-lab/votes';

type Pool = { song: LabSong; analysis: TrackAnalysis }[];

/**
 * The queue (#373): songs to play after the locked one, in order, each with the transition it would get. Each
 * locks when the one before it takes over; only the locked song is decoded. A run of your liked transitions
 * (#384) queues in one tap.
 */
export function QueueCard({ engine, snap, pool, starred, votes }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool; starred: Set<string>; votes: LabVote[] }) {
  const now = snap.now;
  const next = snap.next;
  const analyses = useMemo(() => new Map(pool.map((p) => [p.song.id, p.analysis])), [pool]);
  // previews start from the locked song (or the playing one), at the tempo the set will have by then
  const from = useMemo(
    () => (next?.analysis ? { song: next.song, analysis: next.analysis } : now ? { song: now.song, analysis: now.analysis } : undefined),
    [next, now],
  );
  const setBpm = next?.plan?.jump ? Math.round(next.plan.jump.toBpm * 10) / 10 : snap.setBpm;
  const previews = useMemo(() => previewQueue(from, snap.queue, analyses, { setBpm, mode: snap.mode }), [from, snap.queue, analyses, setBpm, snap.mode]);
  // a liked run carries on from the end of the queue
  const run = useMemo(() => {
    const last = snap.queue.at(-1);
    const tail = last ? pool.find((p) => p.song.id === last.id) : from;
    if (!tail) return [];
    const taken = new Set([...snap.history.map((h) => h.song.id), now?.song.id ?? '', next?.song.id ?? '', ...snap.queue.map((q) => q.id)]);
    return likedRun(tail, pool, { setBpm: previews.at(-1)?.bpm ?? setBpm, played: taken, mode: snap.mode, liked: starred }, votes);
  }, [snap.queue, snap.history, pool, from, now, next, previews, setBpm, snap.mode, starred, votes]);

  if (!now) return null;
  const frozen = next?.state === 'committed' || next?.state === 'mixing';
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">
          Queue{' '}
          <span className="font-normal text-muted-foreground">
            · {snap.queue.length ? `${snap.queue.length} after the locked song` : 'tap + on a song below to play it after the locked one'}
          </span>
        </h3>
        {run.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => engine.enqueue(run)}
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            title={`Your liked transitions from here: ${run.map((s) => s.title).join(' → ')}`}
          >
            <ListPlus className="size-3.5" /> Liked run · {run.length}
          </Button>
        )}
      </div>
      {snap.queue.length > 0 && (
        <Card className="overflow-hidden">
          <ol className="divide-y">
            {previews.map((p, i) => (
              <li key={p.song.id} className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.song.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {p.song.artist} · {p.line}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  onClick={() => engine.playNext(p.song.id)}
                  aria-label={`Play ${p.song.title} next`}
                  title={frozen ? 'The mix has started: it goes to the front of the queue' : 'Play next: it takes the locked spot'}
                >
                  <ArrowUpToLine className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={i === 0} onClick={() => engine.moveQueued(p.song.id, -1)} aria-label="Move up">
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  disabled={i === snap.queue.length - 1}
                  onClick={() => engine.moveQueued(p.song.id, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => engine.dequeue(p.song.id)} aria-label={`Remove ${p.song.title} from the queue`}>
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}
