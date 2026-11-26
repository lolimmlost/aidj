import { Wand2 } from 'lucide-react';
import { usePreferencesStore, type RecommendationSettings as Recs } from '@/lib/stores/preferences';
import { AIDJSettings } from '@/components/ai-dj-settings';
import {
  SettingsSection,
  SettingsSelectRow,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
} from '@/components/settings/settings-ui';

const FREQUENCY = [
  { value: 'always' as const, label: 'Real time' },
  { value: 'daily' as const, label: 'Daily' },
  { value: 'weekly' as const, label: 'Weekly' },
];

export function RecommendationSettings() {
  const recs = usePreferencesStore((s) => s.preferences.recommendationSettings);
  const save = (patch: Partial<Recs>) =>
    saveOrWarn(usePreferencesStore.getState().setRecommendationSettings(patch), 'recommendation setting');
  const off = !recs.aiEnabled;

  return (
    <SettingsStack>
      <SettingsSection title="Recommendations" icon={<Wand2 />} description="What the AI DJ and Discover pick from">
        <SettingsSwitchRow
          id="ai-enabled"
          label="AI recommendations"
          description="Personal picks based on what you play"
          checked={recs.aiEnabled}
          onCheckedChange={(v) => save({ aiEnabled: v })}
        />
        <SettingsSelectRow
          id="frequency"
          label="New picks"
          value={recs.frequency}
          options={FREQUENCY}
          onChange={(v) => save({ frequency: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="style-playlists"
          label="Style-based playlists"
          description="Build playlists from styles and moods"
          checked={recs.styleBasedPlaylists}
          onCheckedChange={(v) => save({ styleBasedPlaylists: v })}
          disabled={off}
        />
        <SettingsSwitchRow
          id="seasonal-recs"
          label="Seasonal picks"
          description="Lean on the time of year"
          checked={recs.enableSeasonalRecommendations ?? true}
          onCheckedChange={(v) => save({ enableSeasonalRecommendations: v })}
          disabled={off}
        />
      </SettingsSection>

      <SettingsSection title="Your feedback" description="How your thumbs up and down are used">
        <SettingsSwitchRow
          id="use-feedback"
          label="Learn from feedback"
          description="Use your ratings to tune recommendations"
          checked={recs.useFeedbackForPersonalization}
          onCheckedChange={(v) => save({ useFeedbackForPersonalization: v })}
        />
        <SettingsSwitchRow
          id="sync-navidrome"
          label="Star in Navidrome"
          description="A thumbs up stars the song in Navidrome, a thumbs down unstars it"
          checked={recs.syncFeedbackToNavidrome ?? true}
          onCheckedChange={(v) => save({ syncFeedbackToNavidrome: v })}
        />
      </SettingsSection>

      <SettingsSection title="AI DJ">
        <SettingsSwitchRow
          id="ai-dj-enabled"
          label="AI DJ mode"
          description="Add songs to your queue based on what you’re playing"
          checked={recs.aiDJEnabled}
          onCheckedChange={(v) => save({ aiDJEnabled: v })}
          disabled={off}
        />
      </SettingsSection>

      <AIDJSettings />
    </SettingsStack>
  );
}
