import { useState } from 'react';
import { CheckCircle2, Music, AlertTriangle, ListMusic, Download, Loader2, ExternalLink, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

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

interface UnmatchedSong {
  title: string;
  artist: string;
  album?: string;
}

interface ImportResult {
  importJobId: string;
  playlistName: string;
  createdPlaylistId: string | null;
  matchReport: MatchReport;
  parseWarnings: string[];
  unmatchedSongs?: UnmatchedSong[];
}

interface ReviewStats {
  reviewed: number;
  skipped: number;
}

interface ConfirmationStepProps {
  importResult: ImportResult;
  playlistName: string;
  onReviewClick?: () => void;
  reviewStats?: ReviewStats;
}

type DownloadService = 'lidarr' | 'metube' | 'both';

export function ConfirmationStep({ importResult, playlistName, onReviewClick, reviewStats }: ConfirmationStepProps) {
  const { matchReport, createdPlaylistId } = importResult;
  const hasWarnings = matchReport.summary.noMatch > 0 || importResult.parseWarnings.length > 0;
  const hasUnmatchedSongs = matchReport.summary.noMatch > 0;

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<DownloadService>('both');
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState<Set<number>>(new Set());
  const [hasQueuedDownloads, setHasQueuedDownloads] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);

  // Mock unmatched songs list (in real implementation, this would come from importResult)
  const unmatchedSongs: UnmatchedSong[] = importResult.unmatchedSongs || [
    // Placeholder - these would come from the actual match results
  ];

  const handleOpenDownloadDialog = () => {
    // Select all songs by default
    setSelectedSongs(new Set(unmatchedSongs.map((_, i) => i)));
    setDownloadDialogOpen(true);
  };

  const handleToggleSong = (index: number) => {
    const newSelected = new Set(selectedSongs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSongs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSongs.size === unmatchedSongs.length) {
      setSelectedSongs(new Set());
    } else {
      setSelectedSongs(new Set(unmatchedSongs.map((_, i) => i)));
    }
  };

  const handleStartDownload = async () => {
    if (selectedSongs.size === 0) {
      toast.error('No songs selected');
      return;
    }

    setIsDownloading(true);

    try {
      const songsToDownload = Array.from(selectedSongs).map(i => unmatchedSongs[i]);

      const response = await fetch('/api/downloads/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importJobId: importResult.importJobId,
          service: selectedService,
          songs: songsToDownload,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to queue downloads';
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          // Response was not JSON (might be HTML error page)
          const text = await response.text().catch(() => '');
          if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            errorMessage = `Server error (${response.status}): The download service may be unavailable`;
          } else if (text) {
            errorMessage = text.substring(0, 200);
          }
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid response from server - expected JSON');
      }
      const result = data.data;

      // Check if anything was actually queued
      if (result.queued === 0) {
        // Build a helpful error message based on what was tried
        const errorTitle = 'No songs could be queued';
        let errorDescription = 'Check that Lidarr/MeTube are configured correctly';

        if (selectedService === 'both') {
          if (result.errors?.some((e: string) => e.includes('not found in Lidarr'))) {
            errorDescription = 'Songs not found in Lidarr, and MeTube failed. Try different search terms or check service configuration.';
          }
        } else if (selectedService === 'lidarr') {
          errorDescription = 'No matching albums found in Lidarr. The artists or albums may not be in MusicBrainz.';
        } else if (selectedService === 'metube') {
          errorDescription = 'MeTube failed to queue downloads. Check that MeTube is running and accessible.';
        }

        // Show specific errors if available
        if (result.errors?.length > 0) {
          const relevantErrors = result.errors.filter((e: string) =>
            !e.includes('trying MeTube') && !e.includes('songs queued')
          );
          if (relevantErrors.length > 0) {
            errorDescription = relevantErrors[0];
          }
        }

        toast.error(errorTitle, {
          description: errorDescription,
          duration: 8000,
        });

        // Mark as failed and close dialog
        setDownloadFailed(true);
        setDownloadErrorMessage(errorDescription);
        setDownloadDialogOpen(false);
        return;
      }

      // Show detailed success message
      let description = '';
      if (selectedService === 'both') {
        const parts = [];
        if (result.lidarrQueued > 0) parts.push(`${result.lidarrQueued} via Lidarr`);
        if (result.metubeQueued > 0) parts.push(`${result.metubeQueued} via MeTube`);
        description = parts.join(', ');
      } else {
        description = `${result.queued} songs sent to ${selectedService === 'lidarr' ? 'Lidarr' : 'MeTube'}`;
      }

      toast.success('Downloads queued!', {
        description,
        duration: 5000,
      });

      // Show info about next steps
      setTimeout(() => {
        toast.info('Next steps', {
          description: 'Once downloaded, rescan your library and add the new songs to your playlist.',
          duration: 8000,
        });
      }, 1000);

      // Show warning about MeTube files needing organization
      if (result.metubeQueued > 0) {
        setTimeout(() => {
          toast.warning('MeTube files need manual organization', {
            description: 'Move downloaded files to your music library folder, then rescan.',
            duration: 8000,
          });
        }, 2500);
      }

      // Show partial failure warning
      if (result.failed > 0) {
        setTimeout(() => {
          toast.warning(`${result.failed} songs couldn't be queued`, {
            description: result.errors?.slice(0, 2).join('; ') || 'Some songs failed to queue',
            duration: 6000,
          });
        }, 4000);
      }

      // Mark downloads as queued
      setHasQueuedDownloads(true);
      setQueuedCount(result.queued);
      setDownloadDialogOpen(false);
    } catch (error) {
      toast.error('Download failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Success Message */}
      <div className="text-center py-3 md:py-4">
        <div className="mx-auto w-10 h-10 md:w-14 md:h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-2 md:mb-3">
          <CheckCircle2 className="h-5 w-5 md:h-7 md:w-7 text-green-500" />
        </div>
        <h3 className="text-sm md:text-lg font-semibold text-green-700 dark:text-green-400">
          Import Complete!
        </h3>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
          Your playlist has been successfully imported
        </p>
      </div>

      {/* Playlist Info */}
      <div className="bg-muted rounded-lg p-3 md:p-4 flex items-center gap-3 md:gap-4">
        <div className="w-8 h-8 md:w-12 md:h-12 rounded bg-primary/10 flex items-center justify-center shrink-0">
          <ListMusic className="h-4 w-4 md:h-6 md:w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm md:text-base font-semibold truncate">{playlistName}</p>
          <p className="text-xs md:text-sm text-muted-foreground">
            {matchReport.summary.matched} songs added
          </p>
        </div>
        {createdPlaylistId && (
          <Badge variant="secondary" className="text-[10px] md:text-xs h-5 md:h-6">Created</Badge>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        <div className="p-2 md:p-3 rounded-lg border bg-card text-center">
          <p className="text-base md:text-xl font-bold">{matchReport.summary.total}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground">Total</p>
        </div>

        <div className="p-2 md:p-3 rounded-lg border bg-card text-center">
          <p className="text-base md:text-xl font-bold text-green-600 dark:text-green-400">
            {matchReport.summary.matched + (reviewStats?.reviewed || 0)}
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground">Matched</p>
        </div>

        {/* Show pending review if not yet reviewed */}
        {matchReport.summary.pendingReview > 0 && !reviewStats && (
          <div className="p-2 md:p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20 text-center">
            <p className="text-base md:text-xl font-bold text-yellow-600 dark:text-yellow-400">
              {matchReport.summary.pendingReview}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Review</p>
            {onReviewClick && (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 md:mt-2 h-6 md:h-8 text-[10px] md:text-xs px-2 md:px-3"
                onClick={onReviewClick}
              >
                <Eye className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                Review
              </Button>
            )}
          </div>
        )}

        {/* Show reviewed stats after review is complete */}
        {reviewStats && reviewStats.reviewed > 0 && (
          <div className="p-2 md:p-3 rounded-lg border bg-blue-500/10 border-blue-500/20 text-center">
            <p className="text-base md:text-xl font-bold text-blue-600 dark:text-blue-400">
              {reviewStats.reviewed}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Reviewed</p>
          </div>
        )}

        {/* Show skipped count */}
        {reviewStats && reviewStats.skipped > 0 && (
          <div className="p-2 md:p-3 rounded-lg border bg-muted text-center">
            <p className="text-base md:text-xl font-bold text-muted-foreground">
              {reviewStats.skipped}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground">Skipped</p>
          </div>
        )}

        {matchReport.summary.noMatch > 0 && (
          <div className={`p-2 md:p-3 rounded-lg border text-center ${
            hasQueuedDownloads ? 'bg-green-500/10 border-green-500/20' : 'bg-card'
          }`}>
            <p className={`text-base md:text-xl font-bold ${hasQueuedDownloads ? 'text-green-600 dark:text-green-400' : ''}`}>
              {hasQueuedDownloads ? queuedCount : matchReport.summary.noMatch}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground">
              {hasQueuedDownloads ? 'Queued' : 'Not Found'}
            </p>
          </div>
        )}
      </div>

      {/* Download Missing Songs Section */}
      {hasUnmatchedSongs && (
        <div className={`p-3 md:p-4 rounded-lg border border-dashed flex items-center gap-3 md:gap-4 ${
          hasQueuedDownloads
            ? 'border-green-500/50 bg-green-500/5'
            : downloadFailed
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-primary/50 bg-primary/5'
        }`}>
          <Download className={`h-4 w-4 md:h-5 md:w-5 shrink-0 ${
            hasQueuedDownloads ? 'text-green-500' : downloadFailed ? 'text-red-500' : 'text-primary'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm">
              {hasQueuedDownloads ? (
                <>
                  <span className="font-medium text-green-600 dark:text-green-400">{queuedCount} songs queued</span>
                  <span className="text-muted-foreground"> for download</span>
                </>
              ) : downloadFailed ? (
                <>
                  <span className="font-medium text-red-600 dark:text-red-400">Download failed</span>
                  <span className="text-muted-foreground block text-[10px] md:text-xs mt-0.5 truncate">
                    {downloadErrorMessage || 'Could not find songs in Lidarr/MeTube'}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">{matchReport.summary.noMatch} songs</span>
                  <span className="text-muted-foreground"> not found</span>
                </>
              )}
            </p>
          </div>
          <Button
            size="sm"
            className="h-7 md:h-9 text-xs md:text-sm shrink-0"
            variant={hasQueuedDownloads ? "outline" : downloadFailed ? "destructive" : "default"}
            onClick={() => {
              if (downloadFailed) {
                setDownloadFailed(false);
                setDownloadErrorMessage(null);
              }
              handleOpenDownloadDialog();
            }}
          >
            <Download className="mr-1 h-3 w-3 md:h-4 md:w-4" />
            {hasQueuedDownloads ? 'Re-download' : downloadFailed ? 'Retry' : 'Download'}
          </Button>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && !hasUnmatchedSongs && (
        <Alert className="py-2 md:py-3 px-3 md:px-4">
          <AlertTriangle className="h-3 w-3 md:h-4 md:w-4" />
          <AlertDescription className="text-[10px] md:text-xs">
            <span className="font-medium">Notes: </span>
            {matchReport.summary.noMatch > 0 && (
              <span>{matchReport.summary.noMatch} song{matchReport.summary.noMatch !== 1 ? 's' : ''} not found. </span>
            )}
            {importResult.parseWarnings.map((warning, i) => (
              <span key={i}>{warning}. </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Success Note */}
      {createdPlaylistId && (
        <div className="p-2 md:p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
          <p className="text-xs md:text-sm">
            <span className="font-medium">Playlist created! </span>
            <span className="text-muted-foreground">
              Find &quot;{playlistName}&quot; in your playlists
            </span>
          </p>
        </div>
      )}

      {/* Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent
          className="w-[calc(100%-2rem)] sm:w-auto sm:max-w-[380px] md:max-w-[500px] p-3 md:p-4 gap-2 md:gap-3"
          style={{ maxHeight: '400px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <DialogHeader className="flex-shrink-0 space-y-0 md:space-y-1">
            <DialogTitle className="text-sm md:text-base">Download Missing Songs</DialogTitle>
            <DialogDescription className="hidden md:block text-xs">
              Choose a download service and select which songs to download.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0">
            {/* Service Selection - Inline */}
            <RadioGroup
              value={selectedService}
              onValueChange={(v) => setSelectedService(v as DownloadService)}
              className="flex flex-wrap gap-1 md:gap-2"
            >
              <div className="flex items-center space-x-1 md:space-x-2 p-1 md:p-2 rounded border hover:bg-muted/50 cursor-pointer text-[10px] md:text-xs">
                <RadioGroupItem value="lidarr" id="dl-lidarr" className="h-3 w-3 md:h-4 md:w-4" />
                <Label htmlFor="dl-lidarr" className="cursor-pointer">Lidarr</Label>
              </div>
              <div className="flex items-center space-x-1 md:space-x-2 p-1 md:p-2 rounded border hover:bg-muted/50 cursor-pointer text-[10px] md:text-xs">
                <RadioGroupItem value="metube" id="dl-metube" className="h-3 w-3 md:h-4 md:w-4" />
                <Label htmlFor="dl-metube" className="cursor-pointer">MeTube</Label>
              </div>
              <div className="flex items-center space-x-1 md:space-x-2 p-1 md:p-2 rounded border bg-primary/5 border-primary/20 cursor-pointer text-[10px] md:text-xs">
                <RadioGroupItem value="both" id="dl-both" className="h-3 w-3 md:h-4 md:w-4" />
                <Label htmlFor="dl-both" className="cursor-pointer">Both (Rec.)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Song Selection */}
          {unmatchedSongs.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col gap-1 md:gap-2">
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] md:text-xs font-medium">Songs ({selectedSongs.size}/{unmatchedSongs.length})</span>
                <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-5 md:h-7 text-[9px] md:text-xs px-1 md:px-2">
                  {selectedSongs.size === unmatchedSongs.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded border" style={{ maxHeight: '180px' }}>
                <div className="p-0.5 md:p-1">
                  {unmatchedSongs.map((song, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 md:gap-2 py-0.5 md:py-1 px-1 md:px-2 hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleToggleSong(index)}
                    >
                      <Checkbox
                        checked={selectedSongs.has(index)}
                        onCheckedChange={() => handleToggleSong(index)}
                        className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0"
                      />
                      <span className="text-[10px] md:text-xs truncate">{song.title}</span>
                      <span className="text-[9px] md:text-xs text-muted-foreground truncate">- {song.artist}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex-shrink-0 text-[9px] md:text-xs text-muted-foreground text-center px-2">
            Note: Downloaded songs must be added to playlist manually after library rescan.
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-2 md:pt-3 gap-2">
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} className="h-7 md:h-9 text-[10px] md:text-sm px-2 md:px-4">
              Cancel
            </Button>
            <Button onClick={handleStartDownload} disabled={isDownloading || selectedSongs.size === 0} className="h-7 md:h-9 text-[10px] md:text-sm px-2 md:px-4">
              {isDownloading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                  Queueing...
                </>
              ) : (
                <>
                  <Download className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                  Queue {selectedSongs.size}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
