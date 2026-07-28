import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// AURORA — a chromatic, reactive ribbon field.
//
// Each ribbon is built segment-by-segment as a closed polygon (top/bottom edge),
// so its THICKNESS, COLOR, and OFFSET all modulate continuously along its length
// from the live FFT spectrum. Ribbons are stacked on a polar-ish vertical layout,
// painted with additive ('lighter') blending so overlapping bands fuse into the
// classic aurora gradient instead of muddy averages.
//
// On beats the system fires:
//   • a radial shock that warps every ribbon
//   • short-lived "sparks" (particles) emitted from peak crests
//   • a brief chromatic-aberration offset pass

interface Ribbon {
  baseY: number;         // 0..1 vertical anchor
  binOffset: number;     // 0..1 where in the spectrum this ribbon reads from
  binSpan: number;       // 0..1 width of its spectral window
  freq: number;          // spatial frequency of the carrier wave
  freq2: number;         // secondary harmonic
  phase: number;
  phaseSpeed: number;    // rad / sec
  thickness: number;     // base half-thickness in px
  hueBand: 0 | 1 | 2;    // primary / secondary / accent
  amp: number;           // smoothed amplitude (px)
  energy: number;        // smoothed band energy 0..1
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;          // 0..1, decays to 0
  hueBand: 0 | 1 | 2;
  size: number;
}

const BASE_RIBBON_COUNT = 11;
const MAX_SPARKS = 220;

let ribbons: Ribbon[] = [];
let sparks: Spark[] = [];
let initializedCount = 0;
let lastHeight = 0;
let shock = 0;             // beat shock envelope 0..1
let chroma = 0;            // chromatic aberration envelope 0..1
let globalPhase = 0;       // drives slow background hue drift

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function buildRibbons(count: number, height: number) {
  ribbons = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const hueBand: 0 | 1 | 2 = (i % 3) as 0 | 1 | 2;
    ribbons.push({
      baseY: 0.12 + t * 0.76,
      binOffset: t * 0.78,
      binSpan: 0.10 + (1 - t) * 0.14,
      freq: 0.0025 + (1 - t) * 0.005,
      freq2: 0.011 + t * 0.013,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.18 + t * 0.55 + Math.random() * 0.25,
      thickness: 2 + (1 - Math.abs(t - 0.5) * 2) * 5,
      hueBand,
      amp: 0,
      energy: 0,
    });
  }
  initializedCount = count;
  lastHeight = height;
}

function sampleBar(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const f = u * (bars.length - 1);
  const i = Math.floor(f);
  const frac = f - i;
  const a = bars[i] ?? 0;
  const b = bars[Math.min(bars.length - 1, i + 1)] ?? a;
  return a * (1 - frac) + b * frac;
}

function sliceEnergy(bars: number[], start: number, span: number): number {
  if (!bars.length) return 0;
  const i0 = Math.max(0, Math.floor(start * bars.length));
  const i1 = Math.min(bars.length, Math.max(i0 + 1, Math.floor((start + span) * bars.length)));
  let s = 0;
  for (let i = i0; i < i1; i++) s += bars[i];
  return s / (i1 - i0);
}

