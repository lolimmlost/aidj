import { AlertTriangle, Check, Circle, Loader2, Pause, Play, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { barTime } from '@/lib/dj-lab/analysis';
import type { EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';
import { fmtTime, useTicker } from './useLab';

const pct = (x: number) => `${Math.max(0, Math.min(100, x * 100))}%`;

/**
 * Sticky while a set runs, on every tab: play/pause, what's playing → what's next, the countdown to the
 * mix, and the playing track's progress with the mix point marked.
 */
export function LiveBar({ engine, snap }: { engine: LabEngine; snap: EngineSnapshot }) {
  useTicker(true, 250);
  const now = snap.now;
  if (!now) return null;
  const next = snap.next;
  const playing = snap.status === 'playing';
  const frozen = next?.state === 'committed' || next?.state === 'mixing';
  const pos = engine.position('now') ?? 0;
  const dur = Math.max(1, now.analysis.duration);
  const mixAt = next?.plan ? barTime(now.analysis, next.plan.entryA) : null;
  const toBlend = engine.secondsToBlend();
  // iOS stopped the audio (a call, Siri, another app): the engine keeps retrying, a tap always works
  const interrupted = playing && !!snap.audio && snap.audio !== 'running';
  const countdown =
    next?.state === 'mixing' ? 'mixing' : toBlend !== null && toBlend > 0 ? fmtTime(toBlend) : next?.state === 'loading' ? '…' : '–';

  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+3rem)] z-20 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border md:top-2">
      <div className="flex items-center gap-2.5">
        <Button
          size="icon"
          className="size-9 shrink-0 rounded-full"
          aria-label={playing ? 'Pause' : 'Resume'}
          onClick={() => {
            if (playing) engine.pause();
            else {
              engine.unlockAudio();
              engine.resume();
            }
          }}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{now.song.title}</div>
          <div className="truncate text-[11px] text-muted-foreground tabular-nums">
            {(now.analysis.bpm * now.rate).toFixed(1)} BPM · {next ? `next ${next.song.title}` : 'nothing locked next'}
            {snap.queue.length ? ` + ${snap.queue.length} queued` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <div className={cn('text-sm font-semibold tabular-nums', frozen && 'text-primary')}>{countdown}</div>
          <div className="text-[10px] text-muted-foreground">{next?.state === 'mixing' ? '' : 'to the mix'}</div>
        </div>
        <RecButton engine={engine} snap={snap} />
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          disabled={frozen}
          onClick={() => engine.skipAhead(6)}
          aria-label={next?.plan ? 'Jump to 6 bars before the mix' : 'Jump 16 bars ahead'}
          title={next?.plan ? 'Jump to 6 bars before the mix' : 'Jump 16 bars ahead'}
        >
          <SkipForward className="size-4" />
        </Button>
      </div>
      {interrupted && (
        <button
          type="button"
          onClick={() => engine.unlockAudio()}
          className="mt-1.5 flex w-full items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-left text-[11px] text-warning"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          The phone paused the audio (a call or another app). Tap to resume.
        </button>
      )}
      <div className="relative mt-1.5 h-1 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(pos / dur) }} />
        {mixAt !== null && <div className="absolute -top-0.5 h-2 w-0.5 rounded bg-foreground" style={{ left: pct(mixAt / dur) }} title="Mix starts" />}
      </div>
    </div>
  );
}

/** Record the set as it plays (#391): ● and the time while it records; tap again to stop and save. */
function RecButton({ engine, snap }: { engine: LabEngine; snap: EngineSnapshot }) {
  const r = snap.recording;
  const live = r && !r.saving && !r.file && !r.error;
  if (r?.saving) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Uploading the last of the recording">
        <Loader2 className="size-3.5 animate-spin" /> saving
      </span>
    );
  }
  if (live) {
    const sec = Math.floor(engine.recordingSeconds() ?? 0);
    return (
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Stop recording? It is saved with the tracklist.')) void engine.stopRecording();
        }}
        className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-destructive"
        aria-label="Stop recording"
        title={r.pending ? `${r.pending} chunks waiting to upload` : 'Recording: tap to stop and save'}
      >
        <span className="size-2 animate-pulse rounded-full bg-destructive" />
        {fmtTime(sec)}
        {r.pending > 2 ? ` · ${r.pending}↑` : ''}
      </button>
    );
  }
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 shrink-0"
      onClick={() => engine.startRecording()}
      aria-label="Record the set"
      title={r?.file ? `Last recording saved (${r.file}). Tap to record again` : r?.error ? `Last recording failed: ${r.error}` : 'Record the set as it plays'}
    >
      {r?.file ? <Check className="size-4 text-primary" /> : r?.error ? <AlertTriangle className="size-4 text-warning" /> : <Circle className="size-4 fill-destructive text-destructive" />}
    </Button>
  );
}
