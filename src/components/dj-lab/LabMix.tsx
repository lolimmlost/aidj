import { useMemo, type ReactNode } from 'react';
import { Lock, LockOpen, Square, ThumbsDown, ThumbsUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { barAt, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { rankCandidates, type LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, HistoryEntry, LabEngine, NextInfo } from '@/lib/dj-lab/engine';
import { describeRecipe, type TransitionPlan } from '@/lib/dj-lab/plan';
import { lockRecord, newId, planRecord, saveVote } from '@/lib/dj-lab/votes';
import { DeckStrip, type StripMarker, type StripRegion } from './DeckStrip';
import { fmtTime, useTicker } from './useLab';
import { TransitionPicker } from './TransitionPicker';

type Pool = { song: LabSong; analysis: TrackAnalysis }[];

const STATE_LABEL: Record<NextInfo['state'], string> = {
  loading: 'Preparing',
  locked: 'Locked',
  committed: 'Committed',
  mixing: 'Mixing',
  failed: "Can't lock",
};

function SongLine({ song, sub }: { song: LabSong; sub?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold">{song.title}</div>
      <div className="truncate text-[11px] text-muted-foreground">
        {song.artist}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

/** The track's own tempo → the tempo it plays at in the set */
function tempoLine(a: TrackAnalysis, rate: number) {
  const pct = Math.round((rate - 1) * 1000) / 10;
  return `${a.bpm.toFixed(1)} → ${(a.bpm * rate).toFixed(1)} BPM (${pct > 0 ? '+' : ''}${pct === 0 ? '0.0' : pct.toFixed(1)}%)`;
}

function exitRegions(plan: TransitionPlan): { regions: StripRegion[]; markers: StripMarker[] } {
  const regions: StripRegion[] = [{ from: plan.entryA, to: plan.endA, className: 'bg-primary/25', label: `${plan.N}-bar blend` }];
  if (plan.bass === 'swap' && plan.kill > 0) {
    regions.push({ from: plan.entryA + plan.S - plan.kill, to: plan.entryA + plan.S, className: 'bg-destructive/30', label: `${plan.kill}-bar bass kill` });
  }
  return { regions, markers: [{ bar: plan.entryA + plan.S, className: 'bg-foreground/70', label: "B's drop" }] };
}

function entryRegions(plan: TransitionPlan, b: TrackAnalysis): { regions: StripRegion[]; markers: StripMarker[] } {
  const regions: StripRegion[] = [{ from: plan.cueB, to: plan.cueB + plan.N, className: 'bg-primary/25', label: 'build' }];
  if (plan.hold) regions.push({ from: plan.cueB, to: plan.cueB + plan.S - plan.hold, className: 'bg-destructive/20', label: 'held (no lock)' });
  return { regions, markers: [{ bar: plan.cueB + plan.S, className: 'bg-foreground/70', label: 'drop' }, ...b.drops.filter((d) => d > plan.cueB + plan.S).map((d) => ({ bar: d, className: 'bg-foreground/30' }))] };
}

/** Higher than what's playing = green ▲, lower = red ▼, within `flat` = neutral. */
function DeltaChip({ delta, flat, title, children }: { delta: number; flat: number; title: string; children: ReactNode }) {
  const dir = delta > flat ? 'up' : delta < -flat ? 'down' : 'flat';
  return (
    <span
      title={title}
      className={cn(
        'rounded px-1 text-[10px] leading-4 tabular-nums',
        dir === 'up' && 'bg-success/15 text-success',
        dir === 'down' && 'bg-destructive/10 text-destructive',
        dir === 'flat' && 'bg-muted text-muted-foreground',
      )}
    >
      {dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : ''}
      {children}
    </span>
  );
}

function LockBadge({ next }: { next: NextInfo }) {
  const l = next.lock;
  if (!l) return null;
  const p90 = l.p90Ms === null ? 'n/a' : `${l.p90Ms.toFixed(1)} ms`;
  return l.verified ? (
    <span className="inline-flex items-center gap-0.5 text-success" title={`${l.points} points`}>
      <CheckCircle2 className="size-3" /> lock {p90}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-warning" title={`Beat lock not verified (${l.points} points)`}>
      <AlertTriangle className="size-3" /> unverified
    </span>
  );
}


function flag(entry: HistoryEntry, thumb: 'up' | 'down', setBpm: number) {
  if (!entry.from || !entry.plan) return;
  saveVote({
    id: newId(),
    at: new Date().toISOString(),
    kind: 'flag',
    a: { id: entry.from.id, title: entry.from.title, artist: entry.from.artist },
    b: { id: entry.song.id, title: entry.song.title, artist: entry.song.artist },
    setBpm,
    thumb,
    plan: planRecord(entry.plan),
    lock: entry.lock ? lockRecord(entry.lock) : undefined,
    tags: [],
    note: '',
  });
  toast.success(thumb === 'up' ? 'Marked as a good transition' : 'Marked as a bad transition');
}

export function LabMix({ engine, snap, pool }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool }) {
  const live = snap.status === 'playing' || snap.status === 'paused';
  useTicker(live);
  const now = snap.now;
  const next = snap.next;
  const played = useMemo(() => new Set(snap.history.map((h) => h.song.id)), [snap.history]);
  const candidates = useMemo(
    () =>
      now
        ? rankCandidates({ song: now.song, analysis: now.analysis }, pool, {
            setBpm: snap.setBpm,
            played,
            mode: snap.mode,
            window: { down: snap.defaults.tempoDown, up: snap.defaults.tempoUp },
          }).slice(0, 12)
        : [],
    [now, pool, snap.setBpm, played, snap.mode, snap.defaults.tempoDown, snap.defaults.tempoUp],
  );
  const posNow = useMemo(() => () => engine.position('now'), [engine]);
  const posNext = useMemo(() => () => engine.position('next'), [engine]);
  const toBlend = engine.secondsToBlend();
  const frozen = next?.state === 'committed' || next?.state === 'mixing';
  const nowPos = engine.position('now');

  if (!now) return null;
  const exit = next?.plan ? exitRegions(next.plan) : { regions: [], markers: [] };
  const aMarkers: StripMarker[] = [
    ...now.analysis.drops.map((d) => ({ bar: d, className: 'bg-foreground/30' })),
    ...exit.markers,
  ];

  return (
    <div className="space-y-2.5">
      {/* deck A */}
      <Card className="space-y-1.5 p-2.5">
        <div className="flex items-center gap-2">
          <SongLine song={now.song} sub={tempoLine(now.analysis, now.rate)} />
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            bar {nowPos === null ? '–' : Math.max(0, Math.floor(barAt(now.analysis, nowPos))) + 1}/{now.analysis.nBars}
          </span>
        </div>
        <DeckStrip analysis={now.analysis} regions={exit.regions} markers={aMarkers} position={posNow} className="h-10" />
        <div
          className="truncate text-[10px] tabular-nums text-muted-foreground"
          title="How well the beat grid fits this track"
        >
          grid {now.analysis.gridConf.toFixed(2)}
          {now.analysis.gridP90Ms !== null ? ` · ±${now.analysis.gridP90Ms.toFixed(0)} ms` : ''} · {now.analysis.downbeat === 'drop' ? 'bars on the drop' : 'bars guessed'}
        </div>
      </Card>

      {/* locked next */}
      <Card className={cn('space-y-1.5 p-2.5', next?.state === 'failed' && 'border-destructive/50')}>
        {!next ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockOpen className="size-4" /> Nothing locked. {snap.autoLock ? 'Auto-lock picks once the crate is analysed.' : 'Lock a song below.'}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <SongLine song={next.song} sub={next.analysis ? tempoLine(next.analysis, snap.setBpm / next.analysis.bpm) : undefined} />
              <Badge variant={next.state === 'failed' ? 'destructive' : next.state === 'loading' ? 'outline' : 'default'} className="shrink-0 gap-1 px-1.5 text-[11px]">
                {next.state === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                {STATE_LABEL[next.state]}
              </Badge>
              <Button size="icon" variant="ghost" disabled={frozen} onClick={() => engine.unlock()} className="size-7 shrink-0" aria-label="Unlock" title="Unlock">
                <LockOpen className="size-3.5" />
              </Button>
            </div>
            {next.error && <p className="text-xs text-destructive">{next.error}</p>}
            {next.plan && next.analysis && (
              <>
                <DeckStrip analysis={next.analysis} {...entryRegions(next.plan, next.analysis)} position={posNext} className="h-10" />
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <span className="truncate">
                    {next.plan.kind} · {next.plan.N} bars · {next.plan.bass === 'sweep' ? 'sweep' : `swap, ${next.plan.kill}-bar kill`}
                  </span>
                  <LockBadge next={next} />
                  {toBlend !== null && <span className="ml-auto shrink-0 font-medium text-foreground">{toBlend > 0 ? `mix in ${fmtTime(toBlend)}` : 'mixing'}</span>}
                </div>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">{next.plan.how}</p>
                {next.notes.map((n) => (
                  <p key={n} className="flex items-center gap-1 text-[11px] text-warning">
                    <AlertTriangle className="size-3 shrink-0" /> {n}
                  </p>
                ))}
              </>
            )}
          </>
        )}
      </Card>

      <TransitionPicker engine={engine} snap={snap} />

      {/* candidates */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold">
          Up next <span className="font-normal text-muted-foreground">· vs {(now.analysis.bpm * now.rate).toFixed(1)} BPM playing</span>
        </h3>
        {candidates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No analysed track between −{snap.defaults.tempoDown} % and +{snap.defaults.tempoUp} % of the playing tempo. Widen the tempo window above.
          </p>
        )}
        <ul className="divide-y rounded-lg border">
          {candidates.map((c) => {
            const isNext = next?.song.id === c.song.id;
            return (
              <li key={c.song.id} className="flex items-center gap-2 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <SongLine song={c.song} />
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <DeltaChip delta={c.bpmDelta} flat={0.005 * snap.setBpm} title="Track tempo vs the tempo playing now">
                      {c.analysis.bpm.toFixed(1)} BPM {c.bpmDelta >= 0 ? '+' : ''}
                      {c.bpmDelta.toFixed(1)}
                    </DeltaChip>
                    <DeltaChip delta={c.bassDelta} flat={0.5} title="Drop bass vs the playing track's">
                      bass {c.bassDelta >= 0 ? '+' : ''}
                      {c.bassDelta.toFixed(1)} dB
                    </DeltaChip>
                    {c.reasons.map((r) => (
                      <span key={r} className="rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground">{r}</span>
                    ))}
                    {c.warnings.map((w) => (
                      <span key={w} className="rounded bg-warning/10 px-1 text-[10px] leading-4 text-warning">{w}</span>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isNext ? 'secondary' : 'outline'}
                  disabled={frozen || isNext || next?.state === 'loading'}
                  onClick={() => void engine.lock(c.song)}
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                >
                  <Lock className="size-3" /> {isNext ? 'Locked' : 'Lock'}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* history */}
      {snap.history.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">
              This set <span className="font-normal text-muted-foreground">· {snap.history.length} played</span>
            </h3>
            <Button size="sm" variant="ghost" onClick={() => engine.stop()} className="h-7 gap-1 px-2 text-xs text-muted-foreground">
              <Square className="size-3" /> End set
            </Button>
          </div>
          <ol className="space-y-1">
            {snap.history.map((h, i) => (
              <li key={`${h.song.id}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {h.song.title} <span className="text-muted-foreground">· {h.song.artist}</span>
                  </div>
                  {h.plan && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {h.plan.kind}, {h.plan.N} bars{h.recipe && describeRecipe(h.recipe) ? ` · ${describeRecipe(h.recipe)}` : ''}
                      {h.lock ? ` · lock ${h.lock.verified ? '✓' : '✗'} ${h.lock.p90Ms?.toFixed(1) ?? 'n/a'} ms` : ''}
                    </div>
                  )}
                </div>
                {h.plan && (
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Good transition" onClick={() => flag(h, 'up', snap.setBpm)}>
                      <ThumbsUp className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Bad transition" onClick={() => flag(h, 'down', snap.setBpm)}>
                      <ThumbsDown className="size-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
