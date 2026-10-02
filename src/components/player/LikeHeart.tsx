import type { CSSProperties } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A one-shot like/unlike animation request; bump `key` to replay. */
export interface LikeEffect {
  kind: 'like' | 'unlike';
  key: number;
}

interface LikeHeartProps {
  liked: boolean;
  /** Animation to play. Omit when the state changed for any other reason
   *  (song change, sync from another device) so nothing animates. */
  effect?: LikeEffect | null;
  /** Size classes for the heart, e.g. "h-4 w-4". */
  className?: string;
  /** How far burst dots travel, in px. Scale with the heart size. */
  burst?: number;
  /** Outline colour when not liked. */
  outlineClassName?: string;
}

const DOT_ANGLES = [0, 51, 103, 154, 206, 257, 309];
const DOT_COLORS = ['bg-red-500', 'bg-pink-400', 'bg-primary'];

/**
 * Heart with like feedback (#278): pop + liquid fill + ring + dot burst on
 * like, a quiet deflate on unlike. Pure CSS (see "Like Heart" in styles.css);
 * reduced motion shows the final state only.
 */
export function LikeHeart({ liked, effect, className, burst = 14, outlineClassName }: LikeHeartProps) {
  const playing = effect?.kind;
  return (
    <span
      // Remount on each new effect so the CSS animations replay.
      key={effect?.key ?? 'static'}
      className={cn('like-heart relative inline-flex shrink-0', className)}
      data-effect={playing}
      style={{ '--like-burst': `${burst}px` } as CSSProperties}
      aria-hidden="true"
    >
      <Heart className={cn('size-full transition-colors', liked ? 'text-red-500' : outlineClassName)} />
      {liked && (
        <Heart className="like-heart-fill absolute inset-0 size-full fill-red-500 text-red-500" />
      )}
      {playing === 'like' && (
        <>
          <span className="like-heart-ring pointer-events-none absolute -inset-1/2 rounded-full border-2 border-red-500/70" />
          {DOT_ANGLES.map((angle, i) => (
            <span
              key={angle}
              className={cn(
                'like-heart-dot pointer-events-none absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full',
                DOT_COLORS[i % DOT_COLORS.length],
              )}
              style={{ '--a': `${angle}deg` } as CSSProperties}
            />
          ))}
        </>
      )}
    </span>
  );
}
