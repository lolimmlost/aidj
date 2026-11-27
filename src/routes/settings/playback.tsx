import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { usePreferencesStore, type PlaybackSettings as Playback } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import {
  SettingsHero,
  SettingsSection,
  SettingsSelectRow,
  SettingsSlider,
  SettingsSliderRow,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
  useSliderDraft,
} from '@/components/settings/settings-ui';

// "Count a play after": the common stops; End = the whole song.
const COUNT_AT = [
  { value: '30', label: '30%' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: 'End' },
];
const nearestStop = (v: number) => String([30, 50, 75, 100].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));

// Stable bar heights for the waveform drawing.
const BARS = Array.from({ length: 34 }, (_, i) => 10 + Math.abs(Math.sin(i * 0.9)) * 22 + (i % 3) * 3);

/** Two songs' waveforms; how far they overlap is the crossfade (0 = hard cut, 10 s = wide blend). */
function CrossfadeArt({ seconds }: { seconds: number }) {
  const overlap = (seconds / 10) * 40; // % of the width the two songs share
  const aEnd = 50 + overlap / 2;
  const bStart = 50 - overlap / 2;
  const fadeA = overlap ? `linear-gradient(90deg, black ${((aEnd - overlap) / aEnd) * 100}%, transparent)` : undefined;
  const fadeB = overlap ? `linear-gradient(90deg, transparent, black ${(overlap / (100 - bStart)) * 100}%)` : undefined;
  return (
    <div aria-hidden className="relative my-3 h-14">
      <div className="absolute inset-y-0 left-0 flex items-center gap-[3px] overflow-hidden" style={{ width: `${aEnd}%`, maskImage: fadeA, WebkitMaskImage: fadeA }}>
        {BARS.map((h, i) => (
          <span key={i} className="w-1 shrink-0 rounded-full bg-primary/80" style={{ height: h }} />
        ))}
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center justify-end gap-[3px] overflow-hidden" style={{ left: `${bStart}%`, maskImage: fadeB, WebkitMaskImage: fadeB }}>
        {BARS.map((h, i) => (
          <span key={i} className="w-1 shrink-0 rounded-full bg-[#E0AE4A]" style={{ height: BARS[BARS.length - 1 - i] ?? h }} />
        ))}
      </div>
    </div>
  );
}

export function PlaybackSettings() {
  const settings = usePreferencesStore((s) => s.preferences.playbackSettings);
  const save = (patch: Partial<Playback>) =>
    saveOrWarn(usePreferencesStore.getState().setPlaybackSettings(patch), 'playback setting');

  // The player follows the saved crossfade (read once per change, no per-tick subscription).
  useEffect(() => {
    const audio = useAudioStore.getState();
    if (settings.crossfadeDuration !== audio.crossfadeDuration) audio.setCrossfadeDuration(settings.crossfadeDuration);
  }, [settings.crossfadeDuration]);

  const crossfade = useSliderDraft(
    settings.crossfadeDuration,
    (v) => save({ crossfadeDuration: v }),
    (v) => useAudioStore.getState().setCrossfadeDuration(v),
  );

  return (
    <SettingsStack>
      <SettingsHero wash>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.14em]">CROSSFADE</span>
          <span className="font-mono text-[22px] font-bold tabular-nums">{crossfade.shown === 0 ? 'Off' : `${crossfade.shown} s`}</span>
        </div>
        <CrossfadeArt seconds={crossfade.shown} />
        <div className="flex justify-between font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
          <span>THIS SONG</span>
          <span>NEXT</span>
        </div>
        <SettingsSlider aria-label="Crossfade length" min={0} max={10} step={1} className="mt-2" {...crossfade.props} />
      </SettingsHero>

      <SettingsSection title="Playing">
        <SettingsSliderRow
          id="volume"
          label="Volume"
          value={settings.volume}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => useAudioStore.getState().setVolume(v)}
          onCommit={(v) => save({ volume: v })}
        />
        <SettingsSelectRow
          id="scrobble-threshold"
          label="Count a play after"
          value={nearestStop(settings.scrobbleThreshold ?? 50)}
          options={COUNT_AT}
          description="When a song counts as played and scrobbles"
          onChange={(v) => save({ scrobbleThreshold: Number(v) })}
        />
        <SettingsSwitchRow
          id="safe-mode"
          icon={<ShieldCheck />}
          label="Safe mode (PG)"
          description="No explicit songs from AI DJ, radio or recommendations"
          checked={settings.safeMode ?? false}
          onCheckedChange={(v) => save({ safeMode: v })}
        />
      </SettingsSection>
    </SettingsStack>
  );
}
