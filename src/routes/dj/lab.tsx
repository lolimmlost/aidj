import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FlaskConical, Loader2, Play } from 'lucide-react';
import { loginRedirect } from '~/lib/auth/login-redirect';
import { PageLayout } from '@/components/ui/page-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAudioStore } from '@/lib/stores/audio';
import { listCrates, rankCandidates, MAX_STRETCH } from '@/lib/dj-lab/crate';
import type { LabEngine } from '@/lib/dj-lab/engine';
import { loadVotes } from '@/lib/dj-lab/votes';
import { startLabLog } from '@/lib/dj-lab/log';
import { useCrate, useHydrated, useLabEngine } from '@/components/dj-lab/useLab';
import { LabMix } from '@/components/dj-lab/LabMix';
import { LabAB } from '@/components/dj-lab/LabAB';
import { LabVotes } from '@/components/dj-lab/LabVotes';
import { LabLog, useDiedBanner } from '@/components/dj-lab/LabLog';
import { RecentSets } from '@/components/dj-lab/RecentSets';
import { TempoWindow } from '@/components/dj-lab/TempoWindow';
import { cn } from '@/lib/utils';

const stretchPct = (setBpm: number, bpm: number) => {
  const pct = (setBpm / bpm - 1) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

export const Route = createFileRoute('/dj/lab')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) throw loginRedirect(location);
    if (context.user.role !== 'admin') throw redirect({ to: '/dj' });
  },
  component: DJLab,
});

const CRATE_KEY = 'aidj:dj-lab:crate';

let appPlayerWatched = false;
/** The Lab and the app's player never play over each other. */
function watchAppPlayer(engine: LabEngine) {
  engine.setOnBeforePlay(() => useAudioStore.getState().setIsPlaying(false));
  if (appPlayerWatched) return;
  appPlayerWatched = true;
  useAudioStore.subscribe((s, prev) => {
    if (s.isPlaying && !prev.isPlaying && engine.getSnapshot().status === 'playing') engine.pause();
  });
}

