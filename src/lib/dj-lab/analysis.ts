/**
 * Track analysis for the Transition Lab (#345): beat grid, bar lines, per-bar band levels, drops.
 *
 * A browser port of what mix_set.py reads from librosa + bar_profile (docs/design/dj-transitions/):
 * - tempo from the onset autocorrelation, then a windowed phasor fit of the kick onsets → a sub-ms
 *   constant-tempo grid (period + phase), like run_fit's least-squares line through the beats;
 * - bar lines on the main drop's downbeat (g2d, "the bar fix track is goated"), not on beat 0;
 * - per-bar dB of the low / kick / mid / full / K-weighted bands, then first/last beat bar,
 *   mixable intro/outro, the main drop and every drop, exactly as bar_profile + drops_of do.
 * Works on a mono signal at any rate ≥ 8 kHz (the Lab decodes candidates at 11025 Hz).
 */
import {
  cascade,
  frameEnergy,
  highpass,
  lowpass,
  meanOf,
  median,
  onsetFromEnergy,
  parabolic,
  percentile,
  spanDb,
} from './dsp';

export const ANALYSIS_VERSION = 1;

export interface TrackAnalysis {
  version: number;
  /** seconds */
  duration: number;
  /** native tempo */
  bpm: number;
  /** time of the first bar line (s) */
  bar0: number;
  /** seconds per bar at the native tempo */
  barLen: number;
  nBars: number;
  /** 0–1: how cleanly the onsets sit on the grid (phasor strength) */
  gridConf: number;
  /** p90 of the windowed phase fit's residual, ms (lower = steadier tempo) */
  gridP90Ms: number | null;
  /** how the bar phase was found: on the main drop's jump, or from bar-line bass onsets */
  downbeat: 'drop' | 'flux';
  /** per-bar dB: lows 40–150 Hz, kick band 40–200, mids 300–3000, full, K-weighted */
  el: number[];
  ek: number[];
  eh: number[];
  ef: number[];
  kw: number[];
  first: number;
  last: number;
  intro: number;
  outro: number;
  drop: number | null;
  drops: number[];
  /** entry drop: where a drop-chain brings this track in (mix_set's De) */
  de: number;
}

export interface AnalyseOptions {
  /** tempo tag or set tempo; narrows the octave choice */
  bpmHint?: number;
}

export const barTime = (a: Pick<TrackAnalysis, 'bar0' | 'barLen'>, bar: number) => a.bar0 + bar * a.barLen;
export const barAt = (a: Pick<TrackAnalysis, 'bar0' | 'barLen'>, t: number) => (t - a.bar0) / a.barLen;

const MIN_BPM = 70;
const MAX_BPM = 190;

function bandEnergy(mono: Float32Array, sr: number, hop: number, filters: ReturnType<typeof lowpass>[]) {
  return frameEnergy(cascade(mono, filters), hop);
}

/** Coarse tempo: autocorrelation of the onset envelope, harmonic-enhanced, under a log-tempo prior. */
export function coarseTempo(o: Float32Array, fps: number, hint?: number): number {
  // half resolution is plenty for the coarse pick and keeps this ~10 ms
  const n = Math.floor(o.length / 2);
  const x = new Float32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    x[i] = o[2 * i] + o[2 * i + 1];
    m += x[i];
  }
  m /= n || 1;
  for (let i = 0; i < n; i++) x[i] -= m;
  const f2 = fps / 2;
  const lagMin = Math.floor((60 * f2) / MAX_BPM) - 1;
  const lagMax = Math.ceil((2 * 60 * f2) / MIN_BPM) + 2;
  const ac = new Float32Array(lagMax + 1);
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 === 0) return hint ?? 120;
  for (let L = Math.max(1, lagMin); L <= lagMax && L < n; L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += x[i] * x[i + L];
    ac[L] = s / e0;
  }
  const acAt = (L: number) => {
    const i = Math.floor(L);
    if (i < 1 || i + 1 > lagMax) return 0;
    const f = L - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  const center = hint ?? 128;
  const sigma = hint ? 0.3 : 0.9;
  let best = hint ?? 120;
  let bestScore = -Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.05) {
    const L = (60 * f2) / bpm;
    const s = Math.max(0, acAt(L) + 0.5 * acAt(2 * L));
    const w = Math.exp(-0.5 * (Math.log2(bpm / center) / sigma) ** 2);
    if (s * w > bestScore) {
      bestScore = s * w;
      best = bpm;
    }
  }
  return best;
}

