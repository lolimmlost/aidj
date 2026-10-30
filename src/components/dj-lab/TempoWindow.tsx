import { Slider } from '@/components/ui/slider';
import { MAX_STRETCH } from '@/lib/dj-lab/crate';

const LIMIT = MAX_STRETCH * 100;

/**
 * How much slower / faster than what's playing the next track may be (#378). Two handles, so the
 * window can lean one way (e.g. −1 … +3 % on a climb). Up next and auto-lock both follow it.
 */
export function TempoWindow({
  down,
  up,
  playing,
  onChange,
}: {
  down: number;
  up: number;
  playing: number;
  onChange: (down: number, up: number) => void;
}) {
  const lo = playing * (1 - down / 100);
  const hi = playing * (1 + up / 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          Next track tempo: <span className="font-medium text-foreground tabular-nums">−{down} % … +{up} %</span>
        </span>
        <span className="tabular-nums">
          {lo.toFixed(1)}–{hi.toFixed(1)} BPM (playing {playing.toFixed(1)})
        </span>
      </div>
      <Slider
        min={-LIMIT}
        max={LIMIT}
        step={0.5}
        minStepsBetweenThumbs={1}
        value={[-down, up]}
        onValueChange={([a, b]) => onChange(Math.max(0, -a), Math.max(0, b))}
        aria-label="Next track tempo window"
      />
    </div>
  );
}
