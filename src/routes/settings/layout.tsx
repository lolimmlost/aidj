import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/lib/stores/preferences';

export function LayoutSettings() {
  const { preferences, setDashboardLayout, isLoading } = usePreferencesStore();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [localSettings, setLocalSettings] = useState(preferences.dashboardLayout);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await setDashboardLayout(localSettings);
      setMessage({ type: 'success', text: 'Layout settings saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save layout settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Dashboard Layout</h2>

      <div className="space-y-6">
        {/* Info Message */}
        <div className="p-4 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
          <p className="text-sm">
            Customize which sections appear on your dashboard. Changes will take effect on your next visit.
          </p>
        </div>

        {/* Show Recommendations Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="show-recommendations">Show Recommendations Section</Label>
            <p className="text-sm text-muted-foreground">
              Display AI-generated recommendations on the dashboard
            </p>
          </div>
          <Switch
            id="show-recommendations"
            checked={localSettings.showRecommendations}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, showRecommendations: checked })
            }
          />
        </div>

        {/* Show Recently Played Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="show-recently-played">Show Recently Played Section</Label>
            <p className="text-sm text-muted-foreground">
              Display your recently played songs on the dashboard
            </p>
          </div>
          <Switch
            id="show-recently-played"
            checked={localSettings.showRecentlyPlayed}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, showRecentlyPlayed: checked })
            }
          />
        </div>

        {/* Widget Order - Future Enhancement */}
        <div className="p-4 rounded-md bg-muted/50 border border-border">
          <Label>Widget Order</Label>
          <p className="text-sm text-muted-foreground mt-2">
            Drag & drop to reorder dashboard widgets
          </p>
          <p className="text-sm text-muted-foreground mt-2 italic">
            Coming soon: Customize the order of dashboard sections
          </p>
        </div>

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
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </Card>
  );
}
