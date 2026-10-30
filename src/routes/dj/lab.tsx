import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, FlaskConical, Loader2, Play, Settings2 } from 'lucide-react';
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
  // mid-set the setup folds into one line
  const [setupOpen, setSetupOpen] = useState(false);
  const showSetup = !live || setupOpen;
  const crateName = crates.data?.find((c) => c.id === crateId)?.name;
  const scanText = crate.loading
    ? 'Loading crate…'
    : crate.error
      ? `Crate failed: ${crate.error}`
      : crate.songs.length
        ? `${crate.done}/${crate.songs.length} analysed${crate.failed ? `, ${crate.failed} failed` : ''}${crate.scanning ? '…' : ''}`
        : '';
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
      icon={<FlaskConical className="h-5 w-5" />}
      compact
      backLink="/dj"
      backLabel="DJ Tools"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <Card className="space-y-2 p-2.5">
          {live && (
            <button
              type="button"
              onClick={() => setSetupOpen(!setupOpen)}
              aria-expanded={showSetup}
              className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate tabular-nums">
                <span className="font-medium text-foreground">{crateName ?? 'Crate'}</span> · {snap.setBpm} BPM ·{' '}
                {snap.mode === 'dropchain' ? 'drop-chain' : 'classic'} · −{snap.defaults.tempoDown}…+{snap.defaults.tempoUp} %
                {snap.autoLock ? ' · auto-lock' : ''}
                {crate.scanning ? ` · ${scanText}` : ''}
              </span>
              <Settings2 className="size-3.5 shrink-0" />
              <ChevronDown className={cn('size-4 shrink-0 transition-transform', showSetup && 'rotate-180')} />
            </button>
          )}
          {showSetup && (
            <>
              <div className="flex items-center gap-2">
                <Select value={crateId ?? undefined} onValueChange={chooseCrate}>
                  <SelectTrigger
                    size="sm"
                    aria-label="Crate"
                    className="min-w-0 flex-1 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
                  >
                    <SelectValue placeholder={crates.isLoading ? 'Loading playlists…' : 'Pick a crate (playlist)'} />
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
                <Input
                  type="number"
                  inputMode="decimal"
                  min={70}
                  max={190}
                  step={1}
                  value={live || tempoManual ? snap.setBpm : ''}
                  placeholder="Auto"
                  disabled={live}
                  aria-label="Set tempo (BPM)"
                  title="Set tempo: blank = the opener's own tempo"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTempoManual(true);
                    if (v >= 70 && v <= 190) engine.setSetBpm(v);
                  }}
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">
                  {tempoManual && !live ? (
                    <button type="button" className="text-primary" onClick={() => setTempoManual(false)}>
                      auto
                    </button>
                  ) : (
                    'BPM'
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <div className="flex rounded-md border p-0.5" role="group" aria-label="Recipe">
                  {(['dropchain', 'classic'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => engine.setMode(m)}
                      aria-pressed={snap.mode === m}
                      className={cn('rounded px-2 py-0.5 text-[11px] font-medium', snap.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                    >
                      {m === 'dropchain' ? 'Drop-chain' : 'Classic'}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5" title="Lock the best next song automatically">
                  <Switch checked={snap.autoLock} onCheckedChange={(v) => engine.setAutoLock(v)} />
                  Auto-lock
                </label>
                <label className="flex items-center gap-1.5" title="The first song runs to its end before the first transition">
                  <Switch checked={snap.defaults.openerPlaysOut} onCheckedChange={(v) => engine.setDefaults({ openerPlaysOut: v })} />
                  Opener plays out
                </label>
                <label className="flex items-center gap-1.5" title="Next songs come in on their first drop instead of their main drop">
                  <Switch checked={snap.defaults.preferFirstDrop} onCheckedChange={(v) => engine.setDefaults({ preferFirstDrop: v })} />
                  1st drops
                </label>
                {scanText && <span className="ml-auto tabular-nums">{scanText}</span>}
              </div>
              <TempoWindow
                down={snap.defaults.tempoDown}
                up={snap.defaults.tempoUp}
                playing={snap.now ? snap.now.analysis.bpm * snap.now.rate : snap.setBpm}
                onChange={(down, up) => engine.setDefaults({ tempoDown: down, tempoUp: up })}
              />
            </>
          )}
          {snap.message && <p className="text-xs text-muted-foreground">{snap.message}</p>}
          {died && !live && (
            <button
              type="button"
              onClick={() => setTab('log')}
              className="flex w-full items-start gap-2 rounded-md bg-destructive/10 p-2 text-left text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
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

          <TabsContent value="mix" className="mt-3">
            {live && snap.now ? (
              <LabMix engine={engine} snap={snap} pool={pool} />
            ) : snap.status === 'loading' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {snap.message ?? 'Loading…'}
              </p>
            ) : (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold">Pick the opener</h3>
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
                    <li key={p.song.id} className="flex items-center gap-2 px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.song.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {p.song.artist} · track {p.analysis.bpm.toFixed(1)} BPM
                          {tempoManual ? ` → plays at ${snap.setBpm} (${stretchPct(snap.setBpm, p.analysis.bpm)})` : ''} · {p.analysis.drops.length} drops
                        </div>
                      </div>
                      <Button size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => startSet(p)}>
                        <Play className="size-3" /> Start
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
