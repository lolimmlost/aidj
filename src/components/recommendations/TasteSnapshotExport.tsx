/**
 * Taste Snapshot Export Component
 *
 * Allows users to export complete taste profiles from any time period
 * in multiple formats (JSON, CSV, PDF report).
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { useState, useCallback, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Calendar,
  Trash2,
  Plus,
  Share2,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface TasteSnapshot {
  id: string;
  name: string;
  description?: string;
  capturedAt: string;
  periodStart: string;
  periodEnd: string;
  profileData: {
    summary: {
      totalListens: number;
      totalFeedback: number;
      thumbsUpCount: number;
      thumbsDownCount: number;
      acceptanceRate: number;
      diversityScore: number;
    };
    topGenres: Array<{ name: string; count: number; percentage: number }>;
    topArtists: Array<{ name: string; count: number; percentage: number }>;
    topTracks: Array<{ name: string; count: number; percentage: number }>;
  };
}

interface TasteSnapshotExportProps {
  onSnapshotCreated?: (snapshot: TasteSnapshot) => void;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchSnapshots(): Promise<{ snapshots: TasteSnapshot[] }> {
  const response = await fetch('/api/recommendations/mood-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list-snapshots' }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to fetch snapshots' }));
    throw new Error(errorData.message || 'Failed to fetch snapshots');
  }

  const result = await response.json();
  // Ensure snapshots is always an array
  return {
    snapshots: Array.isArray(result.snapshots) ? result.snapshots : []
  };
}

async function createSnapshot(data: {
  name: string;
  periodStart: string;
  periodEnd: string;
  description?: string;
}): Promise<TasteSnapshot> {
  // Ensure dates are in ISO format with time
  const periodStart = data.periodStart.includes('T')
    ? data.periodStart
    : new Date(data.periodStart + 'T00:00:00').toISOString();
  const periodEnd = data.periodEnd.includes('T')
    ? data.periodEnd
    : new Date(data.periodEnd + 'T23:59:59').toISOString();

  const response = await fetch('/api/recommendations/mood-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create-snapshot',
      name: data.name,
      periodStart,
      periodEnd,
      description: data.description,
    }),
  });

  if (!response.ok) {
    // Try to extract error message from response
    const errorData = await response.json().catch(() => ({ message: 'Failed to create snapshot' }));
    throw new Error(errorData.message || 'Failed to create snapshot');
  }

  return response.json();
}

async function exportSnapshot(snapshotId: string, format: 'json' | 'csv'): Promise<Blob> {
  const response = await fetch('/api/recommendations/mood-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'export-snapshot',
      snapshotId,
      format,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to export snapshot');
  }

  return response.blob();
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function generatePDFReport(snapshot: TasteSnapshot): Blob {
  // Generate a simple text-based report that can be printed to PDF
  const lines = [
    '═══════════════════════════════════════════════════════════════════',
    `                    MUSIC TASTE PROFILE REPORT`,
    '═══════════════════════════════════════════════════════════════════',
    '',
    `Snapshot: ${snapshot.name}`,
    `Period: ${formatDate(snapshot.periodStart)} - ${formatDate(snapshot.periodEnd)}`,
    `Generated: ${formatDate(snapshot.capturedAt)}`,
    '',
    '───────────────────────────────────────────────────────────────────',
    '                           SUMMARY',
    '───────────────────────────────────────────────────────────────────',
    '',
    `Total Listens:     ${snapshot.profileData.summary.totalListens}`,
    `Total Ratings:     ${snapshot.profileData.summary.totalFeedback}`,
    `Thumbs Up:         ${snapshot.profileData.summary.thumbsUpCount}`,
    `Thumbs Down:       ${snapshot.profileData.summary.thumbsDownCount}`,
    `Acceptance Rate:   ${(snapshot.profileData.summary.acceptanceRate * 100).toFixed(1)}%`,
    `Diversity Score:   ${(snapshot.profileData.summary.diversityScore * 100).toFixed(1)}%`,
    '',
    '───────────────────────────────────────────────────────────────────',
    '                        TOP ARTISTS',
    '───────────────────────────────────────────────────────────────────',
    '',
    ...snapshot.profileData.topArtists.slice(0, 20).map((a, i) =>
      `${String(i + 1).padStart(2)}. ${a.name.padEnd(40)} ${a.percentage.toFixed(1)}%`
    ),
    '',
    '───────────────────────────────────────────────────────────────────',
    '                         TOP GENRES',
    '───────────────────────────────────────────────────────────────────',
    '',
    ...snapshot.profileData.topGenres.slice(0, 10).map((g, i) =>
      `${String(i + 1).padStart(2)}. ${g.name.padEnd(40)} ${g.percentage.toFixed(1)}%`
    ),
    '',
    '───────────────────────────────────────────────────────────────────',
    '                         TOP TRACKS',
    '───────────────────────────────────────────────────────────────────',
    '',
    ...snapshot.profileData.topTracks.slice(0, 50).map((t, i) =>
      `${String(i + 1).padStart(2)}. ${t.name.substring(0, 55).padEnd(55)} ${t.percentage.toFixed(1)}%`
    ),
    '',
    '═══════════════════════════════════════════════════════════════════',
    '                    Generated by AI DJ',
    '═══════════════════════════════════════════════════════════════════',
  ];

  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

// ============================================================================
// Subcomponents
// ============================================================================

const SnapshotCard = memo(function SnapshotCard({
  snapshot,
  onExport,
  onDelete,
}: {
  snapshot: TasteSnapshot;
  onExport: (format: 'json' | 'csv' | 'pdf') => void;
  onDelete: () => void;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'json' | 'csv' | 'pdf') => {
    setIsExporting(true);
    try {
      await onExport(format);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{snapshot.name}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(snapshot.periodStart)} - {formatDate(snapshot.periodEnd)}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Listens</p>
            <p className="text-sm font-bold">{snapshot.profileData.summary.totalListens}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Acceptance</p>
            <p className="text-sm font-bold">
              {(snapshot.profileData.summary.acceptanceRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Artists</p>
            <p className="text-sm font-bold">{snapshot.profileData.topArtists.length}</p>
          </div>
        </div>

        {/* Top Artists Preview */}
        {snapshot.profileData.topArtists.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Top Artists</p>
            <div className="flex flex-wrap gap-1">
              {snapshot.profileData.topArtists.slice(0, 3).map((artist) => (
                <span
                  key={artist.name}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {artist.name}
                </span>
              ))}
              {snapshot.profileData.topArtists.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{snapshot.profileData.topArtists.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isExporting}
            onClick={() => handleExport('json')}
          >
            <FileJson className="w-4 h-4 mr-1" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isExporting}
            onClick={() => handleExport('csv')}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isExporting}
            onClick={() => handleExport('pdf')}
          >
            <FileText className="w-4 h-4 mr-1" />
            Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

