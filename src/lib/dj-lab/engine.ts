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
import { analyseSong, fetchAudio, getCachedAnalysis, isPhone, monoSegment, type LabSong } from './crate';
import { createDeck, createMaster, disposeDeck, placeTransition, resetGains, scheduleIncoming, scheduleOutgoing, type DeckNodes, type PlacedTransition } from './graph';
import { measureLock, type LockResult } from './lock';
import { describeRecipe, planTransition, type MixMode, type Recipe, type TransitionPlan } from './plan';
import { labBeat, labBusy, labLog } from './log';
import { saveSet } from './sets';

export interface LoadedTrack {
  song: LabSong;
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
}

export type NextState = 'loading' | 'locked' | 'committed' | 'mixing' | 'failed';

/** The next-transition picker (#375): unset = the rules decide */
export type Choices = Pick<Recipe, 'exit' | 'entry' | 'bass' | 'bars'>;
export type ChoiceKey = keyof Choices;

/** Set-wide defaults, kept per device */
export interface LabDefaults {
  /** the opener runs to its end before the first transition */
  openerPlaysOut: boolean;
  /** next songs come in on their first drop */
  preferFirstDrop: boolean;
  /** tempo window for the next track (#378): how much slower / faster than what's playing, % */
  tempoDown: number;
  tempoUp: number;
  /** phones: hold the decks in mono, half the memory */
  phoneMono: boolean;
}

const DEFAULTS_KEY = 'aidj:dj-lab:defaults';
const NO_DEFAULTS: LabDefaults = { openerPlaysOut: false, preferFirstDrop: false, tempoDown: 4, tempoUp: 4, phoneMono: false };

export interface NextInfo {
  song: LabSong;
  state: NextState;
  /** the recipe it was planned with */
  recipe?: Recipe;
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
  recipe?: Recipe;
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
  /** what the next transition should do; cleared after it plays unless pinned */
  choices: Choices;
  pinned: ChoiceKey[];
  defaults: LabDefaults;
  /** the AudioContext's state ("interrupted" on iOS when a call or another app takes the audio) */
  audio?: string;
}

/** while a set should be playing but iOS has stopped its audio, try to resume this often */
const RESUME_RETRY_MS = 3000;

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
const AUTO_FAIL_LIMIT = 3;

/** a heartbeat for the flight recorder this often while a set runs */
const BEAT_MS = 5000;

/** decks decode at this rate on a phone (the AudioContext resamples on playback) */
const PHONE_DECK_RATE = 32000;
let phoneCtx: OfflineAudioContext | null = null;
const phoneDecoder = () => (phoneCtx ??= new OfflineAudioContext(2, 1, PHONE_DECK_RATE));

/** One channel, the average of all: the stereo buffer becomes garbage right away. */
function toMono(b: AudioBuffer): AudioBuffer {
  if (b.numberOfChannels === 1) return b;
  const mono = new AudioBuffer({ numberOfChannels: 1, length: b.length, sampleRate: b.sampleRate });
  const out = mono.getChannelData(0);
  const k = 1 / b.numberOfChannels;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const ch = b.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i] * k;
  }
  return mono;
}

const posAt = (d: LiveDeck, t: number) => d.trackStart + (t - d.ctxStart) * d.rate;
const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;
const bufferMB = (b: AudioBuffer) => mb(b.length * b.numberOfChannels * 4);
const songLabel = (s: LabSong) => `${s.artist} – ${s.title}`;
const timeAt = (d: LiveDeck, p: number) => d.ctxStart + (p - d.trackStart) / d.rate;

