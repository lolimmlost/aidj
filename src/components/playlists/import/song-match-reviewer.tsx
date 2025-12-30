import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, AlertCircle, Music, Loader2, ChevronRight } from 'lucide-react';

type MatchConfidence = 'exact' | 'high' | 'low' | 'none';

interface SongMatch {
  platform: string;
  platformId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  confidence: MatchConfidence;
  matchScore: number;
  matchReason: string;
}

interface SongMatchResult {
  originalSong: {
    title: string;
    artist: string;
    album?: string;
    duration?: number;
  };
  matches: SongMatch[];
  selectedMatch?: {
    platform: string;
    platformId: string;
  };
  status: 'matched' | 'pending_review' | 'no_match' | 'skipped';
}

export interface ReviewStats {
  reviewed: number;
  skipped: number;
}

interface SongMatchReviewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importJobId: string;
  matchResults: SongMatchResult[];
  onComplete: (stats: ReviewStats) => void;
}

export function SongMatchReviewer({
  open,
  onOpenChange,
  importJobId,
  matchResults,
  onComplete,
}: SongMatchReviewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedMatches, setReviewedMatches] = useState<Map<number, SongMatch | null>>(new Map());

  // Only show songs that are pending_review (have multiple matches to choose from)
  // Don't include no_match songs - those have no matches to review
  const pendingReviewSongs = matchResults.filter(r => r.status === 'pending_review');
  const currentSong = pendingReviewSongs[currentIndex];

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // Build the match results with ONLY user's reviewed selections
      // Note: Songs that were already matched in the initial import are already in the playlist,
      // so we should NOT include them again (would cause duplicate key error)
      const updatedResults = pendingReviewSongs.map((result, index) => {
        const reviewed = reviewedMatches.get(index);

        if (reviewed) {
          return {
            originalSong: result.originalSong,
            selectedMatch: {
              platform: reviewed.platform,
              platformId: reviewed.platformId,
            },
            status: 'matched' as const,
          };
        }

        // Skip unreviewed songs
        return {
          originalSong: result.originalSong,
          selectedMatch: undefined,
          status: 'skipped' as const,
        };
      });

      const response = await fetch('/api/playlists/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importJobId,
          matchResults: updatedResults,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || 'Failed to confirm import');
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      const songsAdded = data?.data?.songsAdded ?? 0;

      // Calculate stats from reviewedMatches
      let reviewed = 0;
      let skipped = 0;
      reviewedMatches.forEach((match) => {
        if (match !== null) {
          reviewed++;
        } else {
          skipped++;
        }
      });
      // Count unreviewed songs as skipped
      skipped += pendingReviewSongs.length - reviewedMatches.size;

      if (songsAdded > 0) {
        toast.success('Import confirmed', {
          description: `${songsAdded} song${songsAdded !== 1 ? 's' : ''} added to playlist`,
        });
      } else {
        toast.info('Review complete', {
          description: 'All songs were skipped',
        });
      }
      onComplete({ reviewed, skipped });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      // Truncate very long error messages to prevent UI issues
      const message = error.message?.length > 100
        ? error.message.substring(0, 100) + '...'
        : error.message;
      toast.error('Failed to confirm import', {
        description: message || 'An unexpected error occurred',
      });
    },
  });

  const handleSelectMatch = (match: SongMatch | null) => {
    setReviewedMatches(new Map(reviewedMatches.set(currentIndex, match)));
  };

  const handleNext = () => {
    if (currentIndex < pendingReviewSongs.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSkipAll = () => {
    confirmMutation.mutate();
  };

  const handleConfirm = () => {
    confirmMutation.mutate();
  };

  const selectedMatch = reviewedMatches.get(currentIndex);
  const reviewedCount = reviewedMatches.size;
  const progress = ((currentIndex + 1) / pendingReviewSongs.length) * 100;

  if (!currentSong) {
    return null;
  }

  const getConfidenceBadge = (confidence: MatchConfidence) => {
    const variants = {
      exact: { variant: 'default' as const, icon: CheckCircle2, color: 'text-green-500' },
      high: { variant: 'secondary' as const, icon: CheckCircle2, color: 'text-blue-500' },
      low: { variant: 'outline' as const, icon: AlertCircle, color: 'text-yellow-500' },
      none: { variant: 'destructive' as const, icon: XCircle, color: 'text-red-500' },
    };

    const config = variants[confidence];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-0.5 text-[9px] h-4 px-1">
        <Icon className={`h-2.5 w-2.5 ${config.color}`} />
        {confidence}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:w-auto sm:max-w-[400px] p-3 gap-2">
        <DialogHeader className="space-y-0.5 pb-1">
          <DialogTitle className="text-sm">Review Song Matches</DialogTitle>
          <DialogDescription className="text-[11px]">
            Review and confirm matches for songs that need manual verification
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">
              Song {currentIndex + 1} of {pendingReviewSongs.length}
            </span>
            <span className="text-muted-foreground">
              Reviewed: {reviewedCount} / {pendingReviewSongs.length}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Original Song */}
        <div className="bg-muted rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Music className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{currentSong.originalSong.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{currentSong.originalSong.artist}</p>
              {currentSong.originalSong.album && (
                <p className="text-[10px] text-muted-foreground truncate">
                  Album: {currentSong.originalSong.album}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Matches */}
        <div className="space-y-1">
          <Label className="text-[11px]">Select Best Match</Label>
          <div className="rounded-md border max-h-[200px] overflow-y-auto">
            <RadioGroup
              value={selectedMatch?.platformId || ''}
              onValueChange={(value) => {
                const match = currentSong.matches.find(m => m.platformId === value);
                handleSelectMatch(match || null);
              }}
            >
              <div className="p-1 space-y-1">
                {currentSong.matches.length === 0 ? (
                  <div className="text-center py-3 text-muted-foreground">
                    <XCircle className="h-5 w-5 mx-auto mb-1 opacity-50" />
                    <p className="text-[11px]">No matches found</p>
                    <p className="text-[10px]">This song will be skipped</p>
                  </div>
                ) : (
                  currentSong.matches.map((match) => (
                    <div
                      key={match.platformId}
                      className={`flex items-start gap-1.5 p-1.5 rounded-md border cursor-pointer transition-colors ${
                        selectedMatch?.platformId === match.platformId
                          ? 'bg-primary/5 border-primary'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleSelectMatch(match)}
                    >
                      <RadioGroupItem value={match.platformId} id={match.platformId} className="mt-0.5 h-3 w-3" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div>
                          <p className="text-xs font-medium truncate">{match.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{match.artist}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {getConfidenceBadge(match.confidence)}
                          <Badge variant="outline" className="text-[9px] h-4 px-1">
                            {Math.round(match.matchScore)}%
                          </Badge>
                          {match.duration && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.floor(match.duration / 60)}:{String(match.duration % 60).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Skip Option */}
                <div
                  className={`flex items-center gap-1.5 p-1.5 rounded-md border cursor-pointer transition-colors ${
                    selectedMatch === null
                      ? 'bg-primary/5 border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleSelectMatch(null)}
                >
                  <RadioGroupItem value="" id="skip" className="h-3 w-3" />
                  <p className="text-xs text-muted-foreground">Skip this song</p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="h-7 text-[11px]"
          >
            Previous
          </Button>

          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipAll}
              disabled={confirmMutation.isPending}
              className="h-7 text-[11px]"
            >
              Skip All
            </Button>

            {currentIndex < pendingReviewSongs.length - 1 ? (
              <Button size="sm" onClick={handleNext} className="h-7 text-[11px]">
                Next
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleConfirm} disabled={confirmMutation.isPending} className="h-7 text-[11px]">
                {confirmMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
