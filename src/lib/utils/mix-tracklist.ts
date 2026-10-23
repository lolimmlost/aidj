/**
 * Tracklists of published AIDJ mixes. `publish_mix.sh` writes the render's tracklist into the
 * mp3's comment tag, one line per track: `0:00   1. Artist – Title` (`m:ss` or `h:mm:ss`).
 */
export interface MixTrack {
  /** Offset into the mix, in seconds */
  start: number;
  /** The timestamp as written, e.g. "11:10" */
  time: string;
  /** Track number within the mix */
  position: number;
  artist: string;
  title: string;
}

const LINE = /^\s*(\d{1,2}(?::\d{2}){1,2})\s+(\d+)\.\s+(.+?)\s*$/;
// The renderer joins artist and title with an en dash; fall back to a spaced hyphen
const SEPARATORS = [' – ', ' - '];

function toSeconds(time: string): number {
  return time.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

export function parseMixTracklist(comment: string | undefined | null): MixTrack[] {
  if (!comment) return [];
  const tracks: MixTrack[] = [];
  for (const line of comment.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, time, position, name] = m;
    const sep = SEPARATORS.find((s) => name.includes(s));
    const [artist, title] = sep
      ? [name.slice(0, name.indexOf(sep)), name.slice(name.indexOf(sep) + sep.length)]
      : ['', name];
    tracks.push({ start: toSeconds(time), time, position: Number(position), artist: artist.trim(), title: title.trim() });
  }
  return tracks;
}

/** "Five-Star Peak Time (bar-fix test)" -> "Five-Star Peak Time": version notes stay out of the headline */
export function mixDisplayTitle(title: string): string {
  return title.replace(/\s*\([^()]*\)\s*$/, '').trim() || title;
}
