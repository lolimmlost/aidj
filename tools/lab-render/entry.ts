/**
 * Offline render of a saved Lab set (#392), in the browser, with the Lab's own code: every transition placed at the
 * cues the set saved (plan.ts, graph.ts, the beat lock), the timeline rendered a window at a time in an
 * OfflineAudioContext through the Lab's master bus. Driven by render.mjs in headless Chromium.
 *
 * Windows are cut only in the quiet stretch between one transition's automation and the next one's start, so a
 * transition always renders whole; each window has a pre-roll so the master's compressor has settled at the join.
 * A song is decoded once (stereo for playback, mono for analysis, as the Lab does) and let go when it's done.
 */
import { analyseTrack, barTime, dropLevelDb, fitOctave, type TrackAnalysis } from '../../src/lib/dj-lab/analysis';
import { decodeMono, MAX_STRETCH } from '../../src/lib/dj-lab/crate';
import { lockFor } from '../../src/lib/dj-lab/engine';
import { createDeck, createMaster, placeTransition, scheduleIncoming, scheduleOutgoing } from '../../src/lib/dj-lab/graph';
import { planJump, planTransition, type TransitionPlan } from '../../src/lib/dj-lab/plan';
import type { SavedSet, SavedTrack } from '../../src/lib/dj-lab/sets';

const SR = 44100;
const TRIM_LIMIT_DB = 6;
/** seconds rendered before each window and thrown away: the compressor settles */
const PRE = 2;
/** a slice handed to node at a time (s) */
const SLICE = 10;

interface Track {
  t: SavedTrack;
  buffer: AudioBuffer;
  native: TrackAnalysis;
  analysis: TrackAnalysis;
}

interface Deck {
  track: Track;
  /** global time its source starts, its buffer offset then, its playback rate */
  gStart: number;
  offset: number;
  rate: number;
  trimDb: number;
  /** the transition that brings it in */
  inPlan?: TransitionPlan;
  inEntry?: number;
  inBarSec?: number;
  /** its own automation is over by then (scheduleIncoming runs to max(N, S + 4) + 2 bars) */
  busyUntil: number;
  /** the transition that takes it out */
  outPlan?: TransitionPlan;
  outEntry?: number;
  outBarSec?: number;
  /** global time it's gone */
  end: number;
}

export interface RenderReport {
  tracks: number;
  seconds: number;
  windows: number;
  transitions: { song: string; kind: string; bars: number; at: number; planned: 'cues' | 'fresh'; lock: string; jump?: string }[];
  tracklist: { at: number; song: string }[];
}

type Emit = (b64: string) => Promise<void>;

const label = (t: SavedTrack) => `${t.artist} – ${t.title}`;
const round1 = (v: number) => Math.round(v * 10) / 10;

async function load(t: SavedTrack, bpmHint?: number): Promise<Track> {
  const res = await fetch(`/audio/${encodeURIComponent(t.id)}`);
  if (!res.ok) throw new Error(`audio ${t.id}: ${res.status}`);
  const bytes = await res.arrayBuffer();
  const buffer = await new OfflineAudioContext(2, 1, SR).decodeAudioData(bytes.slice(0));
  // the analysis the Lab makes (crate.ts analyseSong): mono at its low rate, the tagged tempo as the hint
  const { mono, sr } = await decodeMono(bytes);
  const native = analyseTrack(mono, sr, { bpmHint });
  return { t, buffer, native, analysis: native };
}