interface GridFit {
  period: number;
  t0: number;
  conf: number;
  p90Ms: number | null;
}

export interface Peak {
  /** seconds */
  t: number;
  /** onset height */
  w: number;
}

/**
 * Onset peaks: local maxima over ±`halfWin` s, timed to a fraction of a frame. The phasor fit uses
 * these rather than the raw envelope, whose ripple over a kick's low sine would drag the phase late.
 */
export function pickPeaks(o: Float32Array, fps: number, halfWin = 0.05): Peak[] {
  const w = Math.max(1, Math.round(halfWin * fps));
  let max = 0;
  for (let i = 0; i < o.length; i++) if (o[i] > max) max = o[i];
  const thr = 0.05 * max;
  const peaks: Peak[] = [];
  for (let i = 1; i < o.length - 1; i++) {
    const v = o[i];
    if (v < thr || v < o[i - 1] || v < o[i + 1]) continue;
    let isMax = true;
    for (let j = Math.max(0, i - w); j <= Math.min(o.length - 1, i + w); j++) {
      if (o[j] > v || (o[j] === v && j < i)) {
        isMax = false;
        break;
      }
    }
    if (isMax) peaks.push({ t: (i + parabolic(o, i)) / fps, w: v });
  }
  return peaks;
}

/** Phasor of the peaks at period P: magnitude/weight = how well they sit on one grid, angle = its phase. */
export function coherence(peaks: Peak[], P: number, from = 0, to = Infinity) {
  let zr = 0;
  let zi = 0;
  let sum = 0;
  for (const p of peaks) {
    if (p.t < from || p.t >= to) continue;
    const ang = (-2 * Math.PI * p.t) / P;
    zr += p.w * Math.cos(ang);
    zi += p.w * Math.sin(ang);
    sum += p.w;
  }
  let theta = -Math.atan2(zi, zr) / (2 * Math.PI);
  theta -= Math.floor(theta);
  return { c: sum ? Math.hypot(zr, zi) / sum : 0, phase: theta * P };
}

/**
 * Kick attacks, not the kick's centre of mass. A sidechained bass swells back ~50 ms after each kick
 * and shows up as a second peak in the kick band, which drags the phasor late by 10–20 ms. Per beat,
 * take the earliest peak at least half as strong as that beat's strongest; the phase is their
 * weighted median offset from the coarse grid.
 */
