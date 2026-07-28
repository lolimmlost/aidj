import type { Visualizer, VisualizerContext } from '../types';

const GRID_SIZE = 16;
let gridValues = new Float32Array(GRID_SIZE * GRID_SIZE);
let shock = 0;
let smoothVol = 0;

function sampleBar(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const f = u * (bars.length - 1);
  const i = Math.floor(f);
  return (bars[i] ?? 0) * (1 - (f - i)) + (bars[Math.min(bars.length - 1, i + 1)] ?? 0) * (f - i);
}

export const GridVisualizer: Visualizer = {
  name: '3D Grid',
  id: 'grid',

  init: () => {
    gridValues = new Float32Array(GRID_SIZE * GRID_SIZE);
    shock = 0;
    smoothVol = 0;
  },

  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, time, deltaTime, quality } = ctx;
    const { bars, bass, volume, isBeat } = audioData;
    const cellStep = quality === 'low' ? 2 : 1;
    const dt = Math.min(deltaTime, 0.05);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 2.0);
    smoothVol += (volume - smoothVol) * Math.min(1, dt * 6);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.3 + (1 - smoothVol) * 0.2;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const cellWidth = width / GRID_SIZE;
    const cellHeight = height / GRID_SIZE;
    const maxHeight = Math.min(width, height) * 0.18 * (1 + shock * 0.2);

    const hasAudio = bars.length > 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = y * GRID_SIZE + x;
        const dx = x - GRID_SIZE / 2;
        const dy = y - GRID_SIZE / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) / (GRID_SIZE / 2);

        // Per-cell spectrum tap
        const u = x / GRID_SIZE;
        const barValue = hasAudio ? sampleBar(bars, u) : 0.3;

        const ripple = Math.sin(dist * 6 - time * (3 + smoothVol * 3)) * 0.5 + 0.5;
        const shockRipple = shock * Math.sin(dist * 4 - time * 8) * 0.3;

        const target = barValue * (1 - dist * 0.4) * ripple +
          bass * 0.3 * (1 - dist) + shockRipple;

        // Faster smoothing for more reactivity
        gridValues[idx] = gridValues[idx] * 0.7 + target * 0.3;
      }
    }

    const perspective = 0.4;

    c.globalCompositeOperation = 'lighter';

    for (let y = 0; y < GRID_SIZE; y += cellStep) {
      const rowY = y / GRID_SIZE;
      const scale = 1 - rowY * perspective;
      const offsetY = rowY * perspective * height * 0.3;

      for (let x = 0; x < GRID_SIZE; x += cellStep) {
        const idx = y * GRID_SIZE + x;
        const value = gridValues[idx];

        const baseX = x * cellWidth * scale + (width * (1 - scale)) / 2;
        const baseY = y * cellHeight * scale + offsetY;
        const barHeight = value * maxHeight * scale;

        if (value < 0.33) c.fillStyle = colors.primary;
        else if (value < 0.66) c.fillStyle = colors.secondary;
        else c.fillStyle = colors.accent;

        // Glow layer
        const barWidth = cellWidth * scale * 0.8 * cellStep;
        c.globalAlpha = 0.08 + value * 0.12;
        c.fillRect(
          baseX + (cellWidth * scale - barWidth) / 2 - 2,
          baseY + cellHeight * scale - barHeight - 2,
          barWidth + 4,
          barHeight + 4,
        );

        // Main bar
        c.globalAlpha = 0.35 + value * 0.65;
        c.fillRect(
          baseX + (cellWidth * scale - barWidth) / 2,
          baseY + cellHeight * scale - barHeight,
          barWidth,
          barHeight,
        );
      }
    }

    // Grid lines
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = colors.primary;
    c.lineWidth = 1;
    c.globalAlpha = 0.12 + shock * 0.08;

    c.beginPath();
    for (let y = 0; y <= GRID_SIZE; y++) {
      const rowY = y / GRID_SIZE;
      const scale = 1 - rowY * perspective;
      const oY = rowY * perspective * height * 0.3;
      const lineY = y * (height / GRID_SIZE) * scale + oY;
      const lineX1 = (width * (1 - scale)) / 2;
      const lineX2 = width - lineX1;
      c.moveTo(lineX1, lineY);
      c.lineTo(lineX2, lineY);
    }
    c.stroke();

    c.beginPath();
    for (let x = 0; x <= GRID_SIZE; x++) {
      const bottomScale = 1 - perspective;
      const topX = x * cellWidth;
      const bottomX = x * cellWidth * bottomScale + (width * (1 - bottomScale)) / 2;
      c.moveTo(topX, 0);
      c.lineTo(bottomX, height * (1 - perspective * 0.7));
    }
    c.stroke();

    // Beat flash
    if (shock > 0.1) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = colors.accent;
      c.globalAlpha = (shock - 0.1) * 0.12;
      c.fillRect(0, 0, width, height);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
