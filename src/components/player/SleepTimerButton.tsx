/**
 * SleepTimerButton — arms/cancels the sleep timer (#171).
 *
 * Self-contained: it only writes intent to the isolated sleep-timer store.
 * PlayerBar's expiry watcher performs the actual pause via the existing
 * togglePlayPause path, so the audio store is never touched here.
 */

import { useEffect, useState, useCallback } from 'react';
import { Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSleepTimer } from '@/lib/stores/sleep-timer';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';

interface SleepTimerButtonProps {
  className?: string;
  contentClassName?: string;
}

const PRESETS_MIN = [15, 30, 45, 60, 90];

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SleepTimerButton({ className, contentClassName }: SleepTimerButtonProps) {
  const mode = useSleepTimer((s) => s.mode);
  const expiresAt = useSleepTimer((s) => s.expiresAt);
  const armDuration = useSleepTimer((s) => s.armDuration);
  const armEndOfTrack = useSleepTimer((s) => s.armEndOfTrack);
  const clear = useSleepTimer((s) => s.clear);

  const armed = mode !== 'off' && expiresAt != null;

  // Live countdown for the label — only ticks while armed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [armed]);

  const remainingMs = armed && expiresAt != null ? expiresAt - now : 0;

  const handleEndOfTrack = useCallback(() => {
    const st = useAudioStore.getState();
    const song = st.playlist[st.currentSongIndex];
    const durationSec = song?.duration ?? 0;
    const remainingSec = Math.max(0, durationSec - st.currentTime);
    armEndOfTrack(remainingSec * 1000);
  }, [armEndOfTrack]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('relative', className)}
          aria-label={armed ? `Sleep timer: ${fmt(remainingMs)} left` : 'Sleep timer'}
          title={armed ? `Sleep timer — ${fmt(remainingMs)} left` : 'Sleep timer'}
        >
          <Moon className={cn('h-5 w-5', armed && 'fill-current text-primary')} />
          {armed && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold leading-none tabular-nums">
              {Math.max(0, Math.ceil(remainingMs / 60000))}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('w-48', contentClassName)}>
        <DropdownMenuLabel>
          {armed
            ? mode === 'end-of-track'
              ? `Stops at end of track (${fmt(remainingMs)})`
              : `Sleep in ${fmt(remainingMs)}`
            : 'Sleep timer'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESETS_MIN.map((min) => (
          <DropdownMenuItem
            key={min}
            className="min-h-[40px]"
            onClick={() => armDuration(min * 60 * 1000)}
          >
            {min} minutes
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="min-h-[40px]" onClick={handleEndOfTrack}>
          End of track
        </DropdownMenuItem>
        {armed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-[40px] text-destructive focus:text-destructive"
              onClick={clear}
            >
              Cancel timer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SleepTimerButton;
