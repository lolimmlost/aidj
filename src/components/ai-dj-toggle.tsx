// AI DJ Toggle Component
// Story 3.9: AI DJ Toggle Mode

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { Loader2 } from 'lucide-react';

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

  // Sync with preferences on mount
  useEffect(() => {
    if (preferences.recommendationSettings.aiDJEnabled !== aiDJEnabled) {
      setAIDJEnabled(preferences.recommendationSettings.aiDJEnabled);
    }
  }, [preferences.recommendationSettings.aiDJEnabled, aiDJEnabled, setAIDJEnabled]);

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      // Update local store immediately for responsive UI
      setAIDJEnabled(checked);

      // Persist to database
      await setRecommendationSettings({ aiDJEnabled: checked });
    } catch (error) {
      console.error('Failed to update AI DJ setting:', error);
      // Revert on error
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
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Label
            htmlFor="ai-dj-toggle"
            className="text-xs font-medium cursor-pointer select-none whitespace-nowrap"
            title="AI DJ automatically adds songs to your queue"
          >
            ✨ AI DJ
          </Label>
          {aiDJIsLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-yellow-600 dark:text-yellow-400" />
          )}
          {aiDJEnabled && aiQueuedSongIds.size > 0 && (
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              ({aiQueuedSongIds.size})
            </span>
          )}
        </div>
        <Switch
          id="ai-dj-toggle"
          checked={aiDJEnabled}
          onCheckedChange={handleToggle}
          disabled={isUpdating}
          aria-label="Toggle AI DJ Mode"
        />
      </div>
    );
  }

  // Full mode (for settings page)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="ai-dj-toggle"
            className="text-sm font-medium cursor-pointer select-none"
            title="AI DJ automatically adds songs to your queue based on what you're listening to"
          >
            AI DJ Mode
          </Label>
          {aiDJIsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <Switch
          id="ai-dj-toggle"
          checked={aiDJEnabled}
          onCheckedChange={handleToggle}
          disabled={isUpdating}
          aria-label="Toggle AI DJ Mode"
        />
      </div>

      {/* Status Indicator */}
      <div
        className={`px-3 py-2 rounded-md text-xs ${status.bgColor} ${status.color} transition-colors`}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </div>

      {/* AI Queue Badge */}
      {aiDJEnabled && aiQueuedSongIds.size > 0 && (
        <div
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium self-start"
          title={`${aiQueuedSongIds.size} songs added by AI DJ`}
        >
          <span className="text-base leading-none">✨</span>
          <span>{aiQueuedSongIds.size} AI songs in queue</span>
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        AI DJ automatically adds songs to your queue based on what you&apos;re listening to
      </p>
    </div>
  );
}
