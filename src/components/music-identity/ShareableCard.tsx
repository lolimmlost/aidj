/**
 * Shareable Card Component
 *
 * Generates shareable visual cards for music identity summaries
 */

import { memo, useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Share2,
  Copy,
  Download,
  Link,
  Check,
  Music,
  TrendingUp,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import type { MusicIdentitySummary, CardData } from '@/lib/db/schema/music-identity.schema';

// ============================================================================
// Types
// ============================================================================

interface ShareableCardProps {
  summary: MusicIdentitySummary;
}

interface UpdateSummaryRequest {
  isPublic?: boolean;
  cardTheme?: string;
  cardData?: Partial<CardData>;
}

// ============================================================================
// API Functions
// ============================================================================

async function updateSummary(
  summaryId: string,
  updates: UpdateSummaryRequest
): Promise<MusicIdentitySummary> {
  const response = await fetch(`/api/music-identity/${summaryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update summary');
  }

  const data = await response.json();
  return data.data;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

// ============================================================================
// Component
// ============================================================================

export const ShareableCard = memo(function ShareableCard({
  summary,
}: ShareableCardProps) {
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [customMessage, setCustomMessage] = useState(summary.cardData?.customMessage || '');
  const [selectedTheme, setSelectedTheme] = useState(summary.cardTheme || 'default');

  const isPublic = summary.isPublic === 1;
  const shareUrl = summary.shareToken
    ? `${window.location.origin}/music-identity/share/${summary.shareToken}`
    : null;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (updates: UpdateSummaryRequest) => updateSummary(summary.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicIdentity.all() });
      toast.success('Settings updated');
    },
    onError: (error) => {
      toast.error('Failed to update', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });

  const handleTogglePublic = useCallback(() => {
    updateMutation.mutate({ isPublic: !isPublic });
  }, [isPublic, updateMutation]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [shareUrl]);

  const handleUpdateCardSettings = useCallback((updates: Partial<CardData>) => {
    updateMutation.mutate({
      cardData: updates,
    });
  }, [updateMutation]);

  const handleUpdateTheme = useCallback((theme: string) => {
    setSelectedTheme(theme); // Optimistic update
    updateMutation.mutate({ cardTheme: theme });
  }, [updateMutation]);

  const periodLabel = summary.month
    ? `${getMonthName(summary.month)} ${summary.year}`
    : `${summary.year}`;

  const cardData = summary.cardData || {
    primaryColor: '#8b5cf6',
    secondaryColor: '#ec4899',
    layout: 'vibrant',
    showStats: true,
    showTopArtists: true,
    showMoodProfile: true,
    showTrends: true,
  };

  return (
    <div className="space-y-6">
      {/* Share Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Settings
          </CardTitle>
          <CardDescription>
            Control who can see your music identity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Public Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="public-toggle" className="text-base font-medium">
                Make Public
              </Label>
              <p className="text-sm text-muted-foreground">
                Allow anyone with the link to view this summary
              </p>
            </div>
            <Switch
              id="public-toggle"
              checked={isPublic}
              onCheckedChange={handleTogglePublic}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Share Link */}
          {isPublic && shareUrl && (
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(shareUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Card Preview</CardTitle>
          <CardDescription>
            Customize how your music identity looks when shared
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Theme Selector */}
          <div className="mb-6">
            <Label className="mb-2 block">Theme</Label>
            <Select
              value={selectedTheme}
              onValueChange={handleUpdateTheme}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="vibrant">Vibrant</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview Card */}
          <div
            ref={cardRef}
            className={`rounded-2xl p-6 ${
              selectedTheme === 'dark'
                ? 'bg-gradient-to-br from-gray-900 to-gray-800 text-white'
                : selectedTheme === 'vibrant'
                ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white'
                : selectedTheme === 'minimal'
                ? 'bg-white border-2 border-gray-200 text-gray-900'
                : 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border'
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-xl ${
                selectedTheme === 'vibrant' || selectedTheme === 'dark'
                  ? 'bg-white/20'
                  : 'bg-purple-500/20'
              }`}>
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{summary.title}</h3>
                <p className={`text-sm ${
                  selectedTheme === 'vibrant' || selectedTheme === 'dark'
                    ? 'text-white/70'
                    : 'text-muted-foreground'
                }`}>
                  {periodLabel}
                </p>
              </div>
            </div>

            {/* Personality */}
            <div className="mb-4 p-4 rounded-xl bg-black/10 backdrop-blur-sm">
              <div className="font-semibold mb-1">
                {summary.aiInsights.musicPersonality.type}
              </div>
              <p className={`text-sm ${
                selectedTheme === 'vibrant' || selectedTheme === 'dark'
                  ? 'text-white/80'
                  : 'text-muted-foreground'
              }`}>
                {summary.aiInsights.musicPersonality.description}
              </p>
            </div>

            {/* Stats Grid */}
            {cardData.showStats && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-black/10">
                  <div className="text-2xl font-bold">
                    {summary.stats.totalListens.toLocaleString()}
                  </div>
                  <div className={`text-xs ${
                    selectedTheme === 'vibrant' || selectedTheme === 'dark'
                      ? 'text-white/70'
                      : 'text-muted-foreground'
                  }`}>
                    Plays
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-black/10">
                  <div className="text-2xl font-bold">
                    {summary.stats.uniqueArtists}
                  </div>
                  <div className={`text-xs ${
                    selectedTheme === 'vibrant' || selectedTheme === 'dark'
                      ? 'text-white/70'
                      : 'text-muted-foreground'
                  }`}>
                    Artists
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-black/10">
                  <div className="text-2xl font-bold">
                    {Math.round(summary.stats.totalMinutesListened / 60)}h
                  </div>
                  <div className={`text-xs ${
                    selectedTheme === 'vibrant' || selectedTheme === 'dark'
                      ? 'text-white/70'
                      : 'text-muted-foreground'
                  }`}>
                    Listened
                  </div>
                </div>
              </div>
            )}

            {/* Top Artists */}
            {cardData.showTopArtists && (
              <div className="mb-4">
                <div className={`text-xs font-medium mb-2 ${
                  selectedTheme === 'vibrant' || selectedTheme === 'dark'
                    ? 'text-white/70'
                    : 'text-muted-foreground'
                }`}>
                  Top Artists
                </div>
                <div className="flex flex-row flex-wrap gap-2">
                  {summary.topArtists.slice(0, 5).map((artist, i) => (
                    <span
                      key={artist.name}
                      className="px-3 py-1 rounded-full text-sm font-medium bg-black/10 whitespace-nowrap"
                    >
                      {i === 0 && '👑 '}
                      {artist.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dominant Mood */}
            {cardData.showMoodProfile && summary.moodProfile.dominantMoods[0] && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-black/10">
                <Music className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Dominant Mood: {summary.moodProfile.dominantMoods[0].mood}
                </span>
              </div>
            )}

            {/* Custom Message */}
            {customMessage && (
              <div className={`mt-4 pt-4 border-t ${
                selectedTheme === 'vibrant' || selectedTheme === 'dark'
                  ? 'border-white/20'
                  : 'border-gray-200'
              }`}>
                <p className="text-sm italic">&quot;{customMessage}&quot;</p>
              </div>
            )}

            {/* Branding */}
            <div className={`mt-4 pt-4 border-t flex items-center justify-between ${
              selectedTheme === 'vibrant' || selectedTheme === 'dark'
                ? 'border-white/20'
                : 'border-gray-200'
            }`}>
              <span className={`text-xs ${
                selectedTheme === 'vibrant' || selectedTheme === 'dark'
                  ? 'text-white/50'
                  : 'text-muted-foreground'
              }`}>
                Generated with AI DJ
              </span>
              <span className={`text-xs ${
                selectedTheme === 'vibrant' || selectedTheme === 'dark'
                  ? 'text-white/50'
                  : 'text-muted-foreground'
              }`}>
                {new Date(summary.generatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Custom Message Input */}
          <div className="mt-6 space-y-2">
            <Label>Custom Message (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a personal note to your card..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                maxLength={200}
              />
              <Button
                variant="outline"
                onClick={() => handleUpdateCardSettings({ customMessage })}
                disabled={updateMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="show-stats">Show Stats</Label>
              <Switch
                id="show-stats"
                checked={cardData.showStats}
                onCheckedChange={(checked) => handleUpdateCardSettings({ showStats: checked })}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show-artists">Show Artists</Label>
              <Switch
                id="show-artists"
                checked={cardData.showTopArtists}
                onCheckedChange={(checked) => handleUpdateCardSettings({ showTopArtists: checked })}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show-mood">Show Mood</Label>
              <Switch
                id="show-mood"
                checked={cardData.showMoodProfile}
                onCheckedChange={(checked) => handleUpdateCardSettings({ showMoodProfile: checked })}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show-trends">Show Trends</Label>
              <Switch
                id="show-trends"
                checked={cardData.showTrends}
                onCheckedChange={(checked) => handleUpdateCardSettings({ showTrends: checked })}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Download or share your music identity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Download as PNG
              <span className="ml-2 text-xs text-muted-foreground">(Coming soon)</span>
            </Button>
            {isPublic && shareUrl && (
              <Button variant="outline" onClick={handleCopyLink}>
                <Link className="mr-2 h-4 w-4" />
                Copy Share Link
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default ShareableCard;
