/**
 * AI DJ Control Component - Story 7.4
 * Controls for AI DJ mode selection and status display
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Sparkles, Hand, Settings, Music2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';

export type AIDJMode = 'autopilot' | 'suggestions' | 'manual';

interface AIDJControlProps {
  mode: AIDJMode;
  onModeChange: (mode: AIDJMode) => void;
  isActive?: boolean;
  isLoading?: boolean;
  queueCount?: number;
  className?: string;
}

const MODES: { id: AIDJMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: <Bot className="h-4 w-4" />,
    description: 'AI auto-queues songs',
  },
  {
    id: 'suggestions',
    label: 'Suggestions',
    icon: <Sparkles className="h-4 w-4" />,
    description: 'AI suggests, you approve',
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: <Hand className="h-4 w-4" />,
    description: 'Full control',
  },
];

export function AIDJControl({
  mode,
  onModeChange,
  isActive = false,
  isLoading = false,
  queueCount = 0,
  className,
}: AIDJControlProps) {
  const currentMode = MODES.find((m) => m.id === mode) || MODES[2];

  return (
    <Card className={cn('bg-card/50 backdrop-blur-sm border-border/50', className)}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Music2 className="h-5 w-5 text-primary" />
          AI DJ
          {isActive && (
            <span className="flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Active
            </span>
          )}
        </CardTitle>
        <Link to="/settings/recommendations">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Selector */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {MODES.map((m) => (
            <Button
              key={m.id}
              variant={mode === m.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onModeChange(m.id)}
              disabled={isLoading}
              className={cn(
                'flex-1 gap-1.5',
                mode === m.id && 'shadow-sm'
              )}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </Button>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Working...</span>
              </>
            ) : (
              <>
                {currentMode.icon}
                <span>{currentMode.description}</span>
              </>
            )}
          </div>
          {queueCount > 0 && mode !== 'manual' && (
            <span className="text-xs text-muted-foreground">
              {queueCount} AI-queued songs
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
