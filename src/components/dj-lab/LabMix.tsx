import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, ListPlus, Lock, LockOpen, Repeat, Square, ThumbsDown, ThumbsUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { barAt, meterName, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { genreFamily, rankCandidates, rankJumps, type Candidate, type LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, HistoryEntry, LabEngine, NextInfo } from '@/lib/dj-lab/engine';
import { describeRecipe, planSummary as planLine, type TransitionPlan } from '@/lib/dj-lab/plan';
import { loadVotes, lockRecord, newId, planRecord, saveVote } from '@/lib/dj-lab/votes';
import { labLog } from '@/lib/dj-lab/log';
import { splitByThumbs } from '@/lib/dj-lab/pick';
import { DeckStrip, type StripMarker, type StripRegion } from './DeckStrip';
import { fmtTime, useStarredIds, useTicker } from './useLab';
import { TransitionPicker } from './TransitionPicker';
import { QueueCard } from './QueueCard';

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
  const own = a.meter ? `${(a.bpm / a.meter).toFixed(1)} at ${meterName(a)}` : a.bpm.toFixed(1);
  return `${own} → ${(a.bpm * rate).toFixed(1)} BPM (${pct > 0 ? '+' : ''}${pct === 0 ? '0.0' : pct.toFixed(1)}%)`;
}


function exitRegions(plan: TransitionPlan): { regions: StripRegion[]; markers: StripMarker[] } {
  // a jump's B drop isn't on A's bar grid: A just fades out
  if (plan.jump) return { regions: [{ from: plan.entryA, to: plan.endA, className: 'bg-primary/25', label: `${plan.N}-bar handover` }], markers: [{ bar: plan.endA, className: 'bg-foreground/70', label: 'A out' }] };
  const regions: StripRegion[] = [{ from: plan.entryA, to: plan.endA, className: 'bg-primary/25', label: `${plan.N}-bar blend` }];
  if (plan.bass === 'swap' && plan.kill > 0) {
    regions.push({ from: plan.entryA + plan.S - plan.kill, to: plan.entryA + plan.S, className: 'bg-destructive/30', label: `${plan.kill}-bar bass kill` });
  }
  return { regions, markers: [{ bar: plan.entryA + plan.S, className: 'bg-foreground/70', label: "B's drop" }] };
}

function entryRegions(plan: TransitionPlan, b: TrackAnalysis): { regions: StripRegion[]; markers: StripMarker[] } {
  const regions: StripRegion[] = [{ from: plan.cueB, to: plan.cueB + (plan.jump ? plan.S : plan.N), className: 'bg-primary/25', label: 'build' }];
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
  labLog('flag', { a: `${entry.from.artist} – ${entry.from.title}`, b: `${entry.song.artist} – ${entry.song.title}`, thumb, kind: entry.plan.kind });
  toast.success(thumb === 'up' ? 'Marked as a good transition' : 'Marked as a bad transition');
}

const UP_NEXT_ID = 'lab-up-next';

/** A replayed set: how far it is, and the way back to auto-lock's own picks */
function ReplayLine({ engine, snap }: { engine: LabEngine; snap: EngineSnapshot }) {
  const replay = snap.replay;
  if (!replay) return null;
  const played = new Set(snap.history.map((h) => h.song.id));
  const done = replay.songIds.filter((id) => played.has(id)).length;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
      <Repeat className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">
        Replaying {replay.name} · {done} of {replay.songIds.length}
        {!snap.autoLock && <span className="text-muted-foreground"> · paused while auto-lock is off</span>}
      </span>
      <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs" onClick={() => engine.endReplay()}>
        Back to picks
      </Button>
    </div>
  );
}
const PICKS_SHOWN = 4;

/** One genre family's picks, best first; past the first few they fold away. */
function PickGroup({ genre, picks, children }: { genre: string; picks: Candidate[]; children: (c: Candidate) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = open ? picks : picks.slice(0, PICKS_SHOWN);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] font-semibold">
        {genre}
        <span className="font-normal tabular-nums text-muted-foreground">{picks.length}</span>
      </div>
      <ul className="divide-y">
        {shown.map((c) => (
          <li key={c.song.id} className="flex items-center gap-2 px-2 py-1.5">
            {children(c)}
          </li>
        ))}
      </ul>
      {picks.length > PICKS_SHOWN && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full border-t px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50">
          {open ? 'Show fewer' : `Show ${picks.length - PICKS_SHOWN} more`}
        </button>
      )}
    </Card>
  );
}

