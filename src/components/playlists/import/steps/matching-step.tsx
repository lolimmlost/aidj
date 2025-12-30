import { Loader2, Music, CheckCircle2, AlertCircle, XCircle, Eye } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface MatchReport {
  summary: {
    total: number;
    matched: number;
    noMatch: number;
    pendingReview: number;
  };
  byConfidence: Record<string, number>;
  unmatchedCount: number;
  pendingReviewCount: number;
}

interface ImportResult {
  importJobId: string;
  playlistName: string;
  createdPlaylistId: string | null;
  matchReport: MatchReport;
  parseWarnings: string[];
}

interface ImportJobData {
  importJob: {
    id: string;
    playlistName: string;
    status: string;
    totalSongs: number;
    processedSongs: number;
    matchedSongs: number;
    unmatchedSongs: number;
    pendingReviewSongs: number;
  };
}

interface MatchingStepProps {
  isMatching: boolean;
  importJobData?: ImportJobData;
  importResult: ImportResult | null;
  onReviewClick?: () => void;
}

export function MatchingStep({ isMatching, importJobData, importResult, onReviewClick }: MatchingStepProps) {
  const processed = importJobData?.importJob?.processedSongs || 0;
  const total = importJobData?.importJob?.totalSongs || importResult?.matchReport?.summary?.total || 0;
  const progress = total > 0 ? (processed / total) * 100 : 0;

  if (isMatching) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex flex-col items-center justify-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">Matching songs...</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Finding matches in your Navidrome library
            </p>
          </div>
        </div>

        {total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {processed} / {total} songs
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>
    );
  }

  if (!importResult) {
    return null;
  }

  const { matchReport } = importResult;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="text-center py-2">
        <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Music className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Song Matching Complete</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Analyzed {matchReport.summary.total} songs
        </p>
      </div>

      {/* Match Statistics */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mb-1" />
          <p className="text-base font-bold text-green-700 dark:text-green-400">
            {matchReport.summary.matched}
          </p>
          <p className="text-[10px] text-muted-foreground">Matched</p>
        </div>

        {matchReport.summary.pendingReview > 0 && (
          <div className="text-center p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
            <p className="text-base font-bold text-yellow-700 dark:text-yellow-400">
              {matchReport.summary.pendingReview}
            </p>
            <p className="text-[10px] text-muted-foreground">Review</p>
            {onReviewClick && (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-6 text-[10px] px-2"
                onClick={onReviewClick}
              >
                <Eye className="mr-1 h-3 w-3" />
                Review
              </Button>
            )}
          </div>
        )}

        <div className="text-center p-2 rounded-lg bg-muted border">
          <XCircle className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-base font-bold">
            {matchReport.summary.noMatch}
          </p>
          <p className="text-[10px] text-muted-foreground">Not Found</p>
        </div>
      </div>

      {/* Match Quality Breakdown */}
      {Object.keys(matchReport.byConfidence).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Match Quality</p>
          <div className="space-y-0.5">
            {Object.entries(matchReport.byConfidence).map(([confidence, count]) => (
              <div key={confidence} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground capitalize">{confidence}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Rate */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Success Rate</span>
          <span className="font-medium">
            {total > 0 ? Math.round((matchReport.summary.matched / total) * 100) : 0}%
          </span>
        </div>
        <Progress
          value={total > 0 ? (matchReport.summary.matched / total) * 100 : 0}
          className="h-1.5"
        />
      </div>
    </div>
  );
}
