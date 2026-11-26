import { Waveform } from '@/components/glass/Waveform';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * The full player's position: the glass waveform on phones, a slider elsewhere (and in short
 * landscape), elapsed and remaining time under it.
 */
export function Scrubber({ songId, currentTime, duration, onSeek, glass }: {
  songId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  glass: boolean;
}) {
  const t = isFinite(currentTime) ? currentTime : 0;
  const d = isFinite(duration) && duration > 0 ? duration : 0;
  return (
    <div className="w-full space-y-2">
      {glass && (
        <Waveform
          seed={songId}
          current={t}
          duration={d}
          onSeek={onSeek}
          playedClassName="bg-primary"
          unplayedClassName="bg-white/20"
          className="h-8 md:hidden short-landscape:hidden"
        />
      )}
      <Slider
        value={[t]}
        max={d || 100}
        step={0.1}
        onValueChange={([v]) => onSeek(v)}
        className={cn(
          'w-full [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white',
          glass && 'max-md:hidden short-landscape:flex',
        )}
      />
      <div className="flex justify-between font-mono text-xs text-white/50">
        <span>{formatTime(t)}</span>
        <span>-{formatTime(Math.max(0, d - t))}</span>
      </div>
    </div>
  );
}
