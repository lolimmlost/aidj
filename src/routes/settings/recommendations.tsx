import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { AIDJSettings } from '@/components/ai-dj-settings';

export function RecommendationSettings() {
  const { preferences, setRecommendationSettings, isLoading } = usePreferencesStore();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [localSettings, setLocalSettings] = useState(preferences.recommendationSettings);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await setRecommendationSettings(localSettings);
      setMessage({ type: 'success', text: 'Recommendation settings saved successfully' });
    } catch (err) {
      console.error('Failed to save recommendation settings:', err);
      setMessage({ type: 'error', text: 'Failed to save recommendation settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Recommendation Preferences</h2>

      <div className="space-y-6">
        {/* AI Recommendations Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="ai-enabled">Enable AI Recommendations</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Get personalized music recommendations powered by AI
            </p>
          </div>
          <Switch
            id="ai-enabled"
            checked={localSettings.aiEnabled}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, aiEnabled: checked })
            }
          />
        </div>

        {/* Recommendation Frequency */}
        <div>
          <Label htmlFor="frequency">Recommendation Frequency</Label>
          <Select
            value={localSettings.frequency}
            onValueChange={(value: 'always' | 'daily' | 'weekly') =>
              setLocalSettings({ ...localSettings, frequency: value })
            }
          >
            <SelectTrigger id="frequency" className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always (Real-time)</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            How often should we generate new recommendations?
          </p>
        </div>

        {/* Style-Based Playlists */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="style-playlists">Style-Based Playlist Generation</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate playlists based on music styles and moods
            </p>
          </div>
          <Switch
            id="style-playlists"
            checked={localSettings.styleBasedPlaylists}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, styleBasedPlaylists: checked })
            }
          />
        </div>

        {/* Seasonal Recommendations (Story 3.11) */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="seasonal-recs">Seasonal Recommendations</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically adjust recommendations based on season and time of year
            </p>
          </div>
          <Switch
            id="seasonal-recs"
            checked={localSettings.enableSeasonalRecommendations ?? true}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, enableSeasonalRecommendations: checked })
            }
          />
        </div>

        {/* Privacy: Use Feedback for Personalization */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="use-feedback">Use Feedback for Personalization</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Use your song ratings and feedback to improve recommendations
            </p>
          </div>
          <Switch
            id="use-feedback"
            checked={localSettings.useFeedbackForPersonalization}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, useFeedbackForPersonalization: checked })
            }
          />
        </div>

        {/* AI DJ Toggle (Story 3.9) */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="space-y-0.5">
            <Label htmlFor="ai-dj-enabled">AI DJ Mode</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically add songs to your queue based on what you're listening to
            </p>
          </div>
          <Switch
            id="ai-dj-enabled"
            checked={localSettings.aiDJEnabled}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, aiDJEnabled: checked })
            }
          />
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
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* AI DJ Settings Section (Story 3.9) */}
      <div className="mt-6">
        <AIDJSettings />
      </div>
    </Card>
  );
}
