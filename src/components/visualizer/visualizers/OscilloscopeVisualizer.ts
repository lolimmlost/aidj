import type { Visualizer, VisualizerContext } from '../types';

// Cached gradient
let cachedGradient: CanvasGradient | null = null;
let cachedColors: string = '';
let cachedWidth: number = 0;

export const OscilloscopeVisualizer: Visualizer = {
  name: 'Oscilloscope',
  id: 'oscilloscope',

  init: () => {
    cachedGradient = null;
  },

  cleanup: () => {
    cachedGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors } = ctx;
    const { waveformData, bass, mid, treble, volume, isBeat } = audioData;

    // Clear with slight fade for phosphor effect
    c.fillStyle = colors.background;
    c.globalAlpha = 0.3;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const centerY = height / 2;
    const amplitude = height * 0.4;
    const hasWaveform = waveformData.length > 0;

    // Draw grid (oscilloscope style)
    c.strokeStyle = colors.primary;
    c.lineWidth = 1;
    c.globalAlpha = 0.15;

    c.beginPath();
    // Vertical divisions
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      c.moveTo(x, 0);
      c.lineTo(x, height);
    }
    // Horizontal divisions
    for (let i = 0; i <= 8; i++) {
      const y = (height / 8) * i;
      c.moveTo(0, y);
      c.lineTo(width, y);
    }
    c.stroke();
    c.globalAlpha = 1;

    // Draw center line
    c.strokeStyle = colors.secondary;
    c.globalAlpha = 0.3;
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

    // Draw main waveform (Lissajous-style with thickness based on audio)
    const step = 2;
    const lineWidth = 2 + volume * 4;

    c.strokeStyle = cachedGradient;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    c.beginPath();
    if (hasWaveform) {
      for (let i = 0; i < waveformData.length; i += step) {
        const x = (i / waveformData.length) * width;
        const y = centerY + waveformData[i] * amplitude * (1 + bass * 0.5);

        if (i === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }
    } else {
      // Draw flat line if no waveform
      c.moveTo(0, centerY);
      c.lineTo(width, centerY);
    }
    c.stroke();

    // Glow effect (draw again with larger width and transparency)
    c.globalAlpha = 0.3;
    c.lineWidth = lineWidth * 3;
    c.stroke();
    c.globalAlpha = 1;

    // Draw frequency indicators at corners
    const indicatorSize = 60;
    const padding = 20;

    // Bass indicator (bottom left)
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.8;
    c.fillRect(padding, height - padding - indicatorSize * bass, 8, indicatorSize * bass);
    c.globalAlpha = 0.3;
    c.strokeStyle = colors.primary;
    c.strokeRect(padding, height - padding - indicatorSize, 8, indicatorSize);

    // Mid indicator (bottom center-left)
    c.fillStyle = colors.secondary;
    c.globalAlpha = 0.8;
    c.fillRect(padding + 20, height - padding - indicatorSize * mid, 8, indicatorSize * mid);
    c.globalAlpha = 0.3;
    c.strokeStyle = colors.secondary;
    c.strokeRect(padding + 20, height - padding - indicatorSize, 8, indicatorSize);

    // Treble indicator (bottom center-right)
    c.fillStyle = colors.accent;
    c.globalAlpha = 0.8;
    c.fillRect(padding + 40, height - padding - indicatorSize * treble, 8, indicatorSize * treble);
    c.globalAlpha = 0.3;
    c.strokeStyle = colors.accent;
    c.strokeRect(padding + 40, height - padding - indicatorSize, 8, indicatorSize);

    c.globalAlpha = 1;

    // Beat flash - screen flash effect
    if (isBeat) {
      c.strokeStyle = colors.accent;
      c.lineWidth = 4;
      c.globalAlpha = 0.6;
      c.strokeRect(2, 2, width - 4, height - 4);
      c.globalAlpha = 1;
    }
  },
};
