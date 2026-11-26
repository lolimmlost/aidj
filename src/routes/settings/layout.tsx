import { LayoutDashboard } from 'lucide-react';
import { usePreferencesStore, type DashboardLayout } from '@/lib/stores/preferences';
import { SettingsSection, SettingsSwitchRow, saveOrWarn } from '@/components/settings/settings-ui';

export function LayoutSettings() {
  const layout = usePreferencesStore((s) => s.preferences.dashboardLayout);
  const save = (patch: Partial<DashboardLayout>) =>
    saveOrWarn(usePreferencesStore.getState().setDashboardLayout(patch), 'layout setting');

  return (
    <SettingsSection title="Dashboard" icon={<LayoutDashboard />} description="Sections on the desktop dashboard">
      <SettingsSwitchRow
        id="show-recommendations"
        label="Recommendations"
        description="AI picks for you"
        checked={layout.showRecommendations}
        onCheckedChange={(v) => save({ showRecommendations: v })}
      />
      <SettingsSwitchRow
        id="show-recently-played"
        label="Recently played"
        description="What you listened to last"
        checked={layout.showRecentlyPlayed}
        onCheckedChange={(v) => save({ showRecentlyPlayed: v })}
      />
    </SettingsSection>
  );
}
