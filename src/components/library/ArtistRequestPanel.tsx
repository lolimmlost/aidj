/**
 * What to get for an artist that isn't in the library (#436): follow the artist,
 * pick a release (album / EP / single), or name a song. Every state shown comes
 * from Lidarr itself (useLidarrRequestStatus), never from a cached flag (#435).
 */
import { useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle2, Clock, Download, Loader2, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useLidarrRequest,
  useLidarrRequestStatus,
  type LidarrRequestResult,
  type LidarrRequestStatus,
} from '@/lib/hooks/useArtistMetadata';

export interface ReleaseGroup {
  id: string;
  title: string;
  firstReleaseDate?: string;
  primaryType?: string;
}

const GROUPS: Array<{ key: string; label: string }> = [
  { key: 'album', label: 'Albums' },
  { key: 'ep', label: 'EPs' },
  { key: 'single', label: 'Singles' },
  { key: 'other', label: 'Other' },
];
const COLLAPSED_ROWS = 5;

function groupKey(primaryType?: string): string {
  const t = primaryType?.toLowerCase();
  return t === 'album' || t === 'ep' || t === 'single' ? t : 'other';
}

export function groupReleases(releases: readonly ReleaseGroup[]): Array<{ key: string; label: string; items: ReleaseGroup[] }> {
  return GROUPS.map(g => ({
    ...g,
    items: releases
      .filter(r => groupKey(r.primaryType) === g.key)
      .sort((a, b) => (b.firstReleaseDate ?? '').localeCompare(a.firstReleaseDate ?? '')),
  })).filter(g => g.items.length > 0);
}

function requestedLabel(req: { users: number; byMe: boolean } | undefined): string | null {
  if (!req) return null;
  const others = req.users - (req.byMe ? 1 : 0);
  if (req.byMe && others > 0) return `Requested by you + ${others} other${others > 1 ? 's' : ''}`;
  if (req.byMe) return 'Requested by you';
  return `Requested by ${others} other${others > 1 ? 's' : ''}`;
}

function notify(result: LidarrRequestResult) {
  if (result.outcome === 'not_found') toast.error(result.message);
  else toast.success(result.message);
}

function AlbumStateBadge({ album }: { album: LidarrRequestStatus['albums'][string] }) {
  switch (album.state) {
    case 'in_library':
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> In library
        </span>
      );
    case 'partial':
      return (
        <span className="flex items-center gap-1 text-xs text-primary tabular-nums">
          <Download className="h-3.5 w-3.5 animate-pulse" /> Downloading {album.trackFiles}/{album.tracks}
        </span>
      );
    case 'wanted':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Waiting for download
        </span>
      );
    default:
      return null;
  }
}

export function ArtistRequestPanel({
  mbid,
  artistName,
  releaseGroups,
}: {
  mbid: string;
  artistName: string;
  releaseGroups: readonly ReleaseGroup[];
}) {
  const { data: status, isError: statusError } = useLidarrRequestStatus(mbid);
  const follow = useLidarrRequest();
  const release = useLidarrRequest();
  const song = useLidarrRequest();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [songTitle, setSongTitle] = useState('');

  const groups = useMemo(() => groupReleases(releaseGroups), [releaseGroups]);
  const requests = status?.requests ?? {};

  if (status === null) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        Downloads aren't set up on this server (Lidarr isn't configured).
      </p>
    );
  }

  const handleFollow = () => {
    follow.mutate({ mbid, artistName, mode: 'artist' }, { onSuccess: notify, onError: err => toast.error(err.message) });
  };

  const handleGet = (rg: ReleaseGroup) => {
    setPendingId(rg.id);
    release.mutate(
      { mbid, artistName, mode: 'release', releaseGroupId: rg.id },
      {
        onSuccess: notify,
        onError: err => toast.error(err.message),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const handleSong = (e: React.FormEvent) => {
    e.preventDefault();
    const title = songTitle.trim();
    if (!title) return;
    song.mutate(
      { mbid, artistName, mode: 'song', songTitle: title },
      {
        onSuccess: (result) => {
          notify(result);
          if (result.outcome !== 'not_found') setSongTitle('');
        },
        onError: err => toast.error(err.message),
      },
    );
  };

  const following = status?.followingNewReleases ?? false;
  const followRequested = requestedLabel(requests.artist);

  return (
    <div className="space-y-5">
      {/* 1. Follow the artist */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {following ? (
            <p className="flex items-center justify-center sm:justify-start gap-1.5 text-sm">
              <BellRing className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              Following. New releases download automatically.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Follow {artistName} to download new releases as they come out.
            </p>
          )}
          {followRequested && <p className="text-xs text-muted-foreground mt-0.5">{followRequested}</p>}
        </div>
        {!following && (
          <Button
            onClick={handleFollow}
            disabled={follow.isPending || !status}
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
          >
            {follow.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
            Follow artist
          </Button>
        )}
      </div>

      {statusError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center sm:text-left">
          Couldn't read Lidarr's status. Download states may be missing.
        </p>
      )}

      {/* 2. Pick a release */}
      {groups.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Get a release</h4>
          {groups.map(group => {
            const open = expanded[group.key] ?? false;
            const rows = open ? group.items : group.items.slice(0, COLLAPSED_ROWS);
            return (
              <div key={group.key} className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {group.label} <span className="tabular-nums">({group.items.length})</span>
                </p>
                <ul className="divide-y rounded-md border">
                  {rows.map(rg => {
                    const album = status?.albums[rg.id];
                    const showBadge = album && album.state !== 'not_monitored';
                    const busy = pendingId === rg.id && release.isPending;
                    const req = requestedLabel(requests[rg.id]);
                    return (
                      <li key={rg.id} className="flex items-center gap-3 px-3 py-2 min-h-[48px]">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{rg.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[rg.firstReleaseDate?.slice(0, 4), req].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {showBadge ? (
                          <AlbumStateBadge album={album} />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleGet(rg)}
                            disabled={release.isPending || !status}
                            className={cn('min-h-[36px] flex-shrink-0', busy && 'pointer-events-none')}
                            aria-label={`Get ${rg.title}`}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-1.5" /> Get
                              </>
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {group.items.length > COLLAPSED_ROWS && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setExpanded(e => ({ ...e, [group.key]: !open }))}
                  >
                    {open ? 'Show less' : `Show all ${group.items.length}`}
                  </button>
                )}
              </div>
            );
          })}
          {release.isPending && (
            <p className="text-xs text-muted-foreground">
              Asking Lidarr… singles and EPs can take up to a minute the first time.
            </p>
          )}
        </div>
      )}

      {/* 3. Find a song */}
      <form onSubmit={handleSong} className="space-y-1.5">
        <label htmlFor="artist-request-song" className="text-sm font-medium">
          Looking for a specific song?
        </label>
        <div className="flex gap-2">
          <Input
            id="artist-request-song"
            value={songTitle}
            onChange={e => setSongTitle(e.target.value)}
            placeholder="Song title"
            maxLength={200}
            className="min-h-[44px]"
          />
          <Button
            type="submit"
            disabled={song.isPending || !songTitle.trim() || !status}
            className="min-h-[44px] flex-shrink-0"
          >
            {song.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">Find</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Finds the release with that song and downloads it.</p>
      </form>
    </div>
  );
}
