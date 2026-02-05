import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// History for trail effect - reduced for performance
let waveHistory: Float32Array[] = [];
const MAX_HISTORY = 4;

// Pre-allocated history buffers (recycled)
let historyPool: Float32Array[] = [];
let lastWaveLength = 0;

// Cached gradient
let cachedGradient: CanvasGradient | null = null;
let cachedColors: string = '';
let cachedHeight: number = 0;

export const WaveformVisualizer: Visualizer = {
  name: 'Waveform',
  id: 'waveform',

  init: () => {
    waveHistory = [];
    historyPool = [];
    cachedGradient = null;
    lastWaveLength = 0;
  },

  cleanup: () => {
    waveHistory = [];
    historyPool = [];
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, quality } = ctx;
    const { waveformData, bars, bass, treble, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    if (waveformData.length === 0) return;

    // Pre-allocate history pool if size changed
    const downsampledLength = Math.floor(waveformData.length / 4);
    if (lastWaveLength !== downsampledLength) {
      historyPool = [];
      for (let i = 0; i < MAX_HISTORY + 1; i++) {
        historyPool.push(new Float32Array(downsampledLength));
      }
      waveHistory = [];
      lastWaveLength = downsampledLength;
    }

    // Recycle oldest buffer or get from pool
    let downsampled: Float32Array;
    if (waveHistory.length >= MAX_HISTORY) {
      downsampled = waveHistory.pop()!;
    } else {
      downsampled = historyPool[waveHistory.length] || new Float32Array(downsampledLength);
    }

    // Fill with downsampled data
    for (let i = 0; i < downsampledLength; i++) {
      downsampled[i] = waveformData[i * 4];
    }
    waveHistory.unshift(downsampled);

    const centerY = height / 2;
    const amplitude = height * 0.38;

    // Draw grid lines - batch into single path
    c.strokeStyle = colors.primary;
    c.globalAlpha = 0.1;
    c.lineWidth = 1;
    c.beginPath();
    const gridLines = 6; // Reduced from 8
    for (let i = 1; i < gridLines; i++) {
      const y = (height / gridLines) * i;
      c.moveTo(0, y);
      c.lineTo(width, y);
    }
    c.stroke();
    c.globalAlpha = 1;

    // Draw wave history (trails) - batch all history into single path per layer
    for (let histIndex = MAX_HISTORY - 1; histIndex > 0; histIndex--) {
      const histWave = waveHistory[histIndex];
      if (!histWave) continue;

      const alpha = 0.12 * (1 - histIndex / MAX_HISTORY);
      c.globalAlpha = alpha;
      c.strokeStyle = colors.secondary;
      c.lineWidth = 1;

      c.beginPath();
      const sliceWidth = width / histWave.length;
      for (let i = 0; i < histWave.length; i++) {
        const v = histWave[i];
        const y = centerY + v * amplitude * 0.9;
        if (i === 0) c.moveTo(0, y);
        else c.lineTo(i * sliceWidth, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;

    // Draw frequency spectrum at bottom - batch by color
    const spectrumHeight = height * 0.12;
    const numSpecBars = Math.min(bars.length, getAdaptiveCount(24, quality));
    const specBarWidth = width / numSpecBars;

    c.globalAlpha = 0.3;

    // Primary bars (left half)
    c.fillStyle = colors.primary;
    c.beginPath();
    for (let i = 0; i < numSpecBars / 2; i++) {
      const barH = bars[Math.floor(i * bars.length / numSpecBars)] * spectrumHeight;
      c.rect(i * specBarWidth, height - barH, specBarWidth - 1, barH);
    }
    c.fill();

    // Secondary bars (right half)
    c.fillStyle = colors.secondary;
    c.beginPath();
    for (let i = Math.floor(numSpecBars / 2); i < numSpecBars; i++) {
      const barH = bars[Math.floor(i * bars.length / numSpecBars)] * spectrumHeight;
      c.rect(i * specBarWidth, height - barH, specBarWidth - 1, barH);
    }
    c.fill();
    c.globalAlpha = 1;

    // Main waveform - use larger step for performance (higher on lower quality)
    const step = quality === 'low' ? 8 : quality === 'medium' ? 6 : 4;
    const sliceWidth = width / (waveformData.length / step);

    // Build filled waveform path
    c.beginPath();
    let x = 0;

    // Top wave
    for (let i = 0; i < waveformData.length; i += step) {
      const v = waveformData[i];
      const y = centerY + v * amplitude * (1 + bass * 0.3);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
      x += sliceWidth;
    }

    // Bottom wave (mirror)
    for (let i = waveformData.length - step; i >= 0; i -= step) {
      const v = waveformData[i];
      const y = centerY - v * amplitude * (1 + bass * 0.3);
      c.lineTo(x, y);
      x -= sliceWidth;
    }
    c.closePath();

    // Cache fill gradient
    const colorKey = colors.accent + colors.primary;
    if (!cachedGradient || cachedColors !== colorKey || cachedHeight !== height) {
      cachedGradient = c.createLinearGradient(0, centerY - amplitude, 0, centerY + amplitude);
      cachedGradient.addColorStop(0, colors.accent + '40');
      cachedGradient.addColorStop(0.5, colors.primary + '80');
      cachedGradient.addColorStop(1, colors.accent + '40');
      cachedColors = colorKey;
      cachedHeight = height;
    }
    c.fillStyle = cachedGradient;
    c.fill();

    // Stroke the main wave (no shadow for performance)
    c.beginPath();
    x = 0;
    for (let i = 0; i < waveformData.length; i += step) {
      const v = waveformData[i];
      const y = centerY + v * amplitude * (1 + bass * 0.3);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
      x += sliceWidth;
    }
    c.strokeStyle = colors.primary;
    c.lineWidth = 2;
    c.stroke();

    // Draw beat flash (simple re-stroke, no shadow)
    if (isBeat) {
      c.strokeStyle = colors.accent;
      c.lineWidth = 3;
      c.globalAlpha = 0.5;
      c.stroke();
      c.globalAlpha = 1;
    }

    // Draw center line
    c.strokeStyle = colors.primary;
    c.globalAlpha = 0.4;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, centerY);
    c.lineTo(width, centerY);
    c.stroke();
    c.globalAlpha = 1;

    // Draw level meters on sides
    const meterWidth = 8;
    const meterHeight = height * 0.6;
    const meterY = (height - meterHeight) / 2;

    // Left meter (bass) - batch both rects
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.3;
    c.fillRect(10, meterY, meterWidth, meterHeight);
    c.globalAlpha = 1;
    c.fillRect(10, meterY + meterHeight * (1 - bass), meterWidth, meterHeight * bass);

    // Right meter (treble)
    c.fillStyle = colors.accent;
    c.globalAlpha = 0.3;
    c.fillRect(width - 18, meterY, meterWidth, meterHeight);
    c.globalAlpha = 1;
    c.fillRect(width - 18, meterY + meterHeight * (1 - treble), meterWidth, meterHeight * treble);
  },
};
