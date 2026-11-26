import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore, type NotificationSettings as Notifications } from '@/lib/stores/preferences';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  SettingsBlock,
  SettingsHero,
  SettingsSection,
  SettingsStack,
  SettingsSwitchRow,
  saveOrWarn,
} from '@/components/settings/settings-ui';

type Permission = NotificationPermission | 'unsupported';

const PERMISSION_COPY: Record<Permission, { title: string; sub: string; tone: 'good' | 'bad' | 'ask' }> = {
  granted: { title: 'Allowed on this device', sub: 'AIDJ can show alerts while it’s open or in the background', tone: 'good' },
  default: { title: 'Not allowed yet', sub: 'Allow alerts so AIDJ can tell you when things are ready', tone: 'ask' },
  denied: { title: 'Blocked on this device', sub: 'Allow notifications for this site in your browser or phone settings', tone: 'bad' },
  unsupported: { title: 'Not available here', sub: 'This browser can’t show notifications', tone: 'bad' },
};

export function NotificationSettings() {
  const settings = usePreferencesStore((s) => s.preferences.notificationSettings);
  const [permission, setPermission] = useState<Permission>('default');

  useEffect(() => {
    setPermission(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  }, []);

  const save = (patch: Partial<Notifications>) =>
    saveOrWarn(usePreferencesStore.getState().setNotificationSettings(patch), 'notification setting');

  const allow = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') await save({ browserNotifications: true });
      else toast.error('Notifications are blocked. Allow them for this site in your settings.');
    } catch {
      toast.error('Couldn’t ask for notification permission');
    }
  };

  const copy = PERMISSION_COPY[permission];
  const canNotify = permission === 'granted';

  return (
    <SettingsStack>
      <SettingsHero className="flex items-center gap-3.5">
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl',
            copy.tone === 'good' ? 'bg-success/15 text-success' : copy.tone === 'bad' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
          )}
        >
          {copy.tone === 'bad' ? <BellOff className="size-6" /> : <Bell className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{copy.title}</p>
          <p className="text-[13px] leading-snug text-muted-foreground">{copy.sub}</p>
        </div>
        {permission === 'default' && (
          <Button size="sm" className="shrink-0 rounded-full" onClick={allow}>
            Allow
          </Button>
        )}
      </SettingsHero>

      <SettingsSection title="Tell me when">
        <SettingsSwitchRow
          id="browser-notifications"
          icon={<Bell />}
          label="Show alerts on this device"
          description="Pop-up notifications from AIDJ"
          checked={settings.browserNotifications && canNotify}
          onCheckedChange={(v) => (v && !canNotify ? allow() : save({ browserNotifications: v }))}
          disabled={permission === 'unsupported' || permission === 'denied'}
        />
        <SettingsSwitchRow
          id="download-completion"
          icon={<Download />}
          label="Downloads finish"
          description="A song you requested is in your library"
          checked={settings.downloadCompletion}
          onCheckedChange={(v) => save({ downloadCompletion: v })}
        />
        <SettingsSwitchRow
          id="recommendation-updates"
          icon={<Sparkles />}
          label="New picks are ready"
          description="Fresh recommendations for you"
          checked={settings.recommendationUpdates}
          onCheckedChange={(v) => save({ recommendationUpdates: v })}
        />
      </SettingsSection>

      {canNotify && settings.browserNotifications && (
        <SettingsSection>
          <SettingsBlock>
            <Button
              variant="outline"
              className="h-11 w-full rounded-full"
              onClick={() => new Notification('AIDJ', { body: 'Notifications are working.', icon: '/favicon.ico' })}
            >
              <Bell className="size-4" />
              Send a test notification
            </Button>
          </SettingsBlock>
        </SettingsSection>
      )}
    </SettingsStack>
  );
}
