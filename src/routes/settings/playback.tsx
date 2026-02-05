import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';

export function PlaybackSettings() {
  const { preferences, setPlaybackSettings, isLoading } = usePreferencesStore();
  const audioStore = useAudioStore();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [localSettings, setLocalSettings] = useState(preferences.playbackSettings);

  // Sync volume and crossfade with audio store on mount
  useEffect(() => {
    if (preferences.playbackSettings.volume !== audioStore.volume) {
      audioStore.setVolume(preferences.playbackSettings.volume);
    }
    if (preferences.playbackSettings.crossfadeDuration !== audioStore.crossfadeDuration) {
      audioStore.setCrossfadeDuration(preferences.playbackSettings.crossfadeDuration);
    }
  }, [preferences.playbackSettings.volume, preferences.playbackSettings.crossfadeDuration, audioStore]);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setLocalSettings({ ...localSettings, volume: newVolume });
    // Update audio store immediately for real-time feedback
    audioStore.setVolume(newVolume);
  };

  const handleCrossfadeChange = (value: number[]) => {
    const newDuration = value[0];
    setLocalSettings({ ...localSettings, crossfadeDuration: newDuration });
    // Update audio store immediately for real-time feedback
    audioStore.setCrossfadeDuration(newDuration);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await setPlaybackSettings(localSettings);
      // Ensure audio store is synced
      audioStore.setCrossfadeDuration(localSettings.crossfadeDuration);
      setMessage({ type: 'success', text: 'Playback settings saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save playback settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Playback Settings</h2>

      <div className="space-y-6">
        {/* Volume Control */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <Label htmlFor="volume">Default Volume</Label>
            <span className="text-sm text-muted-foreground">
              {Math.round(localSettings.volume * 100)}%
            </span>
          </div>
          <Slider
            id="volume"
            min={0}
            max={1}
            step={0.01}
            value={[localSettings.volume]}
            onValueChange={handleVolumeChange}
            className="mt-2"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Set the default volume level for playback
          </p>
        </div>

        {/* Autoplay Next Song */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="autoplay">Autoplay Next Song</Label>
            <p className="text-sm text-muted-foreground">
              Automatically play the next song in the queue
            </p>
          </div>
          <Switch
            id="autoplay"
            checked={localSettings.autoplayNext}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, autoplayNext: checked })
            }
          />
        </div>

        {/* Crossfade Duration */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <Label htmlFor="crossfade">Crossfade Duration</Label>
            <span className="text-sm text-muted-foreground">
              {localSettings.crossfadeDuration}s
            </span>
          </div>
          <Slider
            id="crossfade"
            min={0}
            max={10}
            step={1}
            value={[localSettings.crossfadeDuration]}
            onValueChange={handleCrossfadeChange}
            className="mt-2"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Smooth transition between songs (0-10 seconds)
          </p>
        </div>

        {/* Default Playback Quality */}
        <div>
          <Label htmlFor="quality">Default Playback Quality</Label>
          <Select
            value={localSettings.defaultQuality}
            onValueChange={(value: 'low' | 'medium' | 'high') =>
              setLocalSettings({ ...localSettings, defaultQuality: value })
            }
          >
            <SelectTrigger id="quality" className="mt-2">
              <SelectValue placeholder="Select quality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (128kbps)</SelectItem>
              <SelectItem value="medium">Medium (256kbps)</SelectItem>
              <SelectItem value="high">High (320kbps)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the default audio quality for streaming
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
