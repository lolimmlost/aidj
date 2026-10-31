import { useState, useSyncExternalStore } from 'react';
import { Copy, FlaskConical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { clearLabLog, formatEntry, labLogEntries, labLogSid, labLogText, subscribeLabLog, type LabLogEntry } from '@/lib/dj-lab/log';
import { loadMemProgress, MEM_LABEL, MEM_VARIANTS, resetMemTest, runMemTest, type MemProgress } from '@/lib/dj-lab/memtest';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';
import type { LabSong } from '@/lib/dj-lab/crate';
import type { LabEngine } from '@/lib/dj-lab/engine';
import { useHydrated } from './useLab';

const NONE: LabLogEntry[] = [];

export function useLabLog() {
  return useSyncExternalStore(subscribeLabLog, labLogEntries, () => NONE);
}

/** This page load's report that the previous one died mid-set, if it did. */
export function useDiedBanner(): LabLogEntry | null {
  const entries = useLabLog();
  const sid = labLogSid();
  return [...entries].reverse().find((e) => e.ev === 'previous page died mid-set' && e.sid === sid) ?? null;
}

/**
 * Which way of loading tracks the phone keeps memory from: one long track loaded 25 times per
 * variant. A variant that gets the page killed shows as "died at round N" after the reload.
 */
function MemTest({ engine, live, pool }: { engine: LabEngine; live: boolean; pool: { song: LabSong; analysis: TrackAnalysis }[] }) {
  const hydrated = useHydrated();
  const [progress, setProgress] = useState<MemProgress>(() => loadMemProgress());
  const [running, setRunning] = useState(false);
  const longest = pool.reduce<(typeof pool)[number] | null>((a, p) => (!a || p.analysis.duration > a.analysis.duration ? p : a), null);
  if (!hydrated) return null;
  const done = MEM_VARIANTS.every((v) => progress.results[v]);
  const run = async () => {
    if (!longest) return;
    const ctx = engine.unlockAudio();
    setRunning(true);
    try {
      await runMemTest(longest.song, ctx, setProgress);
    } catch (e) {
      toast.error(`Memory test stopped: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(loadMemProgress());
    }
  };
  return (
    <section className="space-y-2 rounded-lg border p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-primary" />
        <span className="font-semibold">Phone memory test</span>
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" className="h-7 px-2 text-xs" disabled={running || live || !longest || done} onClick={run}>
            {running ? 'Running…' : Object.keys(progress.results).length || progress.current ? 'Continue' : 'Run'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={running} onClick={() => {
              resetMemTest();
              setProgress(loadMemProgress());
            }}>
            Reset
          </Button>
        </span>
      </div>
      <p className="text-muted-foreground">
        Loads {longest ? `“${longest.song.title}” (${Math.round(longest.analysis.duration / 60)} min)` : 'the longest analysed track'} 25 times, four ways. If the
        page reloads, open the Lab and tap Continue: the way that crashed is marked and the test moves on.{live ? ' Stop the set first.' : ''}
      </p>
      <ul className="space-y-0.5">
        {MEM_VARIANTS.map((v) => {
          const r = progress.results[v];
          const now = progress.current?.variant === v;
          return (
            <li key={v} className="flex justify-between gap-2">
              <span>{MEM_LABEL[v]}</span>
              <span className={r?.startsWith('died') ? 'text-destructive' : r === 'ok' ? 'text-success' : 'text-muted-foreground'}>
                {r ?? (now ? (running ? `round ${progress.current!.round}/25` : `died at round ${progress.current!.round}?`) : '–')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The flight recorder: everything the Lab did in this browser (kept across reloads, newest first).
 * The same events reach the server log, so this is for reading on the device.
 */
export function LabLog({ engine, live, pool }: { engine: LabEngine; live: boolean; pool: { song: LabSong; analysis: TrackAnalysis }[] }) {
  const entries = useLabLog();
  const sid = labLogSid();
  const list = [...entries].reverse();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(labLogText(entries));
      toast.success(`Copied ${entries.length} log lines`);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className="space-y-3">
      <MemTest engine={engine} live={live} pool={pool} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {entries.length} events in this browser, also sent to the server log. This page is <span className="font-mono">{sid}</span>.
        </p>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!entries.length} onClick={copy}>
            <Copy className="size-4" /> Copy
          </Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Clear the log" disabled={!entries.length} onClick={clearLabLog}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <ul className="max-h-[70vh] divide-y overflow-y-auto rounded-lg border font-mono text-[11px] leading-snug">
        {list.map((e, i) => (
          <li
            key={e.seq}
            className={cn(
              'break-words px-2 py-1',
              e.level === 'error' && 'bg-destructive/10 text-destructive',
              e.level === 'warn' && 'text-warning',
              e.sid !== sid && 'opacity-70',
              // a new page load starts below this line
              list[i + 1] && list[i + 1].sid !== e.sid && 'border-b-2 border-b-primary/40',
            )}
          >
            {formatEntry(e)}
          </li>
        ))}
        {!entries.length && <li className="p-4 font-sans text-sm text-muted-foreground">Nothing logged yet.</li>}
      </ul>
    </div>
  );
}
