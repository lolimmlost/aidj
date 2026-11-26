import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListMusic, Loader2, Plus, Search } from 'lucide-react';
import { GlassSheet, SheetLabel, SheetRow } from '@/components/glass/GlassSheet';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface PlaylistOption {
  id: string;
  name: string;
  songCount?: number | null;
  actualSongCount?: number | null;
  smartPlaylistCriteria?: unknown;
}

const LIKED_NAME = '❤️ Liked Songs';
const FILTER_FROM = 7;

async function addSong(playlistId: string, song: { id: string; title: string; artist: string }) {
  const res = await fetch(`/api/playlists/${playlistId}/songs/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songId: song.id, artistName: song.artist, songTitle: song.title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to add song');
  }
}

/**
 * Glass UI (phones): "Add to playlist" from the full-screen player as a
 * bottom sheet. New playlist is inline (name it, it's created with the song
 * already in it); a filter appears once there are enough playlists to need it.
 */
export function GlassAddToPlaylistSheet({ open, onOpenChange, song, dark }: {
  dark?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: { id: string; title: string; artist: string };
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    enabled: open,
    queryFn: async () => {
      const res = await fetch('/api/playlists/');
      if (!res.ok) throw new Error('Failed to fetch playlists');
      return (await res.json()).data as { playlists: PlaylistOption[] };
    },
    select: (d) => (d?.playlists ?? []).filter((p) => p.name !== LIKED_NAME && !p.smartPlaylistCriteria),
  });

  const reset = () => {
    setFilter('');
    setCreating(false);
    setNewName('');
    setAdded(null);
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };

  const add = useMutation({
    mutationFn: (p: PlaylistOption) => addSong(p.id, song),
    onSuccess: (_d, p) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', p.id] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setAdded(p.id);
      toast.success(`Added to ${p.name}`, { description: `${song.artist} - ${song.title}` });
      // A beat on the check so the tap reads, then out.
      setTimeout(close, 450);
    },
    onError: (e: Error, p) => {
      if (e.message.includes('already in playlist')) toast.info(`Already in ${p.name}`);
      else toast.error(`Couldn’t add to ${p.name}`, { description: e.message });
    },
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/playlists/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to create playlist');
      }
      const p = (await res.json()).data as PlaylistOption;
      await addSong(p.id, song);
      return p;
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success(`Created ${p.name}`, { description: `${song.artist} - ${song.title}` });
      close();
    },
    onError: (e: Error) => toast.error('Couldn’t create the playlist', { description: e.message }),
  });

  const q = filter.trim().toLowerCase();
  const shown = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists;
  const busy = add.isPending || create.isPending;

  return (
    <GlassSheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Add to playlist"
      dark={dark}
      subtitle={`${song.title} · ${song.artist}`}
      description={`Add ${song.title} by ${song.artist} to a playlist`}
      header={
        playlists.length >= FILTER_FROM ? (
          <label className="glass-flat mt-3 flex h-10 items-center gap-2 rounded-full px-3.5 text-muted-foreground">
            <Search className="size-4 shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a playlist"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        ) : undefined
      }
    >
      {creating ? (
        <form
          className="flex items-center gap-2 px-1 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate(newName.trim());
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            aria-label="New playlist name"
            className="glass-flat h-11 min-w-0 flex-1 rounded-full px-4 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!newName.trim() || busy}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Create'}
          </button>
        </form>
      ) : (
        <SheetRow icon={<Plus className="size-5" />} title="New playlist" sub="Starts with this song" onClick={() => setCreating(true)} tone="primary" active />
      )}

      <SheetLabel>{q ? `${shown.length} MATCHING` : 'YOUR PLAYLISTS'}</SheetLabel>
      {isLoading && <div className="grid place-items-center py-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>}
      {!isLoading && shown.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">{q ? 'No playlist matches.' : 'No playlists yet.'}</p>
      )}
      {shown.map((p) => {
        const count = p.actualSongCount ?? p.songCount ?? 0;
        const pending = add.isPending && add.variables?.id === p.id;
        return (
          <SheetRow
            key={p.id}
            icon={<ListMusic className="size-5" />}
            title={p.name}
            sub={`${count} song${count === 1 ? '' : 's'}`}
            disabled={busy && !pending}
            active={added === p.id}
            tone="success"
            onClick={() => add.mutate(p)}
            trailing={
              <span className={cn('grid size-8 shrink-0 place-items-center', added === p.id ? 'text-success' : 'text-muted-foreground')}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : added === p.id ? <Check className="size-5" /> : <Plus className="size-4" />}
              </span>
            }
          />
        );
      })}
    </GlassSheet>
  );
}