function DJLab() {
  const { engine, snap } = useLabEngine();
  const [crateId, setCrateId] = useState<string | null>(null);
  const [tab, setTab] = useState('mix');
  // set tempo follows the opener unless you type one
  const [tempoManual, setTempoManual] = useState(false);
  const crates = useQuery({ queryKey: ['dj-lab', 'crates'], queryFn: listCrates, staleTime: 5 * 60_000 });
  const crate = useCrate(crateId);
  const pool = useMemo(
    () => crate.songs.filter((s) => crate.analyses.has(s.id)).map((s) => ({ song: s, analysis: crate.analyses.get(s.id)! })),
    [crate],
  );

  useEffect(() => {
    try {
      setCrateId(localStorage.getItem(CRATE_KEY));
    } catch {
      // no storage: pick again
    }
  }, []);

  useEffect(() => watchAppPlayer(engine), [engine]);
  useEffect(() => engine.loadDefaults(), [engine]);
  useEffect(() => startLabLog(), []);
  const died = useDiedBanner();

  // auto-lock picks the best-ranked crate track
  useEffect(() => {
    engine.setPicker(
      (now, played) =>
        rankCandidates({ song: now.song, analysis: now.analysis }, pool, {
          setBpm: snap.setBpm,
          played,
          mode: snap.mode,
          window: { down: snap.defaults.tempoDown, up: snap.defaults.tempoUp },
        })[0]?.song ?? null,
    );
    // the set may start before the crate is analysed: pick as soon as there's something to pick
    engine.maybeAutoLock();
  }, [engine, pool, snap.setBpm, snap.mode, snap.autoLock, snap.status, snap.now, snap.next, snap.defaults.tempoDown, snap.defaults.tempoUp]);

  const chooseCrate = (id: string) => {
    setCrateId(id);
    try {
      localStorage.setItem(CRATE_KEY, id);
    } catch {
      // ignore
    }
  };

  const live = snap.status !== 'idle';
  const openers = useMemo(
    () =>
      tempoManual
        ? pool
            .filter((p) => Math.abs(snap.setBpm / p.analysis.bpm - 1) <= MAX_STRETCH)
            .sort((x, y) => Math.abs(snap.setBpm / x.analysis.bpm - 1) - Math.abs(snap.setBpm / y.analysis.bpm - 1))
        : [...pool].sort((x, y) => x.analysis.bpm - y.analysis.bpm),
    [pool, snap.setBpm, tempoManual],
  );
  const startSet = (p: (typeof pool)[number]) => {
    // Auto: the set runs at the opener's own tempo, so it plays unstretched
    if (!tempoManual) engine.setSetBpm(Math.round(p.analysis.bpm * 10) / 10);
    void engine.start(p.song);
  };
  // localStorage only after hydration: the server render has no votes
  const hydrated = useHydrated();
  const voteCount = useMemo(() => (hydrated ? loadVotes().length : 0), [hydrated, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageLayout
      title="Transition Lab"
      description="A continuous mix that locks the next song, and blind A/B of the transitions"
      icon={<FlaskConical className="h-5 w-5" />}
      backLink="/dj"
      backLabel="DJ Tools"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
              Crate
              <Select value={crateId ?? undefined} onValueChange={chooseCrate}>
                <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate">
                  <SelectValue placeholder={crates.isLoading ? 'Loading playlists…' : 'Pick a playlist'} />
                </SelectTrigger>
                <SelectContent>
                  {crates.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.songCount ? ` · ${c.songCount}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="flex items-center justify-between gap-2">
                Set tempo
                {tempoManual && !live && (
                  <button type="button" className="text-primary" onClick={() => setTempoManual(false)}>
                    auto
                  </button>
                )}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={70}
                max={190}
                step={1}
                value={live || tempoManual ? snap.setBpm : ''}
                placeholder="Opener's"
                disabled={live}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTempoManual(true);
                  if (v >= 70 && v <= 190) engine.setSetBpm(v);
                }}
                className="w-28"
              />
            </label>
            <div className="space-y-1 text-xs text-muted-foreground">
              Recipe
              <div className="flex rounded-md border p-0.5">
                {(['dropchain', 'classic'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => engine.setMode(m)}
                    className={cn('rounded px-2.5 py-1.5 text-xs font-medium', snap.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                  >
                    {m === 'dropchain' ? 'Drop-chain' : 'Classic'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-2">
                <Switch checked={snap.autoLock} onCheckedChange={(v) => engine.setAutoLock(v)} />
                Auto-lock the best next song
              </label>
              <label className="flex items-center gap-2" title="The first song runs to its end before the first transition">
                <Switch checked={snap.defaults.openerPlaysOut} onCheckedChange={(v) => engine.setDefaults({ openerPlaysOut: v })} />
                Opener plays out
              </label>
              <label className="flex items-center gap-2" title="Next songs come in on their first drop instead of their main drop">
                <Switch checked={snap.defaults.preferFirstDrop} onCheckedChange={(v) => engine.setDefaults({ preferFirstDrop: v })} />
                Prefer first drops
              </label>
            </div>
            <span className="tabular-nums">
              {crate.loading
                ? 'Loading crate…'
                : crate.error
                  ? `Crate failed: ${crate.error}`
                  : crate.songs.length
                    ? `${crate.done}/${crate.songs.length} analysed${crate.failed ? `, ${crate.failed} failed` : ''}${crate.scanning ? '…' : ''}`
                    : ''}
            </span>
          </div>
          <TempoWindow
            down={snap.defaults.tempoDown}
            up={snap.defaults.tempoUp}
            playing={snap.now ? snap.now.analysis.bpm * snap.now.rate : snap.setBpm}
            onChange={(down, up) => engine.setDefaults({ tempoDown: down, tempoUp: up })}
          />
          {snap.message && <p className="text-sm text-muted-foreground">{snap.message}</p>}
          {died && !live && (
            <button
              type="button"
              onClick={() => setTab('log')}
              className="flex w-full items-start gap-2 rounded-md bg-destructive/10 p-2 text-left text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                The last set stopped when the page reloaded mid-set
                {typeof died.data?.lastBeatAt === 'string' ? ` (around ${new Date(died.data.lastBeatAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : ''}
                . The phone may have closed it for memory. See the Log tab.
              </span>
            </button>
          )}
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="mix" className="flex-1">
              Mix
            </TabsTrigger>
            <TabsTrigger value="ab" className="flex-1">
              A/B
            </TabsTrigger>
            <TabsTrigger value="votes" className="flex-1">
              Votes{voteCount ? ` (${voteCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="log" className="flex-1">
              Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mix" className="mt-4">
            {live && snap.now ? (
              <LabMix engine={engine} snap={snap} pool={pool} />
            ) : snap.status === 'loading' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {snap.message ?? 'Loading…'}
              </p>
            ) : (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Pick the opener</h3>
                {!crateId && <p className="text-sm text-muted-foreground">Pick a crate first. Its tracks get analysed in the background (once, then cached).</p>}
                {crateId && !openers.length && !crate.loading && (
                  <p className="text-sm text-muted-foreground">
                    {tempoManual ? `No analysed track within ±8 % of ${snap.setBpm} BPM yet.` : 'No analysed tracks yet.'}
                  </p>
                )}
                {!tempoManual && openers.length > 0 && (
                  <p className="text-xs text-muted-foreground">The set runs at the opener's tempo. Type a set tempo to stretch everything to it.</p>
                )}
                <ul className="divide-y rounded-lg border">
                  {openers.slice(0, 200).map((p) => (
                    <li key={p.song.id} className="flex items-center gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.song.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.song.artist} · track {p.analysis.bpm.toFixed(1)} BPM
                          {tempoManual ? ` → plays at ${snap.setBpm} (${stretchPct(snap.setBpm, p.analysis.bpm)})` : ''} · {p.analysis.drops.length} drops
                        </div>
                      </div>
                      <Button size="sm" className="shrink-0 gap-1.5" onClick={() => startSet(p)}>
                        <Play className="size-3.5" /> Start set
                      </Button>
                    </li>
                  ))}
                </ul>
                <RecentSets />
              </section>
            )}
          </TabsContent>

          <TabsContent value="ab" className="mt-4">
            <LabAB engine={engine} snap={snap} pool={pool} />
          </TabsContent>

          <TabsContent value="votes" className="mt-4">
            <LabVotes />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <LabLog />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
