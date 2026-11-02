import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Play, Square, Shuffle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';
import type { LabSong } from '@/lib/dj-lab/crate';
import type { EngineSnapshot, LabEngine, LoadedTrack } from '@/lib/dj-lab/engine';
import { FACTORS, renderPair, type Factor, type Variant } from '@/lib/dj-lab/ab';
import { QUICK_TAGS, lockRecord, newId, planRecord, saveVote, type VoteChoice } from '@/lib/dj-lab/votes';
import { fmtTime } from './useLab';

/**
 * Pick a crate track: a field that opens a search box and the list right under it. Not a Select: with
 * a whole crate in it, the menu opened above the field and wouldn't scroll on an iPhone (PWA).
 */
export function TrackPicker({
  label,
  songs,
  value,
  onPick,
}: {
  label: string;
  songs: { song: LabSong; analysis: TrackAnalysis }[];
  value?: LabSong;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? songs.filter((p) => `${p.song.title} ${p.song.artist}`.toLowerCase().includes(q)) : songs;
  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm text-foreground shadow-xs"
      >
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>{value ? `${value.title} · ${value.artist}` : 'Pick a track'}</span>
        <ChevronDown className={cn('size-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-1.5 rounded-md border p-1.5">
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title or artist" aria-label={`Filter ${label}`} className="h-8" />
          {/* a plain scrolling list: touch scrolls it natively */}
          <ul className="max-h-64 overflow-y-auto overscroll-contain">
            {shown.map((p) => (
              <li key={p.song.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.song.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50 active:bg-muted',
                    value?.id === p.song.id && 'bg-muted',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{p.song.title}</span>
                    <span className="block truncate text-[11px]">{p.song.artist}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{p.analysis.bpm.toFixed(1)}</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-1.5">Nothing matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

type Pool = { song: LabSong; analysis: TrackAnalysis }[];

/**
 * Blind A/B of one A → B transition: two renders that differ in one factor, sides shuffled. Vote,
 * then the labels and recipes are revealed (Blend A/B rounds 1–3, in the app).
 */
export function LabAB({ engine, snap, pool }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool }) {
  const [aId, setAId] = useState<string | undefined>(snap.now?.song.id);
  const [bId, setBId] = useState<string | undefined>(snap.next?.song.id);
  const [factor, setFactor] = useState<Factor>('bass');
  const [busy, setBusy] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [left, setLeft] = useState(0);
  const [playing, setPlaying] = useState<0 | 1 | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [, setTick] = useState(0);
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const tracks = useRef(new Map<string, LoadedTrack>());

  const songs = [...pool].sort((x, y) => x.song.title.localeCompare(y.song.title));
  const byId = (id?: string) => pool.find((p) => p.song.id === id)?.song ?? (id === snap.now?.song.id ? snap.now?.song : id === snap.next?.song.id ? snap.next?.song : undefined);
  const A = byId(aId);
  const B = byId(bId);

  // stop a playing clip when leaving the tab
  useEffect(
    () => () => {
      try {
        srcRef.current?.stop();
      } catch {
        // not started
      }
    },
    [],
  );
  useEffect(() => {
    if (playing === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [playing]);

  function stop() {
    try {
      srcRef.current?.stop();
    } catch {
      // not started
    }
    srcRef.current = null;
    setPlaying(null);
  }

  async function load(song: LabSong) {
    const hit = tracks.current.get(song.id);
    if (hit) return hit;
    const t = await engine.loadTrack(song);
    tracks.current.set(song.id, t);
    return t;
  }

  async function render() {
    if (!A || !B || A.id === B.id) return;
    engine.unlockAudio();
    stop();
    setVariants(null);
    setChoice(null);
    setTags([]);
    setNote('');
    try {
      setBusy('Loading both tracks…');
      const [ta, tb] = await Promise.all([load(A), load(B)]);
      setBusy('Rendering both variants…');
      const res = await renderPair(ta, tb, snap.setBpm, snap.mode, factor, snap.defaults.hard);
      if (typeof res === 'string') {
        toast.info(res);
        return;
      }
      setLeft(Math.random() < 0.5 ? 0 : 1);
      setVariants(res);
    } catch (e) {
      toast.error(`Render failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function play(side: 0 | 1) {
    const ctx = engine.unlockAudio();
    if (!variants) return;
    stop();
    engine.pause();
    const v = variants[side === 0 ? left : 1 - left];
    const src = ctx.createBufferSource();
    src.buffer = v.buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (srcRef.current === src) {
        srcRef.current = null;
        setPlaying(null);
      }
    };
    src.start();
    srcRef.current = src;
    setStartedAt(ctx.currentTime);
    setPlaying(side);
  }

  function vote(c: VoteChoice) {
    if (!variants || !A || !B) return;
    const lv = variants[left];
    const rv = variants[1 - left];
    saveVote({
      id: newId(),
      at: new Date().toISOString(),
      kind: 'ab',
      a: { id: A.id, title: A.title, artist: A.artist },
      b: { id: B.id, title: B.title, artist: B.artist },
      setBpm: snap.setBpm,
      factor,
      variants: variants.map((v) => ({ label: v.label, recipe: v.recipe, plan: planRecord(v.plan), lock: lockRecord(v.lock) })),
      left,
      choice: c,
      winner: c === 'L' ? lv.label : c === 'R' ? rv.label : null,
      tags,
      note,
    });
    setChoice(c);
    stop();
  }

  const winner = choice === 'L' ? variants?.[left] : choice === 'R' ? variants?.[1 - left] : null;
  const livePair = snap.now?.song.id === aId && snap.next?.song.id === bId;
  const canApply = winner && livePair && snap.next && snap.next.state !== 'committed' && snap.next.state !== 'mixing';
  const ctxNow = engine.audioContext?.currentTime ?? 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['A (out)', aId, setAId],
              ['B (in)', bId, setBId],
            ] as const
          ).map(([label, value, set]) => (
            <TrackPicker key={label} label={label} songs={songs} value={value ? byId(value) : undefined} onPick={set} />
          ))}
        </div>
        <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
          What changes
          <Select value={factor} onValueChange={(v) => setFactor(v as Factor)}>
            <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FACTORS) as Factor[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FACTORS[f].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void render()} disabled={!A || !B || A.id === B.id || !!busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
            {busy ?? 'Render blind pair'}
          </Button>
          {snap.now && snap.next && !livePair && (
            <Button
              variant="ghost"
              onClick={() => {
                setAId(snap.now?.song.id);
                setBId(snap.next?.song.id);
              }}
            >
              Use the live pair
            </Button>
          )}
        </div>
      </Card>

      {variants && (
        <Card className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as const).map((side) => {
              const v = variants[side === 0 ? left : 1 - left];
              const on = playing === side;
              const t = on ? ctxNow - startedAt : 0;
              return (
                <Button
                  key={side}
                  variant={on ? 'default' : 'outline'}
                  className="h-auto flex-col gap-1 py-3"
                  onClick={() => (on ? stop() : play(side))}
                >
                  <span className="flex items-center gap-1.5 text-base font-semibold">
                    {on ? <Square className="size-4" /> : <Play className="size-4" />} {side === 0 ? 'Left' : 'Right'}
                  </span>
                  <span className="text-xs tabular-nums opacity-80">
                    {on ? `${fmtTime(t)} / ` : ''}
                    {fmtTime(v.buffer.duration)}
                    {on && t >= v.entryAt && t < v.swapAt ? ' · blending' : on && t >= v.swapAt ? ' · B' : ''}
                  </span>
                  {choice && (
                    <span className="text-xs">
                      {v.label} · lock {v.lock.verified ? '✓' : '✗'} {v.lock.p90Ms?.toFixed(1) ?? 'n/a'} ms
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Each clip: 8 bars of A, the transition, 8 bars of B. Blend starts at {fmtTime(variants[0].entryAt)}.</p>

          {!choice ? (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {(['L', 'R', 'both', 'neither'] as VoteChoice[]).map((c) => (
                  <Button key={c} variant="secondary" onClick={() => vote(c)}>
                    {c === 'L' ? 'Left' : c === 'R' ? 'Right' : c === 'both' ? 'Both good' : 'Neither'}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}
                    className={cn('rounded-full border px-2.5 py-1 text-xs', tags.includes(t) ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground')}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): what made it?" rows={2} />
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-sm">
                Saved. Left was <Badge variant="outline">{variants[left].label}</Badge>, right was <Badge variant="outline">{variants[1 - left].label}</Badge>.
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {variants.map((v) => (
                  <li key={v.label}>
                    <span className="font-medium text-foreground">{v.label}:</span> {v.plan.how}; {v.plan.bass === 'sweep' ? 'filter sweep' : `hard swap, ${v.plan.kill}-bar kill`}
                    {v.plan.hold ? `; build held ${v.plan.hold} bars (no lock)` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {canApply && (
                  <Button size="sm" className="gap-1.5" onClick={() => void engine.relock(winner.recipe).then(() => toast.success(`Locked transition re-planned: ${winner.label}`))}>
                    <Wand2 className="size-3.5" /> Use {winner.label} on the live transition
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void render()}>
                  Next comparison
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
