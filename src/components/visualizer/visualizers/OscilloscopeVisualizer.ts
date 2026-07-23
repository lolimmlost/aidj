import type { Visualizer, VisualizerContext } from '../types';

let cachedGradient: CanvasGradient | null = null;
let cachedColors = '';
let cachedWidth = 0;
let shock = 0;
let smoothBass = 0;

export const OscilloscopeVisualizer: Visualizer = {
  name: 'Oscilloscope',
  id: 'oscilloscope',

  init: () => {
    cachedGradient = null;
    shock = 0;
    smoothBass = 0;
  },

  cleanup: () => {
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { waveformData, bass, mid, treble, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 2.2);
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);

    // Phosphor trail — longer trail on loud passages
    c.fillStyle = colors.background;
    c.globalAlpha = 0.2 + (1 - volume) * 0.2;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const centerY = height / 2;
    const amplitude = height * 0.4 * (1 + shock * 0.15);
    const hasWaveform = waveformData.length > 0;

    // Grid
    c.strokeStyle = colors.primary;
    c.lineWidth = 1;
    c.globalAlpha = 0.1 + shock * 0.05;

    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      c.moveTo(x, 0);
      c.lineTo(x, height);
    }
    for (let i = 0; i <= 8; i++) {
      const y = (height / 8) * i;
      c.moveTo(0, y);
      c.lineTo(width, y);
    }
    c.stroke();

    // Center line
    c.strokeStyle = colors.secondary;
    c.globalAlpha = 0.2 + smoothBass * 0.2;
    c.lineWidth = 1 + smoothBass * 2;
    c.beginPath();
    c.moveTo(0, centerY);
    c.lineTo(width, centerY);
    c.stroke();
    c.globalAlpha = 1;

    // Cache gradient
    const colorKey = colors.primary + colors.accent;
    if (!cachedGradient || cachedColors !== colorKey || cachedWidth !== width) {
      cachedGradient = c.createLinearGradient(0, 0, width, 0);
      cachedGradient.addColorStop(0, colors.primary);
      cachedGradient.addColorStop(0.5, colors.accent);
      cachedGradient.addColorStop(1, colors.primary);
      cachedColors = colorKey;
      cachedWidth = width;
    }

    const step = quality === 'low' ? 6 : quality === 'medium' ? 4 : 2;
    const lineWidth = 2 + volume * 4 + shock * 3;

    // Build waveform path once
    c.beginPath();
    if (hasWaveform) {
      for (let i = 0; i < waveformData.length; i += step) {
        const x = (i / waveformData.length) * width;
        const y = centerY + waveformData[i] * amplitude * (1 + smoothBass * 0.5);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
    } else {
      c.moveTo(0, centerY);
      c.lineTo(width, centerY);
    }

    // Additive glow layers
    c.globalCompositeOperation = 'lighter';

    // Wide glow
    c.strokeStyle = cachedGradient;
    c.lineWidth = lineWidth * 4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = 0.08 + shock * 0.08;
    c.stroke();

    // Medium glow
    c.lineWidth = lineWidth * 2;
    c.globalAlpha = 0.2 + shock * 0.1;
    c.stroke();

    // Core line
    c.lineWidth = lineWidth;
    c.globalAlpha = 0.85 + shock * 0.15;
    c.stroke();

    // Beat shock — bright re-stroke in accent
    if (shock > 0.1) {
      c.strokeStyle = colors.accent;
      c.lineWidth = lineWidth * 1.5;
      c.globalAlpha = (shock - 0.1) * 0.4;
      c.stroke();
    }

    // Band indicators — reactive
    c.globalCompositeOperation = 'source-over';
    const indicatorSize = 60;
    const padding = 20;
    const bandValues = [smoothBass, mid, treble];
    const bandColors = [colors.primary, colors.secondary, colors.accent];

    for (let b = 0; b < 3; b++) {
      const x = padding + b * 20;
      c.fillStyle = bandColors[b];
      c.globalAlpha = 0.2;
      c.fillRect(x, height - padding - indicatorSize, 8, indicatorSize);
      c.globalAlpha = 0.7 + bandValues[b] * 0.3;
      c.fillRect(x, height - padding - indicatorSize * bandValues[b], 8, indicatorSize * bandValues[b]);
    }

    // Beat flash border
    if (shock > 0.2) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = colors.accent;
      c.lineWidth = 2 + shock * 4;
      c.globalAlpha = (shock - 0.2) * 0.4;
      c.strokeRect(2, 2, width - 4, height - 4);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
