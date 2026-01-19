import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Music,
  Search,
  Loader2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSuggestSong } from "./use-collaborative-playlist";

interface SuggestSongDialogProps {
  playlistId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

export function SuggestSongDialog({
  playlistId,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: SuggestSongDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const onOpenChange = controlledOnOpenChange ?? setInternalIsOpen;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const suggestMutation = useSuggestSong();

  // Debounced search using useEffect
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // Search songs from Navidrome
  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult[]>({
    queryKey: ["song-search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const response = await fetch(
        `/api/navidrome/search?q=${encodeURIComponent(debouncedQuery)}&type=song&limit=20`
      );
      if (!response.ok) {
        throw new Error("Search failed");
      }
      const json = await response.json();
      // Map Navidrome response to our format
      return (json.data?.songs ?? json.songs ?? []).map((song: {
        id: string;
        title?: string;
        name?: string;
        artist?: string;
        album?: string;
        duration?: number;
      }) => ({
        id: song.id,
        title: song.title || song.name || "Unknown",
        artist: song.artist || "Unknown Artist",
        album: song.album,
        duration: song.duration,
      }));
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60000, // 1 minute
  });

  const handleSuggest = async (song: SearchResult) => {
    await suggestMutation.mutateAsync({
      playlistId,
      song: {
        songId: song.id,
        songTitle: song.title,
        songArtist: song.artist,
        songAlbum: song.album,
        songDuration: song.duration,
      },
    });
    onOpenChange(false);
    setSearchQuery("");
    setDebouncedQuery("");
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Suggest a Song
          </DialogTitle>
          <DialogDescription>
            Search for a song to suggest for this playlist. Other collaborators will vote on it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for a song..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {/* Results */}
          <ScrollArea className="h-[300px]">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((song) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Music className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{song.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {song.artist}
                        {song.album && ` • ${song.album}`}
                        {song.duration && ` • ${formatDuration(song.duration)}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSuggest(song)}
                      disabled={suggestMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {suggestMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Suggest
                    </Button>
                  </div>
                ))}
              </div>
            ) : debouncedQuery.length >= 2 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No songs found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start typing to search</p>
                <p className="text-sm">Search by song title or artist</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
