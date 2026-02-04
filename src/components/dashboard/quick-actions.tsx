/**
 * Quick Actions Component - Mood-based Playlist Generation
 * Beautiful gradient cards for instant playlist creation
 * Navigates to /dashboard/generate with preset param
 */

import { useNavigate } from '@tanstack/react-router';
import { Sparkles, Zap, PartyPopper, Target, Compass, Music, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  prompt: string;
  gradient: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'chill',
    label: 'Chill',
    description: 'Relax & unwind',
    icon: <Sparkles className="h-6 w-6" />,
    prompt: 'relaxing chill vibes, acoustic, downtempo, peaceful',
    gradient: 'mood-card-chill',
  },
  {
    id: 'energetic',
    label: 'Energy',
    description: 'Get moving',
    icon: <Zap className="h-6 w-6" />,
    prompt: 'high energy workout music, upbeat, driving rhythm',
    gradient: 'mood-card-energy',
  },
  {
    id: 'party',
    label: 'Party',
    description: 'Dance all night',
    icon: <PartyPopper className="h-6 w-6" />,
    prompt: 'dance party hits, crowd pleasers, upbeat pop and electronic',
    gradient: 'mood-card-party',
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Deep work mode',
    icon: <Target className="h-6 w-6" />,
    prompt: 'concentration music, minimal lyrics, ambient, instrumental',
    gradient: 'mood-card-focus',
  },
  {
    id: 'discover',
    label: 'Discover',
    description: 'Find new gems',
    icon: <Compass className="h-6 w-6" />,
    prompt: 'hidden gems and deep cuts from artists similar to my favorites',
    gradient: 'mood-card-discover',
  },
  {
    id: 'similar',
    label: 'Similar',
    description: 'More like this',
    icon: <Music className="h-6 w-6" />,
    prompt: "songs similar to what I'm currently listening to",
    gradient: 'mood-card-party',
  },
];

interface QuickActionsProps {
  onPresetClick?: (preset: StylePreset) => void;
  onContinueListening?: () => void;
  lastPlayedSong?: { title: string; artist: string } | null;
  isLoading?: boolean;
  activePreset?: string | null;
  className?: string;
}

export function QuickActions({
  onPresetClick,
  isLoading = false,
  activePreset = null,
  className,
}: QuickActionsProps) {
  const navigate = useNavigate();

  const handlePresetClick = (preset: StylePreset) => {
    // If a custom handler is provided (e.g., from generate page), use it
    if (onPresetClick) {
      onPresetClick(preset);
      return;
    }
    // Default: navigate to generate page with preset
    navigate({ to: '/dashboard/generate', search: { preset: preset.id } });
  };

  return (
    <section className={cn('space-y-4', className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            What's your vibe?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tap a mood to generate a playlist instantly
          </p>
        </div>
      </div>

      {/* Mobile: compact horizontal scroll */}
      <div className="sm:hidden flex gap-2 overflow-x-auto pb-2">
          {STYLE_PRESETS.map((preset) => (
            <MoodCard
              key={preset.id}
              preset={preset}
              isActive={activePreset === preset.id}
              isLoading={isLoading && activePreset === preset.id}
              onClick={() => handlePresetClick(preset)}
              compact
            />
          ))}
      </div>

      {/* Desktop: grid */}
      <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
        {STYLE_PRESETS.map((preset) => (
          <MoodCard
            key={preset.id}
            preset={preset}
            isActive={activePreset === preset.id}
            isLoading={isLoading && activePreset === preset.id}
            onClick={() => handlePresetClick(preset)}
          />
        ))}
      </div>
    </section>
  );
}

interface MoodCardProps {
  preset: StylePreset;
  isActive: boolean;
  isLoading: boolean;
  onClick: () => void;
  compact?: boolean;
}

function MoodCard({ preset, isActive, isLoading, onClick, compact = false }: MoodCardProps) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={isLoading}
        className={cn(
          'relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full shrink-0',
          'cursor-pointer transition-all duration-200 active:scale-95',
          preset.gradient,
          isActive && 'ring-2 ring-white/50 ring-offset-2 ring-offset-background',
          isLoading && 'animate-pulse'
        )}
      >
        <div className="opacity-90 [&_svg]:h-4 [&_svg]:w-4">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : preset.icon}
        </div>
        <span className="font-semibold text-sm whitespace-nowrap">{preset.label}</span>
        {isActive && !isLoading && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'mood-card',
        preset.gradient,
        isActive && 'ring-2 ring-white/50 ring-offset-2 ring-offset-background scale-[1.02]',
        isLoading && 'animate-pulse'
      )}
    >
      {/* Icon */}
      <div className="mb-3 opacity-90">
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          preset.icon
        )}
      </div>

      {/* Label */}
      <h3 className="font-bold text-base sm:text-lg leading-tight">{preset.label}</h3>

      {/* Description */}
      <p className="text-xs sm:text-sm opacity-80 mt-1">{preset.description}</p>

      {/* Active Indicator */}
      {isActive && !isLoading && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white animate-pulse" />
      )}
    </button>
  );
}
