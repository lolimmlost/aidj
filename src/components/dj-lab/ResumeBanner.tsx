import { Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { parseSongLabel, type ResumePoint } from '@/lib/dj-lab/resume';
import { setTime } from '@/lib/dj-lab/sets';

/**
 * The Lab page went away mid-set (#439): it died, or the set is still open in another window of the
 * app. Offer to pick the set back up at the song and bar it was on.
 */
export function ResumeBanner({
  point,
  busy,
  onResume,
  onDismiss,
}: {
  point: ResumePoint;
  busy: boolean;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const song = parseSongLabel(point.song);
  const elsewhere = point.reason === 'other-window';
  return (
    <Card role="status" className="space-y-2 border-primary/40 p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{elsewhere ? 'Your set is still open in another window' : 'Your set stopped when the page reloaded'}</p>
        {song && (
          <p className="truncate text-xs text-muted-foreground">
            {song.title}
            {song.artist ? ` · ${song.artist}` : ''}
            {point.pos ? ` · at ${setTime(point.pos)}` : ''}
          </p>
        )}
        {elsewhere && <p className="text-xs text-muted-foreground">Swipe back to it, or move it here: the other window stops.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={onResume}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {elsewhere ? 'Move it here' : 'Resume set'}
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={busy} onClick={onDismiss}>
          <X className="size-3.5" /> Dismiss
        </Button>
      </div>
    </Card>
  );
}
