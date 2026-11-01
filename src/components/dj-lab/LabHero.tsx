import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FlaskConical, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadSets } from '@/lib/dj-lab/sets';
import { fmtTime, useHydrated, useLabEngine, useTicker } from './useLab';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The Lab's door on /dj: a live set shows what's playing, what's next and when it mixes (the set keeps
 * playing while you browse the app); otherwise the last set and a way in.
 */
export function LabHero() {
  const { engine, snap } = useLabEngine();
  const hydrated = useHydrated();
  const [last] = useState(() => loadSets()[0]);
  const live = snap.status === 'playing' || snap.status === 'paused';
  useTicker(live, 500);
  const toBlend = live ? engine.secondsToBlend() : null;
  const next = snap.next;

  return (
    <Card className="relative overflow-hidden border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <FlaskConical className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Transition Lab</h2>
            {live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                <span className={snap.status === 'playing' ? 'size-1.5 animate-pulse rounded-full bg-primary' : 'size-1.5 rounded-full bg-muted-foreground'} />
                {snap.status === 'playing' ? 'Live' : 'Paused'}
              </span>
            )}
          </div>
          {live && snap.now ? (
            <div className="mt-0.5 space-y-0.5 text-xs">
              <p className="truncate">
                <span className="font-medium">{snap.now.song.title}</span>
                <span className="text-muted-foreground"> · {snap.now.song.artist}</span>
              </p>
              <p className="truncate text-muted-foreground tabular-nums">
                {next
                  ? `Next: ${next.song.title}${toBlend !== null && toBlend > 0 ? ` · mix in ${fmtTime(toBlend)}` : next.state === 'mixing' ? ' · mixing' : ''}`
                  : 'Nothing locked next'}
                {` · ${(snap.now.analysis.bpm * snap.now.rate).toFixed(1)} BPM`}
              </p>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              A continuous mix that locks the next song on the beat.
              {hydrated && last ? ` Last set ${when(last.startedAt)}, ${last.tracks.length} tracks.` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {live && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5"
            onClick={() => {
              if (snap.status === 'playing') engine.pause();
              else {
                engine.unlockAudio();
                engine.resume();
              }
            }}
          >
            {snap.status === 'playing' ? <Pause className="size-4" /> : <Play className="size-4" />}
            {snap.status === 'playing' ? 'Pause' : 'Resume'}
          </Button>
        )}
        <Button asChild size="sm" className="ml-auto h-8 gap-1 px-3">
          <Link to="/dj/lab">
            {live ? 'Open set' : 'Start a set'} <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
