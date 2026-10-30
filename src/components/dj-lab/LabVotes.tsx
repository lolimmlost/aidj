import { useState } from 'react';
import { Download, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { deleteVote, exportVotes, loadVotes, type LabVote } from '@/lib/dj-lab/votes';

const choiceText = (v: LabVote) =>
  v.kind === 'flag'
    ? null
    : v.choice === 'both'
      ? 'both good'
      : v.choice === 'neither'
        ? 'neither'
        : `${v.winner} won`;

/** Every A/B vote and live flag kept in this browser, newest first, with a JSON export. */
export function LabVotes() {
  const [votes, setVotes] = useState<LabVote[]>(() => loadVotes());
  const list = [...votes].reverse();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {votes.length} saved in this browser. Export to add them to the transition votes and labels.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!votes.length} onClick={() => exportVotes(votes)}>
          <Download className="size-4" /> Export JSON
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {list.map((v) => (
          <li key={v.id} className="flex items-start gap-3 p-2.5 text-sm">
            <div className="pt-0.5">
              {v.kind === 'flag' ? (
                v.thumb === 'up' ? <ThumbsUp className="size-4 text-primary" /> : <ThumbsDown className="size-4 text-destructive" />
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  A/B
                </Badge>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {v.a.title} → {v.b.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {[v.factor, choiceText(v), v.plan && `${v.plan.kind}, ${v.plan.N} bars`, ...v.tags].filter(Boolean).join(' · ')}
              </div>
              {v.note && <div className="mt-0.5 text-xs italic">“{v.note}”</div>}
            </div>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Delete" onClick={() => setVotes(deleteVote(v.id))}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {!votes.length && <li className="p-4 text-sm text-muted-foreground">No votes yet.</li>}
      </ul>
    </div>
  );
}
