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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileJson, FileText, Music } from 'lucide-react';

interface ExportPlaylistDialogProps {
  playlistId: string;
  playlistName: string;
  trigger?: React.ReactNode;
}

type ExportFormat = 'm3u' | 'xspf' | 'json';

const formatInfo: Record<ExportFormat, { label: string; description: string; icon: React.ReactNode }> = {
  m3u: {
    label: 'M3U/M3U8',
    description: 'Most widely compatible format, works with most music players',
    icon: <FileText className="h-4 w-4" />,
  },
  xspf: {
    label: 'XSPF',
    description: 'XML-based format with rich metadata support',
    icon: <Music className="h-4 w-4" />,
  },
  json: {
    label: 'JSON',
    description: 'Best for re-importing or programmatic use',
    icon: <FileJson className="h-4 w-4" />,
  },
};

export function ExportPlaylistDialog({
  playlistId,
  playlistName,
  trigger,
}: ExportPlaylistDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('json');

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          format,
          includeMetadata: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export playlist');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Create download link
      const blob = new Blob([data.data.content], { type: data.data.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Playlist exported successfully', {
        description: `Exported ${data.data.songCount} songs to ${data.data.filename}`,
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to export playlist', {
        description: error.message,
      });
    },
  });

  const handleExport = () => {
    exportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="min-h-[44px]">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Playlist</DialogTitle>
          <DialogDescription>
            Export "{playlistName}" to a file format of your choice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="format">Export Format</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(formatInfo).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {info.icon}
                      <span>{info.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {formatInfo[format].description}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="min-h-[44px]"
          >
            {exportMutation.isPending ? (
              <>Exporting...</>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
