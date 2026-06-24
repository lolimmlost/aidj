import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// Layered, flowing aurora ribbons. Each ribbon is a horizontal sine band
// whose vertical position, amplitude, and frequency are driven by a slice
// of the spectrum. Ribbons blend additively via partial-alpha clears for
// silky motion trails. Beats inject a soft shockwave through all ribbons.

interface Ribbon {
  // spectral slice this ribbon listens to
  binStart: number;
  binEnd: number;
  // motion params
  baseY: number;          // 0..1 vertical anchor
  freq: number;           // spatial frequency
  phase: number;          // animated horizontal phase
  phaseSpeed: number;     // rad / sec
  amp: number;            // smoothed amplitude (px)
  thickness: number;      // base stroke width
  hueBand: 0 | 1 | 2;     // 0=primary, 1=secondary, 2=accent
}

const BASE_RIBBON_COUNT = 9;
let ribbons: Ribbon[] = [];
let initializedCount = 0;
let lastHeight = 0;
let shock = 0; // 0..1 beat shockwave envelope

function buildRibbons(count: number, height: number) {
  ribbons = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const hueBand: 0 | 1 | 2 = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
    ribbons.push({
      binStart: t * 0.85,
      binEnd: Math.min(1, t * 0.85 + 0.18),
      baseY: 0.15 + t * 0.7,
      freq: 0.0035 + (1 - t) * 0.004,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.25 + t * 0.6 + Math.random() * 0.2,
      amp: 0,
      thickness: 1.5 + (1 - Math.abs(t - 0.5) * 2) * 2.5,
      hueBand,
    });
  }
  initializedCount = count;
  lastHeight = height;
}

function sliceEnergy(bars: number[], start: number, end: number): number {
  if (bars.length === 0) return 0;
  const i0 = Math.floor(start * bars.length);
  const i1 = Math.max(i0 + 1, Math.floor(end * bars.length));
  let sum = 0;
  let n = 0;
  for (let i = i0; i < i1 && i < bars.length; i++) {
    sum += bars[i];
    n++;
  }
  return n > 0 ? sum / n : 0;
}

export const AuroraVisualizer: Visualizer = {
  name: 'Aurora',
  id: 'aurora',

  init: () => {
    ribbons = [];
    initializedCount = 0;
    lastHeight = 0;
    shock = 0;
  },

  cleanup: () => {
    ribbons = [];
    initializedCount = 0;
    shock = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    const count = getAdaptiveCount(BASE_RIBBON_COUNT, quality);
    if (initializedCount !== count || lastHeight !== height) {
      buildRibbons(count, height);
    }

    // Motion trails — softer trail on higher quality for richer blending
    const trailAlpha = quality === 'low' ? 0.55 : quality === 'medium' ? 0.32 : 0.22;
    c.fillStyle = colors.background;
    c.globalAlpha = trailAlpha;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const dt = Math.min(deltaTime, 0.05);

    // Beat shock envelope (fast attack, slow decay)
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 1.8);

    // Resolution-aware sampling: fewer segments at lower quality
    const segments =
      quality === 'low' ? 48 : quality === 'medium' ? 80 : 128;
    const step = width / segments;

    // Bucket ribbons by color band for batched stroke calls
    const bands: Ribbon[][] = [[], [], []];
    for (const r of ribbons) bands[r.hueBand].push(r);

    const bandColors = [colors.primary, colors.secondary, colors.accent];
    const bandEnergy = [bass, mid, treble];

    for (let b = 0; b < 3; b++) {
      const list = bands[b];
      if (!list.length) continue;

      c.strokeStyle = bandColors[b];

      for (const r of list) {
        // Target amplitude from this ribbon's spectral slice + global volume
        const energy = sliceEnergy(bars, r.binStart, r.binEnd);
        const target = (energy * 0.75 + volume * 0.25) * height * 0.18;
        // Smooth amplitude changes — prevents jitter
        r.amp += (target - r.amp) * Math.min(1, dt * 6);

        // Phase drift, accelerated by the band's energy
        r.phase += dt * (r.phaseSpeed + bandEnergy[b] * 1.8);

        const anchorY = r.baseY * height;
        const amp = r.amp + shock * height * 0.04;

        // Layered passes: wide soft glow + crisp core line
        const passes = quality === 'low' ? 1 : 2;
        for (let p = 0; p < passes; p++) {
          const isGlow = p === 0 && passes > 1;
          c.lineWidth = isGlow
            ? r.thickness * (3 + bandEnergy[b] * 4)
            : r.thickness * (1 + bandEnergy[b] * 1.2);
          c.globalAlpha = isGlow
            ? 0.12 + bandEnergy[b] * 0.18
            : 0.55 + bandEnergy[b] * 0.35;

          c.beginPath();
          for (let s = 0; s <= segments; s++) {
            const x = s * step;
            // Two stacked sines give a more organic, non-repeating wave
            const wave =
              Math.sin(x * r.freq + r.phase) * 0.7 +
              Math.sin(x * r.freq * 2.3 + r.phase * 1.7) * 0.3;
            // Edge taper so ribbons fade in/out at canvas borders
            const edgeFade =
              Math.sin((s / segments) * Math.PI); // 0 at edges, 1 in middle
            const y = anchorY + wave * amp * edgeFade;
            if (s === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
      }
    }

    c.globalAlpha = 1;
  },
};