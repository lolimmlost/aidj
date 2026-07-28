import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

let waveHistory: Float32Array[] = [];
const MAX_HISTORY = 4;
let historyPool: Float32Array[] = [];
let lastWaveLength = 0;
let cachedGradient: CanvasGradient | null = null;
let cachedColors = '';
let cachedHeight = 0;
let shock = 0;
let smoothBass = 0;

export const WaveformVisualizer: Visualizer = {
  name: 'Waveform',
  id: 'waveform',

  init: () => {
    waveHistory = [];
    historyPool = [];
    cachedGradient = null;
    lastWaveLength = 0;
    shock = 0;
    smoothBass = 0;
  },

  cleanup: () => {
    waveHistory = [];
    historyPool = [];
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { waveformData, bars, bass, treble, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 2.2);
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.3 + (1 - volume) * 0.25;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    if (waveformData.length === 0) return;

    const downsampledLength = Math.floor(waveformData.length / 4);
    if (lastWaveLength !== downsampledLength) {
      historyPool = [];
      for (let i = 0; i < MAX_HISTORY + 1; i++) {
        historyPool.push(new Float32Array(downsampledLength));
      }
      waveHistory = [];
      lastWaveLength = downsampledLength;
    }

    let downsampled: Float32Array;
    if (waveHistory.length >= MAX_HISTORY) {
      downsampled = waveHistory.pop()!;
    } else {
      downsampled = historyPool[waveHistory.length] || new Float32Array(downsampledLength);
    }
    for (let i = 0; i < downsampledLength; i++) {
      downsampled[i] = waveformData[i * 4];
    }
    waveHistory.unshift(downsampled);

    const centerY = height / 2;
    const amplitude = height * 0.38 * (1 + shock * 0.12);

    // Grid lines
    c.strokeStyle = colors.primary;
    c.globalAlpha = 0.08;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 6; i++) {
      const y = (height / 6) * i;
      c.moveTo(0, y);
      c.lineTo(width, y);
    }
    c.stroke();

    // Wave trails — additive for glow
    c.globalCompositeOperation = 'lighter';

    for (let histIndex = MAX_HISTORY - 1; histIndex > 0; histIndex--) {
      const histWave = waveHistory[histIndex];
      if (!histWave) continue;

      const alpha = 0.1 * (1 - histIndex / MAX_HISTORY);
      c.globalAlpha = alpha;
      c.strokeStyle = colors.secondary;
      c.lineWidth = 1;

      c.beginPath();
      const sliceWidth = width / histWave.length;
      for (let i = 0; i < histWave.length; i++) {
        const y = centerY + histWave[i] * amplitude * 0.9;
        if (i === 0) c.moveTo(0, y); else c.lineTo(i * sliceWidth, y);
      }
      c.stroke();
    }

    // Frequency spectrum at bottom
    const spectrumHeight = height * 0.12;
    const numSpecBars = Math.min(bars.length, getAdaptiveCount(24, quality));
    const specBarWidth = width / numSpecBars;

    c.globalAlpha = 0.25 + shock * 0.15;
    c.fillStyle = colors.primary;
    c.beginPath();
    for (let i = 0; i < numSpecBars / 2; i++) {
      const barH = bars[Math.floor(i * bars.length / numSpecBars)] * spectrumHeight * (1 + shock * 0.3);
      c.rect(i * specBarWidth, height - barH, specBarWidth - 1, barH);
    }
    c.fill();
    c.fillStyle = colors.secondary;
    c.beginPath();
    for (let i = Math.floor(numSpecBars / 2); i < numSpecBars; i++) {
      const barH = bars[Math.floor(i * bars.length / numSpecBars)] * spectrumHeight * (1 + shock * 0.3);
      c.rect(i * specBarWidth, height - barH, specBarWidth - 1, barH);
    }
    c.fill();

    // Main waveform — build path
    const step = quality === 'low' ? 8 : quality === 'medium' ? 6 : 4;
    const sliceWidth = width / (waveformData.length / step);

    // Filled waveform body
    c.beginPath();
    let x = 0;
    for (let i = 0; i < waveformData.length; i += step) {
      const v = waveformData[i];
      const y = centerY + v * amplitude * (1 + smoothBass * 0.3);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      x += sliceWidth;
    }
    for (let i = waveformData.length - step; i >= 0; i -= step) {
      const v = waveformData[i];
      const y = centerY - v * amplitude * (1 + smoothBass * 0.3);
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
    c.globalAlpha = 0.6 + shock * 0.2;
    c.fill();

    // Stroke the main wave
    c.beginPath();
    x = 0;
    for (let i = 0; i < waveformData.length; i += step) {
      const v = waveformData[i];
      const y = centerY + v * amplitude * (1 + smoothBass * 0.3);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      x += sliceWidth;
    }

    // Glow pass
    c.strokeStyle = colors.primary;
    c.lineWidth = 6 + shock * 4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = 0.1 + shock * 0.1;
    c.stroke();

    // Core stroke
    c.lineWidth = 2 + shock * 1;
    c.globalAlpha = 0.85;
    c.stroke();

    // Beat shock accent re-stroke
    if (shock > 0.1) {
      c.strokeStyle = colors.accent;
      c.lineWidth = 3 + shock * 2;
      c.globalAlpha = (shock - 0.1) * 0.5;
      c.stroke();
    }

    // Center line
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = colors.primary;
    c.globalAlpha = 0.3 + smoothBass * 0.2;
    c.lineWidth = 1 + smoothBass * 1.5;
    c.beginPath();
    c.moveTo(0, centerY);
    c.lineTo(width, centerY);
    c.stroke();

    // Level meters — reactive
    const meterWidth = 8;
    const meterHeight = height * 0.6;
    const meterY = (height - meterHeight) / 2;

    c.globalCompositeOperation = 'lighter';
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.15;
    c.fillRect(10, meterY, meterWidth, meterHeight);
    c.globalAlpha = 0.7 + smoothBass * 0.3;
    c.fillRect(10, meterY + meterHeight * (1 - smoothBass), meterWidth, meterHeight * smoothBass);

    c.fillStyle = colors.accent;
    c.globalAlpha = 0.15;
    c.fillRect(width - 18, meterY, meterWidth, meterHeight);
    c.globalAlpha = 0.7 + treble * 0.3;
    c.fillRect(width - 18, meterY + meterHeight * (1 - treble), meterWidth, meterHeight * treble);

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
