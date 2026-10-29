/**
 * Continuous mix by locking the next song (#334 / #345), in the browser.
 *
 * One deck plays; once the next song is locked the engine decodes it, plans the transition with the
 * drop-chain rules (plan.ts), measures the phase lock on the actual overlap (lock.ts) and schedules
 * B's start, rate and band automation on the audio clock. B is locked from then on: AI DJ / autoplay
 * can't swap it. Unlocking is allowed until a few seconds before the blend starts ("committed").
 * When A is gone, B becomes the playing deck and the next song can be locked.
 *
 * Vinyl stretch: every track plays at set tempo / its tempo via playbackRate (pitch moves with it,
 * capped at ±8 %). Separate from the app's player: it pauses that one while it plays.
 */
import { barAt, barTime, dropLevelDb, type TrackAnalysis } from './analysis';
import { analyseSong, fetchAudio, monoSegment, type LabSong } from './crate';
import { createDeck, createMaster, disposeDeck, placeTransition, resetGains, scheduleIncoming, scheduleOutgoing, type DeckNodes, type PlacedTransition } from './graph';
import { measureLock, type LockResult } from './lock';
import { planTransition, type MixMode, type Recipe, type TransitionPlan } from './plan';

export interface LoadedTrack {
  song: LabSong;
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
}

export type NextState = 'loading' | 'locked' | 'committed' | 'mixing' | 'failed';

export interface NextInfo {
  song: LabSong;
  state: NextState;
  analysis?: TrackAnalysis;
  plan?: TransitionPlan;
  lock?: LockResult;
  placed?: PlacedTransition;
  /** rule-1 or flam-risk notes for the UI */
  notes: string[];
  error?: string;
}

export interface NowInfo {
  song: LabSong;
  analysis: TrackAnalysis;
  rate: number;
  /** A's entry drop: the floor for its exit (0 for the opener) */
  floorBar: number;
}

export interface HistoryEntry {
  song: LabSong;
  /** ctx time it became audible */
  at: number;
  /** how it came in */
  plan?: TransitionPlan;
  lock?: LockResult;
  from?: LabSong;
}

export interface EngineSnapshot {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  setBpm: number;
  mode: MixMode;
  autoLock: boolean;
  now?: NowInfo;
  next?: NextInfo;
  history: HistoryEntry[];
  message?: string;
}

interface LiveDeck {
  track: LoadedTrack;
  nodes: DeckNodes;
  rate: number;
  /** ctx time at which the deck was at `trackStart` */
  ctxStart: number;
  trackStart: number;
}

/** seconds from "lock" to the earliest blend start: decode + schedule margin */
const LEAD_SEC = 8;
/** unlock refused this close to the blend */
const COMMIT_SEC = 3;
const TRIM_LIMIT_DB = 6;

const posAt = (d: LiveDeck, t: number) => d.trackStart + (t - d.ctxStart) * d.rate;
const timeAt = (d: LiveDeck, p: number) => d.ctxStart + (p - d.trackStart) / d.rate;

