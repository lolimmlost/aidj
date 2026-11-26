/**
 * SleepTimerButton — arms/cancels the sleep timer (#171).
 *
 * Self-contained: it only writes intent to the isolated sleep-timer store.
 * PlayerBar's expiry watcher performs the actual pause via the existing
 * togglePlayPause path, so the audio store is never touched here.
 */

import { useEffect, useState, useCallback } from 'react';
import { Disc3, Moon, Plus, X } from 'lucide-react';
import { GlassSheet, SheetLabel, useIsPhone } from '@/components/glass/GlassSheet';
import { toast } from '@/lib/toast';
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
  /** Glass UI: on phones, open a bottom sheet instead of the dropdown. */
  glass?: boolean;
}

const PRESETS_MIN = [15, 30, 45, 60, 90];

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SleepTimerButton({ className, contentClassName, glass }: SleepTimerButtonProps) {
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const trigger = (
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
  );

  if (glass && phone) {
    const pick = (fn: () => void, label: string) => {
      fn();
      setSheetOpen(false);
      toast.success(label);
    };
    return (
      <>
        <span onClickCapture={() => setSheetOpen(true)} className="contents">{trigger}</span>
        <GlassSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Sleep timer"
          dark
          subtitle={armed ? undefined : 'Pause the music after…'}
          description="Choose when the music should stop"
        >
          {armed && (
            <div className="glass-surface mb-1 flex items-center gap-3 rounded-2xl px-4 py-3.5">
              <Moon className="size-6 shrink-0 fill-current text-primary" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                  {mode === 'end-of-track' ? 'STOPS AT THE END OF THIS SONG' : 'MUSIC STOPS IN'}
                </div>
                <div className="font-display text-[34px] font-extrabold leading-10 tabular-nums tracking-[-0.02em]">{fmt(remainingMs)}</div>
              </div>
              {mode !== 'end-of-track' && (
                <button
                  type="button"
                  onClick={() => armDuration(Math.max(0, remainingMs) + 15 * 60 * 1000)}
                  className="glass-flat flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold"
                >
                  <Plus className="size-3.5" /> 15 min
                </button>
              )}
            </div>
          )}
          {armed && <SheetLabel>CHANGE IT</SheetLabel>}
          <div className="grid grid-cols-3 gap-2 px-1 pt-1">
            {PRESETS_MIN.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => pick(() => armDuration(min * 60 * 1000), `Sleep timer: ${min} minutes`)}
                className="glass-flat flex h-[68px] flex-col items-center justify-center rounded-2xl [-webkit-tap-highlight-color:transparent] active:bg-foreground/10"
              >
                <span className="font-display text-[24px] font-extrabold leading-7 tabular-nums">{min}</span>
                <span className="text-[11px] text-muted-foreground">min</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => pick(handleEndOfTrack, 'Stopping at the end of this song')}
              className={cn(
                'glass-flat flex h-[68px] flex-col items-center justify-center gap-1 rounded-2xl [-webkit-tap-highlight-color:transparent] active:bg-foreground/10',
                mode === 'end-of-track' && armed && 'text-primary',
              )}
            >
              <Disc3 className="size-5" />
              <span className="text-[11px] font-medium leading-tight">End of song</span>
            </button>
          </div>
          {armed && (
            <button
              type="button"
              onClick={() => pick(clear, 'Sleep timer off')}
              className="mx-1 mt-3 flex h-12 w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-full bg-destructive/15 text-[15px] font-semibold text-destructive"
            >
              <X className="size-4" /> Turn off timer
            </button>
          )}
        </GlassSheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger}
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