/** interleaved 16-bit PCM, base64, for node */
function pcm16(L: Float32Array, R: Float32Array): string {
  const out = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
    out[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
  }
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Render the global time span [w0, w1) of the decks that sound in it. */
async function renderWindow(decks: Deck[], w0: number, w1: number, emit: Emit) {
  const base = w0 - PRE;
  const ctx = new OfflineAudioContext(2, Math.ceil((w1 - base) * SR), SR);
  const master = createMaster(ctx).input;
  for (const d of decks) {
    if (d.gStart >= w1 || d.end <= base) continue;
    const nodes = createDeck(ctx, d.track.buffer, master, d.trimDb);
    nodes.src.playbackRate.value = d.rate;
    // a transition that ended before this window left the deck as createDeck makes it: gains 1, filters open
    if (d.inPlan && d.inEntry !== undefined && d.inEntry >= base) scheduleIncoming(nodes, d.inPlan, d.inEntry - base, d.inBarSec!);
    if (d.outPlan && d.outEntry !== undefined && d.outEntry < w1) scheduleOutgoing(nodes, d.outPlan, d.outEntry - base, d.outBarSec!);
    const at = d.gStart - base;
    if (at >= 0) nodes.src.start(at, d.offset);
    else nodes.src.start(0, d.offset + -at * d.rate);
  }
  const out = await ctx.startRendering();
  const from = Math.round(PRE * SR);
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  for (let i = from; i < out.length; i += SLICE * SR) {
    const to = Math.min(out.length, i + SLICE * SR);
    await emit(pcm16(L.subarray(i, to), R.subarray(i, to)));
  }
}

export async function renderSet(set: SavedSet, bpmTags: Record<string, number | undefined>, emit: Emit, maxTracks = Infinity): Promise<RenderReport> {
  const tracks = set.tracks.slice(0, maxTracks);
  let setBpm = set.setBpm;
  const report: RenderReport = { tracks: tracks.length, seconds: 0, windows: 0, transitions: [], tracklist: [] };

  const first = await load(tracks[0], bpmTags[tracks[0].id]);
  first.analysis = fitOctave(first.native, setBpm);
  const refLevel = dropLevelDb(first.analysis);
  let cur: Deck = { track: first, gStart: 0, offset: 0, rate: setBpm / first.analysis.bpm, trimDb: 0, busyUntil: 0, end: Infinity };
  let decks: Deck[] = [cur];
  report.tracklist.push({ at: 0, song: label(tracks[0]) });
  let w0 = 0;

  for (let k = 1; k < tracks.length; k++) {
    const t = tracks[k];
    const B = await load(t, bpmTags[t.id]);
    const A = cur.track.analysis;
    const fitted = fitOctave(B.native, setBpm);
    const c = t.cues;
    const jump = c ? c.kind === 'jump' : Math.abs(setBpm / fitted.bpm - 1) > MAX_STRETCH;
    B.analysis = jump ? B.native : fitted;
    let plan: TransitionPlan | null;
    let planned: 'cues' | 'fresh' = 'cues';
    if (c) {
      plan = {
        mode: t.recipe?.mode ?? set.mode,
        kind: c.kind,
        N: c.N,
        S: c.S,
        entryA: c.entryA,
        cueB: c.cueB,
        bass: c.bass,
        kill: c.kill,
        depth: t.recipe?.depth,
        hold: c.hold ?? 0,
        endA: c.endA,
        deB: c.deB,
        lift: null,
        breakdown: null,
        how: 'saved cues',
        jump: c.jump ?? (jump ? { fromBpm: setBpm, toBpm: B.native.bpm, fadeB: Math.round(((c.N * B.native.bpm) / setBpm) * 100) / 100 } : undefined),
      };
    } else {
      // a set saved before cues were kept: plan it as the Lab would from A's entry drop
      planned = 'fresh';
      const o = { mode: set.mode, fromBar: A.de, floorBar: k === 1 ? 0 : A.de, setBpm, recipe: t.recipe };
      plan = jump ? planJump(A, B.analysis, o) : planTransition(A, B.analysis, o);
    }
    if (!plan) throw new Error(`no transition into ${label(t)}`);
    // the beat lock: as saved, else measured on the decoded audio the way the engine does
    let lock: { shift: number; drift: number } | null = null;
    let lockNote = 'none';
    if (t.lockShift !== undefined) {
      lock = { shift: t.lockShift, drift: t.lockDrift ?? 0 };
      lockNote = 'saved';
    } else if (!plan.jump) {
      const l = lockFor({ song: { id: '', title: '', artist: '', duration: 0 }, buffer: cur.track.buffer, analysis: A }, { song: { id: '', title: '', artist: '', duration: 0 }, buffer: B.buffer, analysis: B.analysis }, plan, cur.rate);
      if (!c || c.hold === undefined) {
        const buildOverBeats = plan.kind === 'chain' || (plan.kind === 'playout' && plan.S === plan.N);
        plan.hold = buildOverBeats && !l.verified ? Math.min(4, plan.N) : 0;
      }
      if (l.verified || l.points >= 3) lock = l;
      lockNote = `${l.verified ? 'verified' : 'unverified'} ${l.points} pts`;
    }
    const tEntry = cur.gStart + (barTime(A, plan.entryA) - cur.offset) / cur.rate;
    const p = placeTransition(A, B.analysis, plan, tEntry, cur.rate, lock);
    cur.outPlan = plan;
    cur.outEntry = tEntry;
    cur.outBarSec = p.barSec;
    cur.end = p.tEnd;
    const trimDb = Math.max(-TRIM_LIMIT_DB, Math.min(TRIM_LIMIT_DB, refLevel - dropLevelDb(B.analysis)));
    const next: Deck = {
      track: B,
      gStart: p.bWhen,
      offset: p.bOffset,
      rate: p.bRate,
      trimDb,
      inPlan: plan,
      inEntry: tEntry,
      inBarSec: p.barSecB,
      busyUntil: tEntry + (Math.max(plan.N, plan.S + 4) + 2) * p.barSecB,
      end: Infinity,
    };
    report.transitions.push({
      song: label(t),
      kind: plan.kind,
      bars: plan.N,
      at: Math.round(p.bWhen),
      planned,
      lock: lockNote,
      jump: plan.jump ? `${plan.jump.fromBpm} → ${round1(plan.jump.toBpm)}` : undefined,
    });
    report.tracklist.push({ at: Math.round(p.bWhen), song: label(t) });
    if (plan.jump) setBpm = round1(plan.jump.toBpm);

    // cut a window in the quiet stretch before this transition, once the last one's automation is over
    const lastBusy = cur.busyUntil;
    const cut = tEntry - 1;
    if (cut - PRE > lastBusy && cut > w0 + 5) {
      await renderWindow(decks, w0, cut, emit);
      report.windows++;
      w0 = cut;
      // let go of songs that are over
      decks = decks.filter((d) => d.end > w0 - PRE);
    }
    decks.push(next);
    cur = next;
  }
  // the last song plays out
  cur.end = cur.gStart + (cur.track.buffer.duration - cur.offset) / cur.rate;
  await renderWindow(decks, w0, cur.end, emit);
  report.windows++;
  report.seconds = Math.round(cur.end);
  return report;
}

(window as unknown as { renderSet: typeof renderSet }).renderSet = renderSet;
