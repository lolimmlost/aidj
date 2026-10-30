import { useMemo, type ReactNode } from 'react';
import { Lock, LockOpen, Pause, Play, SkipForward, Square, ThumbsDown, ThumbsUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { barAt, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { rankCandidates, type LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, HistoryEntry, LabEngine, NextInfo } from '@/lib/dj-lab/engine';
import type { Recipe, TransitionPlan } from '@/lib/dj-lab/plan';
import { lockRecord, newId, planRecord, saveVote } from '@/lib/dj-lab/votes';
import { DeckStrip, type StripMarker, type StripRegion } from './DeckStrip';
import { fmtTime, useTicker } from './useLab';

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
    <div className="min-w-0">
      <div className="truncate font-semibold">{song.title}</div>
      <div className="truncate text-xs text-muted-foreground">
        {song.artist}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

/** The track's own tempo vs the tempo it plays at in the set */
function tempoLine(a: TrackAnalysis, rate: number) {
  const pct = (rate - 1) * 100;
  return `track ${a.bpm.toFixed(1)} BPM → plays at ${(a.bpm * rate).toFixed(1)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
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
        'rounded px-1.5 py-0.5 text-[11px] tabular-nums',
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
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="size-3" /> lock {p90} · {l.points} pts
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-destructive/50 text-destructive">
      <AlertTriangle className="size-3" /> lock unverified · {p90} · {l.points} pts
    </Badge>
  );
}

const RECIPES: [string, Recipe][] = [
  ['Rules', {}],
  ['Sweep bass', { bass: 'sweep' }],
  ['Hard swap', { bass: 'swap' }],
  ['8 bars', { bars: 8 }],
  ['16 bars', { bars: 16 }],
  ['Chain', { kind: 'chain' }],
  ['Swap', { kind: 'swap' }],
];

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
    () => (now ? rankCandidates({ song: now.song, analysis: now.analysis }, pool, { setBpm: snap.setBpm, played, mode: snap.mode }).slice(0, 12) : []),
    [now, pool, snap.setBpm, played, snap.mode],
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
    <div className="space-y-4">
      {/* transport */}
      <div className="flex flex-wrap items-center gap-2">
        {snap.status === 'playing' ? (
          <Button size="sm" onClick={() => engine.pause()} className="gap-1.5">
            <Pause className="size-4" /> Pause
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              engine.unlockAudio();
              engine.resume();
            }}
            className="gap-1.5"
          >
            <Play className="size-4" /> Resume
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => engine.skipAhead(6)} disabled={frozen} className="gap-1.5" title="Jump to 6 bars before the locked transition (or 16 bars ahead)">
          <SkipForward className="size-4" /> {next?.plan ? 'To transition' : '+16 bars'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => engine.stop()} className="gap-1.5">
          <Square className="size-4" /> Stop
        </Button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {snap.setBpm} BPM · {snap.mode === 'dropchain' ? 'drop-chain' : 'classic'} · {snap.history.length} played
        </span>
      </div>

      {/* deck A */}
      <Card className="space-y-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <SongLine song={now.song} sub={tempoLine(now.analysis, now.rate)} />
          <Badge>Playing</Badge>
        </div>
        <DeckStrip analysis={now.analysis} regions={exit.regions} markers={aMarkers} position={posNow} />
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>
            bar {nowPos === null ? '–' : Math.max(0, Math.floor(barAt(now.analysis, nowPos))) + 1} / {now.analysis.nBars}
          </span>
          <span>
            grid {now.analysis.gridConf.toFixed(2)}
            {now.analysis.gridP90Ms !== null ? ` · ±${now.analysis.gridP90Ms.toFixed(0)} ms` : ''} · {now.analysis.downbeat === 'drop' ? 'bars on the drop' : 'bars guessed'}
          </span>
        </div>
      </Card>

      {/* locked next */}
      <Card className={cn('space-y-2 p-3 sm:p-4', next?.state === 'failed' && 'border-destructive/50')}>
        {!next ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockOpen className="size-4" /> Nothing locked. {snap.autoLock ? 'Auto-lock picks once the crate is analysed.' : 'Lock a song below.'}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <SongLine song={next.song} sub={next.analysis ? tempoLine(next.analysis, (snap.setBpm / next.analysis.bpm)) : undefined} />
              <Badge variant={next.state === 'failed' ? 'destructive' : next.state === 'loading' ? 'outline' : 'default'} className="gap-1 shrink-0">
                {next.state === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                {STATE_LABEL[next.state]}
              </Badge>
            </div>
            {next.error && <p className="text-sm text-destructive">{next.error}</p>}
            {next.plan && next.analysis && (
              <>
                <DeckStrip analysis={next.analysis} {...entryRegions(next.plan, next.analysis)} position={posNext} />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{next.plan.kind}</Badge>
                  <Badge variant="outline">
                    {next.plan.N} bars · {next.plan.bass === 'sweep' ? 'filter sweep' : `hard swap, ${next.plan.kill}-bar kill`}
                  </Badge>
                  <LockBadge next={next} />
                  {toBlend !== null && (
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {toBlend > 0 ? `blend in ${fmtTime(toBlend)}` : 'blending'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{next.plan.how}</p>
                {next.notes.map((n) => (
                  <p key={n} className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="size-3.5 shrink-0" /> {n}
                  </p>
                ))}
              </>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="outline" disabled={frozen} onClick={() => engine.unlock()} className="gap-1.5">
                <LockOpen className="size-3.5" /> Unlock
              </Button>
              {next.plan &&
                RECIPES.map(([label, r]) => (
                  <Button key={label} size="sm" variant="ghost" disabled={frozen} onClick={() => void engine.relock(r)} className="h-8 px-2 text-xs">
                    {label}
                  </Button>
                ))}
            </div>
          </>
        )}
      </Card>

      {/* candidates */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Up next <span className="font-normal text-muted-foreground">· matched to {(now.analysis.bpm * now.rate).toFixed(1)} BPM, the tempo playing now</span>
        </h3>
        {candidates.length === 0 && <p className="text-sm text-muted-foreground">No analysed track within ±8 % of {snap.setBpm} BPM yet.</p>}
        <ul className="divide-y rounded-lg border">
          {candidates.map((c) => {
            const isNext = next?.song.id === c.song.id;
            return (
              <li key={c.song.id} className="flex items-center gap-3 p-2.5">
                <div className="min-w-0 flex-1">
                  <SongLine song={c.song} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    <DeltaChip delta={c.bpmDelta} flat={0.005 * snap.setBpm} title="Track tempo vs the tempo playing now">
                      {c.analysis.bpm.toFixed(1)} BPM {c.bpmDelta >= 0 ? '+' : ''}
                      {c.bpmDelta.toFixed(1)}
                    </DeltaChip>
                    <DeltaChip delta={c.bassDelta} flat={0.5} title="Drop bass vs the playing track's">
                      bass {c.bassDelta >= 0 ? '+' : ''}
                      {c.bassDelta.toFixed(1)} dB
                    </DeltaChip>
                    {c.reasons.map((r) => (
                      <span key={r} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{r}</span>
                    ))}
                    {c.warnings.map((w) => (
                      <span key={w} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">{w}</span>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant={isNext ? 'secondary' : 'outline'} disabled={frozen || isNext || next?.state === 'loading'} onClick={() => void engine.lock(c.song)} className="shrink-0 gap-1.5">
                  <Lock className="size-3.5" /> {isNext ? 'Locked' : 'Lock'}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* history */}
      {snap.history.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">This set</h3>
          <ol className="space-y-1.5">
            {snap.history.map((h, i) => (
              <li key={`${h.song.id}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {h.song.title} <span className="text-muted-foreground">· {h.song.artist}</span>
                  </div>
                  {h.plan && (
                    <div className="truncate text-xs text-muted-foreground">
                      {h.plan.kind}, {h.plan.N} bars{h.lock ? ` · lock ${h.lock.verified ? '✓' : '✗'} ${h.lock.p90Ms?.toFixed(1) ?? 'n/a'} ms` : ''}
                    </div>
                  )}
                </div>
                {h.plan && (
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Good transition" onClick={() => flag(h, 'up', snap.setBpm)}>
                      <ThumbsUp className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Bad transition" onClick={() => flag(h, 'down', snap.setBpm)}>
                      <ThumbsDown className="size-4" />
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
