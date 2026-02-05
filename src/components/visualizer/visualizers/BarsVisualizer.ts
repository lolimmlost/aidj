import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// Store peak values for decay effect
let peakBars: number[] = [];
let peakDecay: number[] = [];
let cachedGradient: CanvasGradient | null = null;
let cachedColors: string = '';
let cachedHeight: number = 0;

export const BarsVisualizer: Visualizer = {
  name: 'Frequency Bars',
  id: 'bars',

  init: () => {
    peakBars = [];
    peakDecay = [];
    cachedGradient = null;
  },

  cleanup: () => {
    peakBars = [];
    peakDecay = [];
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, quality } = ctx;
    const { bars, bass } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    if (bars.length === 0) return;

    const numBars = Math.min(bars.length, getAdaptiveCount(48, quality));
    const barWidth = width / numBars;
    const gap = Math.max(1, barWidth * 0.12);
    const actualBarWidth = barWidth - gap;
    const maxHeight = height * 0.42;
    const centerY = height / 2;

    // Initialize peak arrays
    if (peakBars.length !== numBars) {
      peakBars = new Array(numBars).fill(0);
      peakDecay = new Array(numBars).fill(0);
    }

    // Cache gradient (only recreate if colors or height change)
    const colorKey = colors.primary + colors.secondary + colors.accent;
    if (!cachedGradient || cachedColors !== colorKey || cachedHeight !== height) {
      cachedGradient = c.createLinearGradient(0, height, 0, 0);
      cachedGradient.addColorStop(0, colors.primary);
      cachedGradient.addColorStop(0.5, colors.secondary);
      cachedGradient.addColorStop(1, colors.accent);
      cachedColors = colorKey;
      cachedHeight = height;
    }

    // Batch all bars into single path for top and bottom
    c.fillStyle = cachedGradient;
    c.beginPath();

    for (let i = 0; i < numBars; i++) {
      const barValue = bars[Math.floor(i * bars.length / numBars)] || 0;
      const barHeight = barValue * maxHeight;
      const x = i * barWidth + gap / 2;

      if (barHeight > 1) {
        // Top bar (simple rect, no rounded corners for perf)
        c.rect(x, centerY - barHeight, actualBarWidth, barHeight);
        // Bottom bar (mirrored)
        c.rect(x, centerY, actualBarWidth, barHeight);
      }

      // Update peak
      if (barValue > peakBars[i]) {
        peakBars[i] = barValue;
        peakDecay[i] = 0;
      } else {
        peakDecay[i] += 0.015;
        peakBars[i] = Math.max(0, peakBars[i] - peakDecay[i] * 0.04);
      }
    }
    c.fill();

    // Draw all peak indicators in one batch
    c.fillStyle = colors.accent;
    c.globalAlpha = 0.7;
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
    c.globalAlpha = 1;

    // Draw center line (no shadow for performance)
    c.strokeStyle = colors.primary;
    c.lineWidth = 2;
    c.globalAlpha = 0.5 + bass * 0.3;
    c.beginPath();
    c.moveTo(0, centerY);
    c.lineTo(width, centerY);
    c.stroke();
    c.globalAlpha = 1;
  },
};
