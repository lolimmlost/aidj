/**
 * Phone memory test: download and decode one long track over and over, four ways, to find which way
 * the phone keeps memory from. Sets died after 15–25 track loads whatever the decks held, and iOS
 * gives a page no way to read its own memory, so the page dying (and the next load's report naming
 * the variant and round) is the measurement. Progress survives the reload; tapping again carries on
 * with the next variant.
 */
import { fetchAudio, type LabSong } from './crate';
import { labBeat, labLog } from './log';

export type MemVariant = 'fresh' | 'live' | 'shared' | 'shared+fetch';
/** least suspicious first: a variant that dies tells the most when the ones before it survived */
export const MEM_VARIANTS: MemVariant[] = ['fresh', 'live', 'shared', 'shared+fetch'];
export const MEM_LABEL: Record<MemVariant, string> = {
  fresh: 'new decoder per load',
  live: 'the playing audio context',
  shared: 'one shared decoder (the Lab today)',
  'shared+fetch': 'shared decoder, fetch download',
};
const ROUNDS = 25;
const RATE = 32000;
const KEY = 'aidj:dj-lab:memtest';

export interface MemProgress {
  /** "ok" or "died at round N" */
  results: Partial<Record<MemVariant, string>>;
  current?: { variant: MemVariant; round: number; song: string };
}

export function loadMemProgress(): MemProgress {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as MemProgress | null) ?? { results: {} };
  } catch {
    return { results: {} };
  }
}

function save(p: MemProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // the log still has it
  }
}

export function resetMemTest() {
  save({ results: {} });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the variants that haven't finished. A variant that was running when the page died is marked
 * "died at round N" first. `live` must be a running AudioContext (create it in the tap).
 */
export async function runMemTest(song: LabSong, live: AudioContext, onProgress: (p: MemProgress) => void) {
  const p = loadMemProgress();
  if (p.current) {
    p.results[p.current.variant] = `died at round ${p.current.round}`;
    labLog('memtest died', { variant: p.current.variant, round: p.current.round, song: p.current.song }, 'error');
    p.current = undefined;
    save(p);
  }
  const label = `${song.artist} – ${song.title}`;
  let shared: OfflineAudioContext | null = null;
  for (const variant of MEM_VARIANTS) {
    if (p.results[variant]) continue;
    labLog('memtest start', { variant, song: label, rounds: ROUNDS });
    for (let round = 1; round <= ROUNDS; round++) {
      p.current = { variant, round, song: label };
      save(p);
      onProgress({ ...p });
      labBeat({ status: 'memtest', song: label, next: `${variant} ${round}/${ROUNDS}` });
      const t0 = performance.now();
      const buf =
        variant === 'shared+fetch'
          ? await (await fetch(`/api/navidrome/stream/${encodeURIComponent(song.id)}`, { credentials: 'include' })).arrayBuffer()
          : await fetchAudio(song.id);
      const ctx = variant === 'live' ? live : variant === 'fresh' ? new OfflineAudioContext(2, 1, RATE) : (shared ??= new OfflineAudioContext(2, 1, RATE));
      const decoded = await ctx.decodeAudioData(buf);
      if (round === 1 || round % 5 === 0) {
        labLog('memtest round', { variant, round, sec: Math.round(decoded.duration), sr: decoded.sampleRate, ms: Math.round(performance.now() - t0) });
      }
      await sleep(400);
    }
    p.results[variant] = 'ok';
    p.current = undefined;
    save(p);
    onProgress({ ...p });
    labLog('memtest passed', { variant, rounds: ROUNDS });
  }
  labBeat({ status: 'idle' });
  labLog('memtest results', p.results as Record<string, unknown>);
}
