import { ProfileSettings } from './profile';
import { NotificationSettings } from './notifications';
import { LayoutSettings } from './layout';
import { SettingsStack } from '@/components/settings/settings-ui';

export function GeneralSettings() {
  return (
    <SettingsStack>
      <ProfileSettings />
      <NotificationSettings />
      <LayoutSettings />
    </SettingsStack>
  );
}
