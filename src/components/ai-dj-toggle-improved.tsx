// Improved AI DJ Toggle Component
// Uses unified design system for better cohesion

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import {
  AudioButton,
  AudioStatusBadge,
  AudioContainer,
  audioTokens
} from '@/components/ui/audio-design-system';

interface AIDJToggleProps {
  compact?: boolean;
  className?: string;
}

export function ImprovedAIDJToggle({ compact = false, className }: AIDJToggleProps) {
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

  // Sync with preferences on mount and when preferences change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (preferences.recommendationSettings.aiDJEnabled !== aiDJEnabled) {
        setAIDJEnabled(preferences.recommendationSettings.aiDJEnabled);
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
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

  // Determine status
  const getStatus = () => {
    if (!aiDJEnabled) return 'off';
    if (aiDJIsLoading) return 'loading';
    if (aiDJError) return 'error';
    if (aiDJLastQueueTime > 0) return 'active';
    return 'watching';
  };

  const status = getStatus();

  // Check if AI is globally disabled
  const isAIDisabled = !preferences.recommendationSettings.aiEnabled;

  if (isAIDisabled) {
    // Don't show AI DJ toggle if AI is globally disabled
    return null;
  }

  // Compact mode (for mobile/audio player)
  if (compact) {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <div className="flex items-center gap-1 min-w-0">
          <span
            className="text-xs font-medium cursor-pointer select-none whitespace-nowrap"
            title="AI DJ automatically adds songs to your queue"
          >
            ✨ AI
          </span>
          {aiDJIsLoading && (
            <div className="w-3 h-3 animate-spin border-2 border-current border-t-transparent rounded-full" />
          )}
          {aiDJEnabled && aiQueuedSongIds.size > 0 && (
            <span className="text-xs font-medium" style={{ color: audioTokens.colors.ai.background }}>
              ({aiQueuedSongIds.size})
            </span>
          )}
        </div>
        <AudioButton
          variant={aiDJEnabled ? "ai" : "ghost"}
          size="sm"
          onClick={() => handleToggle(!aiDJEnabled)}
          disabled={isUpdating || aiDJIsLoading}
          aria-label="Toggle AI DJ Mode"
          className="h-6 w-11"
        />
      </div>
    );
  }

  // Full mode (for settings page)
  return (
    <AudioContainer variant="card" className={cn("p-6", className)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">✨</span>
        <h3 className="text-xl font-bold">AI DJ Mode</h3>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium cursor-pointer select-none"
            title="AI DJ automatically adds songs to your queue based on what you're listening to"
          >
            AI DJ Mode
          </span>
          {aiDJIsLoading && (
            <div className="w-4 h-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
          )}
        </div>
        <AudioButton
          variant={aiDJEnabled ? "ai" : "secondary"}
          onClick={() => handleToggle(!aiDJEnabled)}
          disabled={isUpdating || aiDJIsLoading}
          aria-label="Toggle AI DJ Mode"
        >
          {aiDJEnabled ? 'Enabled' : 'Disabled'}
        </AudioButton>
      </div>

      {/* Status Indicator */}
      <div className="mb-4">
        {status === 'off' && (
          <AudioStatusBadge status="paused" />
        )}
        {status === 'loading' && (
          <AudioStatusBadge status="ai-loading" />
        )}
        {status === 'error' && (
          <AudioStatusBadge status="error" />
        )}
        {status === 'active' && (
          <div className="space-y-2">
            <AudioStatusBadge status="ai-active" count={aiQueuedSongIds.size} />
            <p className="text-xs text-muted-foreground">
              Last added {getTimeSinceLastQueue()}
            </p>
          </div>
        )}
        {status === 'watching' && (
          <div className="space-y-2">
            <AudioStatusBadge status="ai-active" />
            <p className="text-xs text-muted-foreground">
              Watching queue for refill
            </p>
          </div>
        )}
      </div>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground">
        AI DJ automatically adds songs to your queue based on what you're listening to
      </p>
    </AudioContainer>
  );
}