export const AuroraVisualizer: Visualizer = {
  name: 'Aurora',
  id: 'aurora',

  init: () => {
    ribbons = [];
    sparks = [];
    initializedCount = 0;
    lastHeight = 0;
    shock = 0;
    chroma = 0;
    globalPhase = 0;
  },

  cleanup: () => {
    ribbons = [];
    sparks = [];
    initializedCount = 0;
    shock = 0;
    chroma = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    const count = getAdaptiveCount(BASE_RIBBON_COUNT, quality);
    if (initializedCount !== count || lastHeight !== height) {
      buildRibbons(count, height);
    }

    const dt = Math.min(deltaTime, 0.05);
    globalPhase += dt * 0.35;

    // ---- Motion trail (background wash) ------------------------------------
    const trailAlpha = quality === 'low' ? 0.5 : quality === 'medium' ? 0.22 : 0.14;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = trailAlpha;
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    // ---- Beat envelopes ----------------------------------------------------
    if (isBeat) {
      shock = Math.min(1, shock + 0.75);
      chroma = Math.min(1, chroma + 0.85);
    }
    shock = Math.max(0, shock - dt * 1.6);
    chroma = Math.max(0, chroma - dt * 2.4);

    const segments = quality === 'low' ? 64 : quality === 'medium' ? 128 : 192;
    const bandColors = [colors.primary, colors.secondary, colors.accent];
    const bandEnergy = [bass, mid, treble];

    // ---- Ribbons -----------------------------------------------------------
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // Reusable arrays to avoid per-frame allocs
    const topX = new Float32Array(segments + 1);
    const topY = new Float32Array(segments + 1);
    const botX = new Float32Array(segments + 1);
    const botY = new Float32Array(segments + 1);

    for (const r of ribbons) {
      const sliceE = sliceEnergy(bars, r.binOffset, r.binSpan);
      r.energy += (sliceE - r.energy) * Math.min(1, dt * 8);
      const targetAmp = (sliceE * 0.7 + volume * 0.3) * height * 0.22;
      r.amp += (targetAmp - r.amp) * Math.min(1, dt * 7);
      r.phase += dt * (r.phaseSpeed + bandEnergy[r.hueBand] * 2.2 + r.energy * 1.5);

      const anchorY = r.baseY * height;
      const amp = r.amp + shock * height * 0.05;
      const baseColor = bandColors[r.hueBand];

      // Build polyline coords. Per-segment thickness modulated by local FFT bin.
      let peakY = anchorY;
      let peakX = 0;
      let peakMag = 0;

      for (let s = 0; s <= segments; s++) {
        const u = s / segments;
        const x = u * width;
        const edgeFade = Math.sin(u * Math.PI); // 0 at edges, 1 mid

        // Per-segment spectrum tap -> drives local detail
        const localBin = sampleBar(bars, (r.binOffset + u * r.binSpan) % 1);
        const wave =
          Math.sin(x * r.freq + r.phase) * 0.55 +
          Math.sin(x * r.freq2 + r.phase * 1.6) * 0.3 +
          (localBin - 0.5) * 0.9;

        // Radial shock distortion centered on canvas middle
        const dxn = (x - width * 0.5) / (width * 0.5);
        const shockWarp = shock * Math.cos(dxn * 3.2 - globalPhase * 4) * height * 0.04;

        const y = anchorY + wave * amp * edgeFade + shockWarp;

        const halfT = (r.thickness + localBin * r.thickness * 3.5 + r.energy * 6) * edgeFade;
        topX[s] = x;
        topY[s] = y - halfT;
        botX[s] = x;
        botY[s] = y + halfT;

        const mag = Math.abs(wave) * localBin;
        if (mag > peakMag) { peakMag = mag; peakX = x; peakY = y; }
      }

      // --- Outer glow pass (wide, low alpha) ---
      const glowGrad = c.createLinearGradient(0, anchorY - amp, width, anchorY + amp);
      glowGrad.addColorStop(0, baseColor);
      glowGrad.addColorStop(0.5, bandColors[(r.hueBand + 1) % 3]);
      glowGrad.addColorStop(1, bandColors[(r.hueBand + 2) % 3]);

      c.fillStyle = glowGrad;
      c.globalAlpha = 0.18 + r.energy * 0.35;
      c.beginPath();
      c.moveTo(topX[0], topY[0] - 6);
      for (let s = 1; s <= segments; s++) c.lineTo(topX[s], topY[s] - 6);
      for (let s = segments; s >= 0; s--) c.lineTo(botX[s], botY[s] + 6);
      c.closePath();
      c.fill();

      // --- Body fill (the ribbon itself) ---
      c.globalAlpha = 0.55 + r.energy * 0.4;
      c.beginPath();
      c.moveTo(topX[0], topY[0]);
      for (let s = 1; s <= segments; s++) c.lineTo(topX[s], topY[s]);
      for (let s = segments; s >= 0; s--) c.lineTo(botX[s], botY[s]);
      c.closePath();
      c.fill();

      // --- Crisp inner spine ---
      if (quality !== 'low') {
        c.strokeStyle = baseColor;
        c.globalAlpha = 0.85;
        c.lineWidth = 1 + r.energy * 1.5;
        c.beginPath();
        for (let s = 0; s <= segments; s++) {
          const mx = (topX[s] + botX[s]) * 0.5;
          const my = (topY[s] + botY[s]) * 0.5;
          if (s === 0) c.moveTo(mx, my);
          else c.lineTo(mx, my);
        }
        c.stroke();
      }

      // --- Chromatic aberration ghost on beat ---
      if (chroma > 0.05 && quality === 'high') {
        const off = chroma * 6;
        c.globalAlpha = 0.35 * chroma;
        c.strokeStyle = bandColors[(r.hueBand + 1) % 3];
        c.lineWidth = 1;
        c.beginPath();
        for (let s = 0; s <= segments; s++) {
          const mx = (topX[s] + botX[s]) * 0.5 + off;
          const my = (topY[s] + botY[s]) * 0.5;
          if (s === 0) c.moveTo(mx, my); else c.lineTo(mx, my);
        }
        c.stroke();
        c.strokeStyle = bandColors[(r.hueBand + 2) % 3];
        c.beginPath();
        for (let s = 0; s <= segments; s++) {
          const mx = (topX[s] + botX[s]) * 0.5 - off;
          const my = (topY[s] + botY[s]) * 0.5;
          if (s === 0) c.moveTo(mx, my); else c.lineTo(mx, my);
        }
        c.stroke();
      }

      // --- Emit sparks on beat from crest ---
      if (isBeat && peakMag > 0.15 && sparks.length < MAX_SPARKS) {
        const n = 2 + Math.floor(bandEnergy[r.hueBand] * 5);
        for (let i = 0; i < n; i++) {
          sparks.push({
            x: peakX + rand(-6, 6),
            y: peakY + rand(-6, 6),
            vx: rand(-60, 60),
            vy: rand(-180, -40) * (0.4 + bandEnergy[r.hueBand]),
            life: 1,
            hueBand: r.hueBand,
            size: rand(1.5, 3.5),
          });
        }
      }
    }

    // ---- Sparks ------------------------------------------------------------
    if (sparks.length) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += 220 * dt;            // gravity pulls back down
        p.vx *= 1 - dt * 0.6;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.2;
        if (p.life <= 0 || p.y > height + 10) {
          sparks.splice(i, 1);
          continue;
        }
        c.globalAlpha = Math.max(0, p.life);
        c.fillStyle = bandColors[p.hueBand];
        const sz = p.size * (0.5 + p.life);
        c.beginPath();
        c.arc(p.x, p.y, sz, 0, Math.PI * 2);
        c.fill();
      }
    }

    // ---- Beat flash vignette ----------------------------------------------
    if (shock > 0.02) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = shock * 0.18;
      c.fillStyle = colors.accent;
      c.fillRect(0, 0, width, height);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};