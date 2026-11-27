import { Heart, Sparkles, Star, Wand2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore, type RecommendationSettings as Recs } from '@/lib/stores/preferences';
import { AIDJSettings } from '@/components/ai-dj-settings';
import { cn } from '@/lib/utils';
import {
  SettingsHero,
  SettingsSection,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
  useSettingsLook,
} from '@/components/settings/settings-ui';

/** Your next 12 songs: a sparkle every (interval + 1)th is an AI DJ pick. */
function DripDots({ every, on }: { every: number; on: boolean }) {
  return (
    <div aria-hidden className="mt-4 flex flex-wrap gap-1.5">
      {Array.from({ length: 12 }, (_, i) =>
        on && (i + 1) % (every + 1) === 0 ? (
          <span key={i} className="grid size-[18px] place-items-center rounded-md bg-[linear-gradient(135deg,var(--primary),#E0AE4A)] text-background">
            <Sparkles className="size-[11px]" strokeWidth={2.6} />
          </span>
        ) : (
          <span key={i} className="size-[18px] rounded-full bg-foreground/[0.18]" />
        ),
      )}
    </div>
  );
}

export function RecommendationSettings() {
  const recs = usePreferencesStore((s) => s.preferences.recommendationSettings);
  const glass = useSettingsLook() === 'glass';
  const save = (patch: Partial<Recs>) =>
    saveOrWarn(usePreferencesStore.getState().setRecommendationSettings(patch), 'recommendation setting');
  const off = !recs.aiEnabled;
  const every = recs.aiDJDripInterval ?? 3;
  const djOn = recs.aiEnabled && recs.aiDJEnabled;

  return (
    <SettingsStack>
      <SettingsHero wash>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-foreground text-background">
            <Sparkles className="size-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="ai-dj-enabled" className="block font-display text-xl font-extrabold">
              AI DJ
            </label>
            <p className="text-[13px] leading-snug text-foreground/80">
              {off
                ? 'Turn on AI recommendations below to use the AI DJ'
                : djOn
                  ? `Adds a pick every ${every} songs`
                  : 'Off · your queue plays as you set it'}
            </p>
          </div>
          <Switch
            id="ai-dj-enabled"
            checked={recs.aiDJEnabled}
            disabled={off}
            onCheckedChange={(v) => save({ aiDJEnabled: v })}
            className={cn(glass && 'ios-switch')}
          />
        </div>
        <DripDots every={every} on={djOn} />
        <div className="mt-2 flex justify-between font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
          <span>YOUR QUEUE</span>
          <span>✦ = AI PICK</span>
        </div>
      </SettingsHero>

      <AIDJSettings />

      <SettingsSection title="Recommendations">
        <SettingsSwitchRow
          id="ai-enabled"
          icon={<Wand2 />}
          label="AI recommendations"
          description="Personal picks from what you play"
          checked={recs.aiEnabled}
          onCheckedChange={(v) => save({ aiEnabled: v })}
        />
        <SettingsSwitchRow
          id="use-feedback"
          icon={<Heart />}
          label="Learn from your ratings"
          description="Thumbs up and down tune your picks"
          checked={recs.useFeedbackForPersonalization}
          onCheckedChange={(v) => save({ useFeedbackForPersonalization: v })}
        />
        <SettingsSwitchRow
          id="sync-navidrome"
          icon={<Star />}
          label="Star in Navidrome"
          description="Thumbs up stars a song, thumbs down unstars it"
          checked={recs.syncFeedbackToNavidrome ?? true}
          onCheckedChange={(v) => save({ syncFeedbackToNavidrome: v })}
        />
      </SettingsSection>
    </SettingsStack>
  );
}
