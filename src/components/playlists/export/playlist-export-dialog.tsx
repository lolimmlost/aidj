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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileText, FileJson, Music, Loader2, CheckCircle2 } from 'lucide-react';

type ExportFormat = 'm3u' | 'xspf' | 'json';

interface PlaylistExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  playlistName: string;
}

interface ExportResponse {
  exportId: string;
  filename: string;
  format: ExportFormat;
  mimeType: string;
  content: string;
  songCount: number;
}

export function PlaylistExportDialog({
  open,
  onOpenChange,
  playlistId,
  playlistName,
}: PlaylistExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('m3u');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exportedData, setExportedData] = useState<ExportResponse | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          format,
          includeMetadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export playlist');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setExportedData(data.data);
      toast.success('Playlist exported successfully', {
        description: `${data.data.songCount} songs exported`,
      });
    },
    onError: (error: Error) => {
      toast.error('Export failed', {
        description: error.message,
      });
    },
  });

  const handleExport = () => {
    exportMutation.mutate();
  };

  const handleDownload = () => {
    if (!exportedData) return;

    const blob = new Blob([exportedData.content], { type: exportedData.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportedData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Download started', {
      description: `Saved as ${exportedData.filename}`,
    });
  };

  const handleClose = () => {
    setExportedData(null);
    exportMutation.reset();
    onOpenChange(false);
  };

  const formatOptions = [
    {
      value: 'm3u' as const,
      label: 'M3U8',
      description: 'Most widely supported format for music players',
      icon: Music,
    },
    {
      value: 'xspf' as const,
      label: 'XSPF',
      description: 'XML format with rich metadata support',
      icon: FileText,
    },
    {
      value: 'json' as const,
      label: 'JSON',
      description: 'Structured data format, best for re-importing',
      icon: FileJson,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Playlist</DialogTitle>
          <DialogDescription>
            Export &quot;{playlistName}&quot; to a standard playlist format
          </DialogDescription>
        </DialogHeader>

        {!exportedData ? (
          <>
            <div className="space-y-4 py-4">
              {/* Format Selection */}
              <div className="space-y-3">
                <Label>Export Format</Label>
                <RadioGroup value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
                  {formatOptions.map((option) => (
                    <div key={option.value} className="flex items-start space-x-3 space-y-0">
                      <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                      <div className="flex-1 space-y-1">
                        <Label
                          htmlFor={option.value}
                          className="flex items-center gap-2 font-medium cursor-pointer"
                        >
                          <option.icon className="h-4 w-4 text-muted-foreground" />
                          {option.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <Label>Options</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="metadata"
                    checked={includeMetadata}
                    onCheckedChange={(checked) => setIncludeMetadata(checked as boolean)}
                  />
                  <Label
                    htmlFor="metadata"
                    className="text-sm font-normal cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include metadata (album, duration, ISRC codes)
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={exportMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={exportMutation.isPending}>
                {exportMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center py-6">
                <div className="text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Export Complete!</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {exportedData.songCount} songs exported successfully
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Format:</span>
                  <span className="font-medium">{exportedData.format.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filename:</span>
                  <span className="font-medium truncate ml-2">{exportedData.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Songs:</span>
                  <span className="font-medium">{exportedData.songCount}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download File
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
