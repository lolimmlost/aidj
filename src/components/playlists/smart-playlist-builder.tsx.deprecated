import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Sparkles, X } from 'lucide-react';

interface SmartPlaylistCriteria {
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  artists?: string[];
  rating?: number;
  recentlyAdded?: '7d' | '30d' | '90d';
}

interface SmartPlaylistBuilderProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availableGenres?: string[]; // From library profile
}

const DEFAULT_GENRES = ['Rock', 'Pop', 'Electronic', 'Jazz', 'Classical', 'Hip-Hop', 'Metal', 'Indie', 'Alternative'];

export function SmartPlaylistBuilder({
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  availableGenres = DEFAULT_GENRES,
}: SmartPlaylistBuilderProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const [name, setName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState<[number, number]>([1950, new Date().getFullYear()]);
  const [artistInput, setArtistInput] = useState('');
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [recentlyAdded, setRecentlyAdded] = useState<'7d' | '30d' | '90d' | undefined>(undefined);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; smartPlaylistCriteria: SmartPlaylistCriteria }) => {
      const response = await fetch('/api/playlists/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create smart playlist');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Smart playlist created successfully');
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to create smart playlist', {
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setName('');
    setSelectedGenres([]);
    setYearRange([1950, new Date().getFullYear()]);
    setArtistInput('');
    setSelectedArtists([]);
    setRating(undefined);
    setRecentlyAdded(undefined);
  };

  const handleAddGenre = (genre: string) => {
    if (!selectedGenres.includes(genre)) {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const handleRemoveGenre = (genre: string) => {
    setSelectedGenres(selectedGenres.filter((g) => g !== genre));
  };

  const handleAddArtist = () => {
    const trimmedArtist = artistInput.trim();
    if (trimmedArtist && !selectedArtists.includes(trimmedArtist)) {
      setSelectedArtists([...selectedArtists, trimmedArtist]);
      setArtistInput('');
    }
  };

  const handleRemoveArtist = (artist: string) => {
    setSelectedArtists(selectedArtists.filter((a) => a !== artist));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a playlist name');
      return;
    }

    // Validate year range
    if (yearRange[0] > yearRange[1]) {
      toast.error('Invalid year range');
      return;
    }

    // Build criteria object - only include non-empty values
    const criteria: SmartPlaylistCriteria = {};
    if (selectedGenres.length > 0) criteria.genre = selectedGenres;
    if (yearRange[0] !== 1950 || yearRange[1] !== new Date().getFullYear()) {
      criteria.yearFrom = yearRange[0];
      criteria.yearTo = yearRange[1];
    }
    if (selectedArtists.length > 0) criteria.artists = selectedArtists;
    if (rating) criteria.rating = rating;
    if (recentlyAdded) criteria.recentlyAdded = recentlyAdded;

    // Ensure at least one filter is applied
    if (Object.keys(criteria).length === 0) {
      toast.error('Please add at least one filter criterion');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      smartPlaylistCriteria: criteria,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="min-h-[44px]">
            <Sparkles className="mr-2 h-4 w-4" />
            Create Smart Playlist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Smart Playlist</DialogTitle>
            <DialogDescription>
              Create a dynamic playlist with filters. Songs matching your criteria will be automatically included.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Playlist Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Playlist Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 2020s Rock"
                maxLength={100}
                className="min-h-[44px]"
                required
              />
            </div>

            {/* Genre Filter */}
            <div className="grid gap-2">
              <Label htmlFor="genre">Genre</Label>
              <Select onValueChange={handleAddGenre}>
                <SelectTrigger id="genre" className="min-h-[44px]">
                  <SelectValue placeholder="Select genres..." />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
                  {availableGenres
                    .filter((g) => !selectedGenres.includes(g))
                    .map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedGenres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedGenres.map((genre) => (
                    <div
                      key={genre}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                    >
                      <span>{genre}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGenre(genre)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Year Range Filter */}
            <div className="grid gap-2">
              <Label>
                Year Range: {yearRange[0]} - {yearRange[1]}
              </Label>
              <Slider
                min={1950}
                max={new Date().getFullYear()}
                step={1}
                value={yearRange}
                onValueChange={(value) => setYearRange(value as [number, number])}
                className="mt-2"
              />
            </div>

            {/* Artist Filter */}
            <div className="grid gap-2">
              <Label htmlFor="artist">Artists</Label>
              <div className="flex gap-2">
                <Input
                  id="artist"
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddArtist();
                    }
                  }}
                  placeholder="Type artist name and press Enter"
                  className="min-h-[44px]"
                />
                <Button
                  type="button"
                  onClick={handleAddArtist}
                  variant="outline"
                  className="min-h-[44px]"
                >
                  Add
                </Button>
              </div>
              {selectedArtists.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedArtists.map((artist) => (
                    <div
                      key={artist}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                    >
                      <span>{artist}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveArtist(artist)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rating Filter */}
            <div className="grid gap-2">
              <Label htmlFor="rating">Minimum Rating</Label>
              <Select
                value={rating?.toString() || ''}
                onValueChange={(value) => setRating(value ? Number(value) : undefined)}
              >
                <SelectTrigger id="rating" className="min-h-[44px]">
                  <SelectValue placeholder="Any rating" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
                  <SelectItem value="0">Any rating</SelectItem>
                  <SelectItem value="1">⭐ 1 star or higher</SelectItem>
                  <SelectItem value="2">⭐⭐ 2 stars or higher</SelectItem>
                  <SelectItem value="3">⭐⭐⭐ 3 stars or higher</SelectItem>
                  <SelectItem value="4">⭐⭐⭐⭐ 4 stars or higher</SelectItem>
                  <SelectItem value="5">⭐⭐⭐⭐⭐ 5 stars only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recently Added Filter */}
            <div className="grid gap-2">
              <Label htmlFor="recently">Recently Added</Label>
              <Select
                value={recentlyAdded || ''}
                onValueChange={(value) => setRecentlyAdded(value as '7d' | '30d' | '90d' | undefined || undefined)}
              >
                <SelectTrigger id="recently" className="min-h-[44px]">
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
                  <SelectItem value="0">Any time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-[44px]"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Smart Playlist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
