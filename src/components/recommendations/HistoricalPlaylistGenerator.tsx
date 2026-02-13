/**
 * Historical Playlist Generator Component
 *
 * Allows users to generate playlists based on their historical preferences
 * from any time period, with options to blend past and current tastes.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { useState, useCallback, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Slider } from '../ui/slider';
import {
  Calendar,
  Music,
  Sparkles,
  Download,
  Clock,
  Disc3,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface RegeneratedPlaylist {
  name: string;
  description: string;
  tracks: Array<{
    artist: string;
    title: string;
    songId?: string;
    matchScore: number;
    matchReason: string;
  }>;
  periodLabel: string;
  blendRatio: number;
}

interface HistoricalPlaylistGeneratorProps {
  onPlaylistGenerated?: (playlist: RegeneratedPlaylist) => void;
}

type PresetPeriod = 'last-month' | 'last-quarter' | 'last-year' | 'custom';

// ============================================================================
// Constants
// ============================================================================

const PRESET_PERIODS = [
  { id: 'last-month', label: 'Last Month', months: 1 },
  { id: 'last-quarter', label: 'Last Quarter', months: 3 },
  { id: 'last-year', label: 'Last Year', months: 12 },
  { id: 'custom', label: 'Custom Period', months: null },
] as const;

// ============================================================================
// API Functions
// ============================================================================

async function generateHistoricalPlaylist(
  periodStart: Date,
  periodEnd: Date,
  blendRatio: number,
  maxTracks: number
): Promise<RegeneratedPlaylist> {
  const response = await fetch('/api/recommendations/mood-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'regenerate-playlist',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      blendRatio,
      maxTracks,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate playlist');
  }

  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPeriodDates(preset: PresetPeriod, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  if (preset === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  const end = new Date();
  const start = new Date();

  const presetConfig = PRESET_PERIODS.find(p => p.id === preset);
  if (presetConfig?.months) {
    start.setMonth(start.getMonth() - presetConfig.months);
  }

  return { start, end };
}

function _formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Subcomponents
// ============================================================================

const TrackItem = memo(function TrackItem({
  track,
  index,
}: {
  track: RegeneratedPlaylist['tracks'][0];
  index: number;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      <span className="text-xs text-muted-foreground w-5 text-right">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>
      <div className="flex items-center gap-1">
        <div
          className="h-1.5 rounded-full bg-primary/20"
          style={{ width: '48px' }}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${track.matchScore * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
});

const BlendRatioSlider = memo(function BlendRatioSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Blend Ratio</span>
        <span className="text-sm text-muted-foreground">{value}% Historical</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={100}
        step={10}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Current Taste</span>
        <span>Historical Only</span>
      </div>
    </div>
  );
});

const PlaylistSkeleton = memo(function PlaylistSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="w-5 h-4" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/4 mb-1" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function HistoricalPlaylistGenerator({
  onPlaylistGenerated,
}: HistoricalPlaylistGeneratorProps) {
  // State
  const [selectedPeriod, setSelectedPeriod] = useState<PresetPeriod>('last-quarter');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [blendRatio, setBlendRatio] = useState(100); // 100% historical by default
  const [maxTracks, setMaxTracks] = useState(25);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<RegeneratedPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handlers
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const customStart = customStartDate ? new Date(customStartDate) : undefined;
      const customEnd = customEndDate ? new Date(customEndDate) : undefined;
      const { start, end } = getPeriodDates(selectedPeriod, customStart, customEnd);

      const playlist = await generateHistoricalPlaylist(start, end, blendRatio, maxTracks);
      setGeneratedPlaylist(playlist);
      onPlaylistGenerated?.(playlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate playlist');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedPeriod, customStartDate, customEndDate, blendRatio, maxTracks, onPlaylistGenerated]);

  const handleExport = useCallback(() => {
    if (!generatedPlaylist) return;

    const content = generatedPlaylist.tracks
      .map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`)
      .join('\n');

    const blob = new Blob([
      `# ${generatedPlaylist.name}\n`,
      `# ${generatedPlaylist.description}\n`,
      `# Generated: ${new Date().toISOString()}\n\n`,
      content,
    ], { type: 'text/plain' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedPlaylist.name.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedPlaylist]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Nostalgia Playlist Generator
        </h3>
        <p className="text-sm text-muted-foreground">
          Revisit your past music preferences with a custom playlist
        </p>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Select Time Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period Selection */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_PERIODS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPeriod(preset.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedPeriod === preset.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="text-sm font-medium">{preset.label}</p>
                {preset.months && (
                  <p className="text-xs text-muted-foreground">
                    {preset.months} month{preset.months > 1 ? 's' : ''} ago
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Custom Date Range */}
          {selectedPeriod === 'custom' && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blend Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Customize Mix
          </CardTitle>
          <CardDescription>
            Blend historical preferences with your current taste
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BlendRatioSlider value={blendRatio} onChange={setBlendRatio} />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Playlist Length</span>
            <select
              value={maxTracks}
              onChange={(e) => setMaxTracks(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value={15}>15 tracks</option>
              <option value={25}>25 tracks</option>
              <option value={50}>50 tracks</option>
              <option value={100}>100 tracks</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || (selectedPeriod === 'custom' && (!customStartDate || !customEndDate))}
        className="w-full"
        size="lg"
      >
        {isGenerating ? (
          <>
            <Disc3 className="w-4 h-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Music className="w-4 h-4 mr-2" />
            Generate Nostalgia Playlist
          </>
        )}
      </Button>

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Generated Playlist */}
      {generatedPlaylist && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{generatedPlaylist.name}</CardTitle>
                <CardDescription>{generatedPlaylist.description}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
              <span>{generatedPlaylist.tracks.length} tracks</span>
              <span>•</span>
              <span>{generatedPlaylist.blendRatio}% historical</span>
              <span>•</span>
              <span>{generatedPlaylist.periodLabel}</span>
            </div>

            {isGenerating ? (
              <PlaylistSkeleton />
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-1">
                {generatedPlaylist.tracks.map((track, index) => (
                  <TrackItem key={`${track.artist}-${track.title}`} track={track} index={index} />
                ))}
              </div>
            )}

            {generatedPlaylist.tracks.length === 0 && (
              <div className="text-center py-8">
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No tracks found for this period. Try a different time range.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default HistoricalPlaylistGenerator;
