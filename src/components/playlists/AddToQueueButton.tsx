import { useState } from 'react';
import { ListPlus, Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAudioStore } from '@/lib/stores/audio';
import { toast } from 'sonner';

interface AddToQueueButtonProps {
  songId: string;
  artistName: string;
  songTitle: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function AddToQueueButton({
  songId,
  artistName,
  songTitle,
  variant = 'ghost',
  size = 'sm',
  showLabel = false,
}: AddToQueueButtonProps) {
  const [open, setOpen] = useState(false);
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying, setAIUserActionInProgress } = useAudioStore();

  const handleAddToQueue = (position: 'now' | 'next' | 'end') => {
    const audioSong = {
      id: songId,
      name: songTitle, // Use 'name' instead of 'title' to match Song type
      artist: artistName,
      albumId: '', // Add missing property
      duration: 0, // Add missing property
      track: 1, // Add missing property
      url: `/api/navidrome/stream/${songId}`,
    };

    // Set user action flag to prevent AI DJ auto-refresh
    setAIUserActionInProgress(true);

    if (position === 'now') {
      playSong(songId, [audioSong]);
      setIsPlaying(true);
      toast.success(`Now playing "${songTitle}"`);
    } else if (position === 'next') {
      addToQueueNext([audioSong]);
      toast.success(`Added "${songTitle}" to play next`);
    } else {
      addToQueueEnd([audioSong]);
      toast.success(`Added "${songTitle}" to end of queue`);
    }
    
    setOpen(false);
    
    // Clear the flag after a short delay
    setTimeout(() => {
      setAIUserActionInProgress(false);
    }, 2000);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="min-h-[44px]"
          aria-label="Add to queue"
        >
          <ListPlus className={showLabel ? 'mr-2 h-4 w-4' : 'h-4 w-4'} />
          {showLabel && 'Add to Queue'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => handleAddToQueue('now')}
          className="min-h-[44px]"
        >
          <Play className="mr-2 h-4 w-4" />
          Play Now
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleAddToQueue('next')}
          className="min-h-[44px]"
        >
          <Play className="mr-2 h-4 w-4" />
          Play Next
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleAddToQueue('end')}
          className="min-h-[44px]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add to End
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
