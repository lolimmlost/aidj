import { useState } from 'react';
import { ChevronDown, Copy, ListPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { deleteSet, loadSets, setTime, tracklistText, type SavedSet } from '@/lib/dj-lab/sets';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function saveAsPlaylist(set: SavedSet) {
  const ids = [...new Set(set.tracks.map((t) => t.id))];
  const res = await fetch('/api/playlists/create-from-ids', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Lab set · ${when(set.startedAt)}`, songIds: ids }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

/** Every Lab set played in this browser, newest first: tracklist, copy, save as a playlist. */
export function RecentSets() {
  const [sets, setSets] = useState<SavedSet[]>(() => loadSets());
  const [open, setOpen] = useState<string | null>(() => loadSets()[0]?.id ?? null);
  if (!sets.length) return null;
  return (
    <section className="space-y-2 pt-4">
      <h3 className="text-sm font-semibold">Recent sets</h3>
      <ul className="divide-y rounded-lg border">
        {sets.map((set) => {
          const isOpen = open === set.id;
          const last = set.tracks[set.tracks.length - 1];
          return (
            <li key={set.id} className="p-2.5">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : set.id)} aria-expanded={isOpen}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{when(set.startedAt)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {set.tracks.length} tracks · {setTime(last?.at ?? 0)}+ · {set.setBpm} BPM · {set.mode === 'dropchain' ? 'drop-chain' : 'classic'}
                  </div>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="mt-2 space-y-2">
                  <ol className="space-y-1 text-sm">
                    {set.tracks.map((t, i) => (
                      <li key={`${t.id}-${i}`} className="flex gap-2">
                        <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{setTime(t.at)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {t.title} <span className="text-muted-foreground">· {t.artist}</span>
                        </span>
                        {t.kind && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.kind}
                            {t.choice ? ` · ${t.choice}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(tracklistText(set))
                          .then(() => toast.success('Tracklist copied'))
                          .catch(() => toast.error("Couldn't copy"))
                      }
                    >
                      <Copy className="size-3.5" /> Copy tracklist
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        saveAsPlaylist(set)
                          .then(() => toast.success('Saved as a playlist'))
                          .catch((e: Error) => toast.error(`Couldn't save: ${e.message}`))
                      }
                    >
                      <ListPlus className="size-3.5" /> Save as playlist
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setSets(deleteSet(set.id))}>
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
