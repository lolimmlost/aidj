import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ListMusic, Play, MoreVertical, Download, Share2 } from 'lucide-react';
import { ExportPlaylistDialog } from './ExportPlaylistDialog';

interface PlaylistCardProps {
  id: string;
  name: string;
  description?: string | null;
  songCount: number;
  createdAt: Date;
  onPlay?: (playlistId: string) => void;
}

export function PlaylistCard({
  id,
  name,
  description,
  songCount,
  createdAt,
  onPlay,
}: PlaylistCardProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString();

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ListMusic className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <CardTitle className="truncate">{name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ExportPlaylistDialog
                playlistId={id}
                playlistName={name}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {description && (
          <CardDescription className="line-clamp-2">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <p>{songCount} {songCount === 1 ? 'song' : 'songs'}</p>
            <p>Created {formattedDate}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onPlay?.(id)}
              disabled={songCount === 0}
              className="flex-1 min-h-[44px]"
            >
              <Play className="mr-2 h-4 w-4" />
              Play
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="flex-1 min-h-[44px]"
            >
              <Link to="/playlists/$id" params={{ id }}>
                View
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
