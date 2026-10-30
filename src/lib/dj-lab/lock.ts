/**
 * Phase-lock check for one transition (#345), mix_set.py step 4 in the browser.
 *
 * Both decks are resampled onto the played timeline (vinyl: track time = start + rate × played time).
 * Their transient envelopes are cross-correlated in 2 s windows across the overlap. That gives a
 * shift to apply to B, a linear drift (tiny tempo error, applied as a rate trim), and the residual
 * p90. Rule 1: two kick lines only overlap with a verified lock (p90 ≤ 3 ms on ≥ 5 points).
 */
import { biquad, corr, frameEnergy, highpass, lowpass, median, onsetFromEnergy, parabolic, percentile, sampleAt } from './dsp';

export interface LockInput {
  /** mono signals and their rates */
  a: Float32Array;
  aSr: number;
  b: Float32Array;
  bSr: number;
  /** track time (s) of each deck at the blend start */
  aStart: number;
  bStart: number;
  rateA: number;
  rateB: number;
  /** overlap length in played seconds */
  overlap: number;
}

export interface LockResult {
  /** advance B by this much played time at the blend start (s) */
  shift: number;
  /** extra advance per played second across the blend (trim B's rate by this factor) */
  drift: number;
  p90Ms: number | null;
  points: number;
  verified: boolean;
}

export const LOCK_P90_MS = 3;
export const LOCK_MIN_POINTS = 5;

/** played-time frame rate of the envelopes: ~0.73 ms */
const PFPS = 1378;

function envelope(x: Float32Array, sr: number, lowOnly: boolean): { env: Float32Array; fps: number } {
  const hop = Math.max(4, Math.round(sr / PFPS));
  const y = new Float32Array(x.length);
  if (lowOnly) {
    biquad(x, highpass(40, sr), y);
    biquad(y, lowpass(160, sr), y);
  } else {
    biquad(x, highpass(60, sr), y);
    biquad(y, lowpass(Math.min(8000, sr * 0.45), sr), y);
  }
  return { env: onsetFromEnergy(frameEnergy(y, hop), 4, 2), fps: sr / hop };
}

/** Envelope of one deck on the played-time grid τ = τ0 + j / PFPS. */
function playedEnvelope(x: Float32Array, sr: number, start: number, rate: number, tau0: number, n: number, lowOnly: boolean) {
  // only filter the part of the track the window can reach
  const t0 = Math.max(0, start + tau0 * rate - 0.1);
  const t1 = Math.min(x.length / sr, start + (tau0 + n / PFPS) * rate + 0.1);
  const seg = x.subarray(Math.floor(t0 * sr), Math.ceil(t1 * sr));
  const { env, fps } = envelope(seg, sr, lowOnly);
  const out = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const t = start + (tau0 + j / PFPS) * rate;
    out[j] = sampleAt(env, (t - t0) * fps);
  }
  return out;
}

export function measureLock(input: LockInput): LockResult {
  const P = 0.6;
  const tau0 = -P;
  const n = Math.ceil((input.overlap + 2 * P) * PFPS);
  const eA = playedEnvelope(input.a, input.aSr, input.aStart, input.rateA, tau0, n, false);
  const eB = playedEnvelope(input.b, input.bSr, input.bStart, input.rateB, tau0, n, false);
  const W = Math.round(2 * PFPS);
  // ±50 ms: both decks' grids sit within ~20 ms of their kick attacks, so their sum fits with room
  const L = Math.round(0.05 * PFPS);
  const core0 = Math.round(P * PFPS);
  const core1 = Math.round((P + input.overlap) * PFPS);

  // lag of B behind A (played s) in 2 s windows every second; `c` = B already advanced by c
  const lags = (c: number) => {
    const out: { t: number; lag: number }[] = [];
    const cf = Math.round(c * PFPS);
    for (let s = core0; s + W <= core1; s += PFPS) {
      const ra = eA.subarray(s, s + W);
      const cc: number[] = [];
      for (let q = -L; q <= L; q++) {
        const j0 = s + cf + q;
        if (j0 < 0 || j0 + W > n) {
          cc.push(-1);
          continue;
        }
        cc.push(corr(eB.subarray(j0, j0 + W), ra));
      }
      const qi = cc.indexOf(Math.max(...cc));
      if (cc[qi] > 0.15) {
        const lag = (qi - L + parabolic(cc, qi)) / PFPS;
        out.push({ t: (s - core0 + W / 2) / PFPS, lag: lag + c });
      }
    }
    return out;
  };

  let c = 0;
  let pts = lags(0);
  if (pts.length >= 3) {
    const m = median(pts.map((p) => p.lag));
    if (Math.abs(m) < 0.05) {
      c = m;
      pts = lags(c);
    }
  }
  let shift = c;
  let drift = 0;
  let res: number[] = [];
  if (pts.length >= 3) {
    // fit lag(t) = shift + drift·t through the points that agree with their neighbours
    const lg = pts.map((p) => p.lag);
    const ok = pts.filter((p, i) => Math.abs(p.lag - median(lg.slice(Math.max(0, i - 3), i + 4))) < 0.004);
    const use = ok.length >= 3 ? ok : pts;
    const mt = use.reduce((s, p) => s + p.t, 0) / use.length;
    const ml = use.reduce((s, p) => s + p.lag, 0) / use.length;
    const stt = use.reduce((s, p) => s + (p.t - mt) ** 2, 0);
    drift = use.length >= 5 && stt > 0 ? use.reduce((s, p) => s + (p.t - mt) * (p.lag - ml), 0) / stt : 0;
    shift = ml - drift * mt;
    res = use.map((p) => Math.abs(p.lag - (shift + drift * p.t)) * 1000);
  }
  const p90 = res.length >= 3 ? Math.round(percentile(res, 90) * 100) / 100 : null;
  return {
    shift,
    drift,
    p90Ms: p90,
    points: res.length,
    verified: p90 !== null && p90 <= LOCK_P90_MS && res.length >= LOCK_MIN_POINTS,
  };
}
