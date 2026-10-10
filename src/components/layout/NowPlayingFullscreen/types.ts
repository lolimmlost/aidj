import type { LikeEffect } from '@/components/player/LikeHeart';

/**
 * Modes the unified Now Playing surface can render. Phase A ships only
 * 'art'; lyrics/visualizer/queue are wired in subsequent phases.
 */
export type NPMode = 'art' | 'lyrics' | 'visualizer' | 'queue';

export interface NowPlayingSong {
  id: string;
  name?: string;
  title?: string;
  artist?: string;
  albumId?: string;
  /**
   * Navidrome artist id (when available). When set, the artist name in
   * both PlayerBar and the fullscreen view becomes a link to the artist
   * detail page.
   */
  artistId?: string;
}

export interface NowPlayingFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open/close instantly (no slide): the caller is animating it with a view
   *  transition that morphs the mini-player art into the big art (#289). */
  skipSlide?: boolean;
  /** Open the current song's album page from the fullscreen view, morphing the
   *  big art into the album page's cover (#289). Falls back to onClose + link. */
  onOpenAlbum?: (artistId: string, albumId: string) => void;
  /** Open the artist page and close the sheet as one transition (#289).
   *  Falls back to onClose + link. */
  onOpenArtist?: (artistId: string) => void;
  /** Mode to start in. Defaults to 'art'. */
  initialMode?: NPMode;
  currentSong: NowPlayingSong | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  isLikePending: boolean;
  /** The user's own like/unlike to animate (see LikeHeart). */
  likeEffect?: LikeEffect | null;
  isShuffled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  /** Web Audio AnalyserNode from the player's audio graph. Required for
   *  Visualizer mode; if null, visualizer renders without live audio
   *  data. */
  analyserNode?: AnalyserNode | null;
}
