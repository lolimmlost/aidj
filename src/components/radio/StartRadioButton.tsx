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

/**
 * Start Radio — a separate, additive entry point that never replaces
 * existing Play / Add-to-Queue controls. For artist seeds, opens a menu
 * letting the user pick Artist Variety (Low/Med/High). Other seed kinds
 * start immediately at Medium variety (the knob is artist-specific).
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
  const [busy, setBusy] = useState(false);

  const run = async (v: ArtistVariety = variety) => {
    if (busy) return;
    setBusy(true);
    try {
      await startRadio(seed, v);
    } finally {
      setBusy(false);
    }
  };

  // For non-artist seeds, the variety knob doesn't apply — one-tap start.
  if (seed.kind !== 'artist') {
    if (size === 'icon') {
      return (
        <Button
          size="icon"
          variant={variant}
          disabled={busy}
          onClick={() => void run('medium')}
          aria-label={label}
          title={label}
          className={className}
        >
          <Radio className="size-4" />
        </Button>
      );
    }
    return (
      <Button
        size={size}
        variant={variant}
        disabled={busy}
        onClick={() => void run('medium')}
        className={cn('gap-2', className)}
      >
        <Radio className="size-4" />
        {label}
      </Button>
    );
  }

  // Artist seed: dropdown offers variety selection
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {size === 'icon' ? (
          <Button
            size="icon"
            variant={variant}
            disabled={busy}
            aria-label={label}
            title={label}
            className={className}
          >
            <Radio className="size-4" />
          </Button>
        ) : (
          <Button
            size={size}
            variant={variant}
            disabled={busy}
            className={cn('gap-2', className)}
          >
            <Radio className="size-4" />
            {label}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run()} disabled={busy}>
          <Radio className="size-4" />
          {busy ? 'Starting…' : 'Start Radio'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
