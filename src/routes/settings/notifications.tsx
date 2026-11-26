import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore, type NotificationSettings as Notifications } from '@/lib/stores/preferences';
import { toast } from '@/lib/toast';
import { SettingsBlock, SettingsSection, SettingsSwitchRow, saveOrWarn } from '@/components/settings/settings-ui';

export function NotificationSettings() {
  const settings = usePreferencesStore((s) => s.preferences.notificationSettings);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (supported) setPermission(Notification.permission);
  }, [supported]);

  const save = (patch: Partial<Notifications>) =>
    saveOrWarn(usePreferencesStore.getState().setNotificationSettings(patch), 'notification setting');

  const toggleBrowser = async (on: boolean) => {
    if (on && permission !== 'granted') {
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          toast.error('Notifications are blocked. Allow them for this site in your browser settings.');
          return;
        }
      } catch {
        toast.error('Couldn’t ask for notification permission');
        return;
      }
    }
    await save({ browserNotifications: on });
  };

  return (
    <SettingsSection
      title="Notifications"
      icon={<Bell />}
      description="What pings you"
      footer={
        !supported
          ? 'This browser doesn’t support notifications.'
          : permission === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser settings first.'
            : undefined
      }
    >
      <SettingsSwitchRow
        id="browser-notifications"
        label="Browser notifications"
        description="Show alerts from AIDJ on this device"
        checked={settings.browserNotifications}
        onCheckedChange={toggleBrowser}
        disabled={!supported}
      />
      <SettingsSwitchRow
        id="download-completion"
        label="Downloads finished"
        description="When a song you requested has downloaded"
        checked={settings.downloadCompletion}
        onCheckedChange={(v) => save({ downloadCompletion: v })}
      />
      <SettingsSwitchRow
        id="recommendation-updates"
        label="New recommendations"
        description="When fresh picks are ready for you"
        checked={settings.recommendationUpdates}
        onCheckedChange={(v) => save({ recommendationUpdates: v })}
      />
      {settings.browserNotifications && permission === 'granted' && (
        <SettingsBlock>
          <Button
            variant="outline"
            onClick={() => new Notification('AIDJ', { body: 'Notifications are working.', icon: '/favicon.ico' })}
          >
            Send a test notification
          </Button>
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}
