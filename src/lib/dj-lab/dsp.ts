/**
 * Small DSP kit for the Transition Lab (#345): RBJ biquads, framed band energy, onset envelopes.
 * Pure functions on Float32Arrays so the analysis runs the same in the browser and in vitest.
 */

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function normalize(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** RBJ cookbook low-pass. Two in series at Q 0.707 ≈ a 4th-order (24 dB/oct) split. */
export function lowpass(fc: number, sr: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * fc) / sr;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  return normalize((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

export function highpass(fc: number, sr: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * fc) / sr;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  return normalize((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

/** Filter into a new array (or into `out`, which may be `x` itself). Direct form II transposed. */
export function biquad(x: Float32Array, c: Biquad, out: Float32Array = new Float32Array(x.length)): Float32Array {
  let z1 = 0;
  let z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    out[i] = y;
  }
  return out;
}

/** Run a cascade of biquads, allocating one output array. */
export function cascade(x: Float32Array, cs: Biquad[]): Float32Array {
  const out = new Float32Array(x.length);
  if (cs.length === 0) {
    out.set(x);
    return out;
  }
  biquad(x, cs[0], out);
  for (let i = 1; i < cs.length; i++) biquad(out, cs[i], out);
  return out;
}

/** Mean square per non-overlapping frame of `hop` samples. */
export function frameEnergy(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = f * hop;
    for (let i = a; i < a + hop; i++) s += x[i] * x[i];
    e[f] = s / hop;
  }
  return e;
}

export const toDb = (meanSquare: number) => 10 * Math.log10(meanSquare + 1e-12);

/**
 * Onset strength from framed energy: smooth over `win` frames, compress, then the half-wave rectified
 * rise over `lag` frames. A kick shows up as one sharp peak a few ms wide.
 *
 * 'lin' is the energy rise relative to the band's loud level: in the kick band the kick outweighs an
 * off-beat bassline ~5:1, so the beat phase can't flip to the off-beat (mix_set needed HPSS for that).
 * 'log' compresses relative to the band's loud level (log1p(100·E/E99)), so a quiet hat in an
 * otherwise empty band stays small. 'db' is scale-free: every event counts the same however quiet,
 * which is what the lock check wants on a short window.
 */
export function onsetFromEnergy(e: Float32Array, win = 4, lag = 2, mode: 'db' | 'log' | 'lin' = 'db'): Float32Array {
  const n = e.length;
  const sm = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += e[i];
    if (i >= win) acc -= e[i - win];
    sm[i] = acc / Math.min(i + 1, win);
  }
  const y = new Float32Array(n);
  if (mode === 'log' || mode === 'lin') {
    const ref = percentile(sm.filter((_, i) => i % 7 === 0), 99) || 1e-12;
    for (let i = 0; i < n; i++) y[i] = mode === 'log' ? Math.log1p((100 * sm[i]) / ref) : sm[i] / ref;
  } else {
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      y[i] = toDb(sm[i]);
      if (y[i] > max) max = y[i];
    }
    const floor = max - 80;
    for (let i = 0; i < n; i++) y[i] = Math.max(y[i], floor);
  }
  const o = new Float32Array(n);
  for (let i = lag; i < n; i++) {
    const d = y[i] - y[i - lag];
    o[i] = d > 0 ? d : 0;
  }
  return o;
}

/** dB of the mean of energy frames [a, b). */
export function spanDb(e: Float32Array, a: number, b: number): number {
  const lo = Math.max(0, Math.floor(a));
  const hi = Math.min(e.length, Math.ceil(b));
  if (hi <= lo) return -120;
  let s = 0;
  for (let i = lo; i < hi; i++) s += e[i];
  return toDb(s / (hi - lo));
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Array.from(values).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) return NaN;
  const idx = (p / 100) * (a.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export const median = (values: ArrayLike<number>) => percentile(values, 50);

/** Mean of values[a..b), clamped to the array. */
export function meanOf(values: ArrayLike<number>, a: number, b: number): number {
  const lo = Math.max(0, a);
  const hi = Math.min(values.length, b);
  if (hi <= lo) return NaN;
  let s = 0;
  for (let i = lo; i < hi; i++) s += values[i];
  return s / (hi - lo);
}

/** Linear interpolation of an evenly sampled series at fractional index `x` (0 outside). */
export function sampleAt(series: Float32Array, x: number): number {
  if (x < 0 || x > series.length - 1) return 0;
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < series.length ? series[i] * (1 - f) + series[i + 1] * f : series[i];
}

/** Pearson correlation of two equal-length arrays (0 if either is flat). */
export function corr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Parabolic peak refinement around index i of y; returns the fractional offset in [-0.5, 0.5]. */
export function parabolic(y: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= y.length - 1) return 0;
  const y0 = y[i - 1];
  const y1 = y[i];
  const y2 = y[i + 1];
  const d = y0 - 2 * y1 + y2;
  if (d === 0) return 0;
  const off = (0.5 * (y0 - y2)) / d;
  return Math.max(-0.5, Math.min(0.5, off));
}
