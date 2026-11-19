/** Planning a resume of a lost Lab set (#439): the songs and the bar to pick it back up at. */
import { barAt, fitOctave, type TrackAnalysis } from './analysis';
import type { LabSong } from './crate';
import type { ReplayEntry } from './engine';
import type { MixMode } from './plan';
import { nextSongLabel, parseSongLabel, type ResumePoint } from './resume';
import type { SavedSet } from './sets';

/** The bar to resume on: the start of the bar that was playing, counted the way the set counts it. */
export function resumeBar(analysis: TrackAnalysis, pos: number | undefined, setBpm: number): number | undefined {
  if (!pos || pos <= 0) return undefined;
  const bar = Math.floor(barAt(fitOctave(analysis, setBpm), pos));
  return bar > 0 ? bar : undefined;
}

export interface ResumePlan {
  song: LabSong;
  fromBar?: number;
  /** what auto-lock locks first: the song that was locked when the page went */
  entries: ReplayEntry[];
  setBpm?: number;
  mode?: MixMode;
  /** how the set is named while it plays */
  name: string;
}

export interface ResumeDeps {
  findSongs: (tracks: { id: string; title: string; artist: string }[], known: LabSong[]) => Promise<(LabSong | null)[]>;
  getCachedAnalysis: (id: string) => Promise<TrackAnalysis | null>;
  loadSets: () => SavedSet[];
  setWhen: (iso: string) => string;
}

/** Find the songs and the bar to pick the set back up at. Null when the playing song is gone. */
export async function planResume(point: ResumePoint, known: LabSong[], deps: ResumeDeps): Promise<ResumePlan | null> {
  const cur = parseSongLabel(point.song);
  const nextLabel = nextSongLabel(point.next);
  const next = parseSongLabel(nextLabel);
  const wanted = [{ id: point.songId ?? '', title: cur?.title ?? '', artist: cur?.artist ?? '' }];
  if (next || point.nextId) wanted.push({ id: point.nextId ?? '', title: next?.title ?? '', artist: next?.artist ?? '' });
  const [song, nextSong] = await deps.findSongs(wanted, known);
  if (!song) return null;

  const set = point.setId ? deps.loadSets().find((s) => s.id === point.setId) : undefined;
  const setBpm = point.setBpm ?? set?.setBpm;
  const analysis = await deps.getCachedAnalysis(song.id).catch(() => null);
  const fromBar = analysis && setBpm ? resumeBar(analysis, point.pos, setBpm) : undefined;
  return {
    song,
    fromBar,
    entries: nextSong && nextSong.id !== song.id ? [{ song: nextSong }] : [],
    setBpm,
    mode: point.mode ?? set?.mode,
    name: set ? `Resumed · ${deps.setWhen(set.startedAt)}` : 'Resumed set',
  };
}
