import { AudioWaveform, ImageIcon, MicVocal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NPMode } from './types';

interface ModeSwitcherProps {
  mode: NPMode;
  onModeChange: (mode: NPMode) => void;
  /** Glass UI: frosted pill with bigger (32px) tabs on phones. */
  glass?: boolean;
}

const visibleModes: { id: NPMode; label: string; Icon: typeof ImageIcon }[] = [
  { id: 'art', label: 'Art', Icon: ImageIcon },
  { id: 'lyrics', label: 'Lyrics', Icon: MicVocal },
  { id: 'visualizer', label: 'Visualizer', Icon: AudioWaveform },
];

export function ModeSwitcher({ mode, onModeChange, glass }: ModeSwitcherProps) {
  return (
    <div className={cn("inline-flex items-center bg-white/10 rounded-full p-1 gap-1", glass && "max-md:gap-0.5 max-md:border max-md:border-white/15 max-md:bg-white/10 max-md:backdrop-blur-xl max-md:backdrop-saturate-150")} role="tablist">
      {visibleModes.map(({ id, label, Icon }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onModeChange(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
              glass && 'max-md:h-8 max-md:px-3.5 max-md:py-0 max-md:text-[13px] max-md:font-semibold max-md:[-webkit-tap-highlight-color:transparent]',
              glass && isActive && 'max-md:shadow-[0_4px_14px_rgb(0_0_0/0.25)]',
              isActive
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
