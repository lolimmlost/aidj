import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to get cover art URL from Navidrome
export const getCoverArtUrl = (albumId: string | undefined, size: number = 128) => {
  if (!albumId) return null;
  return `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`;
};

export interface AlbumArtProps {
  albumId?: string;
  songId?: string;
  artist?: string;
  size?: 'sm' | 'md' | 'lg';
  isPlaying?: boolean;
  className?: string;
}

// Album art component with fallback
export const AlbumArt = ({
  albumId,
  songId,
  artist,
  size = 'md',
  isPlaying = false,
  className = ''
}: AlbumArtProps) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [resolvedAlbumId, setResolvedAlbumId] = useState<string | null>(albumId || null);

  // Fetch albumId from Navidrome if not provided but songId is available
  useEffect(() => {
    if (albumId) {
      setResolvedAlbumId(albumId);
      return;
    }

    if (!songId) {
      setResolvedAlbumId(null);
      return;
    }

    // Fetch song metadata to get albumId
    const fetchAlbumId = async () => {
      try {
        const response = await fetch(`/api/navidrome/rest/getSong?id=${songId}&f=json`);
        if (response.ok) {
          const data = await response.json();
          const song = data['subsonic-response']?.song;
          if (song?.albumId) {
            setResolvedAlbumId(song.albumId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch album ID:', error);
      }
    };

    fetchAlbumId();
  }, [albumId, songId]);

  // Reset states when albumId changes
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [resolvedAlbumId]);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  };

  const imgSizes = {
    sm: 96,
    md: 112,
    lg: 160,
  };

  const coverUrl = getCoverArtUrl(resolvedAlbumId || undefined, imgSizes[size]);
  const initials = artist?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '♪';

  return (
    <div className={cn(
      sizeClasses[size],
      'rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 relative overflow-hidden',
      className
    )}>
      {coverUrl && !imgError ? (
        <>
          <img
            src={coverUrl}
            alt="Album cover"
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              imgLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Music className="h-4 w-4 text-primary/40 animate-pulse" />
            </div>
          )}
        </>
      ) : (
        <span className={cn(
          'font-bold text-primary/60',
          size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg'
        )}>
          {initials}
        </span>
      )}

      {/* Playing animation overlay */}
      {isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" />
            <div className="w-0.5 h-3 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
            <div className="w-0.5 h-2 bg-white/80 animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AlbumArt;
