// AI DJ settings (Story 3.9, drip-feed model). Shared by Settings → AI DJ and /dj/settings.
// Reads the preferences store directly and saves on change (the store applies it at once and rolls
// back on failure), so there is no local copy to drift.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore, type RecommendationSettings as Recs } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  SettingsBlock,
  SettingsSection,
  SettingsSliderRow,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
} from '@/components/settings/settings-ui';

const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

export function AIDJSettings() {
  const recs = usePreferencesStore((s) => s.preferences.recommendationSettings);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const save = (patch: Partial<Recs>) =>
    saveOrWarn(usePreferencesStore.getState().setRecommendationSettings(patch), 'AI DJ setting');

  if (!recs.aiEnabled) return null;

  const off = !recs.aiDJEnabled;
  const drip = recs.aiDJDripInterval ?? 3;
  const matching = recs.djMatchingEnabled ?? true;
  const seeding = recs.aiDJSeedQueueEnabled ?? false;
  const density = recs.aiDJSeedDensity ?? 2;
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
      <SettingsSection
        title="How the AI DJ picks"
        footer={
          off
            ? 'Turn on AI DJ mode to use these.'
            : `Adds 1 song every ${drip} songs you play${recs.aiDJUseCurrentContext ? ', based on what’s playing' : ''}.`
        }
      >
        <SettingsSliderRow
          id="ai-dj-drip"
          label="Add a pick every"
          value={drip}
          min={2}
          max={5}
          format={songs}
          onCommit={(v) => save({ aiDJDripInterval: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="ai-dj-context"
          label="Follow what’s playing"
          description="Base picks on the current song"
          checked={recs.aiDJUseCurrentContext}
          onCheckedChange={(v) => save({ aiDJUseCurrentContext: v })}
          disabled={off}
        />
      </SettingsSection>

      <SettingsSection title="DJ mixing">
        <SettingsSwitchRow
          id="dj-matching"
          label="Match BPM, energy and key"
          description="Prefer songs that blend smoothly"
          checked={matching}
          onCheckedChange={(v) => save({ djMatchingEnabled: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="bpm-analysis"
          label="Detect BPM while playing"
          description={recs.bpmAnalysisEnabled ? 'Analyses songs as they play (uses some extra CPU)' : 'Analyse songs as they play'}
          checked={recs.bpmAnalysisEnabled ?? false}
          onCheckedChange={(v) => save({ bpmAnalysisEnabled: v })}
          disabled={off || !matching}
        />
      </SettingsSection>

      <SettingsSection title="Queue seeding">
        <SettingsSwitchRow
          id="seed-queue"
          label="Seed picks through the queue"
          description="Spread AI picks through your queue, not just at the end"
          checked={seeding}
          onCheckedChange={(v) => save({ aiDJSeedQueueEnabled: v })}
          disabled={off}
        />
        {seeding && (
          <SettingsSliderRow
            id="seed-density"
            label="Picks per 10 songs"
            value={density}
            min={1}
            max={5}
            format={(v) => String(v)}
            onCommit={(v) => save({ aiDJSeedDensity: v })}
            disabled={off}
          />
        )}
        <SettingsBlock>
          <Button variant="outline" className="w-full" onClick={seedNow} disabled={off}>
            Seed my queue now
          </Button>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title="When the queue runs low" footer="Fallback for when you’re near the end of the queue.">
        <SettingsBlock className="!py-0">
          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex min-h-[52px] w-full items-center justify-between text-left text-[15px] font-semibold"
          >
            Advanced
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', showAdvanced && 'rotate-180')} />
          </button>
        </SettingsBlock>
        {showAdvanced && (
          <SettingsSliderRow
            id="ai-dj-threshold"
            label="Top up when this many are left"
            value={threshold}
            min={1}
            max={5}
            format={songs}
            onCommit={(v) => save({ aiDJQueueThreshold: v })}
            disabled={off}
          />
        )}
        {showAdvanced && (
          <SettingsSliderRow
            id="ai-dj-batch"
            label="Songs added per top-up"
            value={batch}
            min={1}
            max={10}
            format={songs}
            onCommit={(v) => save({ aiDJBatchSize: v })}
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
