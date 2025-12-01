import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Library, Compass, Shuffle } from 'lucide-react';

export type SourceMode = 'library' | 'discovery' | 'mix';

interface SourceModeSelectorProps {
  value: SourceMode;
  onChange: (mode: SourceMode) => void;
  mixRatio?: number;
  onMixRatioChange?: (ratio: number) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Source Mode Selector component for Story 7.1
 * Allows users to choose between Library Only, Discovery, or Mix modes
 * for playlist/recommendation generation.
 */
export function SourceModeSelector({
  value,
  onChange,
  mixRatio = 70,
  onMixRatioChange,
  className,
  disabled = false,
}: SourceModeSelectorProps) {
  const modes: { id: SourceMode; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: 'library',
      label: 'Library Only',
      icon: <Library className="h-4 w-4" />,
      description: 'Only songs in your Navidrome library',
    },
    {
      id: 'discovery',
      label: 'Discovery',
      icon: <Compass className="h-4 w-4" />,
      description: 'New songs to expand your collection',
    },
    {
      id: 'mix',
      label: 'Mix',
      icon: <Shuffle className="h-4 w-4" />,
      description: 'Blend of library favorites and new finds',
    },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Mode Selector Buttons */}
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => (
          <Button
            key={mode.id}
            variant={value === mode.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(mode.id)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-2 transition-all',
              value === mode.id && mode.id === 'library' && 'bg-green-600 hover:bg-green-700',
              value === mode.id && mode.id === 'discovery' && 'bg-purple-600 hover:bg-purple-700',
              value === mode.id && mode.id === 'mix' && 'bg-blue-600 hover:bg-blue-700'
            )}
            title={mode.description}
          >
            {mode.icon}
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sm:hidden">{mode.id === 'library' ? 'Lib' : mode.id === 'discovery' ? 'New' : 'Mix'}</span>
          </Button>
        ))}
      </div>

      {/* Mix Ratio Slider - only shown when Mix mode is selected */}
      {value === 'mix' && onMixRatioChange && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Library className="h-3.5 w-3.5" />
              Library
            </span>
            <span className="font-medium">{mixRatio}% / {100 - mixRatio}%</span>
            <span className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              Discovery
              <Compass className="h-3.5 w-3.5" />
            </span>
          </div>
          <Slider
            value={[mixRatio]}
            onValueChange={(values) => onMixRatioChange(values[0])}
            min={10}
            max={90}
            step={10}
            disabled={disabled}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground text-center">
            {mixRatio >= 70
              ? 'Mostly familiar songs with some discoveries'
              : mixRatio <= 30
                ? 'Mostly new discoveries with some favorites'
                : 'Balanced mix of library and new music'}
          </p>
        </div>
      )}

      {/* Mode Description */}
      <p className="text-xs text-muted-foreground">
        {value === 'library' && 'Recommendations will only include songs from your Navidrome library.'}
        {value === 'discovery' && 'Discover new music that matches your taste but isn\'t in your library yet.'}
        {value === 'mix' && `Get ${mixRatio}% songs from your library and ${100 - mixRatio}% new discoveries.`}
      </p>
    </div>
  );
}

/**
 * Source badge component to display on recommendation cards
 */
interface SourceBadgeProps {
  inLibrary: boolean;
  isDiscovery?: boolean; // Explicitly mark as discovery (not just "not in library")
  className?: string;
}

export function SourceBadge({ inLibrary, isDiscovery, className }: SourceBadgeProps) {
  // Only show badge for library songs or explicit discoveries
  if (inLibrary) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
          className
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-1"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        In Library
      </span>
    );
  }

  // Only show Discovery badge if explicitly marked as discovery
  if (isDiscovery) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
          'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
          className
        )}
      >
        <Compass className="mr-1 h-3 w-3" />
        Discovery
      </span>
    );
  }

  // Not in library and not a discovery - don't show any badge (let parent handle "Not Found")
  return null;
}
