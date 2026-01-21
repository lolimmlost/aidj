// AI DJ Settings Panel
// Story 3.9: AI DJ Toggle Mode

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import { toast } from 'sonner';

export function AIDJSettings() {
  const { preferences, setRecommendationSettings } = usePreferencesStore();

  const [threshold, setThreshold] = useState(
    preferences.recommendationSettings.aiDJQueueThreshold
  );
  const [batchSize, setBatchSize] = useState(
    preferences.recommendationSettings.aiDJBatchSize
  );
  const [useContext, setUseContext] = useState(
    preferences.recommendationSettings.aiDJUseCurrentContext
  );
  const [djMatchingEnabled, setDjMatchingEnabled] = useState(
    preferences.recommendationSettings.djMatchingEnabled ?? true
  );
  const [bpmAnalysisEnabled, setBpmAnalysisEnabled] = useState(
    preferences.recommendationSettings.bpmAnalysisEnabled ?? false
  );
  const [seedQueueEnabled, setSeedQueueEnabled] = useState(
    preferences.recommendationSettings.aiDJSeedQueueEnabled ?? false
  );
  const [seedDensity, setSeedDensity] = useState(
    preferences.recommendationSettings.aiDJSeedDensity ?? 2
  );

  // Sync with preferences changes
  useEffect(() => {
    // Use setTimeout to avoid cascading renders
    const timeoutId = setTimeout(() => {
      setThreshold(preferences.recommendationSettings.aiDJQueueThreshold);
      setBatchSize(preferences.recommendationSettings.aiDJBatchSize);
      setUseContext(preferences.recommendationSettings.aiDJUseCurrentContext);
      setDjMatchingEnabled(preferences.recommendationSettings.djMatchingEnabled ?? true);
      setBpmAnalysisEnabled(preferences.recommendationSettings.bpmAnalysisEnabled ?? false);
      setSeedQueueEnabled(preferences.recommendationSettings.aiDJSeedQueueEnabled ?? false);
      setSeedDensity(preferences.recommendationSettings.aiDJSeedDensity ?? 2);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [preferences.recommendationSettings]);

  // Handle threshold change with immediate save
  const handleThresholdChange = async (value: number) => {
    setThreshold(value);
    try {
      await setRecommendationSettings({ aiDJQueueThreshold: value });
    } catch (error) {
      console.error('Failed to update threshold:', error);
      toast.error('Failed to update queue threshold');
      // Revert on error
      setThreshold(preferences.recommendationSettings.aiDJQueueThreshold);
    }
  };

  // Handle batch size change with immediate save
  const handleBatchSizeChange = async (value: number) => {
    setBatchSize(value);
    try {
      await setRecommendationSettings({ aiDJBatchSize: value });
    } catch (error) {
      console.error('Failed to update batch size:', error);
      toast.error('Failed to update batch size');
      // Revert on error
      setBatchSize(preferences.recommendationSettings.aiDJBatchSize);
    }
  };

  // Handle context change with immediate save
  const handleContextChange = async (value: boolean) => {
    setUseContext(value);
    try {
      await setRecommendationSettings({ aiDJUseCurrentContext: value });
    } catch (error) {
      console.error('Failed to update context setting:', error);
      toast.error('Failed to update context setting');
      // Revert on error
      setUseContext(preferences.recommendationSettings.aiDJUseCurrentContext);
    }
  };

  // Handle DJ matching toggle
  const handleDjMatchingChange = async (value: boolean) => {
    setDjMatchingEnabled(value);
    try {
      await setRecommendationSettings({ djMatchingEnabled: value });
      toast.success(value ? 'DJ matching enabled' : 'DJ matching disabled');
    } catch (error) {
      console.error('Failed to update DJ matching setting:', error);
      toast.error('Failed to update DJ matching setting');
      setDjMatchingEnabled(preferences.recommendationSettings.djMatchingEnabled ?? true);
    }
  };

  // Handle BPM analysis toggle
  const handleBpmAnalysisChange = async (value: boolean) => {
    setBpmAnalysisEnabled(value);
    try {
      await setRecommendationSettings({ bpmAnalysisEnabled: value });
      toast.success(value ? 'BPM analysis enabled - Songs will be analyzed during playback' : 'BPM analysis disabled');
    } catch (error) {
      console.error('Failed to update BPM analysis setting:', error);
      toast.error('Failed to update BPM analysis setting');
      setBpmAnalysisEnabled(preferences.recommendationSettings.bpmAnalysisEnabled ?? false);
    }
  };

  // Handle seed queue toggle
  const handleSeedQueueChange = async (value: boolean) => {
    setSeedQueueEnabled(value);
    try {
      await setRecommendationSettings({ aiDJSeedQueueEnabled: value });
      toast.success(value ? 'Queue seeding enabled - Recommendations will be injected throughout your queue' : 'Queue seeding disabled');
    } catch (error) {
      console.error('Failed to update seed queue setting:', error);
      toast.error('Failed to update seed queue setting');
      setSeedQueueEnabled(preferences.recommendationSettings.aiDJSeedQueueEnabled ?? false);
    }
  };

  // Handle seed density change
  const handleSeedDensityChange = async (value: number) => {
    setSeedDensity(value);
    try {
      await setRecommendationSettings({ aiDJSeedDensity: value });
    } catch (error) {
      console.error('Failed to update seed density:', error);
      toast.error('Failed to update seed density');
      setSeedDensity(preferences.recommendationSettings.aiDJSeedDensity ?? 2);
    }
  };

  const isAIDisabled = !preferences.recommendationSettings.aiEnabled;
  const isAIDJDisabled = !preferences.recommendationSettings.aiDJEnabled;

  if (isAIDisabled) {
    return null;
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">✨</span>
        <h3 className="text-xl font-bold">AI DJ Configuration</h3>
      </div>

      {isAIDJDisabled && (
        <div className="mb-4 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-sm">
          AI DJ is currently disabled. Enable it in the Audio Player to use these settings.
        </div>
      )}

      <div className="space-y-6">
        {/* Queue Threshold Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="ai-dj-threshold" className="text-sm font-medium">
              Queue Threshold
            </Label>
            <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
              {threshold} {threshold === 1 ? 'song' : 'songs'}
            </span>
          </div>
          <Slider
            id="ai-dj-threshold"
            min={1}
            max={5}
            step={1}
            value={[threshold]}
            onValueChange={(value) => handleThresholdChange(value[0])}
            className="cursor-pointer"
            disabled={isAIDJDisabled}
            aria-label="Queue threshold"
          />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Add more songs when queue has {threshold} {threshold === 1 ? 'song' : 'songs'} left
          </p>
        </div>

        {/* Batch Size Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="ai-dj-batch" className="text-sm font-medium">
              Batch Size
            </Label>
            <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
              {batchSize} {batchSize === 1 ? 'song' : 'songs'}
            </span>
          </div>
          <Slider
            id="ai-dj-batch"
            min={1}
            max={10}
            step={1}
            value={[batchSize]}
            onValueChange={(value) => handleBatchSizeChange(value[0])}
            className="cursor-pointer"
            disabled={isAIDJDisabled}
            aria-label="Batch size"
          />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Add {batchSize} {batchSize === 1 ? 'song' : 'songs'} at a time
          </p>
        </div>

        {/* Use Current Context Toggle */}
        <div className="flex items-center justify-between pt-2">
          <div className="space-y-0.5">
            <Label htmlFor="ai-dj-context" className="text-sm font-medium">
              Use Current Context
            </Label>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Base recommendations on currently playing song and recent queue
            </p>
          </div>
          <Switch
            id="ai-dj-context"
            checked={useContext}
            onCheckedChange={handleContextChange}
            disabled={isAIDJDisabled}
            aria-label="Use current context for recommendations"
          />
        </div>

        {/* DJ Matching Section */}
        <div className="pt-4 border-t border-purple-200 dark:border-purple-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎧</span>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              DJ Mixing Features
            </h4>
          </div>

          {/* DJ Matching Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-0.5">
              <Label htmlFor="dj-matching" className="text-sm font-medium">
                BPM/Energy/Key Matching
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Score recommendations by tempo, energy level, and musical key for smoother transitions
              </p>
            </div>
            <Switch
              id="dj-matching"
              checked={djMatchingEnabled}
              onCheckedChange={handleDjMatchingChange}
              disabled={isAIDJDisabled}
              aria-label="Enable DJ matching"
            />
          </div>

          {/* BPM Analysis Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="bpm-analysis" className="text-sm font-medium">
                Auto BPM Analysis
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Automatically detect BPM during playback using audio analysis
              </p>
              {bpmAnalysisEnabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  ⚡ May use extra CPU during playback
                </p>
              )}
            </div>
            <Switch
              id="bpm-analysis"
              checked={bpmAnalysisEnabled}
              onCheckedChange={handleBpmAnalysisChange}
              disabled={isAIDJDisabled || !djMatchingEnabled}
              aria-label="Enable automatic BPM analysis"
            />
          </div>
        </div>

        {/* Queue Seeding Section */}
        <div className="pt-4 border-t border-purple-200 dark:border-purple-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🌱</span>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Queue Seeding
            </h4>
          </div>

          {/* Seed Queue Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-0.5">
              <Label htmlFor="seed-queue" className="text-sm font-medium">
                Seed Recommendations Throughout Queue
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Inject AI recommendations throughout your existing queue immediately, not just at the end
              </p>
            </div>
            <Switch
              id="seed-queue"
              checked={seedQueueEnabled}
              onCheckedChange={handleSeedQueueChange}
              disabled={isAIDJDisabled}
              aria-label="Enable queue seeding"
            />
          </div>

          {/* Seed Density Slider */}
          {seedQueueEnabled && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="seed-density" className="text-sm font-medium">
                  Seed Density
                </Label>
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  {seedDensity} per 10 songs
                </span>
              </div>
              <Slider
                id="seed-density"
                min={1}
                max={5}
                step={1}
                value={[seedDensity]}
                onValueChange={(value) => handleSeedDensityChange(value[0])}
                className="cursor-pointer"
                disabled={isAIDJDisabled}
                aria-label="Seed density"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Insert {seedDensity} AI recommendation{seedDensity > 1 ? 's' : ''} for every 10 songs in your queue
              </p>
            </div>
          )}

          {/* Seed Now Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const audioStore = useAudioStore.getState();
              if (audioStore.queue.length === 0) {
                toast.error('Add some songs to your queue first');
                return;
              }
              audioStore.seedQueueWithRecommendations();
              toast.success('Seeding recommendations into your queue...');
            }}
            disabled={isAIDJDisabled}
            className="w-full mt-3"
          >
            Seed Queue Now
          </Button>
        </div>

        {/* Preview Summary */}
        <div className="mt-6 p-4 rounded-lg bg-white/50 dark:bg-black/20 border border-purple-200 dark:border-purple-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preview:
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            AI DJ will add <span className="font-semibold text-purple-600 dark:text-purple-400">{batchSize} {batchSize === 1 ? 'song' : 'songs'}</span>{' '}
            when <span className="font-semibold text-purple-600 dark:text-purple-400">{threshold} {threshold === 1 ? 'song remains' : 'songs remain'}</span> in your queue
            {useContext ? ', based on what you\'re currently listening to' : ''}.
          </p>
        </div>

        {/* Note about saving */}
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          Note: Changes are saved automatically when you adjust the settings above.
        </p>
      </div>
    </Card>
  );
}

// Hook version for inline use in settings pages
export function useAIDJSettingsSync() {
  const { preferences, setRecommendationSettings } = usePreferencesStore();

  const updateThreshold = async (threshold: number) => {
    await setRecommendationSettings({ aiDJQueueThreshold: threshold });
  };

  const updateBatchSize = async (batchSize: number) => {
    await setRecommendationSettings({ aiDJBatchSize: batchSize });
  };

  const updateUseContext = async (useContext: boolean) => {
    await setRecommendationSettings({ aiDJUseCurrentContext: useContext });
  };

  return {
    threshold: preferences.recommendationSettings.aiDJQueueThreshold,
    batchSize: preferences.recommendationSettings.aiDJBatchSize,
    useContext: preferences.recommendationSettings.aiDJUseCurrentContext,
    updateThreshold,
    updateBatchSize,
    updateUseContext,
  };
}
