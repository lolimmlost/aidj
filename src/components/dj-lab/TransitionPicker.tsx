import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChoiceKey, Choices, EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';

type Option<K extends ChoiceKey> = [label: string, value: Choices[K]];

const ROWS: { key: ChoiceKey; label: string; options: Option<ChoiceKey>[] }[] = [
  {
    key: 'exit',
    label: 'A exits',
    options: [
      ['After this drop', 'section'],
      ['Into next drop', 'next-drop'],
      ['Play out', 'end'],
    ],
  },
  {
    key: 'entry',
    label: 'B enters',
    options: [
      ['First drop', 'first-drop'],
      ['Main drop', 'main-drop'],
      ['Intro', 'intro'],
    ],
  },
  {
    key: 'bass',
    label: 'Fade',
    options: [
      ['Filter sweep', 'sweep'],
      ['Hard swap', 'swap'],
    ],
  },
  {
    key: 'bars',
    label: 'Length',
    options: [
      ['8', 8],
      ['16', 16],
      ['32', 32],
    ],
  },
];

/**
 * How the next transition goes (#375). Unset = the rules decide. A choice is used once, then resets;
 * 📌 keeps it for the rest of the set. Changing a choice re-plans the locked song until it's committed.
 */
export function TransitionPicker({ engine, snap }: { engine: LabEngine; snap: EngineSnapshot }) {
  const st = snap.next?.state;
  const frozen = st === 'committed' || st === 'mixing';
  const effective = engine.recipe();
  return (
    <section className="space-y-2 rounded-lg border p-2.5 sm:p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Next transition</h3>
        <span className="text-[11px] text-muted-foreground">
          {frozen ? (
            'Committed: changes apply to the one after'
          ) : (
            <>
              Used once · <Pin className="inline size-3 align-[-2px]" aria-hidden /> keeps it for the set
            </>
          )}
        </span>
      </div>
      <div className="space-y-1.5">
        {ROWS.map(({ key, label, options }) => {
          const chosen = snap.choices[key];
          const pinned = snap.pinned.includes(key);
          // a default can fill in for "Rules" (opener plays out, first drops)
          const fromDefault = chosen === undefined && effective[key] !== undefined ? effective[key] : undefined;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                <Pill active={chosen === undefined} onClick={() => engine.setChoice(key, undefined)}>
                  {fromDefault !== undefined ? `Default · ${options.find(([, v]) => v === fromDefault)?.[0] ?? fromDefault}` : 'Rules'}
                </Pill>
                {options.map(([text, value]) => (
                  <Pill key={String(value)} active={chosen === value} onClick={() => engine.setChoice(key, chosen === value ? undefined : value)}>
                    {text}
                  </Pill>
                ))}
              </div>
              <button
                type="button"
                onClick={() => engine.togglePin(key)}
                disabled={chosen === undefined && !pinned}
                aria-pressed={pinned}
                aria-label={pinned ? `Unpin ${label}` : `Pin ${label} for the rest of the set`}
                title={pinned ? 'Pinned for the rest of the set' : 'Pin for the rest of the set'}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-md transition-colors disabled:opacity-30',
                  pinned ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Pin className={cn('size-3.5', pinned && 'fill-current')} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
