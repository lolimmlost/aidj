import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/lib/stores/preferences';

export function NotificationSettings() {
  const { preferences, setNotificationSettings, isLoading } = usePreferencesStore();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'default'>('default');

  const [localSettings, setLocalSettings] = useState(preferences.notificationSettings);

  // Check browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const handleBrowserNotificationToggle = async (checked: boolean) => {
    if (checked && permissionStatus !== 'granted') {
      try {
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);

        if (permission !== 'granted') {
          setMessage({
            type: 'error',
            text: 'Browser notifications permission denied. Please enable in browser settings.',
          });
          return;
        }
      } catch {
        setMessage({
          type: 'error',
          text: 'Failed to request notification permission',
        });
        return;
      }
    }

    setLocalSettings({ ...localSettings, browserNotifications: checked });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await setNotificationSettings(localSettings);
      setMessage({ type: 'success', text: 'Notification settings saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save notification settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const isNotificationSupported = 'Notification' in window;

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Notification Preferences</h2>

      <div className="space-y-6">
        {/* Browser Notifications Warning */}
        {!isNotificationSupported && (
          <div className="p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400">
            Browser notifications are not supported in your browser
          </div>
        )}

        {/* Permission Status */}
        {isNotificationSupported && permissionStatus === 'denied' && (
          <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
            Notification permissions are blocked. Please enable them in your browser settings to receive notifications.
          </div>
        )}

        {/* Browser Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="browser-notifications">Browser Notifications</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Receive desktop notifications for important events
            </p>
          </div>
          <Switch
            id="browser-notifications"
            checked={localSettings.browserNotifications}
            onCheckedChange={handleBrowserNotificationToggle}
            disabled={!isNotificationSupported}
          />
        </div>

        {/* Download Completion Notifications */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="download-completion">Download Completion</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Notify when song downloads are complete
            </p>
          </div>
          <Switch
            id="download-completion"
            checked={localSettings.downloadCompletion}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, downloadCompletion: checked })
            }
          />
        </div>

        {/* Recommendation Update Notifications */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="recommendation-updates">Recommendation Updates</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Notify when new recommendations are available
            </p>
          </div>
          <Switch
            id="recommendation-updates"
            checked={localSettings.recommendationUpdates}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, recommendationUpdates: checked })
            }
          />
        </div>

        {/* Test Notification Button */}
        {localSettings.browserNotifications && permissionStatus === 'granted' && (
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => {
                new Notification('AIDJ Test Notification', {
                  body: 'This is a test notification from AIDJ',
                  icon: '/favicon.ico',
                });
              }}
            >
              Send Test Notification
            </Button>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="w-full sm:w-auto"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </Card>
  );
}
