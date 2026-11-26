import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { usePreferencesStore, type PlaybackSettings as Playback } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import {
  SettingsSection,
  SettingsSelectRow,
  SettingsSliderRow,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
} from '@/components/settings/settings-ui';

const QUALITY = [
  { value: 'low' as const, label: 'Low · 128 kbps' },
  { value: 'medium' as const, label: 'Medium · 256 kbps' },
  { value: 'high' as const, label: 'High · 320 kbps' },
];

export function PlaybackSettings() {
  const settings = usePreferencesStore((s) => s.preferences.playbackSettings);
  const save = (patch: Partial<Playback>) =>
    saveOrWarn(usePreferencesStore.getState().setPlaybackSettings(patch), 'playback setting');

  // The player follows the saved crossfade (read once per change, no per-tick subscription).
  useEffect(() => {
    const audio = useAudioStore.getState();
    if (settings.crossfadeDuration !== audio.crossfadeDuration) audio.setCrossfadeDuration(settings.crossfadeDuration);
  }, [settings.crossfadeDuration]);

  return (
    <SettingsStack>
      <SettingsSection title="Sound" icon={<Volume2 />} description="Volume, crossfade and streaming quality">
        <SettingsSliderRow
          id="volume"
          label="Default volume"
          value={settings.volume}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => useAudioStore.getState().setVolume(v)}
          onCommit={(v) => save({ volume: v })}
        />
        <SettingsSliderRow
          id="crossfade"
          label="Crossfade"
          value={settings.crossfadeDuration}
          min={0}
          max={10}
          format={(v) => (v === 0 ? 'Off' : `${v} s`)}
          description={() => 'Blend the end of one song into the next'}
          onChange={(v) => useAudioStore.getState().setCrossfadeDuration(v)}
          onCommit={(v) => save({ crossfadeDuration: v })}
        />
        <SettingsSelectRow
          id="quality"
          label="Streaming quality"
          value={settings.defaultQuality}
          options={QUALITY}
          onChange={(v) => save({ defaultQuality: v })}
        />
      </SettingsSection>

      <SettingsSection title="Playing">
        <SettingsSwitchRow
          id="autoplay"
          label="Autoplay next song"
          description="Keep playing the queue when a song ends"
          checked={settings.autoplayNext}
          onCheckedChange={(v) => save({ autoplayNext: v })}
        />
        <SettingsSliderRow
          id="scrobble-threshold"
          label="Count a play after"
          value={settings.scrobbleThreshold ?? 50}
          min={10}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          description={(v) => `A song counts as played (and scrobbles) once ${v}% of it has played`}
          onCommit={(v) => save({ scrobbleThreshold: v })}
        />
        <SettingsSwitchRow
          id="safe-mode"
          label="Safe mode (PG)"
          description="Keep explicit songs out of AI DJ picks and autoplay (explicit flags come from Deezer)"
          checked={settings.safeMode ?? false}
          onCheckedChange={(v) => save({ safeMode: v })}
        />
      </SettingsSection>
    </SettingsStack>
  );
}
