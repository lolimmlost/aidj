/**
 * Autoplay Settings Component
 *
 * Provides UI controls for configuring playlist autoplay queueing
 * with smart transitions. Part of the AI DJ feature extension.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Music,
  Radio,
  Waves,
  Volume2,
  Sparkles,
  Loader2,
  Timer,
} from 'lucide-react';

type BlendMode = 'crossfade' | 'silence' | 'reverb_tail';

const BLEND_MODE_OPTIONS: Array<{
  value: BlendMode;
  label: string;
  description: string;
  icon: typeof Music;
}> = [
  {
    value: 'crossfade',
    label: 'Crossfade',
    description: 'Smoothly blend songs together',
    icon: Waves,
  },
  {
    value: 'silence',
    label: 'Silence',
    description: 'Brief pause between songs',
    icon: Volume2,
  },
  {
    value: 'reverb_tail',
    label: 'Reverb Tail',
    description: 'Echo fade into next song',
    icon: Radio,
  },
];

interface AutoplaySettingsProps {
  compact?: boolean;
}

export function AutoplaySettings({ compact = false }: AutoplaySettingsProps) {
  const {
    autoplayEnabled,
    autoplayBlendMode,
    autoplayTransitionDuration,
    autoplaySmartTransitions,
    autoplayIsLoading,
    setAutoplayEnabled,
    setAutoplayBlendMode,
    setAutoplayTransitionDuration,
    setAutoplaySmartTransitions,
  } = useAudioStore();

  const { preferences } = usePreferencesStore();

  const [duration, setDuration] = useState(autoplayTransitionDuration);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync with store changes
  useEffect(() => {
    setDuration(autoplayTransitionDuration);
  }, [autoplayTransitionDuration]);

  // Sync with preferences on mount only (not on every preference change)
  // This prevents infinite loops where preference updates trigger new API calls
  useEffect(() => {
    const prefs = preferences.recommendationSettings;
    // Only sync if values are different AND component just mounted
    if (prefs.autoplayEnabled !== undefined && prefs.autoplayEnabled !== autoplayEnabled) {
      setAutoplayEnabled(prefs.autoplayEnabled);
    }
    if (prefs.autoplayBlendMode !== undefined && prefs.autoplayBlendMode !== autoplayBlendMode) {
      setAutoplayBlendMode(prefs.autoplayBlendMode);
    }
    if (prefs.autoplayTransitionDuration !== undefined && prefs.autoplayTransitionDuration !== autoplayTransitionDuration) {
      setAutoplayTransitionDuration(prefs.autoplayTransitionDuration);
      setDuration(prefs.autoplayTransitionDuration);
    }
    if (prefs.autoplaySmartTransitions !== undefined && prefs.autoplaySmartTransitions !== autoplaySmartTransitions) {
      setAutoplaySmartTransitions(prefs.autoplaySmartTransitions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const handleToggleAutoplay = useCallback(async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      setAutoplayEnabled(enabled);
    } catch (error) {
      console.error('Failed to update autoplay setting:', error);
      toast.error('Failed to update autoplay setting');
    } finally {
      setIsUpdating(false);
    }
  }, [setAutoplayEnabled]);

  const handleBlendModeChange = useCallback(async (mode: BlendMode) => {
    setIsUpdating(true);
    try {
      setAutoplayBlendMode(mode);
    } catch (error) {
      console.error('Failed to update blend mode:', error);
      toast.error('Failed to update blend mode');
    } finally {
      setIsUpdating(false);
    }
  }, [setAutoplayBlendMode]);

  const handleDurationChange = useCallback(async (value: number) => {
    setDuration(value);
  }, []);

  const handleDurationCommit = useCallback(async () => {
    if (duration !== autoplayTransitionDuration) {
      setIsUpdating(true);
      try {
        setAutoplayTransitionDuration(duration);
      } catch (error) {
        console.error('Failed to update transition duration:', error);
        toast.error('Failed to update transition duration');
        setDuration(autoplayTransitionDuration);
      } finally {
        setIsUpdating(false);
      }
    }
  }, [duration, autoplayTransitionDuration, setAutoplayTransitionDuration]);

  const handleSmartTransitionsChange = useCallback(async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      setAutoplaySmartTransitions(enabled);
    } catch (error) {
      console.error('Failed to update smart transitions:', error);
      toast.error('Failed to update smart transitions');
    } finally {
      setIsUpdating(false);
    }
  }, [setAutoplaySmartTransitions]);

  // Check if AI is globally disabled
  const isAIDisabled = !preferences.recommendationSettings.aiEnabled;

  if (isAIDisabled) {
    return null;
  }

  // Compact mode for inline use
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <div>
            <Label htmlFor="autoplay-compact" className="text-sm font-medium cursor-pointer">
              Autoplay Queue
            </Label>
            <p className="text-xs text-muted-foreground">
              Auto-queue songs when playlist ends
            </p>
          </div>
          {autoplayIsLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>
        <Switch
          id="autoplay-compact"
          checked={autoplayEnabled}
          onCheckedChange={handleToggleAutoplay}
          disabled={isUpdating}
          aria-label="Toggle autoplay queueing"
        />
      </div>
    );
  }

  // Full settings panel
  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-2 mb-4">
        <Music className="h-6 w-6 text-primary" />
        <h3 className="text-xl font-bold">Autoplay Queueing</h3>
        {autoplayIsLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="space-y-0.5">
          <Label htmlFor="autoplay-toggle" className="text-sm font-medium">
            Enable Autoplay
          </Label>
          <p className="text-xs text-muted-foreground">
            Automatically queue recommended songs when your playlist ends
          </p>
        </div>
        <Switch
          id="autoplay-toggle"
          checked={autoplayEnabled}
          onCheckedChange={handleToggleAutoplay}
          disabled={isUpdating}
          aria-label="Enable autoplay queueing"
        />
      </div>

      {/* Settings (only shown when enabled) */}
      <div className={cn(
        'space-y-6 transition-opacity duration-200',
        !autoplayEnabled && 'opacity-50 pointer-events-none'
      )}>
        {/* Blend Mode Selection */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            Transition Style
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {BLEND_MODE_OPTIONS.map(option => (
              <Button
                key={option.value}
                variant={autoplayBlendMode === option.value ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-3 px-2',
                  autoplayBlendMode === option.value && 'ring-2 ring-primary ring-offset-2'
                )}
                onClick={() => handleBlendModeChange(option.value)}
                disabled={!autoplayEnabled || isUpdating}
              >
                <option.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{option.label}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {BLEND_MODE_OPTIONS.find(o => o.value === autoplayBlendMode)?.description}
          </p>
        </div>

        {/* Transition Duration */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="transition-duration" className="text-sm font-medium">
                Transition Duration
              </Label>
            </div>
            <span className="text-sm font-semibold text-primary">
              {duration}s
            </span>
          </div>
          <Slider
            id="transition-duration"
            min={1}
            max={10}
            step={1}
            value={[duration]}
            onValueChange={([value]) => handleDurationChange(value)}
            onValueCommit={handleDurationCommit}
            className="cursor-pointer"
            disabled={!autoplayEnabled || isUpdating}
            aria-label="Transition duration in seconds"
          />
          <p className="text-xs text-muted-foreground mt-2">
            How long the transition between songs takes
          </p>
        </div>

        {/* Smart Transitions Toggle */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="space-y-0.5">
              <Label htmlFor="smart-transitions" className="text-sm font-medium">
                Smart Transitions
              </Label>
              <p className="text-xs text-muted-foreground">
                AI analyzes songs to optimize transition timing
              </p>
            </div>
          </div>
          <Switch
            id="smart-transitions"
            checked={autoplaySmartTransitions}
            onCheckedChange={handleSmartTransitionsChange}
            disabled={!autoplayEnabled || isUpdating}
            aria-label="Enable smart transitions"
          />
        </div>

        {/* Preview Summary */}
        <div className="mt-6 p-4 rounded-lg bg-white/50 dark:bg-black/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-foreground/80 mb-2">
            Preview:
          </p>
          <p className="text-sm text-muted-foreground">
            When your playlist ends, Autoplay will add recommended songs with a{' '}
            <span className="font-semibold text-primary">
              {duration}s {autoplayBlendMode === 'crossfade' ? 'crossfade' : autoplayBlendMode === 'silence' ? 'silence gap' : 'reverb tail'}
            </span>
            {autoplaySmartTransitions && (
              <span className="text-primary"> with AI-optimized timing</span>
            )}.
          </p>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-muted-foreground mt-4 italic">
        Note: Changes are saved automatically when you adjust the settings above.
      </p>
    </Card>
  );
}

/**
 * Compact Autoplay Toggle Component
 * For use in the audio player or other compact spaces
 */
interface AutoplayToggleProps {
  compact?: boolean;
}

export function AutoplayToggle({ compact = false }: AutoplayToggleProps) {
  const {
    autoplayEnabled,
    autoplayIsLoading,
    autoplayQueuedSongIds,
    setAutoplayEnabled,
  } = useAudioStore();

  const { preferences } = usePreferencesStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  // Delay showing loading spinner
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (autoplayIsLoading) {
      timeout = setTimeout(() => setShowLoading(true), 500);
    } else {
      setShowLoading(false);
    }
    return () => clearTimeout(timeout);
  }, [autoplayIsLoading]);

  const handleToggle = useCallback(async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    const newState = !autoplayEnabled;

    try {
      setAutoplayEnabled(newState);
    } catch (error) {
      console.error('Failed to toggle autoplay:', error);
      setAutoplayEnabled(!newState);
      toast.error('Failed to toggle autoplay');
    } finally {
      setIsUpdating(false);
    }
  }, [autoplayEnabled, isUpdating, setAutoplayEnabled]);

  // Check if AI is globally disabled
  const isAIDisabled = !preferences.recommendationSettings.aiEnabled;

  if (isAIDisabled) {
    return null;
  }

  const getTooltip = () => {
    if (showLoading) return 'Autoplay is finding songs...';
    if (autoplayEnabled) return 'Autoplay is on - tap to turn off';
    return 'Autoplay is off - tap to turn on';
  };

  if (compact) {
    return (
      <button
        type="button"
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-200',
          'h-9 w-9 select-none',
          !autoplayEnabled && !showLoading && 'bg-muted/50 text-muted-foreground hover:bg-muted',
          autoplayEnabled && !showLoading && 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20',
          showLoading && 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
          isUpdating && 'opacity-50 cursor-not-allowed',
        )}
        disabled={isUpdating}
        title={getTooltip()}
        aria-label={getTooltip()}
        onClick={handleToggle}
      >
        {showLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Music className={cn(
            'h-4 w-4 transition-transform',
            autoplayEnabled && 'drop-shadow-sm',
          )} />
        )}

        {/* Enabled indicator dot */}
        {autoplayEnabled && !showLoading && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        )}

        {/* Queue count badge */}
        {autoplayEnabled && autoplayQueuedSongIds.size > 0 && !showLoading && (
          <span className="absolute -bottom-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-blue-500 text-[10px] font-bold text-white flex items-center justify-center">
            {autoplayQueuedSongIds.size > 9 ? '9+' : autoplayQueuedSongIds.size}
          </span>
        )}
      </button>
    );
  }

  // Full toggle with label
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Music className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <Label
          htmlFor="autoplay-toggle-inline"
          className="text-sm font-medium cursor-pointer select-none"
        >
          Autoplay
        </Label>
        {showLoading && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-600 dark:text-yellow-400" />
        )}
      </div>
      <Switch
        id="autoplay-toggle-inline"
        checked={autoplayEnabled}
        onCheckedChange={handleToggle}
        disabled={isUpdating}
        aria-label="Toggle Autoplay Mode"
      />
    </div>
  );
}