export function attackPhase(peaks: Peak[], P: number, phase0: number): number {
  const groups = new Map<number, Peak[]>();
  for (const p of peaks) {
    const k = Math.round((p.t - phase0) / P);
    const off = p.t - (phase0 + k * P);
    if (Math.abs(off) > P / 3) continue;
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  const offs: { off: number; w: number }[] = [];
  for (const [k, g] of groups) {
    const max = Math.max(...g.map((p) => p.w));
    const first = g.filter((p) => p.w >= 0.5 * max).sort((x, y) => x.t - y.t)[0];
    offs.push({ off: first.t - (phase0 + k * P), w: max });
  }
  if (offs.length < 8) return phase0;
  offs.sort((x, y) => x.off - y.off);
  const half = offs.reduce((s, o) => s + o.w, 0) / 2;
  let acc = 0;
  for (const o of offs) {
    acc += o.w;
    if (acc >= half) return phase0 + o.off;
  }
  return phase0;
}

/**
 * Constant-tempo grid through the onset peaks: the period (within ±1.5 % of the coarse tempo) at which
 * every kick of the whole track lands on one grid, and that grid's phase. Over a 4-minute track a
 * 0.05 % period error already smears the kicks by a third of a beat, so the peak is sharp.
 * The residual is the p90 of 16-beat windows' phase against the global grid (tempo drift, live edits).
 */
export function fitGrid(peaks: Peak[], duration: number, bpm0: number): GridFit {
  const P0 = 60 / bpm0;
  let bestP = P0;
  let bestC = -1;
  for (let r = -0.015; r <= 0.015; r += 0.0002) {
    const { c } = coherence(peaks, P0 * (1 + r));
    if (c > bestC) {
      bestC = c;
      bestP = P0 * (1 + r);
    }
  }
  // refine around the winner
  const step = P0 * 0.0002;
  for (let d = -step; d <= step; d += step / 20) {
    const { c } = coherence(peaks, bestP + d);
    if (c > bestC) {
      bestC = c;
      bestP = bestP + d;
    }
  }
  const P = bestP;
  const phase = attackPhase(peaks, P, coherence(peaks, P).phase);
  const res: number[] = [];
  for (let s = 0; s + 16 * P <= duration; s += 8 * P) {
    const w = coherence(peaks, P, s, s + 16 * P);
    // breakdowns: too few or too scattered peaks to say anything about the phase
    if (w.c < 0.4 || peaks.filter((p) => p.t >= s && p.t < s + 16 * P).length < 8) continue;
    let d = w.phase - phase;
    d -= P * Math.round(d / P);
    res.push(Math.abs(d) * 1000);
  }
  return { period: P, t0: phase, conf: bestC, p90Ms: res.length >= 3 ? percentile(res, 90) : null };
}

/**
 * The beat a drop hits near beat index `center`, like mix_set's drop_downbeat: the first beat where
 * the low end crosses halfway from the breakdown level to the drop level (and stays). Null when
 * there's no clear ≥4 dB jump there.
 */
export function dropBeatNear(elBeat: number[], center: number): number | null {
  if (center < 8 || center + 8 > elBeat.length) return null;
  const E = elBeat.slice(center - 8, center + 8);
  const L0 = median(E.slice(0, 4));
  const L1 = median(E.slice(12, 16));
  if (L1 - L0 < 4) return null;
  const thr = (L0 + L1) / 2;
  for (let j = 4; j < 13; j++) {
    if (E[j] > thr && E[j + 1] > thr) return center - 8 + j;
  }
  return null;
}

/**
 * Which beat of the bar is the downbeat (0–3, counted from the first grid beat): the beat the track's
 * biggest bass jump hits. Falls back to the beat with the most bass onsets. analyseTrack then re-grids
 * on the entry drop itself (g2d), since a track can shift its phrase between sections.
 */
export function downbeatOffset(elBeat: number[]): { offset: number; how: 'drop' | 'flux' } {
  const n = elBeat.length;
  const hi = percentile(elBeat, 60);
  let best = -Infinity;
  let bi = -1;
  for (let i = 8; i + 16 <= n; i++) {
    const post = meanOf(elBeat, i, i + 16);
    if (post < hi - 1) continue;
    const jump = post - meanOf(elBeat, i - 8, i);
    if (jump > best) {
      best = jump;
      bi = i;
    }
  }
  if (bi >= 0 && best >= 4) {
    const k = dropBeatNear(elBeat, bi);
    if (k !== null) return { offset: k % 4, how: 'drop' };
  }
  const score = [0, 0, 0, 0];
  for (let i = 1; i < n; i++) score[i % 4] += Math.max(0, elBeat[i] - elBeat[i - 1]);
  return { offset: score.indexOf(Math.max(...score)), how: 'flux' };
}

/** bar_profile's section logic on per-bar dB arrays. */
export function sections(el: number[], ek: number[], eh: number[], ef: number[]) {
  const n = el.length;
  const kHi = percentile(ek, 75);
  const hMed = median(eh);
  const beat = ek.map((v) => v > kHi - 12);
  const sparse = eh.map((v) => v < hMed - 1.5);
  let first = beat.indexOf(true);
  if (first < 0) first = 0;
  let last = beat.lastIndexOf(true);
  if (last < 0) last = n - 1;
  let intro = 0;
  let miss = 0;
  for (let i = first; i < n; i++) {
    if (beat[i] && sparse[i]) intro++;
    else if (beat[i] && miss === 0) {
      miss++;
      intro++;
    } else break;
  }
  let outro = 0;
  miss = 0;
  for (let i = last; i >= 0; i--) {
    if (beat[i] && sparse[i]) outro++;
    else if (beat[i] && miss === 0) {
      miss++;
      outro++;
    } else break;
  }
  const hiLo = percentile(el, 60);
  let drop: number | null = null;
  let dropScore = -Infinity;
  for (let k = first + 8; k < Math.min(first + 81, n - 8); k++) {
    // 1 dB of slack (mix_set has none): when the drops are the loudest 40 % of a track, p60 sits on
    // the drop level itself and the real drop bar loses to its neighbour by a rounding error
    if (meanOf(el, k, k + 8) <= hiLo - 1) continue;
    const s = meanOf(el, k, k + 8) - meanOf(el, k - 4, k) + 0.5 * (meanOf(ef, k, k + 8) - meanOf(ef, k - 4, k));
    if (s > dropScore) {
      dropScore = s;
      drop = k;
    }
  }
  // drops_of: every drop = ≥8 bars of full low end right after ≥4 bars sitting 4.5 dB+ under it,
  // on the main drop's 4-bar grid
  const hi = percentile(el.slice(first, last + 1), 60);
  const ref = drop ?? first;
  const drops: number[] = [];
  for (let b = first + 8; b < last - 7; b++) {
    if ((((b - ref) % 4) + 4) % 4) continue;
    if (meanOf(el, b, b + 8) > hi - 1 && meanOf(el, b - 4, b) < hi - 4.5 && (!drops.length || b - drops[drops.length - 1] >= 16)) {
      drops.push(b);
    }
  }
  // entry drop: the main drop if 32 bars of track follow it, else the latest drop that has them
  const cands = [...new Set([...drops, ...(drop !== null ? [drop] : [])])].sort((a, b) => a - b);
  const fits = cands.filter((d) => d + 32 <= last - 1);
  const main = drop ?? cands[0] ?? first + 8;
  const de = fits.includes(main) || fits.length === 0 ? main : fits[fits.length - 1];
  return { first, last, intro, outro, drop, drops, de };
}

/** Full analysis of a mono signal. ~0.3 s for a 5-minute track at 11025 Hz. */
export function analyseTrack(mono: Float32Array, sr: number, opts: AnalyseOptions = {}): TrackAnalysis {
  const hop = Math.max(8, Math.round(sr / 344.53));
  const fps = sr / hop;
  const duration = mono.length / sr;
  const eKick = bandEnergy(mono, sr, hop, [highpass(40, sr), lowpass(200, sr), lowpass(200, sr)]);
  const eLow = bandEnergy(mono, sr, hop, [highpass(40, sr), lowpass(150, sr), lowpass(150, sr)]);
  const midTop = Math.min(3000, sr * 0.4);
  const eMid = bandEnergy(mono, sr, hop, [highpass(300, sr), highpass(300, sr), lowpass(midTop, sr), lowpass(midTop, sr)]);
  const eHigh = bandEnergy(mono, sr, hop, [highpass(midTop, sr), highpass(midTop, sr)]);
  const eFull = frameEnergy(mono, hop);
  // rough BS.1770 K-weighting, as mix_set's kweight: drop the sub rumble, lift the top ~4 dB
  const h = cascade(mono, [highpass(60, sr)]);
  const h2 = cascade(h, [highpass(1500, sr)]);
  for (let i = 0; i < h.length; i++) h[i] += 0.585 * h2[i];
  const eKw = frameEnergy(h, hop);

  // loudness-relative onsets: the kick dominates its band, quiet off-beat hats don't
  const oKick = onsetFromEnergy(eKick, 4, 2, 'log');
  const oMid = onsetFromEnergy(eMid, 4, 2, 'log');
  const oHigh = onsetFromEnergy(eHigh, 4, 2, 'log');
  const oAll = new Float32Array(oKick.length);
  for (let i = 0; i < oAll.length; i++) oAll[i] = oKick[i] + 0.5 * oMid[i] + 0.25 * oHigh[i];
  // The grid comes from the kick's attack band alone (90–250 Hz, linear energy, see onsetFromEnergy).
  // Below 90 Hz the sub-bass and its sidechain swell blur the kick: on 36 tracks from the Peak Time and
  // BOO sets, 40–200 Hz put the bass-music grids 200–340 ms off and scored half the kick coherence.
  const eAttack = bandEnergy(mono, sr, hop, [highpass(90, sr), highpass(90, sr), lowpass(250, sr), lowpass(250, sr)]);
  const oGrid = onsetFromEnergy(eAttack, 4, 2, 'lin');

  const bpm0 = coarseTempo(oAll, fps, opts.bpmHint);
  const fit = fitGrid(pickPeaks(oGrid, fps), duration, bpm0);
  // the onset (4-frame average, 2-frame rise) peaks ~2 frames after the attack; put the grid on the attack
  const grid = { ...fit, t0: fit.t0 - 2 / fps };
  const P = grid.period;

  // per-beat lows → bar phase on the drop's downbeat
  const nBeats = Math.max(0, Math.floor((duration - grid.t0) / P));
  // windows start an eighth of a beat early, so a kick on the beat counts for its own beat even when
  // the grid sits a few ms late (onset delay), never as a bleed into the beat before
  const lead = P / 8;
  const elBeat: number[] = [];
  for (let k = 0; k < nBeats; k++) {
    const t = grid.t0 + k * P - lead;
    elBeat.push(spanDb(eLow, t * fps, (t + P) * fps));
  }
  const db = downbeatOffset(elBeat);
  const barLen = 4 * P;

  const profile = (offset: number) => {
    let bar0 = grid.t0 + offset * P;
    if (bar0 < 0) bar0 += barLen;
    const nBars = Math.max(0, Math.floor((duration - bar0) / barLen));
    const el: number[] = [];
    const ek: number[] = [];
    const eh: number[] = [];
    const ef: number[] = [];
    const kw: number[] = [];
    for (let i = 0; i < nBars; i++) {
      const a = (bar0 + i * barLen - lead) * fps;
      const b = (bar0 + (i + 1) * barLen - lead) * fps;
      el.push(spanDb(eLow, a, b));
      ek.push(spanDb(eKick, a, b));
      eh.push(spanDb(eMid, a, b));
      ef.push(spanDb(eFull, a, b));
      kw.push(spanDb(eKw, a, b));
    }
    const sec = nBars >= 24
      ? sections(el, ek, eh, ef)
      : { first: 0, last: Math.max(0, nBars - 1), intro: 0, outro: 0, drop: null, drops: [], de: 0 };
    return { bar0, nBars, el, ek, eh, ef, kw, ...sec };
  };

  let offset = db.offset;
  let prof = profile(offset);
  // g2d: drop-chain lands B's entry drop on A's bar line, so the bar lines must sit on that drop's own
  // downbeat (a track can shift its phrase by a beat between sections)
  const atDe = dropBeatNear(elBeat, offset + 4 * prof.de);
  if (atDe !== null && atDe % 4 !== offset) {
    offset = atDe % 4;
    prof = profile(offset);
  }
  const { bar0, nBars, el, ek, eh, ef, kw, ...sec } = prof;

  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    version: ANALYSIS_VERSION,
    duration,
    bpm: 60 / P,
    bar0,
    barLen,
    nBars,
    gridConf: round(grid.conf),
    gridP90Ms: grid.p90Ms === null ? null : round(grid.p90Ms),
    downbeat: db.how,
    el: el.map(round),
    ek: ek.map(round),
    eh: eh.map(round),
    ef: ef.map(round),
    kw: kw.map(round),
    ...sec,
  };
}

/** K-weighted level of the 16 bars after the entry drop: the per-drop loudness match target (g2c). */
export function dropLevelDb(a: TrackAnalysis, from = a.de): number {
  const vals = a.kw.slice(from, from + 16);
  if (!vals.length) return median(a.kw);
  return 10 * Math.log10(vals.reduce((s, v) => s + 10 ** (v / 10), 0) / vals.length);
}
