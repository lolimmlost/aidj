// AI DJ settings (Story 3.9, drip-feed model). Shared by Settings → AI DJ and /dj/settings.
// Reads the preferences store directly and saves on change (the store applies it at once and rolls
// back on failure), so there is no local copy to drift.

import { useState } from 'react';
import { AudioWaveform, Disc3, Gauge, ListPlus, Music, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore, type RecommendationSettings as Recs } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import { toast } from '@/lib/toast';
import {
  SettingsBlock,
  SettingsLinkRow,
  SettingsSection,
  SettingsStack,
  SettingsStepperRow,
  SettingsSwitchRow,
  saveOrWarn,
} from '@/components/settings/settings-ui';

export function AIDJSettings() {
  const recs = usePreferencesStore((s) => s.preferences.recommendationSettings);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const save = (patch: Partial<Recs>) =>
    saveOrWarn(usePreferencesStore.getState().setRecommendationSettings(patch), 'AI DJ setting');

  if (!recs.aiEnabled) return null;

  const off = !recs.aiDJEnabled;
  const matching = recs.djMatchingEnabled ?? true;
  const seeding = recs.aiDJSeedQueueEnabled ?? false;
  const threshold = recs.aiDJQueueThreshold;
  const batch = recs.aiDJBatchSize;

  const seedNow = () => {
    const audio = useAudioStore.getState();
    if (audio.playlist.length === 0) {
      toast.error('Add some songs to your queue first');
      return;
    }
    audio.seedQueueWithRecommendations();
    toast.success('Seeding recommendations into your queue…');
  };

  return (
    <SettingsStack>
      <SettingsSection title="How it picks" footer={off ? 'Turn on the AI DJ to use these.' : undefined}>
        <SettingsStepperRow
          icon={<Gauge />}
          label="Add a pick every"
          value={recs.aiDJDripInterval ?? 3}
          min={2}
          max={5}
          unit="songs"
          onChange={(v) => save({ aiDJDripInterval: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="ai-dj-context"
          icon={<Music />}
          label="Follow what’s playing"
          description="Base picks on the current song"
          checked={recs.aiDJUseCurrentContext}
          onCheckedChange={(v) => save({ aiDJUseCurrentContext: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="dj-matching"
          icon={<AudioWaveform />}
          label="Match BPM, energy and key"
          description="Prefer songs that blend smoothly"
          checked={matching}
          onCheckedChange={(v) => save({ djMatchingEnabled: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="bpm-analysis"
          icon={<Disc3 />}
          label="Detect BPM while playing"
          description="Uses a little extra battery"
          checked={recs.bpmAnalysisEnabled ?? false}
          onCheckedChange={(v) => save({ bpmAnalysisEnabled: v })}
          disabled={off || !matching}
        />
      </SettingsSection>

      <SettingsSection title="Seeding">
        <SettingsSwitchRow
          id="seed-queue"
          icon={<SlidersHorizontal />}
          label="Seed picks through the queue"
          description="Not just at the end"
          checked={seeding}
          onCheckedChange={(v) => save({ aiDJSeedQueueEnabled: v })}
          disabled={off}
        />
        {seeding && (
          <SettingsStepperRow
            icon={<ListPlus />}
            label="Picks per 10 songs"
            value={recs.aiDJSeedDensity ?? 2}
            min={1}
            max={5}
            onChange={(v) => save({ aiDJSeedDensity: v })}
            disabled={off}
          />
        )}
        <SettingsBlock>
          <Button variant="outline" className="h-11 w-full rounded-full" onClick={seedNow} disabled={off}>
            <Sparkles className="size-4" />
            Seed my queue now
          </Button>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title="When the queue runs low">
        <SettingsLinkRow
          icon={<SlidersHorizontal />}
          label={showAdvanced ? 'Hide' : 'Advanced'}
          description={`Top up ${batch} ${batch === 1 ? 'song' : 'songs'} when ${threshold} ${threshold === 1 ? 'is' : 'are'} left`}
          onClick={() => setShowAdvanced((v) => !v)}
        />
        {showAdvanced && (
          <SettingsStepperRow
            label="Top up when this many are left"
            value={threshold}
            min={1}
            max={5}
            onChange={(v) => save({ aiDJQueueThreshold: v })}
            disabled={off}
          />
        )}
        {showAdvanced && (
          <SettingsStepperRow
            label="Songs per top-up"
            value={batch}
            min={1}
            max={10}
            onChange={(v) => save({ aiDJBatchSize: v })}
            disabled={off}
          />
        )}
      </SettingsSection>
    </SettingsStack>
  );
}

// Hook version for inline use in settings pages
export function useAIDJSettingsSync() {
  const { preferences, setRecommendationSettings } = usePreferencesStore();

  const updateDripInterval = async (interval: number) => {
    await setRecommendationSettings({ aiDJDripInterval: interval });
  };

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
    dripInterval: preferences.recommendationSettings.aiDJDripInterval ?? 3,
    threshold: preferences.recommendationSettings.aiDJQueueThreshold,
    batchSize: preferences.recommendationSettings.aiDJBatchSize,
    useContext: preferences.recommendationSettings.aiDJUseCurrentContext,
    updateDripInterval,
    updateThreshold,
    updateBatchSize,
    updateUseContext,
  };
}
