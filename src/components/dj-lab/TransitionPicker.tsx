import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChoiceKey, Choices, EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';

type Option<K extends ChoiceKey> = [label: string, value: Choices[K]];

const ROWS: { key: ChoiceKey; label: string; title: string; options: Option<ChoiceKey>[] }[] = [
  {
    key: 'exit',
    label: 'A out',
    title: 'How the playing track exits',
    options: [
      ['After drop', 'section'],
      ['Next drop', 'next-drop'],
      ['Play out', 'end'],
    ],
  },
  {
    key: 'entry',
    label: 'B in',
    title: 'Where the next track comes in',
    options: [
      ['1st drop', 'first-drop'],
      ['Main drop', 'main-drop'],
      ['Intro', 'intro'],
    ],
  },
  {
    key: 'bass',
    label: 'Fade',
    title: 'Bass handover',
    options: [
      ['Sweep', 'sweep'],
      ['Swap', 'swap'],
    ],
  },
  {
    key: 'bars',
    label: 'Bars',
    title: 'Blend length',
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
    <section className="space-y-1.5 rounded-lg border p-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">Next transition</h3>
        <span className="text-[10px] text-muted-foreground">
          {frozen ? (
            'Committed: changes apply to the one after'
          ) : (
            <>
              Used once · <Pin className="inline size-2.5 align-[-1px]" aria-hidden /> whole set
            </>
          )}
        </span>
      </div>
      <div className="space-y-1">
        {ROWS.map(({ key, label, title, options }) => {
          const chosen = snap.choices[key];
          const pinned = snap.pinned.includes(key);
          // a default can fill in for "Rules" (opener plays out, first drops): that option gets a dashed ring
          const fromDefault = chosen === undefined && effective[key] !== undefined ? effective[key] : undefined;
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="w-9 shrink-0 text-[11px] text-muted-foreground" title={title}>
                {label}
              </span>
              <div className="scrollbar-hide flex min-w-0 flex-1 gap-1 overflow-x-auto">
                <Pill active={chosen === undefined} onClick={() => engine.setChoice(key, undefined)}>
                  {fromDefault !== undefined ? 'Default' : 'Rules'}
                </Pill>
                {options.map(([text, value]) => (
                  <Pill
                    key={String(value)}
                    active={chosen === value}
                    viaDefault={fromDefault === value}
                    onClick={() => engine.setChoice(key, chosen === value ? undefined : value)}
                  >
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
                  'grid size-6 shrink-0 place-items-center rounded-md transition-colors disabled:opacity-30',
                  pinned ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Pin className={cn('size-3', pinned && 'fill-current')} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Pill({ active, viaDefault, onClick, children }: { active: boolean; viaDefault?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={viaDefault ? 'What the set default picks' : undefined}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-5 transition-colors',
        active ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
        viaDefault && 'border-dashed border-primary/70 text-primary',
      )}
    >
      {children}
    </button>
  );
}
