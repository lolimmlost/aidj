// AI DJ Toggle Component
// Story 3.9: AI DJ Toggle Mode
//
// Simple tap-to-toggle button for AI DJ
// Feedback on AI recommendations is given in the Queue Panel (like/dislike individual songs)

import { useEffect, useState, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { Loader2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AIDJToggleProps {
  compact?: boolean;
}

export function AIDJToggle({ compact = false }: AIDJToggleProps) {
  const {
    aiDJEnabled,
    aiDJLastQueueTime,
    aiDJIsLoading,
    aiDJError,
    aiQueuedSongIds,
    setAIDJEnabled,
  } = useAudioStore();

  const {
    preferences,
    setRecommendationSettings,
  } = usePreferencesStore();

  const [isUpdating, setIsUpdating] = useState(false);

  // Handle toggle - turn AI DJ on/off
  const handleToggle = useCallback(async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    const newState = !aiDJEnabled;

    try {
      // Update local store immediately for responsive UI
      setAIDJEnabled(newState);
      // Persist to database
      await setRecommendationSettings({ aiDJEnabled: newState });
      toast.success(newState ? 'AI DJ enabled' : 'AI DJ disabled', { duration: 1500 });
    } catch (error) {
      console.error('Failed to update AI DJ setting:', error);
      // Revert on error
      setAIDJEnabled(!newState);
      toast.error('Failed to toggle AI DJ');
    } finally {
      setIsUpdating(false);
    }
  }, [aiDJEnabled, isUpdating, setAIDJEnabled, setRecommendationSettings]);

  // Sync with preferences on mount and when preferences change
  useEffect(() => {
    // Use setTimeout to avoid cascading renders and potential visual flashing
    const timeoutId = setTimeout(() => {
      if (preferences.recommendationSettings.aiDJEnabled !== aiDJEnabled) {
        setAIDJEnabled(preferences.recommendationSettings.aiDJEnabled);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [preferences.recommendationSettings.aiDJEnabled, aiDJEnabled, setAIDJEnabled]);

  // Switch toggle handler for full mode
  const handleSwitchToggle = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      setAIDJEnabled(checked);
      await setRecommendationSettings({ aiDJEnabled: checked });
      toast.success(checked ? 'AI DJ enabled' : 'AI DJ disabled', { duration: 1500 });
    } catch (error) {
      console.error('Failed to update AI DJ setting:', error);
      setAIDJEnabled(!checked);
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate time since last queue
  const getTimeSinceLastQueue = (): string => {
    if (aiDJLastQueueTime === 0) return '';

    const secondsAgo = Math.floor((Date.now() - aiDJLastQueueTime) / 1000);

    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  };

  // Determine status indicator
  const getStatusIndicator = () => {
    if (!aiDJEnabled) {
      return {
        color: 'text-gray-500 dark:text-gray-400',
        text: 'AI DJ Off',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
      };
    }

    if (aiDJIsLoading) {
      return {
        color: 'text-yellow-600 dark:text-yellow-400',
        text: 'AI DJ fetching songs...',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      };
    }

    if (aiDJError) {
      return {
        color: 'text-red-600 dark:text-red-400',
        text: `AI DJ failed: ${aiDJError}`,
        bgColor: 'bg-red-50 dark:bg-red-900/20',
      };
    }

    if (aiDJLastQueueTime > 0) {
      const timeSince = getTimeSinceLastQueue();
      return {
        color: 'text-green-600 dark:text-green-400',
        text: `AI DJ queued ${aiQueuedSongIds.size} songs • ${timeSince}`,
        bgColor: 'bg-green-50 dark:bg-green-900/20',
      };
    }

    return {
      color: 'text-green-600 dark:text-green-400',
      text: 'AI DJ Active • Watching queue',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    };
  };

  const status = getStatusIndicator();

  // Check if AI is globally disabled
  const isAIDisabled = !preferences.recommendationSettings.aiEnabled;

  if (isAIDisabled) {
    // Don't show AI DJ toggle if AI is globally disabled
    return null;
  }

  // Compact mode (for mobile/audio player)
  // Simple tap-to-toggle button
  if (compact) {
    const isDisabled = isUpdating;
    const showLoading = aiDJIsLoading;
    const hasError = !!aiDJError;

    // Button tooltip based on state
    const getTooltip = () => {
      if (showLoading) return 'AI DJ is finding songs...';
      if (hasError) return `AI DJ error: ${aiDJError}`;
      if (aiDJEnabled) return 'AI DJ is on - tap to turn off';
      return 'AI DJ is off - tap to turn on';
    };

    return (
      <button
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-200',
          'h-9 w-9 select-none',
          // Off state
          !aiDJEnabled && !showLoading && 'bg-muted/50 text-muted-foreground hover:bg-muted',
          // On state - subtle glow
          aiDJEnabled && !showLoading && !hasError && 'bg-primary/10 text-primary hover:bg-primary/20',
          // Loading state
          showLoading && 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
          // Error state
          hasError && 'bg-red-500/10 text-red-600 dark:text-red-400',
          // Disabled
          isDisabled && 'opacity-50 cursor-not-allowed',
        )}
        disabled={isDisabled}
        title={getTooltip()}
        aria-label={getTooltip()}
        onClick={handleToggle}
      >
        {/* Icon */}
        {showLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className={cn(
            'h-4 w-4 transition-transform',
            aiDJEnabled && 'drop-shadow-sm',
          )} />
        )}

        {/* AI DJ enabled indicator - small dot */}
        {aiDJEnabled && !showLoading && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        )}

        {/* Queue count badge */}
        {aiDJEnabled && aiQueuedSongIds.size > 0 && !showLoading && (
          <span className="absolute -bottom-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
            {aiQueuedSongIds.size > 9 ? '9+' : aiQueuedSongIds.size}
          </span>
        )}
      </button>
    );
  }

  // Full mode (for settings page)
  return (
    <div className="flex flex-col gap-3">
      {/* Header row with toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <Label
            htmlFor="ai-dj-toggle-full"
            className="text-sm font-medium cursor-pointer select-none"
          >
            AI DJ Mode
          </Label>
          {aiDJIsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <Switch
          id="ai-dj-toggle-full"
          checked={aiDJEnabled}
          onCheckedChange={handleSwitchToggle}
          disabled={isUpdating || aiDJIsLoading}
          aria-label="Toggle AI DJ Mode"
        />
      </div>

      {/* Status indicator */}
      <div
        className={cn(
          'px-3 py-2 rounded-lg text-xs font-medium transition-colors',
          status.bgColor,
          status.color,
        )}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </div>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground">
        When enabled, AI DJ automatically adds similar songs to your queue. Like or dislike AI recommendations in the queue panel to improve suggestions.
      </p>
    </div>
  );
}
