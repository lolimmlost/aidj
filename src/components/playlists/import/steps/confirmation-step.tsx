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
        const error = await response.json();
        throw new Error(error.message || 'Failed to queue downloads');
      }

      const data = await response.json();
      const result = data.data;

      // Check if anything was actually queued
      if (result.queued === 0) {
        toast.error('No songs could be queued', {
          description: result.errors?.length > 0
            ? result.errors[0]
            : 'Check that Lidarr/MeTube are configured correctly',
          duration: 6000,
        });
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
    <div className="space-y-3">
      {/* Success Message */}
      <div className="text-center py-2">
        <div className="mx-auto w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        </div>
        <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">
          Import Complete!
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your playlist has been successfully imported
        </p>
      </div>

      {/* Playlist Info */}
      <div className="bg-muted rounded-lg p-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
          <ListMusic className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{playlistName}</p>
          <p className="text-xs text-muted-foreground">
            {matchReport.summary.matched} songs added
          </p>
        </div>
        {createdPlaylistId && (
          <Badge variant="secondary" className="text-[10px] h-5">Created</Badge>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <div className="p-2 rounded-lg border bg-card text-center">
          <p className="text-base font-bold">{matchReport.summary.total}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>

        <div className="p-2 rounded-lg border bg-card text-center">
          <p className="text-base font-bold text-green-600 dark:text-green-400">
            {matchReport.summary.matched + (reviewStats?.reviewed || 0)}
          </p>
          <p className="text-[10px] text-muted-foreground">Matched</p>
        </div>

        {/* Show pending review if not yet reviewed */}
        {matchReport.summary.pendingReview > 0 && !reviewStats && (
          <div className="p-2 rounded-lg border bg-yellow-500/10 border-yellow-500/20 text-center">
            <p className="text-base font-bold text-yellow-600 dark:text-yellow-400">
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

        {/* Show reviewed stats after review is complete */}
        {reviewStats && reviewStats.reviewed > 0 && (
          <div className="p-2 rounded-lg border bg-blue-500/10 border-blue-500/20 text-center">
            <p className="text-base font-bold text-blue-600 dark:text-blue-400">
              {reviewStats.reviewed}
            </p>
            <p className="text-[10px] text-muted-foreground">Reviewed</p>
          </div>
        )}

        {/* Show skipped count */}
        {reviewStats && reviewStats.skipped > 0 && (
          <div className="p-2 rounded-lg border bg-muted text-center">
            <p className="text-base font-bold text-muted-foreground">
              {reviewStats.skipped}
            </p>
            <p className="text-[10px] text-muted-foreground">Skipped</p>
          </div>
        )}

        {matchReport.summary.noMatch > 0 && (
          <div className={`p-2 rounded-lg border text-center ${
            hasQueuedDownloads ? 'bg-green-500/10 border-green-500/20' : 'bg-card'
          }`}>
            <p className={`text-base font-bold ${hasQueuedDownloads ? 'text-green-600 dark:text-green-400' : ''}`}>
              {hasQueuedDownloads ? queuedCount : matchReport.summary.noMatch}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasQueuedDownloads ? 'Queued' : 'Not Found'}
            </p>
          </div>
        )}
      </div>

      {/* Download Missing Songs Section */}
      {hasUnmatchedSongs && (
        <div className={`p-2 rounded-lg border border-dashed flex items-center gap-2 ${
          hasQueuedDownloads
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-primary/50 bg-primary/5'
        }`}>
          <Download className={`h-4 w-4 shrink-0 ${hasQueuedDownloads ? 'text-green-500' : 'text-primary'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs">
              {hasQueuedDownloads ? (
                <>
                  <span className="font-medium text-green-600 dark:text-green-400">{queuedCount} songs queued</span>
                  <span className="text-muted-foreground"> for download</span>
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
            className="h-7 text-xs shrink-0"
            variant={hasQueuedDownloads ? "outline" : "default"}
            onClick={handleOpenDownloadDialog}
          >
            <Download className="mr-1 h-3 w-3" />
            {hasQueuedDownloads ? 'Re-download' : 'Download'}
          </Button>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && !hasUnmatchedSongs && (
        <Alert className="py-1.5 px-2">
          <AlertTriangle className="h-3 w-3" />
          <AlertDescription className="text-[10px]">
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
        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-center">
          <p className="text-xs">
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
          className="w-[calc(100%-2rem)] sm:w-auto sm:max-w-[380px] p-3 gap-2"
          style={{ maxHeight: '350px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <DialogHeader className="flex-shrink-0 space-y-0">
            <DialogTitle className="text-sm">Download Missing Songs</DialogTitle>
          </DialogHeader>

          <div className="flex-shrink-0">
            {/* Service Selection - Inline */}
            <RadioGroup
              value={selectedService}
              onValueChange={(v) => setSelectedService(v as DownloadService)}
              className="flex flex-wrap gap-1"
            >
              <div className="flex items-center space-x-1 p-1 rounded border hover:bg-muted/50 cursor-pointer text-[10px]">
                <RadioGroupItem value="lidarr" id="dl-lidarr" className="h-3 w-3" />
                <Label htmlFor="dl-lidarr" className="cursor-pointer">Lidarr</Label>
              </div>
              <div className="flex items-center space-x-1 p-1 rounded border hover:bg-muted/50 cursor-pointer text-[10px]">
                <RadioGroupItem value="metube" id="dl-metube" className="h-3 w-3" />
                <Label htmlFor="dl-metube" className="cursor-pointer">MeTube</Label>
              </div>
              <div className="flex items-center space-x-1 p-1 rounded border bg-primary/5 border-primary/20 cursor-pointer text-[10px]">
                <RadioGroupItem value="both" id="dl-both" className="h-3 w-3" />
                <Label htmlFor="dl-both" className="cursor-pointer">Both (Rec.)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Song Selection */}
          {unmatchedSongs.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col gap-1">
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] font-medium">Songs ({selectedSongs.size}/{unmatchedSongs.length})</span>
                <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-5 text-[9px] px-1">
                  {selectedSongs.size === unmatchedSongs.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded border" style={{ maxHeight: '150px' }}>
                <div className="p-0.5">
                  {unmatchedSongs.map((song, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleToggleSong(index)}
                    >
                      <Checkbox
                        checked={selectedSongs.has(index)}
                        onCheckedChange={() => handleToggleSong(index)}
                        className="h-3 w-3 flex-shrink-0"
                      />
                      <span className="text-[10px] truncate">{song.title}</span>
                      <span className="text-[9px] text-muted-foreground truncate">- {song.artist}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex-shrink-0 text-[9px] text-muted-foreground text-center px-2">
            Note: Downloaded songs must be added to playlist manually after library rescan.
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-2 gap-2">
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} className="h-7 text-[10px] px-2">
              Cancel
            </Button>
            <Button onClick={handleStartDownload} disabled={isDownloading || selectedSongs.size === 0} className="h-7 text-[10px] px-2">
              {isDownloading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Queueing...
                </>
              ) : (
                <>
                  <Download className="mr-1 h-3 w-3" />
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
