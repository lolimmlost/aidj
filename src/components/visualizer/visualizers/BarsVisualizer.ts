import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

let peakBars: number[] = [];
let peakDecay: number[] = [];
let smoothBars: number[] = [];
let cachedGradient: CanvasGradient | null = null;
let cachedColors: string = '';
let cachedHeight: number = 0;
let shock = 0;
let flash = 0;

export const BarsVisualizer: Visualizer = {
  name: 'Frequency Bars',
  id: 'bars',

  init: () => {
    peakBars = [];
    peakDecay = [];
    smoothBars = [];
    cachedGradient = null;
    shock = 0;
    flash = 0;
  },

  cleanup: () => {
    peakBars = [];
    peakDecay = [];
    smoothBars = [];
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);

    // Beat envelopes
    if (isBeat) {
      shock = Math.min(1, shock + 0.7);
      flash = 1;
    }
    shock = Math.max(0, shock - dt * 2.0);
    flash = Math.max(0, flash - dt * 3.5);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.35 + (1 - volume) * 0.4;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    if (bars.length === 0) return;

    const numBars = Math.min(bars.length, getAdaptiveCount(48, quality));
    const barWidth = width / numBars;
    const gap = Math.max(1, barWidth * 0.12);
    const actualBarWidth = barWidth - gap;
    const maxHeight = height * 0.42 * (1 + shock * 0.15);
    const centerY = height / 2;

    if (peakBars.length !== numBars) {
      peakBars = new Array(numBars).fill(0);
      peakDecay = new Array(numBars).fill(0);
      smoothBars = new Array(numBars).fill(0);
    }

    // Cache gradient
    const colorKey = colors.primary + colors.secondary + colors.accent;
    if (!cachedGradient || cachedColors !== colorKey || cachedHeight !== height) {
      cachedGradient = c.createLinearGradient(0, height, 0, 0);
      cachedGradient.addColorStop(0, colors.primary);
      cachedGradient.addColorStop(0.5, colors.secondary);
      cachedGradient.addColorStop(1, colors.accent);
      cachedColors = colorKey;
      cachedHeight = height;
    }

    // Additive glow pass
    c.globalCompositeOperation = 'lighter';

    // Glow layer (wider, dimmer)
    c.fillStyle = cachedGradient;
    c.globalAlpha = 0.15 + shock * 0.2;
    c.beginPath();
    for (let i = 0; i < numBars; i++) {
      const rawValue = bars[Math.floor(i * bars.length / numBars)] || 0;
      smoothBars[i] += (rawValue - smoothBars[i]) * Math.min(1, dt * 12);
      const barHeight = smoothBars[i] * maxHeight;
      const x = i * barWidth + gap / 2;
      if (barHeight > 1) {
        c.rect(x - 1, centerY - barHeight - 2, actualBarWidth + 2, barHeight + 2);
        c.rect(x - 1, centerY, actualBarWidth + 2, barHeight + 2);
      }
    }
    c.fill();

    // Main bars
    c.globalAlpha = 0.85 + shock * 0.15;
    c.beginPath();
    for (let i = 0; i < numBars; i++) {
      const barHeight = smoothBars[i] * maxHeight;
      const x = i * barWidth + gap / 2;
      if (barHeight > 1) {
        c.rect(x, centerY - barHeight, actualBarWidth, barHeight);
        c.rect(x, centerY, actualBarWidth, barHeight);
      }

      if (smoothBars[i] > peakBars[i]) {
        peakBars[i] = smoothBars[i];
        peakDecay[i] = 0;
      } else {
        peakDecay[i] += dt * 0.8;
        peakBars[i] = Math.max(0, peakBars[i] - peakDecay[i] * dt * 2);
      }
    }
    c.fill();

    // Peak indicators
    c.fillStyle = colors.accent;
    c.globalAlpha = 0.8;
    c.beginPath();
    for (let i = 0; i < numBars; i++) {
      const peakHeight = peakBars[i] * maxHeight;
      if (peakHeight > 3) {
        const x = i * barWidth + gap / 2;
        c.rect(x, centerY - peakHeight - 2, actualBarWidth, 2);
        c.rect(x, centerY + peakHeight, actualBarWidth, 2);
      }
    }
    c.fill();

    // Center line pulses with bass
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = colors.primary;
    c.lineWidth = 2 + bass * 3 + shock * 4;
    c.globalAlpha = 0.5 + bass * 0.3 + shock * 0.2;
    c.beginPath();
    c.moveTo(0, centerY);
    c.lineTo(width, centerY);
    c.stroke();

    // Beat flash vignette
    if (flash > 0.02) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = flash * 0.12;
      c.fillStyle = colors.accent;
      c.fillRect(0, 0, width, height);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