export class LabEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cur: LiveDeck | null = null;
  private nxt: LiveDeck | null = null;
  private nextTrack: LoadedTrack | null = null;
  private lockToken = 0;
  private refLevel = 0;
  private skipped = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snap: EngineSnapshot = { status: 'idle', setBpm: 126, mode: 'dropchain', autoLock: true, history: [] };
  /** picks the next song when auto-lock is on (the page ranks the crate) */
  private pickNext: ((now: NowInfo, played: Set<string>) => LabSong | null) | null = null;
  /** called before the Lab starts sound, so the app's own player can pause */
  private onBeforePlay: (() => void) | null = null;

  setPicker(fn: (now: NowInfo, played: Set<string>) => LabSong | null) {
    this.pickNext = fn;
  }

  setOnBeforePlay(fn: () => void) {
    this.onBeforePlay = fn;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private set(patch: Partial<EngineSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  private setNext(patch: Partial<NextInfo> | undefined) {
    this.set({ next: patch === undefined ? undefined : ({ ...this.snap.next, ...patch } as NextInfo) });
  }

  get audioContext() {
    return this.ctx;
  }

  /** Create/resume the AudioContext. Call synchronously inside a tap (iOS). */
  unlockAudio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      this.master = createMaster(this.ctx);
      // keep playing with the screen locked where Safari allows it
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    }
    void this.ctx.resume();
    return this.ctx;
  }

  setMode(mode: MixMode) {
    this.set({ mode });
  }

  setAutoLock(autoLock: boolean) {
    this.set({ autoLock });
  }

  /** The set tempo only changes between sets: every deck plays at it. */
  setSetBpm(bpm: number) {
    if (this.snap.status === 'idle') this.set({ setBpm: bpm });
  }

  async loadTrack(song: LabSong, hint?: number): Promise<LoadedTrack> {
    const ctx = this.unlockAudio();
    const buf = await fetchAudio(song.id);
    const [buffer, analysis] = await Promise.all([ctx.decodeAudioData(buf.slice(0)), analyseSong(song, hint, buf)]);
    return { song, buffer, analysis };
  }

  private trimDb(a: TrackAnalysis) {
    return Math.max(-TRIM_LIMIT_DB, Math.min(TRIM_LIMIT_DB, this.refLevel - dropLevelDb(a)));
  }

  /** Start a set on `song`, from its first bar (or `fromBar`). */
  async start(song: LabSong, fromBar?: number) {
    this.stop();
    const ctx = this.unlockAudio();
    this.skipped.clear();
    this.set({ status: 'loading', message: `Loading ${song.title}…`, history: [], next: undefined, now: undefined });
    const token = ++this.lockToken;
    let track: LoadedTrack;
    try {
      track = await this.loadTrack(song, this.snap.setBpm);
    } catch (e) {
      this.set({ status: 'idle', message: `Couldn't load ${song.title}: ${(e as Error).message}` });
      return;
    }
    if (token !== this.lockToken) return;
    const a = track.analysis;
    const rate = this.snap.setBpm / a.bpm;
    if (Math.abs(rate - 1) > 0.08) {
      this.set({ status: 'idle', message: `${song.title} is ${a.bpm.toFixed(1)} BPM, more than 8 % from the set tempo` });
      return;
    }
    this.refLevel = dropLevelDb(a);
    this.onBeforePlay?.();
    const nodes = createDeck(ctx, track.buffer, this.master!, 0);
    nodes.src.playbackRate.value = rate;
    const offset = fromBar ? Math.max(0, barTime(a, fromBar)) : 0;
    const when = ctx.currentTime + 0.15;
    nodes.src.start(when, offset);
    this.cur = { track, nodes, rate, ctxStart: when, trackStart: offset };
    this.set({
      status: 'playing',
      message: undefined,
      now: { song, analysis: a, rate, floorBar: 0 },
      history: [{ song, at: when }],
    });
    this.startTimer();
    this.maybeAutoLock();
  }

  /** Lock `song` as the next track: decode, plan, check the lock, schedule. */
  async lock(song: LabSong, recipe?: Recipe) {
    if (!this.cur || !this.ctx) return;
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    this.cancelNext();
    const token = ++this.lockToken;
    this.setNext({ song, state: 'loading', notes: [], plan: undefined, lock: undefined, placed: undefined, analysis: undefined, error: undefined });
    let track: LoadedTrack;
    try {
      track = await this.loadTrack(song, this.snap.setBpm);
    } catch (e) {
      if (token === this.lockToken) this.setNext({ state: 'failed', error: (e as Error).message });
      return;
    }
    if (token !== this.lockToken || !this.cur) return;
    this.schedule(track, recipe);
  }

  private schedule(track: LoadedTrack, recipe?: Recipe) {
    const ctx = this.ctx!;
    const cur = this.cur!;
    const A = cur.track.analysis;
    const B = track.analysis;
    const song = track.song;
    const rateB0 = this.snap.setBpm / B.bpm;
    if (Math.abs(rateB0 - 1) > 0.08) {
      this.setNext({ state: 'failed', analysis: B, error: `${B.bpm.toFixed(1)} BPM is more than 8 % from the set tempo` });
      return;
    }
    const fromBar = Math.ceil(barAt(A, posAt(cur, ctx.currentTime + LEAD_SEC)));
    const plan = planTransition(A, B, {
      mode: this.snap.mode,
      fromBar,
      floorBar: this.snap.now?.floorBar ?? 0,
      setBpm: this.snap.setBpm,
      recipe,
    });
    if (!plan) {
      this.setNext({ state: 'failed', analysis: B, error: 'No exit left in this track for that song' });
      return;
    }
    const lock = lockFor(cur.track, track, plan, cur.rate);
    const notes: string[] = [];
    if (plan.kind === 'chain' && !lock.verified) {
      // rule 1: never overlap two kick lines without a verified lock — hold B's build back
      plan.hold = Math.min(4, plan.N);
      notes.push("Lock unverified: B's build held to the last 4 bars (rule 1)");
    } else if (plan.bass === 'sweep' && !lock.verified) {
      notes.push('Lock unverified: the blend overlaps kicks (flam risk)');
    }
    const useLock = lock.verified || lock.points >= 3 ? lock : null;
    const tEntry = timeAt(cur, barTime(A, plan.entryA));
    const placed = placeTransition(A, B, plan, tEntry, cur.rate, useLock);
    const nodes = createDeck(ctx, track.buffer, this.master!, this.trimDb(B));
    nodes.src.playbackRate.value = placed.bRate;
    scheduleIncoming(nodes, plan, tEntry, placed.barSec);
    nodes.src.start(placed.bWhen, placed.bOffset);
    scheduleOutgoing(cur.nodes, plan, tEntry, placed.barSec);
    this.nxt = { track, nodes, rate: placed.bRate, ctxStart: placed.bWhen, trackStart: placed.bOffset };
    this.nextTrack = track;
    this.setNext({ song, state: 'locked', analysis: B, plan, lock, placed, notes, error: undefined });
  }

  /** Drop the locked song (only before it's committed). */
  unlock() {
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    // auto-lock won't pick a song you just unlocked
    if (this.snap.next) this.skipped.add(this.snap.next.song.id);
    this.lockToken++;
    this.cancelNext();
    this.setNext(undefined);
  }

  private cancelNext() {
    if (this.nxt) disposeDeck(this.nxt.nodes);
    this.nxt = null;
    this.nextTrack = null;
    if (this.cur && this.ctx) resetGains(this.cur.nodes, this.ctx.currentTime);
  }

  /** Re-plan the locked song with another recipe (A/B winner, or a manual override). */
  async relock(recipe?: Recipe) {
    const track = this.nextTrack;
    if (!track || !this.cur) return;
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    this.cancelNext();
    this.schedule(track, recipe);
  }

  pause() {
    if (this.ctx && this.snap.status === 'playing') {
      void this.ctx.suspend();
      this.set({ status: 'paused' });
    }
  }

  resume() {
    if (this.ctx && this.snap.status === 'paused') {
      this.onBeforePlay?.();
      void this.ctx.resume();
      this.set({ status: 'playing' });
    }
  }

  stop() {
    this.lockToken++;
    if (this.nxt) disposeDeck(this.nxt.nodes);
    if (this.cur) disposeDeck(this.cur.nodes);
    this.nxt = null;
    this.cur = null;
    this.nextTrack = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ status: 'idle', now: undefined, next: undefined });
  }

  /** Jump the playing deck to `bars` bars before the locked transition (or forward 16 bars). */
  skipAhead(bars = 6) {
    const ctx = this.ctx;
    const cur = this.cur;
    if (!ctx || !cur) return;
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    const A = cur.track.analysis;
    const plan = this.snap.next?.plan;
    const target = plan ? barTime(A, plan.entryA - bars) : posAt(cur, ctx.currentTime) + 16 * A.barLen;
    if (target <= posAt(cur, ctx.currentTime) || target >= cur.track.buffer.duration - 1) return;
    // restart A's source at the new position, then re-place B on the new clock
    const old = cur.nodes.src;
    const src = ctx.createBufferSource();
    src.buffer = cur.track.buffer;
    src.playbackRate.value = cur.rate;
    src.connect(cur.nodes.hp[0]);
    const when = ctx.currentTime + 0.05;
    try {
      old.stop(when);
    } catch {
      // already stopped
    }
    src.start(when, target);
    cur.nodes.src = src;
    cur.ctxStart = when;
    cur.trackStart = target;
    const track = this.nextTrack;
    const lock = this.snap.next?.lock;
    if (track && plan) {
      if (this.nxt) disposeDeck(this.nxt.nodes);
      resetGains(cur.nodes, ctx.currentTime);
      const tEntry = timeAt(cur, barTime(A, plan.entryA));
      const useLock = lock && (lock.verified || lock.points >= 3) ? lock : null;
      const placed = placeTransition(A, track.analysis, plan, tEntry, cur.rate, useLock);
      const nodes = createDeck(ctx, track.buffer, this.master!, this.trimDb(track.analysis));
      nodes.src.playbackRate.value = placed.bRate;
      scheduleIncoming(nodes, plan, tEntry, placed.barSec);
      nodes.src.start(placed.bWhen, placed.bOffset);
      scheduleOutgoing(cur.nodes, plan, tEntry, placed.barSec);
      this.nxt = { track, nodes, rate: placed.bRate, ctxStart: placed.bWhen, trackStart: placed.bOffset };
      this.setNext({ placed });
    }
  }

  /** Track position (s) of the playing / locked deck, for the playheads. */
  position(which: 'now' | 'next'): number | null {
    const d = which === 'now' ? this.cur : this.nxt;
    if (!d || !this.ctx) return null;
    return posAt(d, this.ctx.currentTime);
  }

  /** Seconds until the locked blend starts (negative once it has). */
  secondsToBlend(): number | null {
    const p = this.snap.next?.placed;
    return p && this.ctx ? p.tEntry - this.ctx.currentTime : null;
  }

  private startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 200);
  }

  private tick() {
    const ctx = this.ctx;
    const cur = this.cur;
    if (!ctx || !cur) return;
    const t = ctx.currentTime;
    const next = this.snap.next;
    if (next?.placed && this.nxt) {
      if (next.state === 'locked' && t >= next.placed.tEntry - COMMIT_SEC) this.setNext({ state: 'committed' });
      if (next.state !== 'mixing' && t >= next.placed.bWhen) this.setNext({ state: 'mixing' });
      if (t >= next.placed.tEnd) this.promote();
      return;
    }
    if (posAt(cur, t) >= cur.track.buffer.duration) {
      // played out with nothing locked
      disposeDeck(cur.nodes);
      this.cur = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.set({ status: 'idle', now: undefined, message: 'Set ended: nothing was locked next' });
    }
  }

  private promote() {
    const cur = this.cur!;
    const nxt = this.nxt!;
    const next = this.snap.next!;
    disposeDeck(cur.nodes);
    this.cur = nxt;
    this.nxt = null;
    this.nextTrack = null;
    this.set({
      now: { song: nxt.track.song, analysis: nxt.track.analysis, rate: nxt.rate, floorBar: next.plan!.deB },
      next: undefined,
      history: [...this.snap.history, { song: nxt.track.song, at: next.placed!.bWhen, plan: next.plan, lock: next.lock, from: cur.track.song }],
    });
    this.maybeAutoLock();
  }

  /** With auto-lock on and nothing locked, lock the best pick (also called when the crate grows). */
  maybeAutoLock() {
    if (!this.snap.autoLock || !this.pickNext || !this.snap.now || this.snap.next || this.snap.status !== 'playing') return;
    const played = new Set([...this.snap.history.map((h) => h.song.id), ...this.skipped]);
    const song = this.pickNext(this.snap.now, played);
    if (song) void this.lock(song);
  }
}

/** Phase-lock check for a planned transition, on the decoded audio of both decks. */
export function lockFor(A: LoadedTrack, B: LoadedTrack, plan: TransitionPlan, rateA: number): LockResult {
  const a = A.analysis;
  const b = B.analysis;
  const rateB = b.barLen / (a.barLen / rateA);
  const overlap = (plan.N * a.barLen) / rateA;
  const aStart = barTime(a, plan.entryA);
  const bStart = barTime(b, plan.cueB);
  const segA = monoSegment(A.buffer, aStart - 1, aStart + overlap * rateA + 1);
  const segB = monoSegment(B.buffer, bStart - 1.5, bStart + overlap * rateB + 1.5);
  return measureLock({
    a: segA.x,
    aSr: A.buffer.sampleRate,
    aStart: aStart - segA.t0,
    b: segB.x,
    bSr: B.buffer.sampleRate,
    bStart: bStart - segB.t0,
    rateA,
    rateB,
    overlap,
  });
}

let engine: LabEngine | null = null;
/** One engine per page load: the set keeps playing while you browse the app. */
export function getLabEngine(): LabEngine {
  engine ??= new LabEngine();
  return engine;
}
