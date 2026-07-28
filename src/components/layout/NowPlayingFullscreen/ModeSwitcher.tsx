import { AudioWaveform, ImageIcon, MicVocal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NPMode } from './types';

interface ModeSwitcherProps {
  mode: NPMode;
  onModeChange: (mode: NPMode) => void;
}

const visibleModes: { id: NPMode; label: string; Icon: typeof ImageIcon }[] = [
  { id: 'art', label: 'Art', Icon: ImageIcon },
  { id: 'lyrics', label: 'Lyrics', Icon: MicVocal },
  { id: 'visualizer', label: 'Visualizer', Icon: AudioWaveform },
];

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-white/10 rounded-full p-1 gap-1" role="tablist">
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
