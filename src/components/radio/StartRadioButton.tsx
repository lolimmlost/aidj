import { Radio } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAudioStore } from '@/lib/stores/audio';
import type { SeededRadioSeed, ArtistVariety } from '@/lib/services/seeded-radio';
import { cn } from '@/lib/utils';

type Variant = React.ComponentProps<typeof Button>['variant'];
type Size = React.ComponentProps<typeof Button>['size'];

interface StartRadioButtonProps {
  seed: SeededRadioSeed;
  label?: string;
  /** If "icon", renders a square icon-only button; otherwise a labelled button. */
  size?: Size;
  variant?: Variant;
  className?: string;
}

// `null` = "Auto" (no constraint, default ~40 tracks).
type LengthChoice = 30 | 60 | 120 | 180 | null;

const LENGTH_OPTIONS: Array<{ value: LengthChoice; label: string; tag: string }> = [
  { value: null, label: 'Auto', tag: 'auto' },
  { value: 30, label: '30 minutes', tag: '30' },
  { value: 60, label: '1 hour', tag: '60' },
  { value: 120, label: '2 hours', tag: '120' },
  { value: 180, label: 'Journey (3+ hours)', tag: '180' },
];

/**
 * Start Radio — a separate, additive entry point that never replaces
 * existing Play / Add-to-Queue controls.
 *
 * Labelled variant opens a dropdown with Length (all seeds) and Variety
 * (artist seeds only). Icon-only variant is one-tap with defaults so the
 * dense context-menu callsites stay frictionless.
 */
export function StartRadioButton({
  seed,
  label = 'Start Radio',
  size = 'sm',
  variant = 'outline',
  className,
}: StartRadioButtonProps) {
  const startRadio = useAudioStore((s) => s.startRadio);
  const [variety, setVariety] = useState<ArtistVariety>('medium');
  const [length, setLength] = useState<LengthChoice>(null);
  const [busy, setBusy] = useState(false);

  const run = async (
    v: ArtistVariety = variety,
    targetMinutes: LengthChoice = length,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await startRadio(seed, {
        variety: v,
        ...(targetMinutes != null ? { targetMinutes } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  // Icon-only callsites (per-song context menus) stay one-tap with defaults.
  if (size === 'icon') {
    return (
      <Button
        size="icon"
        variant={variant}
        disabled={busy}
        onClick={() => void run('medium', null)}
        aria-label={label}
        title={label}
        className={className}
      >
        <Radio className="size-4" />
      </Button>
    );
  }

  const showVariety = seed.kind === 'artist';
  const lengthTag = LENGTH_OPTIONS.find((o) => o.value === length)?.tag ?? 'auto';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={variant}
          disabled={busy}
          className={cn('gap-2', className)}
        >
          <Radio className="size-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Length</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lengthTag}
          onValueChange={(t) => {
            const found = LENGTH_OPTIONS.find((o) => o.tag === t);
            if (found) setLength(found.value);
          }}
        >
          {LENGTH_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.tag} value={o.tag}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {showVariety ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Artist Variety</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={variety}
              onValueChange={(v) => setVariety(v as ArtistVariety)}
            >
              <DropdownMenuRadioItem value="low">
                Low — mostly this artist
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="medium">
                Medium — balanced mix
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="high">
                High — adventurous
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run()} disabled={busy}>
          <Radio className="size-4" />
          {busy ? 'Starting…' : 'Start Radio'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
