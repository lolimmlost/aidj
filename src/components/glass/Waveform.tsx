import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const BAR_COUNT = 48;

/**
 * Bar heights (0..1) for a song. Prototype: a stable shape derived from the
 * song id, so each song always looks the same but it is not its real audio.
 * Real peaks (decoded once, cached per song) can replace this without changing
 * the component.
 */
export function waveformShape(seed: string, count = BAR_COUNT): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
  const phase = rnd() * Math.PI;
  const waves = 2 + rnd() * 2;
  return Array.from({ length: count }, (_, i) => {
    const env = 0.35 + 0.65 * Math.sin((i / count) * Math.PI * waves + phase) ** 2;
    return Math.max(0.12, env * (0.45 + rnd() * 0.55));
  });
}

interface WaveformProps {
  seed: string;
  current: number;
  duration: number;
  onSeek?: (seconds: number) => void;
  disabled?: boolean;
  /** Tailwind classes for played / unplayed bars. */
  playedClassName?: string;
  unplayedClassName?: string;
  className?: string;
  label?: string;
}

/**
 * SoundCloud-style progress: the bars fill in as the song plays. A transparent
 * native range input sits on top, so dragging, tapping and keyboard seeking all
 * work and screen readers get a real slider.
 */
export function Waveform({
  seed,
  current,
  duration,
  onSeek,
  disabled,
  playedClassName = 'bg-primary',
  unplayedClassName = 'bg-foreground/15',
  className,
  label = 'Seek',
}: WaveformProps) {
  const bars = useMemo(() => waveformShape(seed), [seed]);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = Number.isFinite(current) ? Math.min(Math.max(current, 0), safeDuration || 0) : 0;
  const played = safeDuration > 0 ? safeCurrent / safeDuration : 0;

  return (
    <div className={cn('relative flex h-6 items-center gap-[2px]', className)}>
      {bars.map((h, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'flex-1 rounded-[1px] transition-colors duration-150',
            i / bars.length <= played ? playedClassName : unplayedClassName,
          )}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
      <input
        type="range"
        min={0}
        max={safeDuration || 100}
        step={0.1}
        value={safeCurrent}
        disabled={disabled || safeDuration === 0}
        onChange={(e) => onSeek?.(Number(e.target.value))}
        aria-label={label}
        className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </div>
  );
}
