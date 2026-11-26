import { Check, Disc3, Layers } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { setGlassUi, useGlassUi } from '@/lib/hooks/useGlassUi';
import { setLowMotion, useLowMotion } from '@/lib/hooks/useLowMotion';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { SettingsHero, SettingsSection, SettingsStack, SettingsSwitchRow } from '@/components/settings/settings-ui';

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
] as const;

/** A tiny phone screen in each theme. */
function ThemePreview({ kind }: { kind: (typeof THEMES)[number]['id'] }) {
  const line = (light: boolean) => (light ? 'bg-[#0B0A12]' : 'bg-[#F4F3F8]');
  const card = (light: boolean) => (light ? 'bg-[#0B0A12]/[0.08]' : 'bg-[#F4F3F8]/10');
  if (kind === 'system') {
    return (
      <span className="absolute inset-1.5 overflow-hidden rounded-[10px] bg-[linear-gradient(90deg,#F4F3F8_50%,#08070D_50%)]">
        <span className="mx-2 mt-2.5 block h-1.5 w-1/2 rounded-full bg-primary" />
      </span>
    );
  }
  const light = kind === 'light';
  return (
    <span className={cn('absolute inset-1.5 rounded-[10px] p-2', light ? 'bg-[#F4F3F8]' : 'bg-[#08070D]')}>
      <span className={cn('mt-0.5 block h-1.5 w-1/2 rounded-full', line(light))} />
      <span className={cn('mt-2 block h-5 rounded-md', card(light))} />
      <span className={cn('mt-1.5 block h-5 rounded-md', card(light))} />
    </span>
  );
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const glass = useGlassUi();
  const lowMotion = useLowMotion();

  return (
    <SettingsStack>
      <SettingsHero className="!px-2.5 !py-5">
        <div role="radiogroup" aria-label="Theme" className="flex justify-around">
          {THEMES.map(({ id, label }) => {
            const on = theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(id)}
                className="flex flex-col items-center gap-2 [-webkit-tap-highlight-color:transparent]"
              >
                <span className={cn('relative h-[132px] w-[88px] rounded-2xl bg-foreground/[0.08] transition-shadow', on && 'ring-2 ring-primary')}>
                  <ThemePreview kind={id} />
                </span>
                <span className={cn('text-[13px] font-bold', on ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
                <span
                  aria-hidden
                  className={cn(
                    'grid size-5 place-items-center rounded-full border-2',
                    on ? 'border-primary bg-primary text-background' : 'border-foreground/30',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[13px] text-muted-foreground">Auto follows your device</p>
      </SettingsHero>

      <SettingsSection>
        <SettingsSwitchRow
          id="glass-design"
          icon={<Layers />}
          label="Glass design"
          description="Off shows the classic layout"
          checked={glass}
          onCheckedChange={(on) => {
            if (!setGlassUi(on)) toast.error('Can’t save this setting (storage blocked)');
          }}
        />
        <SettingsSwitchRow
          id="low-motion"
          icon={<Disc3 />}
          label="Low motion"
          description="Still the spinning record and beat effects"
          checked={lowMotion}
          onCheckedChange={(on) => setLowMotion(on)}
        />
      </SettingsSection>
    </SettingsStack>
  );
}