export function LabMix({ engine, snap, pool }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool }) {
  const live = snap.status === 'playing' || snap.status === 'paused';
  useTicker(live);
  const now = snap.now;
  const next = snap.next;
  // played, or queued already (#373): Up next leaves both out
  const played = useMemo(() => new Set([...snap.history.map((h) => h.song.id), ...snap.queue.map((q) => q.id)]), [snap.history, snap.queue]);
  const starred = useStarredIds();
  // thumbs out of the playing song, read when it starts: you can only give them once its successor has played
  const nowId = now?.song.id;
  const votes = useMemo(() => (nowId ? loadVotes() : []), [nowId]);
  const candidates = useMemo(
    () =>
      now
        ? rankCandidates({ song: now.song, analysis: now.analysis }, pool, {
            setBpm: snap.setBpm,
            played,
            mode: snap.mode,
            window: { down: snap.defaults.tempoDown, up: snap.defaults.tempoUp },
            liked: starred,
          })
        : [],
    [now, pool, snap.setBpm, played, snap.mode, snap.defaults.tempoDown, snap.defaults.tempoUp, starred],
  );
  // transitions you liked out of the playing song, anywhere they can stretch to: auto-lock takes these first (#384)
  const likedAfter = useMemo(
    () =>
      now
        ? splitByThumbs(rankCandidates({ song: now.song, analysis: now.analysis }, pool, { setBpm: snap.setBpm, played, mode: snap.mode, liked: starred }), now.song, votes)
            .liked
        : [],
    [now, pool, snap.setBpm, played, snap.mode, starred, votes],
  );
  // too far to stretch: a tempo jump moves the set to their tempo (never auto-locked)
  const jumps = useMemo(
    () => (now ? rankJumps({ song: now.song, analysis: now.analysis }, pool, { setBpm: snap.setBpm, played, mode: snap.mode }) : []),
    [now, pool, snap.setBpm, played, snap.mode],
  );
  // a card per genre family, in the order of each family's best pick
  const groups = useMemo(() => {
    const byGenre = new Map<string, Candidate[]>();
    for (const c of now ? splitByThumbs(candidates, now.song, votes).rest : []) {
      const g = genreFamily(c.song);
      const list = byGenre.get(g);
      if (list) list.push(c);
      else byGenre.set(g, [c]);
    }
    return [...(likedAfter.length ? ([['Liked after this', likedAfter]] as const) : []), ...byGenre];
  }, [candidates, likedAfter, now, votes]);
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

      <ReplayLine engine={engine} snap={snap} />

      {/* locked next */}
      <Card className={cn('space-y-1.5 p-2.5', next?.state === 'failed' && 'border-destructive/50')}>
        {!next ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockOpen className="size-4" /> Nothing locked. {snap.autoLock ? 'Auto-lock picks once the crate is analysed.' : 'Lock a song below.'}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <SongLine
                song={next.song}
                sub={next.analysis ? tempoLine(next.analysis, (next.plan?.jump?.toBpm ?? snap.setBpm) / next.analysis.bpm) : undefined}
              />
              <Badge variant={next.state === 'failed' ? 'destructive' : next.state === 'loading' ? 'outline' : 'default'} className="shrink-0 gap-1 px-1.5 text-[11px]">
                {next.state === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                {STATE_LABEL[next.state]}
              </Badge>
              {/* unlocking lets auto-lock take the slot at once: Swap keeps this song locked until you pick */}
              <Button
                size="sm"
                variant="ghost"
                disabled={frozen}
                onClick={() => document.getElementById(UP_NEXT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                title="Pick another song below; this one stays locked until you do"
              >
                <ArrowLeftRight className="size-3.5" /> Swap
              </Button>
              {!snap.autoLock && (
                <Button size="icon" variant="ghost" disabled={frozen} onClick={() => engine.unlock()} className="size-7 shrink-0" aria-label="Unlock" title="Unlock">
                  <LockOpen className="size-3.5" />
                </Button>
              )}
            </div>
            {next.error && <p className="text-xs text-destructive">{next.error}</p>}
            {next.plan && next.analysis && (
              <>
                <DeckStrip analysis={next.analysis} {...entryRegions(next.plan, next.analysis)} position={posNext} className="h-10" />
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <span className="truncate">
                    {next.plan.jump
                      ? `${planLine(next.plan)} BPM · ${next.plan.N}-bar handover`
                      : `${next.plan.kind} · ${next.plan.N} bars · ${next.plan.bass === 'sweep' ? 'sweep' : `swap, ${next.plan.kill}-bar kill`}`}
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

      <QueueCard engine={engine} snap={snap} pool={pool} starred={starred} votes={votes} />

      {/* candidates, a card per genre family */}
      <section id={UP_NEXT_ID} className="scroll-mt-32 space-y-1.5">
        <h3 className="text-xs font-semibold">
          Up next{' '}
          <span className="font-normal text-muted-foreground">
            · {candidates.length} within the tempo window · vs {(now.analysis.bpm * now.rate).toFixed(1)} BPM playing
          </span>
        </h3>
        {candidates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No analysed track between −{snap.defaults.tempoDown} % and +{snap.defaults.tempoUp} % of the playing tempo. Widen the tempo window above.
          </p>
        )}
        {[...groups, ...(jumps.length ? [['Tempo jump · plays at its own tempo', jumps] as const] : [])].map(([genre, picks]) => (
          <PickGroup key={genre} genre={genre} picks={picks}>
            {(c) => {
              const isNext = next?.song.id === c.song.id;
              return (
                <>
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
                    size="icon"
                    variant="ghost"
                    disabled={isNext}
                    onClick={() => engine.enqueue([c.song])}
                    className="size-7 shrink-0"
                    aria-label={`Queue ${c.song.title}`}
                    title="Queue: plays after the locked song and anything queued"
                  >
                    <ListPlus className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={isNext ? 'secondary' : 'outline'}
                    disabled={frozen || isNext || next?.state === 'loading'}
                    onClick={() => void engine.lock(c.song)}
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                  >
                    {next && !isNext && next.state !== 'failed' ? (
                      <>
                        <ArrowLeftRight className="size-3" /> Swap
                      </>
                    ) : (
                      <>
                        <Lock className="size-3" /> {isNext ? 'Locked' : 'Lock'}
                      </>
                    )}
                  </Button>
                </>
              );
            }}
          </PickGroup>
        ))}
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
                      {planLine(h.plan)}{h.recipe && describeRecipe(h.recipe) ? ` · ${describeRecipe(h.recipe)}` : ''}
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
