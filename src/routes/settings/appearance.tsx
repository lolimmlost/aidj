import { Disc3, Layers, Palette } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { GlassGroup, GlassRow, GlassSeparator } from '@/components/glass/GlassSettings';
import { ThemeSegmented } from '@/components/glass/ThemeSegmented';
import { setGlassUi, useGlassUi } from '@/lib/hooks/useGlassUi';
import { setLowMotion, useLowMotion } from '@/lib/hooks/useLowMotion';
import { toast } from '@/lib/toast';

/** Glass phones: theme, the glass design switch and Low motion (the same switch as the full player's). */
export function AppearanceSettings() {
  const glass = useGlassUi();
  const lowMotion = useLowMotion();
  return (
    <div className="flex flex-col gap-5 pb-6">
      <GlassGroup className="p-3.5">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary [&_svg]:size-[18px]">
            <Palette />
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">Theme</span>
            <span className="text-[13px] text-muted-foreground">Auto follows your phone</span>
          </span>
        </div>
        <ThemeSegmented />
      </GlassGroup>

      <GlassGroup>
        <GlassRow icon={<Layers />} label="Glass design" sub="Off shows the classic layout">
          <Switch
            aria-label="Glass design"
            checked={glass}
            onCheckedChange={(on) => {
              if (!setGlassUi(on)) toast.error('Can’t save this setting (storage blocked)');
            }}
          />
        </GlassRow>
        <GlassSeparator />
        <GlassRow icon={<Disc3 />} label="Low motion" sub="Stills the spinning record and beat effects">
          <Switch aria-label="Low motion" checked={lowMotion} onCheckedChange={(on) => setLowMotion(on)} />
        </GlassRow>
      </GlassGroup>
    </div>
  );
}
