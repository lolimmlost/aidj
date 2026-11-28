import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SongActionSheet, type ActionSheetSong } from '@/components/glass/SongActionSheet';
import { useAudioStore } from '@/lib/stores/audio';
import { queryKeys } from '@/lib/query';
import { toast } from '@/lib/toast';
import type { Song } from '@/lib/types/song';

/**
 * The ⋯ sheet for a song in a glass list (search, artist, album): play next, queue, add to playlist, like
 * (the library star, same as the player heart), radio, go to artist/album.
 */
export function useGlassSongSheet(likedIds: string[] | undefined) {
  const [sheet, setSheet] = useState<Song | null>(null);
  const queryClient = useQueryClient();
  const addToQueueNext = useAudioStore((s) => s.addToQueueNext);
  const addToQueueEnd = useAudioStore((s) => s.addToQueueEnd);
  const startRadio = useAudioStore((s) => s.startRadio);
  const setAIUserActionInProgress = useAudioStore((s) => s.setAIUserActionInProgress);
  const liked = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  const toQueue = (song: Song) => ({
    ...song,
    title: song.title || song.name || '',
    name: song.name || song.title || '',
    url: song.url || `/api/navidrome/stream/${song.id}`,
  });
  const queue = (song: Song, where: 'next' | 'end') => {
    setAIUserActionInProgress(true);
    if (where === 'next') addToQueueNext([toQueue(song)]);
    else addToQueueEnd([toQueue(song)]);
    toast.success(where === 'next' ? `“${song.title || song.name}” plays next` : `Added “${song.title || song.name}” to the queue`);
    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };
  const toggleLike = async (id: string, star: boolean) => {
    // flip the heart right away in every cached feedback list ({ liked: string[] }); the refetch confirms
    queryClient.setQueriesData({ queryKey: queryKeys.feedback.all() }, (old: unknown) => {
      const o = old as { liked?: string[] } | undefined;
      if (!o || !Array.isArray(o.liked)) return old;
      const liked = o.liked.filter((x) => x !== id);
      return { ...o, liked: star ? [...liked, id] : liked };
    });
    try {
      const res = await fetch(`/api/navidrome/star?id=${id}`, { method: star ? 'POST' : 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(star ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      toast.error('Couldn’t update Liked Songs');
    } finally {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    }
  };

  const sheetSong: ActionSheetSong | null = sheet
    ? {
        songId: sheet.id,
        title: sheet.title || sheet.name || 'Unknown song',
        artist: sheet.artist || 'Unknown artist',
        albumId: sheet.albumId,
        artistId: sheet.artistId,
        starred: liked.has(sheet.id),
      }
    : null;

  const element = (
    <SongActionSheet
      song={sheetSong}
      onOpenChange={(o) => {
        if (!o) setSheet(null);
      }}
      onPlayNext={() => sheet && queue(sheet, 'next')}
      onAddToQueue={() => sheet && queue(sheet, 'end')}
      onToggleLike={(s) => void toggleLike(s.songId, !s.starred)}
      onStartRadio={(s) => void startRadio({ kind: 'song', songId: s.songId })}
    />
  );
  return { open: setSheet, element };
}
