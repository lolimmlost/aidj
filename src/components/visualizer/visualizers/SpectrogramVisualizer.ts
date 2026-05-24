import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

/**
 * SpectrogramVisualizer — a scrolling frequency waterfall. Each frame
 * appends a new column of frequency-vs-intensity to the right edge and
 * the canvas scrolls left. Looks like an audio engineer's view of the
 * track over time.
 *
 * Implementation: we keep a ring buffer of past frequency columns and
 * redraw on each frame. To keep cost down, the canvas is rendered with
 * fillRect tiles whose size adapts to quality.
 */

let history: Float32Array[] = [];
let initializedColumns = 0;

const BASE_COLUMNS = 200;

function initHistory(columns: number, bins: number) {
  history = [];
  for (let i = 0; i < columns; i++) {
    history.push(new Float32Array(bins));
  }
  initializedColumns = columns;
}

// Linearly interpolate between two hex colors. h1/h2 must be `#rrggbb`.
function lerpHex(h1: string, h2: string, t: number): string {
  const r1 = parseInt(h1.slice(1, 3), 16);
  const g1 = parseInt(h1.slice(3, 5), 16);
  const b1 = parseInt(h1.slice(5, 7), 16);
  const r2 = parseInt(h2.slice(1, 3), 16);
  const g2 = parseInt(h2.slice(3, 5), 16);
  const b2 = parseInt(h2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

// Build a small lookup table of colors keyed by intensity (0..1).
let colorLUT: string[] = [];
let cachedColorKey = '';
function buildLUT(primary: string, secondary: string, accent: string) {
  const key = primary + secondary + accent;
  if (key === cachedColorKey && colorLUT.length === 64) return;
  cachedColorKey = key;
  colorLUT = [];
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    // 0..0.5: secondary→primary, 0.5..1: primary→accent
    const col = t < 0.5
      ? lerpHex(secondary, primary, t * 2)
      : lerpHex(primary, accent, (t - 0.5) * 2);
    colorLUT.push(col);
  }
}

export const SpectrogramVisualizer: Visualizer = {
  name: 'Spectrogram',
  id: 'spectrogram',

  init: () => {
    history = [];
    initializedColumns = 0;
    colorLUT = [];
    cachedColorKey = '';
  },

  cleanup: () => {
    history = [];
    initializedColumns = 0;
    colorLUT = [];
    cachedColorKey = '';
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, quality } = ctx;
    const { bars, isBeat } = audioData;
    if (bars.length === 0) return;

    const columns = getAdaptiveCount(BASE_COLUMNS, quality);
    const bins = bars.length;

    if (initializedColumns !== columns || !history[0] || history[0].length !== bins) {
      initHistory(columns, bins);
    }

    // Shift history left, append latest at the end
    const newest = history.shift()!;
    for (let i = 0; i < bins; i++) newest[i] = bars[i];
    history.push(newest);

    buildLUT(colors.primary, colors.secondary, colors.accent);

    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const colW = width / columns;
    const rowH = height / bins;

    // Render in tiles. We bucket cells by color index so we issue fewer
    // fillStyle changes — the LUT only has 64 entries, so at most 64
    // batch passes per frame.
    type Cell = { x: number; y: number; w: number; h: number };
    const buckets: Cell[][] = Array.from({ length: 64 }, () => []);

    for (let x = 0; x < columns; x++) {
      const col = history[x];
      const drawX = x * colW;
      for (let y = 0; y < bins; y++) {
        const v = col[y];
        if (v < 0.04) continue;
        const idx = Math.min(63, Math.floor(v * 63));
        // Flip y so low frequencies are at the bottom
        const drawY = height - (y + 1) * rowH;
        buckets[idx].push({ x: drawX, y: drawY, w: colW + 1, h: rowH + 1 });
      }
    }

    for (let i = 0; i < buckets.length; i++) {
      const list = buckets[i];
      if (list.length === 0) continue;
      c.fillStyle = colorLUT[i];
      c.globalAlpha = 0.35 + (i / 63) * 0.65;
      for (let j = 0; j < list.length; j++) {
        const cell = list[j];
        c.fillRect(cell.x, cell.y, cell.w, cell.h);
      }
    }
    c.globalAlpha = 1;

    // Leading-edge sweep line marks "now"
    c.strokeStyle = colors.accent;
    c.globalAlpha = 0.5;
    c.lineWidth = isBeat ? 2 : 1;
    c.beginPath();
    c.moveTo(width - 1, 0);
    c.lineTo(width - 1, height);
    c.stroke();
    c.globalAlpha = 1;
  },
};