export class LabEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cur: LiveDeck | null = null;
  private nxt: LiveDeck | null = null;
  private nextTrack: LoadedTrack | null = null;
  private lockToken = 0;
  /** the download in flight for the opener or the next song: unlock, a new lock or stop cancels it */
  private loadAbort: AbortController | null = null;
  private refLevel = 0;
  private skipped = new Set<string>();
  /** auto-picks that failed in a row; auto-lock pauses at AUTO_FAIL_LIMIT */
  private autoFails = 0;
  private setId = '';
  private setStartedAt = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  /** tick health: wall/audio clock at the last tick, last heartbeat, last clock-stall report */
  private lastTick: { wall: number; ctx: number } | null = null;
  /** performance.now() of the last heartbeat (same clock as checkHealth) */
  private lastBeat = 0;
  private lastStall = -Infinity;
  /** last automatic resume attempt, and when the audio stopped (performance.now()) */
  private lastResumeTry = 0;
  private lastResumeLog = -Infinity;
  private audioStoppedAt: number | null = null;
  private listeners = new Set<() => void>();
  private snap: EngineSnapshot = {
    status: 'idle',
    setBpm: 126,
    mode: 'dropchain',
    autoLock: true,
    history: [],
    choices: {},
    pinned: [],
    defaults: NO_DEFAULTS,
  };
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
    const historyChanged = patch.history && patch.history !== this.snap.history;
    this.snap = { ...this.snap, ...patch };
    if (historyChanged) this.persist(this.snap.history);
    for (const fn of this.listeners) fn();
  }

  /** Save the set's tracklist (this browser), so Stop or a reload doesn't lose it. */
  private persist(history: HistoryEntry[]) {
    if (!this.setId || !history.length) return;
    const t0 = history[0].at;
    saveSet({
      id: this.setId,
      startedAt: this.setStartedAt,
      updatedAt: new Date().toISOString(),
      setBpm: this.snap.setBpm,
      mode: this.snap.mode,
      tracks: history.map((h) => ({
        id: h.song.id,
        title: h.song.title,
        artist: h.song.artist,
        at: Math.max(0, h.at - t0),
        kind: h.plan?.kind,
        bars: h.plan?.N,
        lockMs: h.lock?.p90Ms ?? null,
        locked: h.lock?.verified,
        choice: h.recipe ? describeRecipe(h.recipe) || undefined : undefined,
      })),
    });
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
      const ctx = new AudioContext({ latencyHint: 'playback' });
      this.ctx = ctx;
      this.master = createMaster(ctx);
      // keep playing with the screen locked where Safari allows it
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      labLog('audio context', { sampleRate: ctx.sampleRate, state: ctx.state, baseLatency: ctx.baseLatency, audioSession: nav.audioSession?.type });
      ctx.addEventListener('statechange', () => {
        const bad = ctx.state !== 'running' && this.snap.status === 'playing';
        const now = performance.now();
        if (bad && this.audioStoppedAt === null) this.audioStoppedAt = now;
        const stoppedSec = ctx.state === 'running' && this.audioStoppedAt !== null ? Math.round((now - this.audioStoppedAt) / 100) / 10 : undefined;
        if (ctx.state === 'running') this.audioStoppedAt = null;
        labLog('audio context state', { state: ctx.state, t: ctx.currentTime, status: this.snap.status, stoppedSec }, bad ? 'warn' : 'info');
        this.set({ audio: ctx.state });
      });
      // iOS can leave the context suspended after an interruption (a call, Siri, another app's audio)
      const retry = (why: string) => {
        if (this.snap.status === 'playing' && ctx.state !== 'running') this.tryResume(ctx, why);
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') retry('back in view');
      });
      window.addEventListener('pageshow', () => retry('page shown'));
      window.addEventListener('focus', () => retry('focus'));
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

  /** Read the per-device defaults (client only: call from an effect, so SSR and hydration agree). */
  loadDefaults() {
    try {
      const d = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null') as Partial<LabDefaults> | null;
      if (d) this.set({ defaults: { ...NO_DEFAULTS, ...d } });
    } catch {
      // no storage: defaults stay off
    }
  }

  setDefaults(patch: Partial<LabDefaults>) {
    const defaults = { ...this.snap.defaults, ...patch };
    try {
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
    } catch {
      // still applies this session
    }
    this.set({ defaults });
    this.replanIfOpen();
  }

  /** Set (or clear, with undefined) one choice for the next transition; re-plans a locked song in time. */
  setChoice<K extends ChoiceKey>(key: K, value: Choices[K] | undefined) {
    const choices: Choices = { ...this.snap.choices };
    if (value === undefined) delete choices[key];
    else choices[key] = value;
    this.set({ choices });
    this.replanIfOpen();
  }

  /** 📌 keep a choice for the rest of the set instead of just the next transition */
  togglePin(key: ChoiceKey) {
    const pinned = this.snap.pinned.includes(key) ? this.snap.pinned.filter((k) => k !== key) : [...this.snap.pinned, key];
    this.set({ pinned });
  }

  /** The recipe the next lock uses: your choices, then the set defaults, then the rules. */
  recipe(): Recipe {
    const c = this.snap.choices;
    const d = this.snap.defaults;
    const opener = this.snap.history.length <= 1;
    return {
      ...c,
      exit: c.exit ?? (d.openerPlaysOut && opener ? 'end' : undefined),
      entry: c.entry ?? (d.preferFirstDrop ? 'first-drop' : undefined),
    };
  }

  private replanIfOpen() {
    if (this.snap.next?.state === 'locked' && this.nextTrack) void this.relock();
  }

  /** The set tempo only changes between sets: every deck plays at it. */
  setSetBpm(bpm: number) {
    if (this.snap.status === 'idle') this.set({ setBpm: bpm });
  }

  /**
   * Fetch + decode for playback; the analysis is the crate scan's cached one when there is one.
   * `signal` cancels the download, and skips the decode if it fires first.
   */
  async loadTrack(song: LabSong, signal?: AbortSignal): Promise<LoadedTrack> {
    const ctx = this.unlockAudio();
    const label = songLabel(song);
    const done = labBusy(`load ${label}`);
    const t0 = performance.now();
    try {
      const buf = await fetchAudio(song.id, signal);
      const fileMB = mb(buf.byteLength);
      const t1 = performance.now();
      // the crate scan has usually analysed it already: then decode the download itself, no copy
      // (a FLAC is 25–55 MB, and phones run out of memory)
      const cached = await getCachedAnalysis(song.id);
      signal?.throwIfAborted();
      // a phone decodes the decks at 32 kHz: ~27 % less memory per deck than 44.1 kHz (a 6-minute
      // extended mix is ~130 MB at 44.1 kHz), at the cost of the band above 16 kHz; in mono, half again
      const phone = isPhone();
      const decoded = await (phone ? phoneDecoder() : ctx).decodeAudioData(cached ? buf : buf.slice(0));
      const buffer = phone && this.snap.defaults.phoneMono ? toMono(decoded) : decoded;
      const t2 = performance.now();
      signal?.throwIfAborted();
      const analysis = cached ?? (await analyseSong(song, undefined, buf));
      signal?.throwIfAborted();
      labLog('loaded', {
        song: label,
        fileMB,
        fetchMs: Math.round(t1 - t0),
        decodeMs: Math.round(t2 - t1),
        decodedMB: bufferMB(buffer),
        sec: Math.round(buffer.duration),
        sr: buffer.sampleRate,
        analysis: cached ? 'cached' : 'decoded',
        heldMB: this.heldMB() + bufferMB(buffer),
      });
      return { song, buffer, analysis };
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      if (signal?.aborted) labLog('load cancelled', { song: label, ms });
      else labLog('load failed', { song: label, error: (e as Error).message, ms }, 'warn');
      throw e;
    } finally {
      done();
    }
  }

  /** A fresh signal for the next load; cancels the one before. */
  private newLoad(): AbortSignal {
    this.abortLoad();
    this.loadAbort = new AbortController();
    return this.loadAbort.signal;
  }

  private abortLoad() {
    this.loadAbort?.abort();
    this.loadAbort = null;
  }

  /** Decoded audio the engine holds (MB): the playing deck, the locked one. */
  private heldMB(): number {
    const bufs = new Set([this.cur?.track.buffer, this.nxt?.track.buffer, this.nextTrack?.buffer].filter((b): b is AudioBuffer => !!b));
    return Math.round([...bufs].reduce((n, b) => n + bufferMB(b), 0) * 10) / 10;
  }

  private trimDb(a: TrackAnalysis) {
    return Math.max(-TRIM_LIMIT_DB, Math.min(TRIM_LIMIT_DB, this.refLevel - dropLevelDb(a)));
  }

  /** Start a set on `song`, from its first bar (or `fromBar`). */
  async start(song: LabSong, fromBar?: number) {
    this.stop();
    const ctx = this.unlockAudio();
    this.skipped.clear();
    this.autoFails = 0;
    this.set({ choices: {}, pinned: [] });
    this.setId = `${Date.now().toString(36)}`;
    this.setStartedAt = new Date().toISOString();
    this.set({ status: 'loading', message: `Loading ${song.title}…`, history: [], next: undefined, now: undefined });
    const token = ++this.lockToken;
    labLog('set start', { song: songLabel(song), setBpm: this.snap.setBpm, mode: this.snap.mode, fromBar });
    let track: LoadedTrack;
    try {
      track = await this.loadTrack(song, this.newLoad());
    } catch (e) {
      if (token === this.lockToken) this.set({ status: 'idle', message: `Couldn't load ${song.title}: ${(e as Error).message}` });
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
  async lock(song: LabSong, recipe?: Recipe, auto = false) {
    if (!this.cur || !this.ctx) return;
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    // swapping out the locked song (often the auto-pick) means you didn't want it: don't re-pick it
    const replaced = this.snap.next?.song.id;
    if (replaced && replaced !== song.id) this.skipped.add(replaced);
    this.cancelNext();
    const token = ++this.lockToken;
    labLog('lock', { song: songLabel(song), auto });
    this.setNext({ song, state: 'loading', notes: [], plan: undefined, lock: undefined, placed: undefined, analysis: undefined, error: undefined });
    let track: LoadedTrack;
    try {
      track = await this.loadTrack(song, this.newLoad());
    } catch (e) {
      // a cancelled load (unlocked, replaced, stopped) has a newer token: nothing to report
      if (token === this.lockToken) this.failLock(song, (e as Error).message, auto);
      return;
    }
    if (token !== this.lockToken || !this.cur) return;
    try {
      this.schedule(track, { ...this.recipe(), ...recipe }, auto);
    } catch (e) {
      // scheduling errors (Web Audio automation) fail this lock visibly instead of an unhandled rejection
      this.failLock(song, `couldn't schedule: ${(e as Error).message}`, auto);
    }
  }

  private schedule(track: LoadedTrack, recipe?: Recipe, auto = false) {
    const ctx = this.ctx!;
    const cur = this.cur!;
    const A = cur.track.analysis;
    const B = track.analysis;
    const song = track.song;
    const rateB0 = this.snap.setBpm / B.bpm;
    if (Math.abs(rateB0 - 1) > 0.08) {
      this.failLock(song, `${B.bpm.toFixed(1)} BPM is more than 8 % from the set tempo`, auto);
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
      this.failLock(song, 'No exit left in this track for that song', auto);
      return;
    }
    const lock = lockFor(cur.track, track, plan, cur.rate);
    const notes: string[] = [];
    if (plan.unmet) notes.push(plan.unmet);
    // a build over A's beats: a chain, or B's drop landing as A plays out
    const buildOverBeats = plan.kind === 'chain' || (plan.kind === 'playout' && plan.S === plan.N);
    if (buildOverBeats && !lock.verified) {
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
    this.setNext({ song, state: 'locked', analysis: B, plan, lock, placed, notes, error: undefined, recipe });
    labLog('locked', {
      song: songLabel(song),
      kind: plan.kind,
      bars: plan.N,
      inSec: Math.round(placed.tEntry - ctx.currentTime),
      lockMs: lock.p90Ms,
      verified: lock.verified,
      choice: recipe ? describeRecipe(recipe) || undefined : undefined,
      notes: notes.length ? notes.join('; ') : undefined,
      heldMB: this.heldMB(),
    });
    this.autoFails = 0;
    if (this.snap.message) this.set({ message: undefined });
  }

  /**
   * A song that can't be locked is skipped. An auto-pick moves on to the next pick, up to
   * AUTO_FAIL_LIMIT in a row (then auto-lock waits for you). A song you picked shows why it failed.
   */
  private failLock(song: LabSong, error: string, auto: boolean) {
    labLog('lock failed', { song: songLabel(song), error, auto, autoFails: this.autoFails }, 'warn');
    this.skipped.add(song.id);
    if (auto && this.snap.autoLock && this.pickNext && ++this.autoFails < AUTO_FAIL_LIMIT) {
      this.set({ next: undefined, message: `Skipped ${song.title}: ${error}` });
      this.maybeAutoLock();
      return;
    }
    if (auto && this.autoFails >= AUTO_FAIL_LIMIT) {
      this.set({ message: `Auto-lock paused: ${AUTO_FAIL_LIMIT} picks in a row couldn't lock (${error}). Lock one by hand.` });
    }
    this.setNext({ song, state: 'failed', error });
  }

  /** Drop the locked song (only before it's committed). */
  unlock() {
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    // auto-lock won't pick a song you just unlocked
    if (this.snap.next) {
      labLog('unlock', { song: songLabel(this.snap.next.song) });
      this.skipped.add(this.snap.next.song.id);
    }
    this.lockToken++;
    this.cancelNext();
    this.setNext(undefined);
  }

  private cancelNext() {
    this.abortLoad();
    if (this.nxt) disposeDeck(this.nxt.nodes);
    this.nxt = null;
    this.nextTrack = null;
    if (this.cur && this.ctx) {
      try {
        resetGains(this.cur.nodes, this.ctx.currentTime);
      } catch (e) {
        console.warn('[Lab] resetting the exit failed', e);
      }
    }
  }

  /** Re-plan the locked song: with the current choices, or an explicit recipe on top (A/B winner). */
  async relock(recipe?: Recipe) {
    const track = this.nextTrack;
    if (!track || !this.cur) return;
    const st = this.snap.next?.state;
    if (st === 'committed' || st === 'mixing') return;
    labLog('relock', { song: songLabel(track.song), recipe: recipe ? describeRecipe(recipe) : undefined });
    this.cancelNext();
    this.schedule(track, { ...this.recipe(), ...recipe });
  }

  pause() {
    if (this.ctx && this.snap.status === 'playing') {
      labLog('pause');
      void this.ctx.suspend();
      this.set({ status: 'paused' });
    }
  }

  resume() {
    if (this.ctx && this.snap.status === 'paused') {
      labLog('resume', { ctx: this.ctx.state });
      this.onBeforePlay?.();
      void this.ctx.resume();
      this.set({ status: 'playing' });
    }
  }

  stop() {
    if (this.snap.status !== 'idle') labLog('stop', { tracks: this.snap.history.length });
    const next = this.snap.next;
    if (next?.state === 'mixing' && this.cur && next.placed) {
      this.set({ history: [...this.snap.history, { song: next.song, at: next.placed.bWhen, plan: next.plan, lock: next.lock, from: this.cur.track.song }] });
    }
    this.lockToken++;
    this.abortLoad();
    if (this.nxt) disposeDeck(this.nxt.nodes);
    if (this.cur) disposeDeck(this.cur.nodes);
    this.nxt = null;
    this.cur = null;
    this.nextTrack = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ status: 'idle', now: undefined, next: undefined });
    this.beat();
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
    labLog('skip ahead', { from: Math.round(posAt(cur, ctx.currentTime)), to: Math.round(target) });
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
    this.lastTick = null;
    this.timer = setInterval(() => this.tick(), 200);
  }

  /** Heartbeat for the flight recorder: a page that dies mid-set leaves this behind. */
  private beat() {
    this.lastBeat = performance.now();
    const cur = this.cur;
    labBeat({
      status: this.snap.status,
      song: this.snap.now ? songLabel(this.snap.now.song) : undefined,
      pos: cur && this.ctx ? Math.round(posAt(cur, this.ctx.currentTime)) : undefined,
      next: this.snap.next ? `${this.snap.next.state} ${songLabel(this.snap.next.song)}` : undefined,
      ctx: this.ctx?.state,
      heldMB: this.heldMB(),
    });
  }

  /**
   * Resume after iOS stopped the audio mid-set. Fails quietly while the interruption lasts (another
   * app still has the audio); the next try or a tap on the live bar gets it back.
   */
  private tryResume(ctx: AudioContext, why: string) {
    const now = performance.now();
    this.lastResumeTry = now;
    // retries every few seconds through a long interruption: log the first, then twice a minute
    if (why !== 'retry' || now - this.lastResumeLog >= 30_000) {
      this.lastResumeLog = now;
      labLog('resuming audio', { why, state: ctx.state }, 'warn');
    }
    ctx.resume().catch((e: Error) => labLog('audio resume refused', { why, error: e.message }, 'warn'));
  }

  /** Timers stopped (page in the background) or the audio clock stopped while it should run. */
  private checkHealth(ctx: AudioContext) {
    const wall = performance.now();
    const last = this.lastTick;
    this.lastTick = { wall, ctx: ctx.currentTime };
    if (wall - this.lastBeat >= BEAT_MS) this.beat();
    if (this.snap.status === 'playing' && ctx.state !== 'running' && wall - this.lastResumeTry >= RESUME_RETRY_MS) {
      this.tryResume(ctx, 'retry');
    }
    if (!last || this.snap.status !== 'playing') return;
    const wallGap = (wall - last.wall) / 1000;
    const ctxGap = ctx.currentTime - last.ctx;
    if (wallGap > 2) {
      labLog('timer gap', { wallSec: wallGap, audioSec: ctxGap, ctx: ctx.state, visibility: document.visibilityState }, 'warn');
    } else if (wallGap > 1 && ctxGap < 0.05 && wall - this.lastStall > 30_000) {
      this.lastStall = wall;
      labLog('audio clock stalled', { wallSec: wallGap, audioSec: ctxGap, ctx: ctx.state, visibility: document.visibilityState }, 'warn');
    }
  }

  private tick() {
    const ctx = this.ctx;
    const cur = this.cur;
    if (!ctx || !cur) return;
    this.checkHealth(ctx);
    const t = ctx.currentTime;
    const next = this.snap.next;
    if (next?.placed && this.nxt) {
      if (next.state === 'locked' && t >= next.placed.tEntry - COMMIT_SEC) {
        labLog('committed', { song: songLabel(next.song) });
        this.setNext({ state: 'committed' });
      }
      if (next.state !== 'mixing' && t >= next.placed.bWhen) {
        labLog('mixing', { song: songLabel(next.song), kind: next.plan?.kind });
        this.setNext({ state: 'mixing' });
      }
      if (t >= next.placed.tEnd) this.promote();
      return;
    }
    if (posAt(cur, t) >= cur.track.buffer.duration) {
      // played out with nothing locked
      labLog('set ended: nothing locked', { song: songLabel(cur.track.song), next: next ? `${next.state} ${songLabel(next.song)}` : undefined }, 'warn');
      disposeDeck(cur.nodes);
      this.cur = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.set({ status: 'idle', now: undefined, message: 'Set ended: nothing was locked next' });
      this.beat();
    }
  }

  private promote() {
    this.autoFails = 0;
    const cur = this.cur!;
    const nxt = this.nxt!;
    const next = this.snap.next!;
    disposeDeck(cur.nodes);
    this.cur = nxt;
    this.nxt = null;
    this.nextTrack = null;
    labLog('now playing', { song: songLabel(nxt.track.song), from: songLabel(cur.track.song), heldMB: this.heldMB() });
    this.set({
      now: { song: nxt.track.song, analysis: nxt.track.analysis, rate: nxt.rate, floorBar: next.plan!.deB },
      next: undefined,
      history: [...this.snap.history, { song: nxt.track.song, at: next.placed!.bWhen, plan: next.plan, lock: next.lock, from: cur.track.song, recipe: next.recipe }],
      // the choices this transition used are spent, unless 📌 pinned; ones changed after it was
      // committed are for the next transition and stay
      choices: Object.fromEntries(
        Object.entries(this.snap.choices).filter(([k, v]) => this.snap.pinned.includes(k as ChoiceKey) || next.recipe?.[k as ChoiceKey] !== v),
      ) as Choices,
    });
    this.maybeAutoLock();
  }

  /** With auto-lock on and nothing locked, lock the best pick (also called when the crate grows). */
  maybeAutoLock() {
    if (!this.snap.autoLock || !this.pickNext || !this.snap.now || this.snap.next || this.snap.status !== 'playing') return;
    if (this.autoFails >= AUTO_FAIL_LIMIT) return;
    const played = new Set([...this.snap.history.map((h) => h.song.id), ...this.skipped]);
    const song = this.pickNext(this.snap.now, played);
    if (song) void this.lock(song, undefined, true);
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
