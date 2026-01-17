/**
 * Discovery Settings Component
 *
 * Settings panel for configuring background discovery.
 * - Enable/disable toggle
 * - Frequency slider (6-24 hours)
 * - Max suggestions per run (10-30)
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useDiscoverySuggestionsStore } from '@/lib/stores/discovery-suggestions';
import {
  Settings,
  Clock,
  Sparkles,
  Music,
  TrendingUp,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscoverySettingsProps {
  onClose?: () => void;
}

export function DiscoverySettings({ onClose }: DiscoverySettingsProps) {
  const {
    settings,
    status,
    fetchSettings,
    fetchStatus,
    updateSettings,
  } = useDiscoverySuggestionsStore();

  const [localSettings, setLocalSettings] = useState({
    enabled: true,
    frequencyHours: 12,
    maxSuggestionsPerRun: 15,
    seedCount: 10,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
    fetchStatus();
  }, [fetchSettings, fetchStatus]);

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        enabled: settings.enabled,
        frequencyHours: settings.frequencyHours,
        maxSuggestionsPerRun: settings.maxSuggestionsPerRun,
        seedCount: settings.seedCount,
      });
    }
  }, [settings]);

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        localSettings.enabled !== settings.enabled ||
        localSettings.frequencyHours !== settings.frequencyHours ||
        localSettings.maxSuggestionsPerRun !== settings.maxSuggestionsPerRun ||
        localSettings.seedCount !== settings.seedCount;
      setHasChanges(changed);
    }
  }, [localSettings, settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      setHasChanges(false);
      if (onClose) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const frequencyLabels: Record<number, string> = {
    6: '6 hours',
    12: '12 hours',
    24: '1 day',
    48: '2 days',
    72: '3 days',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Discovery Settings</CardTitle>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
        <CardDescription>
          Configure how background discovery finds new music for you
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">
              Background Discovery
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically discover new music based on your taste
            </p>
          </div>
          <Switch
            checked={localSettings.enabled}
            onCheckedChange={(checked) =>
              setLocalSettings({ ...localSettings, enabled: checked })
            }
          />
        </div>

        {/* Frequency Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Discovery Frequency
              </Label>
              <p className="text-sm text-muted-foreground">
                How often to search for new music
              </p>
            </div>
            <Badge variant="secondary">
              Every {frequencyLabels[localSettings.frequencyHours] || `${localSettings.frequencyHours}h`}
            </Badge>
          </div>
          <Slider
            value={[localSettings.frequencyHours]}
            onValueChange={([value]) =>
              setLocalSettings({ ...localSettings, frequencyHours: value })
            }
            min={6}
            max={72}
            step={6}
            disabled={!localSettings.enabled}
            className={cn(!localSettings.enabled && "opacity-50")}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>6h</span>
            <span>24h</span>
            <span>48h</span>
            <span>72h</span>
          </div>
        </div>

        {/* Suggestions Per Run */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Suggestions Per Run
              </Label>
              <p className="text-sm text-muted-foreground">
                Maximum suggestions generated each time
              </p>
            </div>
            <Badge variant="secondary">
              {localSettings.maxSuggestionsPerRun} tracks
            </Badge>
          </div>
          <Slider
            value={[localSettings.maxSuggestionsPerRun]}
            onValueChange={([value]) =>
              setLocalSettings({ ...localSettings, maxSuggestionsPerRun: value })
            }
            min={5}
            max={50}
            step={5}
            disabled={!localSettings.enabled}
            className={cn(!localSettings.enabled && "opacity-50")}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5</span>
            <span>25</span>
            <span>50</span>
          </div>
        </div>

        {/* Seed Count */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium flex items-center gap-2">
                <Music className="h-4 w-4" />
                Seed Artists
              </Label>
              <p className="text-sm text-muted-foreground">
                Number of your artists to use as discovery seeds
              </p>
            </div>
            <Badge variant="secondary">
              {localSettings.seedCount} artists
            </Badge>
          </div>
          <Slider
            value={[localSettings.seedCount]}
            onValueChange={([value]) =>
              setLocalSettings({ ...localSettings, seedCount: value })
            }
            min={3}
            max={20}
            step={1}
            disabled={!localSettings.enabled}
            className={cn(!localSettings.enabled && "opacity-50")}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3</span>
            <span>10</span>
            <span>20</span>
          </div>
        </div>

        {/* Statistics */}
        {status && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Statistics
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">
                  {status.totalSuggestionsGenerated}
                </p>
                <p className="text-xs text-muted-foreground">Generated</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">
                  {status.totalApproved}
                </p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">
                  {status.approvalRate}%
                </p>
                <p className="text-xs text-muted-foreground">Approval Rate</p>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {status?.lastError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Last error</p>
              <p className="text-sm text-destructive/80">{status.lastError}</p>
            </div>
          </div>
        )}

        {/* Save button */}
        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
