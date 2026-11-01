import { useRef, useState } from 'react';
import { Download, ThumbsDown, ThumbsUp, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { deleteVote, exportVotes, importVotes, loadVotes, type LabVote } from '@/lib/dj-lab/votes';

const choiceText = (v: LabVote) =>
  v.kind === 'flag'
    ? null
    : v.choice === 'both'
      ? 'both good'
      : v.choice === 'neither'
        ? 'neither'
        : `${v.winner} won`;

/** Every A/B vote and live flag kept in this browser, newest first, with a JSON export and import. */
export function LabVotes() {
  const [votes, setVotes] = useState<LabVote[]>(() => loadVotes());
  const fileRef = useRef<HTMLInputElement>(null);
  const list = [...votes].reverse();
  async function importFile(f: File) {
    try {
      const { all, added } = importVotes(JSON.parse(await f.text()));
      setVotes(all);
      toast.success(added ? `Imported ${added} vote${added === 1 ? '' : 's'}` : 'Nothing new in that file');
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {votes.length} saved in this browser. Your 👍 / 👎 on transitions steer auto-lock. Export to add them to the transition votes and
          labels; import an export to bring them to another browser.
        </p>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!votes.length} onClick={() => exportVotes(votes)}>
            <Download className="size-4" /> Export JSON
          </Button>
        </div>
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
