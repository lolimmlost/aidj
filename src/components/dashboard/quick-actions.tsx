/**
 * Quick Actions Component - Story 7.4
 * Provides style preset buttons for quick playlist generation
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Zap, PartyPopper, Target, Compass, Play, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StylePreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  color: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'chill',
    label: 'Chill',
    icon: <Sparkles className="h-5 w-5" />,
    prompt: 'relaxing chill vibes, acoustic, downtempo, peaceful',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'energetic',
    label: 'Energy',
    icon: <Zap className="h-5 w-5" />,
    prompt: 'high energy workout music, upbeat, driving rhythm',
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'party',
    label: 'Party',
    icon: <PartyPopper className="h-5 w-5" />,
    prompt: 'dance party hits, crowd pleasers, upbeat pop and electronic',
    color: 'from-pink-500 to-purple-500',
  },
  {
    id: 'focus',
    label: 'Focus',
    icon: <Target className="h-5 w-5" />,
    prompt: 'concentration music, minimal lyrics, ambient, instrumental',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: <Compass className="h-5 w-5" />,
    prompt: 'hidden gems and deep cuts from artists similar to my favorites',
    color: 'from-violet-500 to-indigo-500',
  },
];

interface QuickActionsProps {
  onPresetClick: (preset: StylePreset) => void;
  onContinueListening?: () => void;
  lastPlayedSong?: { title: string; artist: string } | null;
  isLoading?: boolean;
  activePreset?: string | null;
  className?: string;
}

export function QuickActions({
  onPresetClick,
  onContinueListening,
  lastPlayedSong,
  isLoading = false,
  activePreset = null,
  className,
}: QuickActionsProps) {
  return (
    <Card className={cn('bg-card/50 backdrop-blur-sm border-border/50', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Music className="h-5 w-5 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Style Preset Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              onClick={() => onPresetClick(preset)}
              disabled={isLoading}
              className={cn(
                'flex flex-col items-center justify-center h-20 sm:h-24 gap-1.5 transition-all hover:scale-105',
                'border-2 hover:border-primary/50',
                activePreset === preset.id && 'border-primary bg-primary/10'
              )}
            >
              <div
                className={cn(
                  'p-2 rounded-full bg-gradient-to-br text-white',
                  preset.color
                )}
              >
                {preset.icon}
              </div>
              <span className="text-xs font-medium">{preset.label}</span>
            </Button>
          ))}
        </div>

        {/* Continue Listening Section */}
        {lastPlayedSong && onContinueListening && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Play className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{lastPlayedSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">{lastPlayedSong.artist}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onContinueListening}
              disabled={isLoading}
              className="flex-shrink-0"
            >
              Resume
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
