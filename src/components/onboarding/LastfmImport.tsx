import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Radio, Check, Loader2, SkipForward } from 'lucide-react';

type BackfillPhase = 'idle' | 'import' | 'similarity' | 'scoring' | 'done' | 'error';

interface BackfillEvent {
  phase: BackfillPhase;
  imported?: number;
  skipped?: number;
  total?: number;
  page?: number;
  totalPages?: number;
  processed?: number;
  current?: string;
  cached?: number;
  failed?: number;
  scores?: number;
  status?: string;
  error?: string;
}

interface LastfmImportProps {
  onComplete: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  import: 'Importing scrobbles...',
  similarity: 'Analyzing artist similarity...',
  scoring: 'Building your taste profile...',
  done: 'Import complete!',
  error: 'Import failed',
};

function getProgressPercent(event: BackfillEvent | null): number {
  if (!event) return 0;
  switch (event.phase) {
    case 'import':
      if (event.status === 'completed') return 33;
      if (event.totalPages && event.page) return (event.page / event.totalPages) * 33;
      return 10;
    case 'similarity':
      if (event.status === 'completed') return 66;
      if (event.total && event.processed) return 33 + (event.processed / event.total) * 33;
      return 45;
    case 'scoring':
      if (event.status === 'completed') return 100;
      return 80;
    case 'done':
      return 100;
    default:
      return 0;
  }
}

export function LastfmImport({ onComplete }: LastfmImportProps) {
  const [username, setUsername] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [latestEvent, setLatestEvent] = useState<BackfillEvent | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; artists: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback((jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/lastfm/backfill?jobId=${jobId}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        const event = data.event as BackfillEvent;
        setLatestEvent(event);

        if (event.phase === 'done') {
          if (pollRef.current) clearInterval(pollRef.current);
          setIsImporting(false);

          // Calculate result summary
          setImportResult({
            imported: event.imported ?? 0,
            artists: event.processed ?? 0,
          });

          // Update onboarding status
          await fetch('/api/onboarding/update-step', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lastfmImported: true,
              lastfmUsername: username,
            }),
          });
        } else if (event.phase === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          setIsImporting(false);
          setError(event.error || 'Import failed');
        }
      } catch {
        // Polling errors are non-fatal, will retry next interval
      }
    }, 1500);
  }, [username]);

  const handleImport = useCallback(async () => {
    if (!username.trim()) return;
    setIsImporting(true);
    setError(null);
    setImportResult(null);
    setLatestEvent(null);

    try {
      const res = await fetch('/api/lastfm/backfill', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (res.status === 409) {
        setError('A backfill is already in progress. Please wait.');
        setIsImporting(false);
        return;
      }

      if (!res.ok) {
        setError('Failed to start import');
        setIsImporting(false);
        return;
      }

      const data = await res.json();
      startPolling(data.jobId);
    } catch (err) {
      console.error('Failed to start Last.fm import:', err);
      setError('Failed to start import');
      setIsImporting(false);
    }
  }, [username, startPolling]);

  const handleSkip = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    onComplete();
  }, [onComplete]);

  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const progress = getProgressPercent(latestEvent);
  const phaseLabel = latestEvent ? PHASE_LABELS[latestEvent.phase] || '' : '';

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Connect Last.fm</h2>
        <p className="text-sm text-muted-foreground">
          Import your listening history for instant personalized recommendations.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 py-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Radio className="h-8 w-8 text-primary" />
        </div>

        {importResult ? (
          <div className="flex items-center gap-2 text-lg font-medium text-primary">
            <Check className="h-5 w-5" />
            Imported {importResult.imported} plays
            {importResult.artists > 0 && ` across ${importResult.artists} artists`}
          </div>
        ) : isImporting ? (
          <div className="w-full max-w-sm space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">{phaseLabel}</p>
          </div>
        ) : (
          <>
            <Input
              placeholder="Last.fm username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="max-w-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleImport();
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          <SkipForward className="mr-1 h-4 w-4" />
          Skip
        </Button>

        {importResult ? (
          <Button onClick={handleFinish}>Finish Setup</Button>
        ) : (
          <Button
            onClick={handleImport}
            disabled={isImporting || !username.trim()}
          >
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        )}
      </div>
    </Card>
  );
}
