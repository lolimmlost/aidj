import { Loader2, Radio } from 'lucide-react';
import { useState } from 'react';
import { GlassSheet, SheetLabel, useIsPhone } from '@/components/glass/GlassSheet';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
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
  // Glass UI on phones: the options open as a bottom sheet instead of a dropdown.
  const glass = useGlassUi();
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const showVariety = seed.kind === 'artist';
  const lengthTag = LENGTH_OPTIONS.find((o) => o.value === length)?.tag ?? 'auto';

  const menuContent = (
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
          <DropdownMenuRadioItem
            key={o.tag}
            value={o.tag}
            onSelect={(e) => e.preventDefault()}
          >
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
            <DropdownMenuRadioItem value="low" onSelect={(e) => e.preventDefault()}>
              Low — mostly this artist
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="medium" onSelect={(e) => e.preventDefault()}>
              Medium — balanced mix
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="high" onSelect={(e) => e.preventDefault()}>
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
  );

  if (glass && phone) {
    const VARIETY: Array<{ value: ArtistVariety; label: string; sub: string }> = [
      { value: 'low', label: 'Low', sub: 'Mostly this artist' },
      { value: 'medium', label: 'Medium', sub: 'Balanced mix' },
      { value: 'high', label: 'High', sub: 'Adventurous' },
    ];
    const choice = (on: boolean) =>
      cn(
        'flex flex-col items-center justify-center rounded-2xl text-center [-webkit-tap-highlight-color:transparent] active:bg-foreground/10',
        on ? 'bg-primary text-primary-foreground' : 'glass-flat',
      );
    return (
      <>
        <Button
          size={size}
          variant={variant}
          disabled={busy}
          aria-label={size === 'icon' ? label : undefined}
          title={size === 'icon' ? label : undefined}
          className={cn(size !== 'icon' && 'gap-2', className)}
          onClick={() => setSheetOpen(true)}
        >
          <Radio className="size-4" />
          {size !== 'icon' && label}
        </Button>
        <GlassSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Start radio"
          subtitle="Songs like these, played as one long mix"
          description="Choose how long the radio runs and start it"
          footer={
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run().then(() => setSheetOpen(false), () => {});
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
              {busy ? 'Starting…' : 'Start radio'}
            </button>
          }
        >
          <SheetLabel>LENGTH</SheetLabel>
          <div className="grid grid-cols-3 gap-2 px-1">
            {LENGTH_OPTIONS.map((o) => (
              <button
                key={o.tag}
                type="button"
                aria-pressed={length === o.value}
                onClick={() => setLength(o.value)}
                className={cn(choice(length === o.value), 'h-[60px]', o.value === 180 && 'col-span-2')}
              >
                <span className="text-[15px] font-semibold">{o.value === 180 ? 'Journey' : o.label}</span>
                {o.value === 180 && <span className="text-[11px] opacity-75">3+ hours</span>}
                {o.value == null && <span className="text-[11px] opacity-75">about 40 songs</span>}
              </button>
            ))}
          </div>
          {showVariety && (
            <>
              <SheetLabel>ARTIST VARIETY</SheetLabel>
              <div className="grid grid-cols-3 gap-2 px-1">
                {VARIETY.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={variety === v.value}
                    onClick={() => setVariety(v.value)}
                    className={cn(choice(variety === v.value), 'h-[60px]')}
                  >
                    <span className="text-[15px] font-semibold">{v.label}</span>
                    <span className="text-[11px] opacity-75">{v.sub}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="h-2" />
        </GlassSheet>
      </>
    );
  }

  if (size === 'icon') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
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
        </DropdownMenuTrigger>
        {menuContent}
      </DropdownMenu>
    );
  }

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
      {menuContent}
    </DropdownMenu>
  );
}
