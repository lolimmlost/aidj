import { ProfileSettings } from './profile';
import { NotificationSettings } from './notifications';
import { LayoutSettings } from './layout';

export function GeneralSettings() {
  return (
    <div className="space-y-8">
      <ProfileSettings />
      <NotificationSettings />
      <LayoutSettings />
    </div>
  );
}