const CreateSnapshotForm = memo(function CreateSnapshotForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: { name: string; periodStart: string; periodEnd: string; description?: string }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && periodStart && periodEnd) {
      onSubmit({ name, periodStart, periodEnd, description: description || undefined });
    }
  };

  // Set default dates
  const handleQuickPeriod = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);

    setPeriodEnd(end.toISOString().split('T')[0]);
    setPeriodStart(start.toISOString().split('T')[0]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create New Snapshot</CardTitle>
        <CardDescription>
          Capture your taste profile for a specific period. Make sure you have listening history and ratings for the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Summer 2024 Mix"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="flex gap-2 pb-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleQuickPeriod(1)}>
              Last Month
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => handleQuickPeriod(3)}>
              Last 3 Months
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => handleQuickPeriod(6)}>
              Last 6 Months
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes this period special?"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Snapshot'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
});

const SnapshotsSkeleton = memo(function SnapshotsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function TasteSnapshotExport({ onSnapshotCreated }: TasteSnapshotExportProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  // Fetch snapshots
  const { data, isLoading, error } = useQuery({
    queryKey: ['taste-snapshots'],
    queryFn: fetchSnapshots,
    staleTime: 5 * 60 * 1000,
  });

  // Create snapshot mutation
  const createMutation = useMutation({
    mutationFn: createSnapshot,
    onSuccess: (snapshot) => {
      queryClient.invalidateQueries({ queryKey: ['taste-snapshots'] });
      setIsCreating(false);
      onSnapshotCreated?.(snapshot);
    },
    onError: (error: Error) => {
      console.error('Failed to create snapshot:', error);
      alert(`Failed to create snapshot: ${error.message}`);
    },
  });

  // Export handler
  const handleExport = useCallback(async (snapshot: TasteSnapshot, format: 'json' | 'csv' | 'pdf') => {
    try {
      let blob: Blob;
      let fileName: string;

      if (format === 'pdf') {
        blob = generatePDFReport(snapshot);
        fileName = `${snapshot.name.replace(/\s+/g, '-').toLowerCase()}-report.txt`;
      } else {
        blob = await exportSnapshot(snapshot.id, format);
        fileName = `${snapshot.name.replace(/\s+/g, '-').toLowerCase()}.${format}`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export snapshot:', err);
    }
  }, []);

  // Delete handler (placeholder - would need API support)
  const handleDelete = useCallback((snapshotId: string) => {
    // TODO: Implement delete API
    console.log('Delete snapshot:', snapshotId);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            Taste Snapshots
          </h3>
          <p className="text-sm text-muted-foreground">
            Export and share your music taste profiles
          </p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Snapshot
          </Button>
        )}
      </div>

      {/* Create Form */}
      {isCreating && (
        <CreateSnapshotForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setIsCreating(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Loading State */}
      {isLoading && <SnapshotsSkeleton />}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Failed to load snapshots. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Snapshots Grid */}
      {!isLoading && !error && data?.snapshots && data.snapshots.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.snapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot.id}
              snapshot={snapshot}
              onExport={(format) => handleExport(snapshot, format)}
              onDelete={() => handleDelete(snapshot.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && data && (!data.snapshots || data.snapshots.length === 0) && !isCreating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Share2 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No snapshots yet. Create your first taste snapshot to save and export
              your music preferences from any time period.
            </p>
            <Button className="mt-4" onClick={() => setIsCreating(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create First Snapshot
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TasteSnapshotExport;
