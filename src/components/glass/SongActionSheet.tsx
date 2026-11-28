import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Disc3, Heart, ListEnd, ListPlus, ListStart, MinusCircle, Radio, User,
} from 'lucide-react';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { GlassSheetFrame, SheetScroll } from '@/components/glass/GlassSheet';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface ActionSheetSong {
  songId: string;
  title: string;
  artist: string;
  albumId?: string | null;
  artistId?: string | null;
  starred?: boolean;
}

interface SongActionSheetProps {
  song: ActionSheetSong | null;
  onOpenChange: (open: boolean) => void;
  /** Hide "Remove from this playlist" (Liked Songs, smart playlists). */
  canRemove?: boolean;
  currentPlaylistId?: string;
  onPlayNext: (song: ActionSheetSong) => void;
  onAddToQueue: (song: ActionSheetSong) => void;
  onToggleLike: (song: ActionSheetSong) => void;
  onStartRadio: (song: ActionSheetSong) => void;
  onRemove?: (song: ActionSheetSong) => void;
}

interface PlaylistOption {
  id: string;
  name: string;
  songCount?: number | null;
  actualSongCount?: number | null;
  navidromeId?: string | null;
  smartPlaylistCriteria?: unknown;
}

const LIKED_NAME = '❤️ Liked Songs';

const rowClass =
  'flex h-[50px] w-full items-center gap-3.5 rounded-xl px-1 text-left text-[15px] text-foreground transition-colors active:bg-foreground/10 [-webkit-tap-highlight-color:transparent]';

/**
 * Glass UI: the ⋯ menu for a song, as a bottom sheet — play next, queue, add
 * to playlist (sub-list), like, radio, go to artist/album, remove.
 */
export function SongActionSheet({
  song, onOpenChange, canRemove, currentPlaylistId,
  onPlayNext, onAddToQueue, onToggleLike, onStartRadio, onRemove,
}: SongActionSheetProps) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const open = !!song;

  const { data: playlists = [] } = useQuery<PlaylistOption[]>({
    queryKey: ['playlists'],
    enabled: open && view === 'playlists',
    queryFn: async () => {
      const response = await fetch('/api/playlists');
      if (!response.ok) return { playlists: [] };
      const json = await response.json();
      return json.data || { playlists: [] };
    },
    select: (data: unknown) =>
      ((data as { playlists?: PlaylistOption[] })?.playlists ?? []).filter(
        (p) => p.name !== LIKED_NAME && !p.smartPlaylistCriteria && p.id !== currentPlaylistId,
      ),
  });

  const close = () => {
    onOpenChange(false);
    setView('main');
  };
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const addTo = async (p: PlaylistOption) => {
    if (!song) return;
    close();
    try {
      const res = await fetch(`/api/playlists/${p.id}/songs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.songId, artistName: song.artist, songTitle: song.title }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`Added to ${p.name}`);
    } catch {
      toast.error(`Couldn’t add to ${p.name}`);
    }
  };

  return (
    <GlassSheetFrame
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      className="max-h-[80dvh] dark:bg-[rgb(22_20_32/0.86)]"
      head={
        song && (
          <div className="mb-1.5 flex items-center gap-3 border-b border-foreground/10 px-0.5 pb-3">
            {song.albumId ? (
              <img src={getCoverArtUrl(song.albumId, 96) ?? undefined} alt="" className="size-12 shrink-0 rounded-md bg-muted object-cover" />
            ) : (
              <span className="size-12 shrink-0 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate font-display text-base font-bold">{song.title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-[13px] text-muted-foreground">{song.artist}</DialogPrimitive.Description>
            </div>
          </div>
        )
      }
    >
      {song && (
        <SheetScroll className="pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
          {view === 'main' ? (
            <div className="flex flex-col">
              <button type="button" className={rowClass} onClick={run(() => onPlayNext(song))}>
                <ListStart className="size-5 text-muted-foreground" aria-hidden /> Play next
              </button>
              <button type="button" className={rowClass} onClick={run(() => onAddToQueue(song))}>
                <ListEnd className="size-5 text-muted-foreground" aria-hidden /> Add to queue
              </button>
              <button type="button" className={rowClass} onClick={() => setView('playlists')}>
                <ListPlus className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Add to playlist</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
              <button type="button" className={rowClass} onClick={run(() => onToggleLike(song))}>
                <Heart className={cn('size-5', song.starred ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground')} aria-hidden />
                {song.starred ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
              </button>
              {canRemove && onRemove && (
                <button type="button" className={rowClass} onClick={run(() => onRemove(song))}>
                  <MinusCircle className="size-5 text-muted-foreground" aria-hidden /> Remove from this playlist
                </button>
              )}
              <button type="button" className={rowClass} onClick={run(() => onStartRadio(song))}>
                <Radio className="size-5 text-muted-foreground" aria-hidden /> Start radio
              </button>
              {song.artistId && (
                <Link to="/library/artists/$id" params={{ id: song.artistId }} className={rowClass} onClick={close}>
                  <User className="size-5 text-muted-foreground" aria-hidden /> Go to artist
                </Link>
              )}
              {song.artistId && song.albumId && (
                <Link
                  to="/library/artists/$id/albums/$albumId"
                  params={{ id: song.artistId, albumId: song.albumId }}
                  className={rowClass}
                  onClick={close}
                >
                  <Disc3 className="size-5 text-muted-foreground" aria-hidden /> Go to album
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <button type="button" className={cn(rowClass, 'text-muted-foreground')} onClick={() => setView('main')}>
                <ChevronLeft className="size-5" aria-hidden /> Add to playlist
              </button>
              {playlists.map((p) => (
                <button key={p.id} type="button" className={rowClass} onClick={() => void addTo(p)}>
                  {p.navidromeId ? (
                    <img src={getCoverArtUrl(`pl-${p.navidromeId}`, 80) ?? undefined} alt="" className="size-9 shrink-0 rounded-md bg-muted object-cover" />
                  ) : (
                    <span className="size-9 shrink-0 rounded-md bg-muted" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.actualSongCount ?? p.songCount ?? 0} songs</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </SheetScroll>
      )}
    </GlassSheetFrame>
  );
}
