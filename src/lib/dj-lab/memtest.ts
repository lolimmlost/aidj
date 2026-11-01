/**
 * Phone memory test: download and decode one long track over and over, a few ways, to find which way
 * the phone keeps memory from. Sets died after 15–25 track loads whatever the decks held, and iOS
 * gives a page no way to read its own memory, so the page dying (and the next load's report naming
 * the variant and round) is the measurement. Progress survives the reload; tapping again carries on
 * with the next variant. The crate scan pauses while it runs (the first run was spoiled by the scan
 * downloading a 2-hour set).
 */
import { fetchAudio, type LabSong } from './crate';
import { createDeck, disposeDeck, type DeckNodes } from './graph';
import { labBeat, labLog } from './log';

export type MemVariant = 'fresh' | 'play' | 'shared' | 'release' | 'reuse';
/**
 * Run 2 found it: played decks are what the phone keeps (fresh ran 20, play died at 7). release is
 * the Lab's fix; reuse is the way out if it isn't enough.
 */
export const MEM_VARIANTS: MemVariant[] = ['fresh', 'play', 'shared', 'release', 'reuse'];
export const MEM_LABEL: Record<MemVariant, string> = {
  fresh: 'new decoder per load',
  play: 'new decoder, then played like a deck',
  shared: 'one shared decoder (the Lab before)',
  release: 'played, then the deck lets go of it (the Lab now)',
  reuse: 'played from two reused buffers',
};
/** a 7-minute track is ~110 MB decoded: kept every round, that's past what killed the sets */
export const MEM_ROUNDS = 20;
const RATE = 32000;
const PLAY_MS = 2000;
const KEY = 'aidj:dj-lab:memtest2';

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

let running = false;
/** the crate scan waits while the test runs */
export const memTestRunning = () => running;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How a played-out deck was disposed before `release`: the source node keeps its buffer. */
function disposeKeepingBuffer(deck: DeckNodes) {
  try {
    deck.src.stop();
  } catch {
    // never started
  }
  deck.src.disconnect();
  for (const n of deck.nodes) n.disconnect();
}

/** A deck's graph into silence for a moment, then disposed. */
async function playSilently(ctx: AudioContext, buffer: AudioBuffer, dispose: (deck: DeckNodes) => void) {
  const mute = ctx.createGain();
  mute.gain.value = 0;
  mute.connect(ctx.destination);
  const deck = createDeck(ctx, buffer, mute);
  deck.src.start();
  await sleep(PLAY_MS);
  dispose(deck);
  mute.disconnect();
}

/** Two buffers made once, taking turns: the decoded audio is copied in and never itself played. */
let reusable: AudioBuffer[] = [];
let turn = 0;
function intoReused(decoded: AudioBuffer): AudioBuffer {
  const [first] = reusable;
  if (!first || first.length !== decoded.length || first.numberOfChannels !== decoded.numberOfChannels) {
    reusable = [0, 1].map(() => new AudioBuffer({ numberOfChannels: decoded.numberOfChannels, length: decoded.length, sampleRate: decoded.sampleRate }));
  }
  const b = reusable[turn++ % 2];
  for (let c = 0; c < decoded.numberOfChannels; c++) b.copyToChannel(decoded.getChannelData(c), c);
  return b;
}

/**
 * Run the variants that haven't finished. A variant that was running when the page died is marked
 * "died at round N" first. `live` must be a running AudioContext (create it in the tap).
 */
export async function runMemTest(song: LabSong, live: AudioContext, onProgress: (p: MemProgress) => void) {
  running = true;
  try {
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
      labLog('memtest start', { variant, song: label, rounds: MEM_ROUNDS });
      for (let round = 1; round <= MEM_ROUNDS; round++) {
        p.current = { variant, round, song: label };
        save(p);
        onProgress({ ...p });
        labBeat({ status: 'memtest', song: label, next: `${variant} ${round}/${MEM_ROUNDS}` });
        const t0 = performance.now();
        const buf = await fetchAudio(song.id);
        const fileMB = Math.round(buf.byteLength / 1e5) / 10;
        const ctx = variant === 'shared' ? (shared ??= new OfflineAudioContext(2, 1, RATE)) : new OfflineAudioContext(2, 1, RATE);
        const decoded = await ctx.decodeAudioData(buf);
        if (variant === 'play') await playSilently(live, decoded, disposeKeepingBuffer);
        else if (variant === 'release') await playSilently(live, decoded, disposeDeck);
        else if (variant === 'reuse') await playSilently(live, intoReused(decoded), disposeKeepingBuffer);
        if (round === 1 || round % 5 === 0) {
          labLog('memtest round', { variant, round, fileMB, sec: Math.round(decoded.duration), sr: decoded.sampleRate, ms: Math.round(performance.now() - t0) });
        }
        await sleep(400);
      }
      p.results[variant] = 'ok';
      p.current = undefined;
      save(p);
      onProgress({ ...p });
      labLog('memtest passed', { variant, rounds: MEM_ROUNDS });
    }
    labBeat({ status: 'idle' });
    labLog('memtest results', p.results as Record<string, unknown>);
  } finally {
    running = false;
  }
}
